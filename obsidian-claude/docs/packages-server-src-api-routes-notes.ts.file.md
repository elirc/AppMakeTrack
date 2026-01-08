# notes.ts - Notes API Routes

## What This File Is

This file defines the REST API endpoints for notes. It's where HTTP requests become database operations and file changes.

## My Thought Process

### REST API Design Principles

I followed standard REST conventions:

| HTTP Method | Path | Action | Response |
|-------------|------|--------|----------|
| GET | /notes | List all | 200 + array |
| GET | /notes/:id | Get one | 200 or 404 |
| POST | /notes | Create | 201 + created |
| PUT | /notes/:id | Update | 200 + updated |
| DELETE | /notes/:id | Delete | 200 + confirmation |

**Why these conventions?**
- Predictable for frontend developers
- Self-documenting (verb = action)
- Standard HTTP semantics
- Cacheable (GET is idempotent)

---

## Key Patterns Explained

### Pattern 1: Async Handler Wrapper

```typescript
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Usage
router.get('/', asyncHandler(async (req, res) => {
  const notes = await db.getNotes();  // Async operation
  res.json(notes);
}));
```

**Why this wrapper?**

Express doesn't handle async errors automatically:

```typescript
// BAD - unhandled rejection if getNotes() throws
router.get('/', async (req, res) => {
  const notes = await db.getNotes();  // Throws!
  res.json(notes);
});
// Error is swallowed, request hangs forever

// GOOD - errors passed to Express error handler
router.get('/', asyncHandler(async (req, res) => {
  const notes = await db.getNotes();  // Throws!
  res.json(notes);
}));
// Error caught, passed to next(), handled by error middleware
```

**How it works:**
1. Wrap the async function
2. Return a sync function Express understands
3. Catch any rejections
4. Pass errors to `next()` for error middleware

### Pattern 2: Consistent Response Helpers

```typescript
function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

function sendError(res: Response, code: string, message: string, status = 400): void {
  res.status(status).json({
    success: false,
    error: { code, message },
  });
}
```

**Why helpers instead of inline?**

```typescript
// WITHOUT helpers - inconsistent, verbose
router.get('/a', (req, res) => {
  res.json({ data: notes });  // Missing success field
});
router.get('/b', (req, res) => {
  res.json({ success: true, data: notes });  // Different structure
});
router.get('/c', (req, res) => {
  res.status(200).json({ ok: true, notes });  // Another variation!
});

// WITH helpers - consistent, concise
router.get('/a', (req, res) => sendSuccess(res, notes));
router.get('/b', (req, res) => sendSuccess(res, notes));
router.get('/c', (req, res) => sendSuccess(res, notes));
```

**The type parameter `<T>`:**
```typescript
sendSuccess<Note>(res, note);      // TypeScript knows data is Note
sendSuccess<Note[]>(res, notes);   // TypeScript knows data is Note[]
```

### Pattern 3: Input Validation at the Boundary

```typescript
router.post('/', asyncHandler(async (req, res) => {
  // FIRST: Validate input
  const result = validate(createNoteSchema, req.body);

  if (!result.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Invalid note data', 400, {
      errors: formatErrors(result.errors),
    });
  }

  // THEN: Use validated data (type-safe!)
  const { title, type, content } = result.data;
  // ...
}));
```

**Why validate first?**

```
req.body (unknown)
     ↓
validate() - check shape, types, constraints
     ↓
result.data (typed!) - safe to use
```

After validation:
- `title` is definitely a non-empty string
- `type` is definitely a valid NoteType
- TypeScript knows the types

**Early return on error:**
```typescript
if (!result.success) {
  return sendError(...);  // Return stops execution here
}

// Only reaches here if validation passed
const { title } = result.data;  // Safe!
```

### Pattern 4: Wildcard Route Parameter

```typescript
router.get('/:id(*)', asyncHandler(async (req, res) => {
  const id = req.params.id;  // "notes/subfolder/my-note.md"
}));
```

**Why `(*)`?**

Note IDs are file paths with slashes:
```
notes/my-note.md
notes/subfolder/deep/note.md
```

Without `(*)`:
```typescript
router.get('/:id', ...)
// /api/notes/notes/my-note.md
// Express sees: id = "notes", then looks for /my-note.md route
// Result: 404!

// With (*)
router.get('/:id(*)', ...)
// /api/notes/notes/my-note.md
// Express sees: id = "notes/my-note.md"
// Result: Works!
```

**URL encoding:**

The frontend should URL-encode the ID:
```javascript
const id = 'notes/my-note.md';
const url = `/api/notes/${encodeURIComponent(id)}`;
// url = '/api/notes/notes%2Fmy-note.md'
```

Express automatically decodes `%2F` back to `/`.

### Pattern 5: Lazy Service Access

```typescript
const db = () => getDatabase();
const vault = () => getVaultService();

// Usage
router.get('/', asyncHandler(async (req, res) => {
  const notes = db().getNotes();  // Note: db() not db
}));
```

**Why functions instead of direct reference?**

```typescript
// BAD - singleton created at module load
import { getDatabase } from '../../db/index.js';
const db = getDatabase();  // Called when module loads!

// Routes defined...

// PROBLEM: If config hasn't loaded yet, database path is wrong!
```

```typescript
// GOOD - singleton created on first use
const db = () => getDatabase();

// Routes defined...

// First request comes in
db().getNotes();  // NOW getDatabase() is called
// Config is definitely loaded by now
```

**This is lazy initialization** - defer work until it's needed.

### Pattern 6: Write-Through Caching

```typescript
router.post('/', asyncHandler(async (req, res) => {
  // 1. Write to vault (source of truth)
  const note = await vault().createNote(folder, filename, { ... });

  // 2. Update database cache
  db().upsertNote({
    id: note.id,
    title: note.title,
    // ...
  });

  // 3. Update link index
  const links = vault().extractLinks(note.content);
  db().updateLinks(note.id, links);

  sendSuccess(res, note, 201);
}));
```

**Write-through cache pattern:**
```
Write request
     ↓
Write to source of truth (vault/files)
     ↓
Update cache (database)
     ↓
Respond
```

**Why not just write to database?**

If database is primary:
- Files and database can get out of sync
- Obsidian edits don't reflect
- Can't use standard text editors

With vault as primary:
- Files are always correct
- Database is rebuildable
- Obsidian works normally

---

## Route-by-Route Analysis

### GET / - List Notes

```typescript
router.get('/', asyncHandler(async (req, res) => {
  // 1. Validate pagination
  const paginationResult = validate(paginationSchema, {
    page: req.query.page ? Number(req.query.page) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });

  // 2. Extract filters
  const type = req.query.type as string | undefined;

  // 3. Query database
  const { notes, total } = db().getNotes({ type, limit, offset });

  // 4. Return with pagination metadata
  sendSuccess(res, {
    notes,
    pagination: { page, limit, total, totalPages }
  });
}));
```

**Pagination formula:**
```typescript
offset = (page - 1) * limit

// Page 1, limit 20: offset = 0  (items 0-19)
// Page 2, limit 20: offset = 20 (items 20-39)
// Page 3, limit 20: offset = 40 (items 40-59)
```

**Why return pagination metadata?**

Frontend needs to know:
- Current page (for highlighting)
- Total pages (for "Page 1 of 10")
- Total items (for "Showing 1-20 of 150")

### POST / - Create Note

```typescript
router.post('/', asyncHandler(async (req, res) => {
  // Validate
  const result = validate(createNoteSchema, req.body);
  if (!result.success) return sendError(...);

  // Determine folder
  const folder = type === 'project' ? 'projects' : 'notes';

  // Generate filename
  const filename = `${slugify(title)}.md`;

  try {
    // Create in vault
    const note = await vault().createNote(folder, filename, { ... });

    // Index in database
    db().upsertNote({ ... });

    sendSuccess(res, note, 201);
  } catch (error) {
    if (error.message.includes('already exists')) {
      return sendError(res, 'ALREADY_EXISTS', '...', 409);
    }
    throw error;
  }
}));
```

**Status code 201:**
```
200 OK = Request succeeded
201 Created = Request succeeded AND created a resource
```

Use 201 for POST that creates something.

**409 Conflict:**
```
409 = Request conflicts with current state
```

"Note already exists" is a conflict - the resource you're trying to create already exists.

### PUT /:id - Update Note

```typescript
router.put('/:id(*)', asyncHandler(async (req, res) => {
  // Check exists
  const existing = await vault().readNote(id);
  if (!existing) return sendError(..., 404);

  // Validate updates
  const result = validate(updateNoteSchema, req.body);

  // Handle content update vs frontmatter-only
  if (updates.content !== undefined) {
    // Rebuild entire file
  } else {
    // Just update frontmatter
  }

  // Re-read and return
  const note = await vault().readNote(id);
  sendSuccess(res, note);
}));
```

**Why two update paths?**

1. **Full content update** - User edited the markdown body
   - Must rebuild entire file (frontmatter + body)

2. **Frontmatter-only** - User changed tags, status, etc.
   - Can use simpler updateNoteFrontmatter()

**Optimistic update pattern:**
```
1. Check exists (404 if not)
2. Validate input (400 if invalid)
3. Make changes
4. Re-read from source (verify changes applied)
5. Return updated entity
```

### DELETE /:id - Delete Note

```typescript
router.delete('/:id(*)', asyncHandler(async (req, res) => {
  // Check exists
  const existing = await vault().readNote(id);
  if (!existing) return sendError(..., 404);

  // Delete from vault
  await vault().deleteNote(id);

  // Delete from database
  db().deleteNote(id);

  sendSuccess(res, { deleted: true, id });
}));
```

**Why return `{ deleted: true, id }`?**

Options for delete response:
```typescript
// Option 1: Empty 204
res.status(204).send();
// Pro: RESTful
// Con: No confirmation of what was deleted

// Option 2: Confirmation object
res.json({ deleted: true, id: 'notes/x.md' });
// Pro: Clear confirmation
// Con: Slightly more data

// Option 3: Return deleted entity
res.json({ deleted: note });
// Pro: Can undo
// Con: More data, entity is gone anyway
```

I chose option 2 - clear confirmation without extra data.

---

## Error Handling Strategy

| Situation | Status | Code | Example |
|-----------|--------|------|---------|
| Invalid input | 400 | VALIDATION_ERROR | Missing title |
| Not found | 404 | NOT_FOUND | Note doesn't exist |
| Already exists | 409 | ALREADY_EXISTS | Duplicate title |
| Server error | 500 | INTERNAL_ERROR | Database crash |

**Specific error codes help frontend:**
```typescript
switch (error.code) {
  case 'VALIDATION_ERROR':
    showFieldErrors(error.details.errors);
    break;
  case 'NOT_FOUND':
    redirect('/notes');
    break;
  case 'ALREADY_EXISTS':
    showToast('Note with this title exists');
    break;
}
```

---

## Common Mistakes

### Mistake 1: Not Handling Async Errors

```typescript
// BAD - unhandled rejection
router.get('/', async (req, res) => {
  const notes = await db.getNotes();  // If this throws, request hangs
});

// GOOD - wrapped
router.get('/', asyncHandler(async (req, res) => {
  const notes = await db.getNotes();  // Error goes to error middleware
}));
```

### Mistake 2: Trusting req.body

```typescript
// BAD - no validation
router.post('/', (req, res) => {
  const note = await vault.createNote(req.body.title, ...);
  // What if title is missing? Or a number? Or SQL injection?
});

// GOOD - validated
router.post('/', (req, res) => {
  const result = validate(schema, req.body);
  if (!result.success) return sendError(...);
  // Now result.data is safe
});
```

### Mistake 3: Wrong Status Codes

```typescript
// BAD - 200 for everything
router.post('/', (req, res) => res.status(200).json(note));
router.delete('/', (req, res) => res.status(200).json({ ok: true }));

// GOOD - semantic status codes
router.post('/', (req, res) => res.status(201).json(note));  // Created
router.delete('/', (req, res) => res.status(200).json(...)); // OK (or 204)
```

### Mistake 4: Not Syncing Cache

```typescript
// BAD - write to vault, forget cache
await vault.createNote(...);
sendSuccess(res, note);
// Database is now out of sync!

// GOOD - update both
await vault.createNote(...);
db.upsertNote(...);  // Keep cache in sync
sendSuccess(res, note);
```

---

## How This Connects to Senior-Level Thinking

### 1. **API Design**

- Consistent response format
- Semantic HTTP methods/status codes
- Proper error codes
- Pagination metadata

### 2. **Defensive Programming**

- Validate all input
- Check existence before operations
- Handle edge cases (already exists)
- Wrap async operations

### 3. **Separation of Concerns**

- Route layer: HTTP handling
- Service layer: Business logic (vault)
- Data layer: Persistence (database)

### 4. **Caching Strategy**

- Write-through cache
- Source of truth awareness
- Sync on every write

---

## Questions to Test Understanding

1. Why wrap async handlers in `asyncHandler()`?
2. What does `/:id(*)` capture that `/:id` doesn't?
3. Why validate before doing any work?
4. What's the difference between 400, 404, and 409?
5. Why update the database after writing to vault?
6. When would you return 201 vs 200?
