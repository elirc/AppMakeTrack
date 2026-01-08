# schema.ts - Database Schema Design

## What This File Is

This file defines the database schema - the structure of tables, indexes, and queries for our SQLite database. It's the blueprint for how we store and retrieve data efficiently.

## My Thought Process

### The Fundamental Design Decision: Cache, Not Source of Truth

**The problem:**
We have markdown files in an Obsidian vault. We could:
1. Query files directly every time (slow)
2. Store everything in a database (lose Obsidian compatibility)
3. Use database as a cache (best of both worlds)

**I chose option 3:**

```
┌─────────────────────┐
│  Obsidian Vault     │  ← Source of truth
│  (Markdown files)   │  ← Human-readable
│                     │  ← Git-friendly
└─────────┬───────────┘
          │ Parse & index
          ▼
┌─────────────────────┐
│  SQLite Cache       │  ← Fast queries
│  (.cache.db)        │  ← Aggregations
│                     │  ← Can be rebuilt
└─────────────────────┘
```

**Benefits:**
- Files stay human-readable (edit in Obsidian, VS Code, etc.)
- Files are Git-friendly (version control)
- Queries are fast (SQLite indexes)
- Cache can be rebuilt anytime (delete .cache.db, restart)

---

## Schema Design Decisions

### Table: `notes`

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,              -- File path relative to vault root
  title TEXT NOT NULL,
  type TEXT,
  status TEXT,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,
  excerpt TEXT
);
```

**Why TEXT for id instead of INTEGER?**

Using file path as ID:
- Natural identifier (notes/my-note.md)
- No mapping table needed
- Matches how Obsidian references notes
- Human-readable in queries

**Why TEXT for dates instead of INTEGER timestamps?**

```sql
-- TEXT (ISO 8601)
created_at = '2024-01-15T10:30:00Z'

-- INTEGER (Unix timestamp)
created_at = 1705315800
```

SQLite doesn't have a native datetime type. TEXT is:
- Human-readable when debugging
- Sortable (ISO dates sort correctly as strings)
- Standard format

**Why nullable `type` and `status`?**

Not all notes have frontmatter. A quick capture might just be:
```markdown
Remember to check the API response format
```

No type, no status - and that's okay. The schema shouldn't force structure.

### Indexes: The Performance Secret

```sql
CREATE INDEX idx_notes_modified ON notes(modified_at DESC);
CREATE INDEX idx_notes_type ON notes(type);
CREATE INDEX idx_notes_status ON notes(status);
```

**What indexes do:**

Without index:
```sql
SELECT * FROM notes WHERE type = 'concept';
-- SQLite scans EVERY row, checks type
-- 10,000 notes = 10,000 comparisons
```

With index:
```sql
SELECT * FROM notes WHERE type = 'concept';
-- SQLite looks up 'concept' in index
-- Directly jumps to matching rows
-- 10,000 notes = ~100 comparisons (if 1% are concepts)
```

**Why `DESC` on modified_at?**

```sql
CREATE INDEX idx_notes_modified ON notes(modified_at DESC);
```

Most common query is "recent notes first":
```sql
SELECT * FROM notes ORDER BY modified_at DESC LIMIT 20;
```

DESC index is already in the right order - no sorting needed.

### Table: Normalized Tags

```sql
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE note_tags (
  note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);
```

**Why normalize tags?**

Option 1: Store tags as JSON in notes table
```sql
-- Denormalized
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  tags TEXT  -- '["react", "hooks"]'
);

-- Query: Find notes with tag 'react'
SELECT * FROM notes WHERE tags LIKE '%react%';
-- Problems:
-- 1. Matches 'react-native' too
-- 2. Can't use index
-- 3. Slow on large datasets
```

Option 2: Normalized junction table (what I chose)
```sql
-- Query: Find notes with tag 'react'
SELECT n.* FROM notes n
JOIN note_tags nt ON n.id = nt.note_id
JOIN tags t ON nt.tag_id = t.id
WHERE t.name = 'react';
-- Benefits:
-- 1. Exact match only
-- 2. Uses indexes
-- 3. Fast on any size
```

**The tradeoff:**
- More complex queries (JOINs)
- More tables to maintain
- But: Correct results and good performance

**Senior insight:** Denormalization is tempting for simplicity, but often leads to bugs and performance issues. Start normalized, denormalize only when you have proof it's needed.

### Foreign Keys and CASCADE

```sql
note_id TEXT REFERENCES notes(id) ON DELETE CASCADE
```

**What `ON DELETE CASCADE` means:**

```sql
-- When you delete a note:
DELETE FROM notes WHERE id = 'notes/old-note.md';

-- CASCADE automatically deletes related records:
-- DELETE FROM note_tags WHERE note_id = 'notes/old-note.md';
-- DELETE FROM links WHERE source_id = 'notes/old-note.md';
```

**Why CASCADE?**
- No orphaned records
- No manual cleanup code
- Database enforces integrity

### Table: Links (for Backlinks)

```sql
CREATE TABLE links (
  source_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
  target_id TEXT,  -- May reference non-existent note
  context TEXT,
  PRIMARY KEY (source_id, target_id)
);
```

**Why `target_id` doesn't have REFERENCES?**

In Obsidian, you can link to notes that don't exist yet:
```markdown
See [[future-topic]] for more details.
```

The link is valid even though `future-topic.md` doesn't exist. If we had a foreign key, we couldn't store this link.

**The `context` column:**

Stores text around the link for previews:
```
"...as discussed in [[API Design]], the response format should..."
```

Useful for showing WHY a note is linked, not just THAT it's linked.

---

## Query Design Patterns

### Pattern 1: Upsert (Insert or Update)

```sql
INSERT INTO notes (id, title, ...)
VALUES (?, ?, ...)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  modified_at = excluded.modified_at
```

**What this does:**
- If note doesn't exist: INSERT
- If note exists: UPDATE

**Why not separate INSERT and UPDATE?**

```typescript
// Without upsert - two queries, race condition possible
const exists = await db.get('SELECT 1 FROM notes WHERE id = ?', [id]);
if (exists) {
  await db.run('UPDATE notes SET ...', [...]);
} else {
  await db.run('INSERT INTO notes ...', [...]);
}

// With upsert - one atomic query
await db.run('INSERT ... ON CONFLICT DO UPDATE ...', [...]);
```

### Pattern 2: Parameterized Queries

```sql
SELECT * FROM notes WHERE type = $type AND status = $status
```

**Why `$type` instead of string concatenation?**

```typescript
// BAD - SQL injection vulnerable
const query = `SELECT * FROM notes WHERE type = '${userInput}'`;
// If userInput = "'; DROP TABLE notes; --"
// Query becomes: SELECT * FROM notes WHERE type = ''; DROP TABLE notes; --'

// GOOD - parameterized
const query = 'SELECT * FROM notes WHERE type = ?';
db.prepare(query).get(userInput);
// userInput is treated as data, never as SQL
```

**This is CRITICAL security.** Never concatenate user input into SQL.

### Pattern 3: Optional Filters

```sql
WHERE ($type IS NULL OR n.type = $type)
  AND ($status IS NULL OR n.status = $status)
```

**What this pattern does:**

```typescript
// If type is null, condition is always true (no filter)
// If type is 'concept', only concepts are returned

getNotesWithFilters({ type: 'concept', status: null })
// Returns all concepts, regardless of status

getNotesWithFilters({ type: null, status: 'evergreen' })
// Returns all evergreen notes, regardless of type
```

One query handles all combinations of filters.

### Pattern 4: Aggregations

```sql
SELECT
  dimension,
  COUNT(*) as count,
  MAX(date) as last_date
FROM evidence
GROUP BY dimension
```

**Why aggregate in SQL?**

```typescript
// BAD - fetch all, aggregate in JS
const evidence = db.all('SELECT * FROM evidence');
const summary = {};
for (const e of evidence) {
  summary[e.dimension] = (summary[e.dimension] || 0) + 1;
}

// GOOD - aggregate in SQL
const summary = db.all(`
  SELECT dimension, COUNT(*) as count
  FROM evidence
  GROUP BY dimension
`);
```

SQL aggregations are:
- Faster (database is optimized for this)
- Less data transfer (summary vs all rows)
- Less memory usage

---

## Schema Version and Migrations

```sql
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
```

**Why track schema version?**

As your app evolves, the schema changes:
- v1: Initial schema
- v2: Add new column
- v3: Add new index

**Migration pattern:**

```typescript
const currentVersion = db.get('SELECT MAX(version) FROM schema_version');

if (currentVersion < 2) {
  db.run('ALTER TABLE notes ADD COLUMN new_field TEXT');
  db.run('INSERT INTO schema_version (version) VALUES (2)');
}

if (currentVersion < 3) {
  db.run('CREATE INDEX idx_notes_new ON notes(new_field)');
  db.run('INSERT INTO schema_version (version) VALUES (3)');
}
```

Each user's database upgrades incrementally when they update the app.

---

## Common Mistakes

### Mistake 1: No Indexes

```sql
-- BAD - no index, full table scan
CREATE TABLE notes (id TEXT, type TEXT, ...);
SELECT * FROM notes WHERE type = 'concept';  -- Slow!

-- GOOD - indexed
CREATE INDEX idx_notes_type ON notes(type);
SELECT * FROM notes WHERE type = 'concept';  -- Fast!
```

### Mistake 2: Over-Indexing

```sql
-- BAD - index everything
CREATE INDEX idx_1 ON notes(title);
CREATE INDEX idx_2 ON notes(word_count);
CREATE INDEX idx_3 ON notes(excerpt);
-- Slows down writes, wastes space

-- GOOD - index what you query
CREATE INDEX idx_notes_type ON notes(type);  -- You filter by type
-- Don't index word_count if you never query by it
```

### Mistake 3: SQL Injection

```typescript
// BAD
db.run(`DELETE FROM notes WHERE id = '${userInput}'`);

// GOOD
db.run('DELETE FROM notes WHERE id = ?', [userInput]);
```

### Mistake 4: Missing Foreign Key Cleanup

```sql
-- BAD - orphaned tags when note deleted
DELETE FROM notes WHERE id = ?;
-- note_tags still has entries for this note!

-- GOOD - CASCADE handles it
CREATE TABLE note_tags (
  note_id TEXT REFERENCES notes(id) ON DELETE CASCADE
);
```

---

## How This Connects to Senior-Level Thinking

### 1. **Data Modeling**

Good schema design:
- Reflects the domain (notes, tags, links)
- Optimizes for access patterns (what queries are common?)
- Balances normalization vs. performance

### 2. **Performance Awareness**

Understanding:
- When indexes help (reads) vs. hurt (writes)
- Why aggregations belong in SQL
- Cost of full table scans

### 3. **Security Mindset**

Always:
- Parameterize queries
- Validate input before database
- Use foreign keys for integrity

### 4. **Evolution Planning**

Schema will change. Plan for:
- Version tracking
- Incremental migrations
- Backward compatibility

---

## Questions to Test Understanding

1. Why use file path as the note ID instead of auto-increment?
2. What's the difference between the notes table and the markdown files?
3. Why normalize tags into a separate table?
4. What does `ON DELETE CASCADE` do?
5. Why use `ON CONFLICT DO UPDATE` instead of separate INSERT/UPDATE?
6. How do optional filters work with `($type IS NULL OR n.type = $type)`?
