# logger.ts - Structured Logging

## What This File Is

This module creates a configured logger that outputs structured logs. In development, you get pretty, colorized output. In production, you get JSON logs that can be parsed by log aggregation tools.

## My Thought Process

### Why Not Just `console.log`?

```javascript
// console.log - works but limited
console.log('User created');
console.log('User created', userId);
console.log('Error:', error.message);

// Problems:
// 1. No log levels (can't filter debug vs error)
// 2. No timestamps (when did this happen?)
// 3. Unstructured (can't search by userId)
// 4. No context (which request caused this?)
```

**Structured logging solves all of these:**

```javascript
logger.info({ userId: '123', email: 'user@example.com' }, 'User created');
// Output: {"level":30,"time":1705123456,"userId":"123","email":"user@example.com","msg":"User created"}
```

Now you can:
- Filter by level (show only errors in production)
- Search by field (find all logs for userId:123)
- Parse timestamps (when did things happen?)
- Aggregate (how many users created per hour?)

### Why Pino?

| Logger | Speed | Features | Ecosystem |
|--------|-------|----------|-----------|
| Pino | Fastest | Core | Good |
| Winston | Slow | Many | Large |
| Bunyan | Medium | Good | Aging |
| console | Fast | None | N/A |

**Pino is 5-10x faster than Winston.** For a local app this doesn't matter much, but good habits transfer to production systems where it does.

---

## Key Patterns Explained

### Pattern 1: Environment-Specific Configuration

```typescript
if (config.isMcp) {
  return pino({ level: 'silent' });
}

if (config.isDev) {
  return pino({
    transport: { target: 'pino-pretty', ... }
  });
}

return pino({ level: config.logLevel });
```

**Three modes:**

| Mode | Output | Why |
|------|--------|-----|
| MCP | Silent | stdout is for MCP protocol, not logs |
| Development | Pretty | Human-readable for debugging |
| Production | JSON | Machine-parseable for tooling |

### Pattern 2: Pretty Printing in Dev

```typescript
transport: {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'HH:MM:ss',
    ignore: 'pid,hostname',
  },
}
```

**What each option does:**

```
colorize: true
// ERROR is red, WARN is yellow, INFO is green

translateTime: 'HH:MM:ss'
// Instead of: 1705123456789
// Shows:     10:30:56

ignore: 'pid,hostname'
// Removes noise - you know the process, you're on localhost
```

**Development output:**
```
[10:30:56] INFO: Server started
    port: 3000
[10:30:57] INFO: User created
    userId: "abc123"
```

**Production output:**
```json
{"level":30,"time":1705123456789,"pid":1234,"hostname":"server","port":3000,"msg":"Server started"}
```

### Pattern 3: Child Loggers for Context

```typescript
export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

// Usage in a service
const dbLogger = createChildLogger({ module: 'database' });
dbLogger.info('Connected');
// Output: { module: 'database', msg: 'Connected' }

dbLogger.info({ table: 'notes' }, 'Query executed');
// Output: { module: 'database', table: 'notes', msg: 'Query executed' }
```

**Why child loggers?**

You want to know WHERE logs come from without repeating yourself:

```typescript
// Without child logger - repetitive
logger.info({ module: 'database' }, 'Connected');
logger.info({ module: 'database' }, 'Query executed');
logger.info({ module: 'database' }, 'Disconnected');

// With child logger - DRY
const dbLogger = createChildLogger({ module: 'database' });
dbLogger.info('Connected');
dbLogger.info('Query executed');
dbLogger.info('Disconnected');
```

### Pattern 4: MCP Mode Silent Logging

```typescript
if (config.isMcp) {
  return pino({ level: 'silent' });
}
```

**Why silent in MCP mode?**

MCP uses stdio for communication:
- stdin: Receives commands from Claude
- stdout: Sends responses to Claude

If we log to stdout, we'd corrupt the MCP protocol:
```
<-- {"jsonrpc":"2.0","method":"tools/call"...}  (MCP command)
--> [10:30:56] INFO: Processing request  (LOG - BREAKS PROTOCOL!)
--> {"jsonrpc":"2.0","result":...}  (MCP response)
```

**Solution:** In MCP mode, disable console logging entirely. Use file logging if you need to debug.

---

## Log Levels Explained

```typescript
logger.trace('Very detailed');  // Level 10 - Almost never used
logger.debug('Debug info');     // Level 20 - Development details
logger.info('General info');    // Level 30 - Normal operation
logger.warn('Warning');         // Level 40 - Something unexpected
logger.error('Error');          // Level 50 - Something failed
logger.fatal('Fatal error');    // Level 60 - App is crashing
```

**Level filtering:**

```typescript
// With level: 'info', you see: info, warn, error, fatal
// You DON'T see: trace, debug
```

**When to use each:**

| Level | Use for |
|-------|---------|
| trace | Extremely detailed debugging (rarely used) |
| debug | Development-time information |
| info | Normal operations (startup, requests handled) |
| warn | Something unexpected that didn't fail |
| error | Something failed, needs attention |
| fatal | Application is crashing |

---

## Logging Best Practices

### Do: Include Context

```typescript
// BAD - no context
logger.error('Failed to create note');

// GOOD - with context
logger.error({ noteId, userId, err }, 'Failed to create note');
```

### Do: Use Appropriate Levels

```typescript
// BAD - everything is info
logger.info('Starting server');
logger.info('Error occurred');
logger.info('Debug value: ' + x);

// GOOD - appropriate levels
logger.info('Starting server');
logger.error({ err }, 'Error occurred');
logger.debug({ x }, 'Debug value');
```

### Do: Log the Error Object

```typescript
// BAD - loses stack trace
logger.error('Error: ' + error.message);

// GOOD - preserves stack trace
logger.error({ err: error }, 'Operation failed');
// Pino knows how to serialize Error objects
```

### Don't: Log Sensitive Data

```typescript
// BAD - logs password
logger.info({ user: { email, password } }, 'User login');

// GOOD - omit sensitive fields
logger.info({ userId, email }, 'User login');
```

### Don't: Log in Hot Paths Without Need

```typescript
// BAD - logs every iteration
for (const item of items) {
  logger.debug({ item }, 'Processing');
  // ...
}

// GOOD - log summary
logger.debug({ count: items.length }, 'Processing items');
for (const item of items) {
  // ...
}
logger.debug({ count: items.length }, 'Finished processing');
```

---

## Common Mistakes

### Mistake 1: Concatenating Strings

```typescript
// BAD - slow, unstructured
logger.info('User ' + userId + ' created note ' + noteId);

// GOOD - structured, fast
logger.info({ userId, noteId }, 'User created note');
```

### Mistake 2: Forgetting Error Serialization

```typescript
// BAD - [object Object]
logger.error({ error }, 'Failed');

// GOOD - proper error serialization
logger.error({ err: error }, 'Failed');
// Pino treats 'err' specially
```

### Mistake 3: Wrong Log Level

```typescript
// BAD - error for expected case
logger.error('User not found');  // This isn't an error, it's a 404

// GOOD
logger.info({ userId }, 'User not found');
```

### Mistake 4: Logging to Stdout in MCP Mode

```typescript
// BAD - breaks MCP protocol
console.log('Debug info');

// GOOD - use logger (silent in MCP mode)
logger.debug('Debug info');
```

---

## How This Connects to Senior-Level Thinking

### 1. **Observability**

Logging is part of the observability triad:
- **Logs** - What happened (this module)
- **Metrics** - How much/how fast (counters, histograms)
- **Traces** - Request flow (distributed tracing)

### 2. **Operations Mindset**

Good logging means:
- Can debug production issues without code changes
- Can analyze patterns (how many errors per hour?)
- Can set up alerts (email me if error rate spikes)

### 3. **Performance Awareness**

Pino is fast, but logging still has cost:
- Each log is a function call
- Each log is serialization
- Each log is I/O

Seniors know when logging adds value vs. when it's noise.

### 4. **Security Consciousness**

Never log:
- Passwords
- API keys
- Personal data (depending on regulations)
- Full request bodies (might contain sensitive data)

---

## Questions to Test Understanding

1. Why is Pino faster than Winston?
2. What does `logger.child()` do and why use it?
3. Why disable logging in MCP mode?
4. What's the difference between `{ error }` and `{ err: error }`?
5. When would you use `debug` vs `info` level?
6. Why use structured logging instead of string concatenation?
