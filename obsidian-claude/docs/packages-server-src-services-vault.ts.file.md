# vault.ts - The Heart of the System

## What This File Is

This is the vault service - the most important service in the backend. It handles all interactions with the Obsidian vault (reading, writing, parsing markdown files). Everything else depends on this.

## My Thought Process

### The Central Design Principle

**Files are the source of truth.** The database is just a cache.

```
User edits in Obsidian → File changes → Vault service reads → Database updates
User edits in our app → Vault service writes → File changes → Database updates

In both cases: Vault service → Files → Truth
```

**Why this matters:**
1. Notes stay human-readable (edit in any text editor)
2. Notes are Git-friendly (version control works)
3. Obsidian works normally (native markdown)
4. If database corrupts, rebuild from files

---

## Key Design Decisions

### Decision 1: Async File Operations

```typescript
async readNote(relativePath: string): Promise<Note | null> {
  const content = await readFile(absolutePath, 'utf-8');
  // ...
}
```

**Why async?**

| Sync | Async |
|------|-------|
| `fs.readFileSync` | `fs.promises.readFile` |
| Blocks event loop | Non-blocking |
| Simple code | Slightly more complex |
| Bad for multiple files | Good for concurrent reads |

For reading many files (indexing), async is essential:

```typescript
// Sync - sequential, slow
for (const file of files) {
  const content = readFileSync(file);  // Blocks until done
}

// Async - concurrent, fast
const notes = await Promise.all(
  files.map(file => readFile(file))  // All at once
);
```

### Decision 2: Relative vs. Absolute Paths

```typescript
// Internal: Always use relative paths
readNote('notes/my-note.md')
writeNote('daily/2024-01-15.md', content)

// Conversion helpers
getAbsolutePath(relativePath)  // For fs operations
getRelativePath(absolutePath)  // For storage/display
```

**Why relative internally?**

| Absolute | Relative |
|----------|----------|
| `/Users/owner/vault/notes/x.md` | `notes/x.md` |
| Tied to filesystem | Portable |
| Breaks if vault moves | Works anywhere |
| Hard to compare | Easy to compare |

Relative paths are:
- Stored in database
- Used as IDs
- Shown in UI
- Stable across moves

### Decision 3: gray-matter for Frontmatter

```typescript
import matter from 'gray-matter';

const { data: frontmatter, content: body } = matter(content);
```

**What gray-matter does:**

```markdown
---
title: My Note
tags: [react, hooks]
---

# Content here
```

```javascript
matter(content)
// Returns:
{
  data: { title: 'My Note', tags: ['react', 'hooks'] },
  content: '\n# Content here\n'
}
```

**Why gray-matter?**
- Industry standard (Gatsby, Next.js, Hugo use it)
- Handles YAML edge cases
- Supports multiple formats (YAML, TOML, JSON)
- Handles stringify (writing back)

---

## Method Deep Dives

### parseNote - The Core Parser

```typescript
parseNote(id: string, content: string, modifiedTime?: Date): Note {
  // 1. Parse frontmatter
  const { data: frontmatter, content: body } = matter(content);

  // 2. Extract title (frontmatter → H1 → filename)
  const title = this.extractTitle(id, frontmatter, body);

  // 3. Get timestamps
  const createdAt = this.parseDate(frontmatter.created) ?? now;

  // 4. Calculate derived values
  const wordCount = this.countWords(body);
  const excerpt = this.generateExcerpt(body);

  // 5. Return structured Note
  return { id, title, content, frontmatter, body, ... };
}
```

**The parsing pipeline:**

```
Raw markdown string
       ↓
   gray-matter
       ↓
frontmatter (YAML) + body (markdown)
       ↓
   extractTitle (fallback logic)
       ↓
   countWords, generateExcerpt
       ↓
Structured Note object
```

### extractTitle - Graceful Fallbacks

```typescript
private extractTitle(id, frontmatter, body): string {
  // 1. Check frontmatter
  if (frontmatter.title) return frontmatter.title;

  // 2. Check first H1 heading
  const h1Match = body.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1];

  // 3. Fall back to filename
  return basename(id, '.md').replace(/-/g, ' ');
}
```

**Why three fallbacks?**

Different note styles:
```markdown
<!-- Style 1: Title in frontmatter -->
---
title: My Note
---
Content...

<!-- Style 2: Title as H1 -->
# My Note
Content...

<!-- Style 3: Filename is title -->
<!-- File: my-note.md, no frontmatter -->
Content...
```

All valid! The service handles them all.

**Senior insight:** Graceful degradation. Don't force a single format - accommodate how users actually work.

### generateExcerpt - Clean Preview Text

```typescript
private generateExcerpt(body: string): string {
  let text = body
    .replace(/^#+\s+.+$/gm, '')           // Remove headings
    .replace(/```[\s\S]*?```/g, '')       // Remove code blocks
    .replace(/`[^`]+`/g, '')              // Remove inline code
    .replace(/\[\[([^\]|]+)...\]\]/g, '') // Remove wiki links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Markdown links → text
    .replace(/[*_~]+/g, '')               // Remove formatting
    .trim();

  return text.substring(0, 200) + '...';
}
```

**Why all this cleaning?**

Raw body:
```markdown
# My Note

Check out [[related-topic]] for more info.

```javascript
const x = 1;
```

The **important** part is here.
```

Excerpt (cleaned):
```
Check out related-topic for more info. The important part is here...
```

Excerpts are for quick scanning. Markdown syntax just adds noise.

### extractLinks - Wiki-Link Parsing

```typescript
extractLinks(content: string): Array<{ target: string; context: string }> {
  const links = [];
  const WIKI_LINK_PATTERN = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

  for (const line of content.split('\n')) {
    while ((match = WIKI_LINK_PATTERN.exec(line)) !== null) {
      links.push({
        target: match[1].trim(),
        context: /* surrounding text */
      });
    }
  }

  return links;
}
```

**What this parses:**

| Input | Target | Alias |
|-------|--------|-------|
| `[[note]]` | note | - |
| `[[note\|display]]` | note | display |
| `[[folder/note]]` | folder/note | - |

**Why capture context?**

```markdown
As discussed in [[API Design]], the response format...
```

Context = "As discussed in API Design, the response format..."

Useful for showing WHY notes are linked in backlinks view.

### getOrCreateDailyNote - Idempotent Creation

```typescript
async getOrCreateDailyNote(date: Date = new Date()): Promise<Note> {
  const relativePath = this.getDailyNotePath(date);
  const existing = await this.readNote(relativePath);

  if (existing) {
    return existing;  // Already exists, return it
  }

  // Doesn't exist, create from template
  const template = await this.loadTemplate('daily');
  // ...
  await this.writeNote(relativePath, content);
  return (await this.readNote(relativePath))!;
}
```

**What "idempotent" means:**

```typescript
// Call once or many times, same result
await getOrCreateDailyNote();  // Creates note
await getOrCreateDailyNote();  // Returns same note
await getOrCreateDailyNote();  // Returns same note
```

**Why this pattern?**

At startup, on "daily" command, on timer - multiple places might request today's note. All should work without checking first.

---

## Template System

```typescript
async loadTemplate(name: string): Promise<string> {
  const templatePath = join(VAULT_FOLDERS.TEMPLATES, `${name}.md`);

  if (!existsSync(templatePath)) {
    return this.getDefaultTemplate(name);  // Fallback
  }

  return readFile(templatePath, 'utf-8');
}
```

**Template variable substitution:**

```markdown
<!-- Template -->
---
title: "{{title}}"
created: {{date}}
---
# {{title}}

<!-- After substitution -->
---
title: "My New Note"
created: 2024-01-15
---
# My New Note
```

**Why defaults if template missing?**

User might:
1. Delete templates folder
2. Start fresh without templates
3. Haven't set up templates yet

System should still work! Defaults cover the gap.

---

## Error Handling Strategy

```typescript
async readNote(relativePath: string): Promise<Note | null> {
  if (!existsSync(absolutePath)) {
    return null;  // Not found = null (not error)
  }

  try {
    const content = await readFile(absolutePath, 'utf-8');
    return this.parseNote(...);
  } catch (error) {
    log.error({ err: error, path: relativePath }, 'Failed to read note');
    throw error;  // Unexpected error = throw
  }
}
```

**Two kinds of "not working":**

| Situation | Response | Why |
|-----------|----------|-----|
| Note doesn't exist | Return `null` | Expected case, caller handles |
| File read fails | Throw error | Unexpected, something's wrong |

**This distinction matters:**

```typescript
// Not found is normal
const note = await vault.readNote('maybe-exists.md');
if (!note) {
  console.log('Note not found');  // Handle gracefully
}

// Errors should propagate
try {
  const note = await vault.readNote('exists-but-locked.md');
} catch (error) {
  // Permission denied, disk failure, etc.
  // Should probably show error to user
}
```

---

## File System Safety

### Path Traversal Prevention

Notice we always use `join()`:

```typescript
const absolutePath = join(this.vaultPath, relativePath);
```

**Why this matters:**

```typescript
// DANGEROUS - direct string concatenation
const path = vaultPath + '/' + userInput;
// If userInput = '../../../etc/passwd'
// path = '/Users/owner/vault/../../../etc/passwd' = '/etc/passwd'

// SAFE - join() normalizes
const path = join(vaultPath, '../../../etc/passwd');
// path = '/etc/passwd' (but we should validate!)
```

**Additional validation needed:**

```typescript
// Should add:
if (!absolutePath.startsWith(this.vaultPath)) {
  throw new Error('Path traversal detected');
}
```

### Directory Creation

```typescript
await mkdir(dirname(absolutePath), { recursive: true });
await writeFile(absolutePath, content, 'utf-8');
```

**Why `mkdir` before `writeFile`?**

```typescript
// Writing to notes/subfolder/new-note.md
// If 'subfolder' doesn't exist, writeFile fails!

// recursive: true creates all needed directories
mkdir('a/b/c', { recursive: true });
// Creates 'a', then 'a/b', then 'a/b/c' if needed
```

---

## Common Mistakes

### Mistake 1: Sync File Operations

```typescript
// BAD - blocks event loop
const content = fs.readFileSync(path, 'utf-8');

// GOOD - non-blocking
const content = await fs.promises.readFile(path, 'utf-8');
```

### Mistake 2: Not Handling Missing Files

```typescript
// BAD - crashes on missing file
const content = await readFile(path, 'utf-8');  // Throws!

// GOOD - check first
if (!existsSync(path)) return null;
const content = await readFile(path, 'utf-8');
```

### Mistake 3: Absolute Paths as IDs

```typescript
// BAD - breaks if vault moves
const noteId = '/Users/owner/vault/notes/x.md';

// GOOD - relative and portable
const noteId = 'notes/x.md';
```

### Mistake 4: Not Escaping Regex in User Input

```typescript
// BAD - user input in regex
const pattern = new RegExp(userSearch);  // If userSearch = '[' → error!

// GOOD - escape special characters
const pattern = new RegExp(escapeRegex(userSearch));
```

---

## How This Connects to Senior-Level Thinking

### 1. **Single Responsibility**

VaultService does ONE thing: file operations. It doesn't:
- Update database (that's another service)
- Handle HTTP (that's the API layer)
- Search (that's the search service)

### 2. **Defensive Programming**

- Check file existence before reading
- Use async for non-blocking
- Graceful fallbacks (title, templates)
- Log errors with context

### 3. **Interface Design**

Methods are atomic and composable:
```typescript
// Read + parse
const note = await vault.readNote(path);

// Read + update + write (composed internally)
await vault.updateNoteFrontmatter(path, { status: 'evergreen' });
```

### 4. **Data Integrity**

- Never modify files user didn't ask to modify
- Use gray-matter for consistent frontmatter
- Preserve content user wrote

---

## Questions to Test Understanding

1. Why use relative paths internally instead of absolute?
2. What's the purpose of three title fallbacks?
3. Why is `getOrCreateDailyNote` idempotent?
4. How does the excerpt generator clean markdown?
5. What's the difference between returning `null` vs throwing?
6. Why `mkdir` before `writeFile`?
