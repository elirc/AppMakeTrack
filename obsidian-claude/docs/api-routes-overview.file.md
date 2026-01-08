# API Routes Overview - The Complete REST API

## What These Files Are

The API routes define all HTTP endpoints for the server. Each route file handles a specific domain:

| Route File | Path | Purpose |
|------------|------|---------|
| notes.ts | /api/notes | CRUD for notes |
| daily.ts | /api/daily | Daily note operations |
| search.ts | /api/search | Full-text search |
| time.ts | /api/time | Time tracking |
| stats.ts | /api/stats | Dashboard statistics |
| growth.ts | /api/growth | Competency tracking |
| projects.ts | /api/projects | Project management |

## Complete API Reference

### Notes API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/notes | List notes (paginated) |
| GET | /api/notes/:id | Get single note |
| POST | /api/notes | Create note |
| PUT | /api/notes/:id | Update note |
| DELETE | /api/notes/:id | Delete note |
| GET | /api/notes/:id/backlinks | Get notes linking to this |

### Daily API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/daily | Get today's note |
| GET | /api/daily/:date | Get note for date |
| POST | /api/daily/capture | Quick capture |

### Search API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/search?q=... | Full-text search |
| GET | /api/search/tags | List all tags |
| GET | /api/search/recent | Recently modified |

### Time API

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/time | Log time entry |
| GET | /api/time/today | Today's entries |
| GET | /api/time/week | Week summary |
| GET | /api/time/project/:name | Project time |

### Stats API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/stats/dashboard | Main stats |
| GET | /api/stats/weekly | Week summary |

### Growth API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/growth/competencies | Competency matrix |
| POST | /api/growth/evidence | Add evidence |
| GET | /api/growth/evidence/:dim | Evidence by dimension |
| GET | /api/growth/snapshots | List snapshots |
| POST | /api/growth/snapshots | Generate snapshot |

### Projects API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects | List projects |
| GET | /api/projects/:id | Get project |
| POST | /api/projects | Create project |
| PUT | /api/projects/:id/status | Update status |

---

## My Design Thought Process

### Why Separate Route Files?

I could have put everything in one file:

```typescript
// BAD - one huge file
app.get('/api/notes', ...);
app.post('/api/notes', ...);
app.get('/api/daily', ...);
app.post('/api/time', ...);
// 500+ lines in one file
```

Instead, I separated by domain:

```typescript
// GOOD - domain-focused files
// notes.ts - just note operations
// daily.ts - just daily note operations
// time.ts - just time tracking
```

**Benefits:**
1. **Easier to find code** - Know where to look
2. **Smaller files** - ~150 lines each vs 500+
3. **Independent changes** - Modify time tracking without touching notes
4. **Team-friendly** - Multiple people can work on different routes

### Consistent Patterns Across Routes

Every route file follows the same structure:

```typescript
// 1. Imports
import { Router } from 'express';
import { getDatabase } from '../../db/index.js';
// ...

// 2. Setup
const router = Router();
const log = createChildLogger({ module: 'api:xxx' });
const db = () => getDatabase();

// 3. Helpers
function asyncHandler(...) { ... }
function sendSuccess(...) { ... }
function sendError(...) { ... }

// 4. Routes
router.get('/', asyncHandler(async (req, res) => { ... }));
router.post('/', asyncHandler(async (req, res) => { ... }));

// 5. Export
export { router as xxxRouter };
```

**Why consistency?**
- Learn one pattern, understand all routes
- Copy-paste-modify for new routes
- Bugs are obvious (doesn't follow pattern)

---

## Shared Patterns Deep Dive

### Pattern: asyncHandler Wrapper

Every route has this:

```typescript
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

// Usage
router.get('/', asyncHandler(async (req, res) => {
  const data = await db.getSomething();  // If this throws...
  sendSuccess(res, data);
}));
// ...the error goes to Express error middleware
```

**This is so important it's in every file.** Why not extract to shared utility?

```typescript
// Could do:
import { asyncHandler } from '../../utils/asyncHandler.js';

// But:
// 1. More imports
// 2. Another file to maintain
// 3. Pattern is simple enough to inline
```

For a bigger project, I'd extract it. For this size, inline is fine.

### Pattern: Response Helpers

```typescript
function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

function sendError(res: Response, code: string, message: string, status = 400): void {
  res.status(status).json({ success: false, error: { code, message } });
}
```

**Every response follows the same shape:**

```typescript
// Success
{ success: true, data: ... }

// Error
{ success: false, error: { code: 'XXX', message: '...' } }
```

Frontend can rely on this:

```typescript
const response = await fetch('/api/notes');
const result = await response.json();

if (result.success) {
  setNotes(result.data);
} else {
  showError(result.error.message);
}
```

### Pattern: Lazy Service Access

```typescript
const db = () => getDatabase();
const vault = () => getVaultService();

// In route:
const notes = db().getNotes();  // Note the ()
```

**Why functions?**

```typescript
// Problem: Module loads before config
const db = getDatabase();  // Called at import time!

// Solution: Defer to first use
const db = () => getDatabase();  // Called when route handles request
```

### Pattern: Validate First, Act Second

Every mutating route:

```typescript
router.post('/', asyncHandler(async (req, res) => {
  // 1. VALIDATE
  const result = validate(createNoteSchema, req.body);
  if (!result.success) {
    return sendError(res, 'VALIDATION_ERROR', 'Invalid data', 400);
  }

  // 2. ACT (only with validated data)
  const note = await vault().createNote(result.data);

  // 3. RESPOND
  sendSuccess(res, note, 201);
}));
```

**Never trust req.body directly:**

```typescript
// BAD
const { title, type } = req.body;  // Could be anything!
await vault.createNote(title, type);

// GOOD
const result = validate(schema, req.body);
if (!result.success) return sendError(...);
const { title, type } = result.data;  // Validated!
await vault.createNote(title, type);
```

---

## Domain-Specific Patterns

### Daily Notes: Idempotent Gets

```typescript
router.get('/', asyncHandler(async (req, res) => {
  const note = await vault().getOrCreateDailyNote();  // Creates if missing
  sendSuccess(res, note);
}));
```

**GET that creates?** Controversial but practical:

- User expects today's note to exist
- Creating it is side-effect-free (same result each time)
- Simplifies client code (no "create then get")

This is a pragmatic choice for UX.

### Search: Query Parameters

```typescript
router.get('/', asyncHandler(async (req, res) => {
  const query = req.query.q as string;
  const types = req.query.types;  // Could be string or string[]
}));
```

**Handling array query params:**

```
// URL: /api/search?types=concept&types=solution
req.query.types = ['concept', 'solution']

// URL: /api/search?types=concept
req.query.types = 'concept'  // String, not array!

// Solution:
const types = Array.isArray(req.query.types)
  ? req.query.types
  : [req.query.types];
```

### Growth: Evidence Levels

```typescript
function getLevel(evidenceCount: number): 'junior' | 'mid' | 'senior' {
  if (evidenceCount >= 20) return 'senior';
  if (evidenceCount >= 10) return 'mid';
  return 'junior';
}
```

**Simple heuristic for gamification:**

| Level | Evidence Needed |
|-------|-----------------|
| Junior | 0-9 |
| Mid | 10-19 |
| Senior | 20+ |

This is adjustable. The point is to motivate collecting evidence.

---

## Error Handling Strategy

### HTTP Status Codes Used

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful GET/PUT/DELETE |
| 201 | Created | Successful POST |
| 400 | Bad Request | Validation failed |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Already exists |
| 500 | Server Error | Unexpected error |

### Error Codes (for frontend)

| Code | Meaning |
|------|---------|
| VALIDATION_ERROR | Input didn't pass validation |
| NOT_FOUND | Resource not found |
| ALREADY_EXISTS | Duplicate resource |
| INTERNAL_ERROR | Server bug |

**Frontend uses these:**

```typescript
switch (error.code) {
  case 'VALIDATION_ERROR':
    highlightInvalidFields(error.details.errors);
    break;
  case 'NOT_FOUND':
    showToast('Not found');
    redirectToList();
    break;
  case 'ALREADY_EXISTS':
    showToast('Already exists with that name');
    break;
}
```

---

## Data Flow Architecture

```
HTTP Request
     ↓
Express Router (routes/*.ts)
     ↓
Validation (Zod schemas)
     ↓
Service Layer (vault.ts, search.ts)
     ↓
Data Layer (db/index.ts, file system)
     ↓
Response
```

**Separation of concerns:**
- Routes: HTTP handling, validation, response formatting
- Services: Business logic
- Data: Persistence

---

## Common Mistakes to Avoid

### Mistake 1: Forgetting async error handling

```typescript
// BAD - unhandled rejection
router.get('/', async (req, res) => {
  const notes = await db.getNotes();  // Throws = request hangs
});

// GOOD
router.get('/', asyncHandler(async (req, res) => {
  const notes = await db.getNotes();  // Throws = 500 error
}));
```

### Mistake 2: Trusting input

```typescript
// BAD
router.post('/', (req, res) => {
  await db.createNote(req.body.title);  // Could be anything
});

// GOOD
router.post('/', (req, res) => {
  const result = validate(schema, req.body);
  if (!result.success) return sendError(...);
  await db.createNote(result.data.title);
});
```

### Mistake 3: Inconsistent responses

```typescript
// BAD - different shapes
router.get('/a', (req, res) => res.json(notes));
router.get('/b', (req, res) => res.json({ data: notes }));

// GOOD - consistent shape
router.get('/a', (req, res) => sendSuccess(res, notes));
router.get('/b', (req, res) => sendSuccess(res, notes));
```

### Mistake 4: Not syncing cache

```typescript
// BAD - write to vault, forget cache
await vault.createNote(...);
sendSuccess(res, note);

// GOOD - sync both
await vault.createNote(...);
db.upsertNote(...);  // Update cache
sendSuccess(res, note);
```

---

## How This Connects to Senior-Level Thinking

### 1. **API Design**

- RESTful conventions
- Consistent response format
- Meaningful error codes
- Pagination for lists

### 2. **Code Organization**

- Domain-focused modules
- Consistent patterns
- Clear separation of concerns

### 3. **Defensive Programming**

- Validate all input
- Handle errors explicitly
- Never trust external data

### 4. **Performance Awareness**

- Pagination for large lists
- Database caching
- Lazy service initialization

---

## Questions to Test Understanding

1. Why use separate route files instead of one big file?
2. What does asyncHandler do and why is it needed?
3. Why validate before acting?
4. What's the difference between 400 and 404?
5. Why return both `success` and `error` in responses?
6. Why sync database after vault operations?
