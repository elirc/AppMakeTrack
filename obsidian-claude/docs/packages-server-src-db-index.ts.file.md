# db/index.ts - Database Service Implementation

## What This File Is

This is the database service - the code that actually talks to SQLite. It handles connections, prepared statements, transactions, and provides type-safe methods for all database operations.

## My Thought Process

### Why a Class vs. Functions?

I chose a class (`DatabaseService`) because:

```typescript
// With a class - state is encapsulated
class DatabaseService {
  private db: Database;           // Connection
  private statements: Map<...>;   // Cached statements

  getNotes() { /* use this.db */ }
}

// With functions - state must be passed or global
let db: Database;
let statements: Map<...>;

function getNotes() { /* use global db */ }
```

**Benefits of class approach:**
1. Encapsulates connection and cached statements
2. Can have multiple instances (for testing)
3. Clear lifecycle (constructor, close)
4. Methods have access to shared state

### Singleton Pattern with Lazy Initialization

```typescript
let instance: DatabaseService | null = null;

export function getDatabase(): DatabaseService {
  if (!instance) {
    instance = new DatabaseService();
  }
  return instance;
}
```

**Why singleton?**
- Database connections are expensive to create
- Multiple connections can cause locking issues
- One connection is enough for this app

**Why lazy initialization?**
- Don't create database until needed
- Allows configuration to load first
- Easier testing (can mock before first call)

---

## Key Patterns Explained

### Pattern 1: Prepared Statement Caching

```typescript
private statements: Map<string, Database.Statement> = new Map();

private prepare(sql: string): Database.Statement {
  let stmt = this.statements.get(sql);
  if (!stmt) {
    stmt = this.db.prepare(sql);
    this.statements.set(sql, stmt);
  }
  return stmt;
}
```

**What prepared statements do:**

```javascript
// Without prepared statement
db.exec(`SELECT * FROM notes WHERE id = '${id}'`);
// 1. Parse SQL
// 2. Plan query
// 3. Execute

// With prepared statement
const stmt = db.prepare('SELECT * FROM notes WHERE id = ?');
stmt.get(id);
// First call: 1. Parse SQL, 2. Plan query, 3. Execute
// Later calls: 3. Execute only (reuses parse & plan)
```

**Performance benefit:**

| Operation | Without Prep | With Prep |
|-----------|--------------|-----------|
| Parse SQL | Every time | Once |
| Plan query | Every time | Once |
| Execute | Every time | Every time |

For queries run many times, this is 2-3x faster.

**Security benefit:**

Prepared statements also prevent SQL injection:
```javascript
// Parameter is ALWAYS treated as data, never as SQL
stmt.get(userInput);  // Safe even if userInput is malicious
```

### Pattern 2: Transactions for Consistency

```typescript
upsertNote(note) {
  const transaction = this.db.transaction(() => {
    // Multiple operations that must succeed or fail together
    this.prepare(QUERIES.insertNote).run(...);
    this.prepare(QUERIES.deleteNoteTags).run(note.id);
    for (const tag of note.tags) {
      this.prepare(QUERIES.insertTag).run(tag);
      // ...
    }
  });

  transaction();  // Executes atomically
}
```

**What transactions guarantee:**

| Property | Meaning |
|----------|---------|
| Atomic | All changes succeed or none do |
| Consistent | Database stays valid |
| Isolated | Other queries don't see partial changes |
| Durable | Changes survive crashes |

**Without transaction:**
```javascript
// If this crashes mid-way...
insertNote(note);          // ✓ Succeeds
deleteNoteTags(note.id);   // ✓ Succeeds
insertTag(tag1);           // ✓ Succeeds
insertTag(tag2);           // ✗ Crashes here!
// Result: Note has only some tags - inconsistent!
```

**With transaction:**
```javascript
// If this crashes mid-way...
transaction(() => {
  insertNote(note);
  deleteNoteTags(note.id);
  insertTag(tag1);
  insertTag(tag2);  // Crash here
});
// Result: Everything rolled back - database unchanged
```

### Pattern 3: Row Type Mapping

```typescript
// Database row (matches SQL columns)
interface NoteRow {
  id: string;
  created_at: string;   // snake_case (SQL convention)
  word_count: number;
}

// Application type (from shared package)
interface NoteSummary {
  id: string;
  createdAt: string;    // camelCase (JS convention)
  wordCount: number;
}

// Mapping function
private rowToNoteSummary(row: NoteRow, tags: string[]): NoteSummary {
  return {
    id: row.id,
    createdAt: row.created_at,
    wordCount: row.word_count,
    tags,
  };
}
```

**Why separate types?**

1. **Convention mismatch**: SQL uses snake_case, JavaScript uses camelCase
2. **Transformation needed**: Sometimes database values need processing
3. **Abstraction**: Application code shouldn't know database details

**The boundary:**
```
Database (snake_case) → rowToX() → Application (camelCase)
```

### Pattern 4: SQLite Pragmas

```typescript
// Enable foreign keys (disabled by default!)
this.db.pragma('foreign_keys = ON');

// WAL mode for better performance
this.db.pragma('journal_mode = WAL');
```

**Foreign keys pragma:**

SQLite has foreign keys but they're OFF by default (historical reasons):
```sql
CREATE TABLE note_tags (
  note_id TEXT REFERENCES notes(id) ON DELETE CASCADE
);

-- With foreign_keys = OFF:
INSERT INTO note_tags (note_id, tag_id) VALUES ('nonexistent', 1);
-- Works! But shouldn't.

-- With foreign_keys = ON:
INSERT INTO note_tags (note_id, tag_id) VALUES ('nonexistent', 1);
-- Error: FOREIGN KEY constraint failed
```

**WAL (Write-Ahead Logging) mode:**

```
Normal mode:
  Write → Lock database → Write to file → Unlock
  Readers blocked during writes

WAL mode:
  Write → Append to WAL file → Later merge to main
  Readers never blocked, use snapshot
```

WAL is faster for read-heavy workloads (which we have).

---

## Method Analysis

### upsertNote - The Most Complex Method

```typescript
upsertNote(note: { ... }): void {
  const transaction = this.db.transaction(() => {
    // 1. Insert or update the note itself
    this.prepare(QUERIES.insertNote).run(
      note.id, note.title, note.type, note.status,
      note.createdAt, note.modifiedAt, note.wordCount, note.excerpt
    );

    // 2. Clear existing tag associations
    this.prepare(QUERIES.deleteNoteTags).run(note.id);

    // 3. Re-create tag associations
    for (const tagName of note.tags) {
      // 3a. Ensure tag exists
      this.prepare(QUERIES.insertTag).run(tagName);

      // 3b. Get tag's ID
      const tag = this.prepare(QUERIES.getTagId).get(tagName);

      // 3c. Link note to tag
      this.prepare(QUERIES.insertNoteTag).run(note.id, tag.id);
    }
  });

  transaction();
}
```

**Why this complexity?**

Tags are normalized (separate table). When updating a note:
- Old tags: [react, hooks]
- New tags: [react, typescript]

We could try to diff (remove hooks, add typescript), but simpler to:
1. Delete all existing links
2. Re-create with new tags

**Performance tradeoff:**
- Slightly slower (extra deletes)
- Much simpler code
- Runs in transaction (fast)

For a personal app, simplicity wins.

### getNotes - Filtering and Pagination

```typescript
getNotes(options: {
  type?: string | null;
  status?: string | null;
  tag?: string | null;
  limit?: number;
  offset?: number;
}): { notes: NoteSummary[]; total: number } {
```

**Returning both data and total count:**

```typescript
// For pagination UI, you need:
// 1. The current page of items
// 2. Total count (to show "Page 1 of 10")

return { notes, total: countRow.count };

// In the UI:
const totalPages = Math.ceil(total / limit);
```

**Why two queries instead of one?**

```sql
-- Can't get total AND paginated results in one query
-- This returns only 20 rows, can't know total:
SELECT * FROM notes LIMIT 20;

-- SQLite has no window function for total in same query
-- So we run COUNT(*) separately
```

---

## Lifecycle Management

### Initialization Flow

```typescript
constructor(dbPath: string) {
  // 1. Open connection
  this.db = new Database(dbPath);

  // 2. Enable features
  this.db.pragma('foreign_keys = ON');
  this.db.pragma('journal_mode = WAL');

  // 3. Create/update schema
  this.initializeSchema();
}
```

**Order matters:**
- Pragmas before schema creation
- Schema before any queries

### Shutdown Flow

```typescript
close(): void {
  this.db.close();
}

export function closeDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
```

**Why close explicitly?**

```javascript
// BAD - connection never closed
process.exit(0);
// Data might not be flushed to disk!

// GOOD - clean shutdown
closeDatabase();
process.exit(0);
// WAL is checkpointed, data safe
```

In practice, use shutdown handlers:
```typescript
process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});
```

---

## Error Handling Philosophy

Notice there's minimal try/catch in this file. Why?

**Let errors propagate:**
```typescript
// BAD - swallows errors
upsertNote(note) {
  try {
    // ...
  } catch (e) {
    console.error('Error:', e);
    // Returns nothing, caller doesn't know it failed
  }
}

// GOOD - let it throw
upsertNote(note) {
  // If this fails, caller should know
  this.prepare(QUERIES.insertNote).run(...);
}
```

**Handle errors at the appropriate level:**
- Database layer: Let errors propagate
- Service layer: Might catch and transform
- API layer: Catch and return error response

---

## Common Mistakes

### Mistake 1: Forgetting Foreign Keys Pragma

```typescript
// BAD - foreign keys silently ignored
const db = new Database('app.db');
// INSERT with invalid foreign key works!

// GOOD
const db = new Database('app.db');
db.pragma('foreign_keys = ON');
// INSERT with invalid foreign key fails
```

### Mistake 2: Not Using Transactions

```typescript
// BAD - partial updates possible
this.prepare(INSERT_NOTE).run(...);
this.prepare(DELETE_TAGS).run(...);
this.prepare(INSERT_TAGS).run(...);  // Crash here = inconsistent

// GOOD - all or nothing
const transaction = this.db.transaction(() => {
  this.prepare(INSERT_NOTE).run(...);
  this.prepare(DELETE_TAGS).run(...);
  this.prepare(INSERT_TAGS).run(...);
});
transaction();
```

### Mistake 3: Creating Statements in Loops

```typescript
// BAD - re-parses every iteration
for (const tag of tags) {
  this.db.prepare('INSERT INTO tags (name) VALUES (?)').run(tag);
}

// GOOD - prepare once, run many times
const stmt = this.prepare('INSERT INTO tags (name) VALUES (?)');
for (const tag of tags) {
  stmt.run(tag);
}
```

### Mistake 4: Exposing Database Types

```typescript
// BAD - leaks database structure
function getNotes(): NoteRow[] {
  return db.all('SELECT * FROM notes');  // snake_case fields
}

// GOOD - return application types
function getNotes(): NoteSummary[] {
  const rows = db.all('SELECT * FROM notes');
  return rows.map(rowToNoteSummary);  // camelCase fields
}
```

---

## How This Connects to Senior-Level Thinking

### 1. **Separation of Concerns**

- Schema (schema.ts): What the database looks like
- Service (index.ts): How to interact with it
- Types (@shared): What the rest of app sees

### 2. **Performance Awareness**

- Prepared statement caching
- WAL mode
- Transactions for batched writes
- Understanding query cost

### 3. **Defensive Programming**

- Foreign keys enforced
- Transactions for consistency
- Type-safe returns
- Proper shutdown handling

### 4. **Abstraction Boundaries**

Application code doesn't know:
- It's SQLite (could swap to Postgres)
- Column names are snake_case
- How joins work

It just calls `getNotes()` and gets typed results.

---

## Questions to Test Understanding

1. Why cache prepared statements in a Map?
2. What does `foreign_keys = ON` pragma enable?
3. Why wrap multiple operations in a transaction?
4. Why return `{ notes, total }` instead of just `notes`?
5. Why have both `NoteRow` (internal) and `NoteSummary` (exported)?
6. When would you NOT use the singleton pattern for database?
