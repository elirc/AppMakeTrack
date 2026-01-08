# app.ts - Express Application Factory

## What This File Is

This file creates and configures the Express application. It's separated from the server startup (index.ts) so we can:
1. Test the app without starting a server
2. Use the same app configuration for different entry points

## My Thought Process

### Why Separate app.ts from index.ts?

```typescript
// BAD - everything in one file
// index.ts
const app = express();
app.use(cors());
app.use(express.json());
// ... 200 lines of routes ...
app.listen(3000);

// Testing this requires starting a server!
```

```typescript
// GOOD - separated concerns
// app.ts - just configuration
export function createApp() {
  const app = express();
  // Configure and return
  return app;
}

// index.ts - just startup
import { createApp } from './app.js';
const app = createApp();
app.listen(3000);

// test.ts - no server needed!
import { createApp } from './app.js';
const app = createApp();
request(app).get('/api/health').expect(200);
```

**The factory pattern** (`createApp` function) lets us create fresh app instances - essential for testing.

---

## Key Patterns Explained

### Pattern 1: CORS Configuration

```typescript
app.use(
  cors({
    origin: config.isDev ? 'http://localhost:5173' : false,
    credentials: true,
  })
);
```

**What CORS prevents:**

```javascript
// Frontend at http://localhost:5173
fetch('http://localhost:3000/api/notes')
// Browser blocks: "CORS policy: No 'Access-Control-Allow-Origin' header"
```

**Why it's blocked:**
- Same-origin policy protects users
- Scripts can only access their own origin
- Cross-origin requests need explicit permission

**Our configuration:**

| Setting | Development | Production |
|---------|-------------|------------|
| `origin` | `localhost:5173` | `false` (same-origin only) |
| `credentials` | `true` | `true` |

**Why different in production?**
- Development: Frontend and backend are separate servers
- Production: Frontend is served by backend (same origin)

**`credentials: true`:**
Allows cookies/auth headers in cross-origin requests. Needed for sessions.

### Pattern 2: Request Logging Middleware

```typescript
if (config.isDev) {
  app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.debug({ method: req.method, url: req.url, status: res.statusCode, duration });
    });

    next();
  });
}
```

**How this works:**

```
Request arrives
    ↓
Middleware runs, records start time
    ↓
next() → continues to route handler
    ↓
Route handler processes request
    ↓
res.send() triggers 'finish' event
    ↓
Our listener calculates duration, logs
```

**Why `res.on('finish')`?**

We want to log AFTER the response is sent (to include status code and duration). `finish` event fires when response is complete.

**Why only in development?**

```
Development: See every request for debugging
Production: Reduce noise, save CPU (logging isn't free)
```

### Pattern 3: Consistent API Response Format

```typescript
// Success
res.json({
  success: true,
  data: { ... }
});

// Error
res.json({
  success: false,
  error: {
    code: 'NOT_FOUND',
    message: 'Route not found'
  }
});
```

**Why consistent format?**

Frontend can have ONE way to handle all responses:

```typescript
const response = await fetch('/api/notes');
const result = await response.json();

if (result.success) {
  // Use result.data
} else {
  // Show result.error.message
}
```

No guessing about response shape!

### Pattern 4: Error Handling Middleware

```typescript
// 404 handler - catches routes that don't exist
app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', ... } });
});

// Global error handler - catches thrown errors
app.use((err, req, res, next) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', ... } });
});
```

**Order matters!**

```typescript
// Routes first
app.use('/api/notes', notesRouter);
app.use('/api/daily', dailyRouter);

// 404 catches anything that didn't match
app.use((req, res) => { /* 404 */ });

// Error handler must be LAST with 4 parameters
app.use((err, req, res, next) => { /* 500 */ });
```

Express identifies error handlers by their 4-parameter signature.

**Why hide error details in production?**

```typescript
const message = config.isDev ? err.message : 'Internal server error';
```

Development: "Cannot read property 'id' of undefined" - helpful for debugging
Production: "Internal server error" - don't expose implementation details

Exposing stack traces helps attackers understand your code.

---

## Middleware Order

```typescript
// 1. CORS - must be first for preflight requests
app.use(cors(...));

// 2. Body parsing - before routes need req.body
app.use(express.json());

// 3. Logging - see all requests
app.use(loggingMiddleware);

// 4. API routes - the actual functionality
app.use('/api/notes', notesRouter);

// 5. 404 - anything that didn't match
app.use(notFoundHandler);

// 6. Error - catches thrown errors
app.use(errorHandler);
```

**Why this order?**

- CORS must handle OPTIONS preflight before anything
- Body parsing must happen before routes access `req.body`
- Logging should see everything
- Routes in order of priority
- Fallback handlers last

---

## Body Parser Configuration

```typescript
app.use(express.json({ limit: '1mb' }));
```

**Why limit?**

Without limit, someone could send:
```bash
curl -X POST -d @huge-file.json http://localhost:3000/api/notes
```

A 1GB JSON would:
1. Use all your memory parsing it
2. Block the event loop
3. Crash your server

**1mb is generous** for a note-taking app. Notes are text - rarely over 100KB.

---

## Common Mistakes

### Mistake 1: Wrong Error Handler Signature

```typescript
// BAD - 3 parameters, Express thinks it's regular middleware
app.use((err, req, res) => { ... });

// GOOD - 4 parameters (even if you don't use next)
app.use((err, req, res, next) => { ... });
```

### Mistake 2: Error Handler Not Last

```typescript
// BAD - error handler before routes
app.use(errorHandler);
app.use('/api/notes', notesRouter);  // Errors here won't be caught!

// GOOD - error handler after routes
app.use('/api/notes', notesRouter);
app.use(errorHandler);
```

### Mistake 3: Forgetting CORS for API

```typescript
// BAD - no CORS
const app = express();
app.use('/api', router);
// Frontend can't access API!

// GOOD - with CORS
app.use(cors());
app.use('/api', router);
```

### Mistake 4: Inconsistent Response Format

```typescript
// BAD - different shapes
app.get('/api/notes', (req, res) => res.json(notes));
app.get('/api/note/:id', (req, res) => res.json({ note }));
app.post('/api/notes', (req, res) => res.json({ success: true, id: 123 }));

// GOOD - consistent shape
app.get('/api/notes', (req, res) => res.json({ success: true, data: notes }));
app.get('/api/note/:id', (req, res) => res.json({ success: true, data: note }));
app.post('/api/notes', (req, res) => res.json({ success: true, data: { id: 123 } }));
```

---

## How This Connects to Senior-Level Thinking

### 1. **Separation of Concerns**

- app.ts: Configuration
- index.ts: Lifecycle
- routes/*.ts: Business logic

Each file has one job.

### 2. **Testability**

Factory pattern enables testing without side effects:
```typescript
const app = createApp();  // Fresh instance
// Test...
// No cleanup needed, no server to stop
```

### 3. **Security Awareness**

- CORS configuration
- Body size limits
- Error message hiding
- Consistent error format (no accidental data leaks)

### 4. **Developer Experience**

- Consistent API format
- Development logging
- Helpful error messages (in dev)

---

## Questions to Test Understanding

1. Why separate `createApp()` from `app.listen()`?
2. What does CORS protect against?
3. Why does the error handler need exactly 4 parameters?
4. Why limit JSON body size?
5. Why hide error details in production?
6. What order should middleware be in?
