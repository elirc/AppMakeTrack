# index.ts - Server Entry Point

## What This File Is

This is where the server starts. It's the first file that runs when you do `npm run start`. It orchestrates initialization, starts the HTTP server, and handles graceful shutdown.

## My Thought Process

### The Startup Sequence

```
npm run start
    ↓
Node loads index.ts
    ↓
main() runs
    ↓
1. Initialize vault (check/create structure)
    ↓
2. Initialize database (open connection)
    ↓
3. Create Express app
    ↓
4. Start listening
    ↓
5. Register shutdown handlers
    ↓
Server running!
```

**Order matters:**
- Vault before database (database might need vault path)
- Database before app (routes need database)
- App before listen (create before use)
- Shutdown handlers last (need references to close)

---

## Key Patterns Explained

### Pattern 1: Async Main Function

```typescript
async function main() {
  // All async initialization here
}

main().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
```

**Why wrap in async function?**

Top-level await is supported in ES modules, but:
1. Error handling is cleaner with try/catch or .catch()
2. We can use early return for conditional startup
3. Clearer structure than top-level code

**Why `.catch()` with `process.exit(1)`?**

If main() throws:
- Log the error (fatal level - highest)
- Exit with code 1 (error)

Exit code 1 tells process managers (systemd, pm2) something went wrong.

### Pattern 2: Graceful Shutdown

```typescript
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');

  // 1. Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // 2. Close database
  closeDatabase();

  // 3. Exit cleanly
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

**What are these signals?**

| Signal | Source | Meaning |
|--------|--------|---------|
| SIGINT | Ctrl+C | User interrupted |
| SIGTERM | kill command | Please terminate |
| SIGKILL | kill -9 | Force kill (can't handle) |

**Why graceful shutdown?**

Without it:
```bash
# Ctrl+C
^C
# Process dies immediately
# Database might not flush writes
# In-progress requests fail
# Connections left hanging
```

With graceful shutdown:
```bash
# Ctrl+C
^C
# Stop accepting new connections
# Wait for in-progress requests to finish
# Flush database writes
# Close connections cleanly
# Exit
```

**server.close() doesn't wait by default:**

```typescript
server.close();  // Stops accepting NEW connections
// But doesn't wait for existing connections to finish!

server.close(() => {
  // This callback runs when all connections are done
  logger.info('Server closed');
});
```

### Pattern 3: Crash Handlers

```typescript
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  shutdown('unhandledRejection');
});
```

**What triggers these?**

```typescript
// uncaughtException - sync error not caught
throw new Error('Oops');  // No try/catch

// unhandledRejection - async error not caught
Promise.reject('Oops');  // No .catch()
await failingFunction();  // No try/catch around await
```

**Why log and exit?**

```typescript
// BAD - ignore and continue
process.on('uncaughtException', (error) => {
  console.error(error);
  // Keep running... but in what state?
});

// GOOD - log and exit
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});
```

After an uncaught exception, your application state is **unknown**:
- Maybe half a transaction completed
- Maybe some data is corrupted
- Maybe resources are leaked

**Safest to crash and let a process manager restart.**

### Pattern 4: Defensive Initialization

```typescript
if (!vault.isVaultAccessible()) {
  logger.warn({ vaultPath: config.vaultPath }, 'Vault not found, creating...');
  await vault.initializeVault();
}
```

**Why not just fail?**

First-time users:
1. Install the app
2. Run it
3. Error: "Vault not found"
4. Frustrated, uninstall

With defensive initialization:
1. Install the app
2. Run it
3. "Vault created at ~/obsidian-vault"
4. It just works!

**When to fail vs. auto-fix:**

| Situation | Action | Why |
|-----------|--------|-----|
| Vault missing | Create it | Easy to fix, good UX |
| Config invalid | Fail | User needs to fix config |
| Database corrupt | Fail or rebuild | Depends on severity |
| Permissions denied | Fail | Can't fix automatically |

---

## Startup Console Output

```typescript
console.log(`\n  🚀 Server running at http://${config.host}:${config.port}\n`);
```

**Why `console.log` instead of `logger`?**

This is for the human at the terminal, not for logs:
- Pretty formatting with emoji
- Visible even if log level is 'error'
- Standard startup banner pattern

Many tools do this (Vite, Next.js, etc.):
```
  🚀 Server running at http://localhost:3000
```

---

## Error Handling Philosophy

```
Startup errors  →  Log + exit (can't recover)
Runtime errors  →  Log + respond 500 (keep running)
Shutdown errors →  Log + exit anyway (best effort)
```

**Startup is unrecoverable:**
If database won't open, there's nothing the server can do. Exit and let ops investigate.

**Runtime is recoverable:**
One bad request shouldn't crash the server. Return 500, keep handling other requests.

**Shutdown is best-effort:**
If database close fails, log it but still exit. Don't hang forever.

---

## Common Mistakes

### Mistake 1: No Graceful Shutdown

```typescript
// BAD - no shutdown handling
const server = app.listen(3000);
// Ctrl+C kills immediately, potentially corrupting data

// GOOD - graceful shutdown
process.on('SIGTERM', gracefulShutdown);
```

### Mistake 2: Not Handling Rejections

```typescript
// BAD - unhandled rejection crashes Node (in newer versions)
doSomethingAsync();  // If this rejects, no handler!

// GOOD - either await with try/catch or add handler
await doSomethingAsync().catch(handleError);
// AND
process.on('unhandledRejection', ...);  // Safety net
```

### Mistake 3: Continuing After Fatal Error

```typescript
// BAD - continue in unknown state
process.on('uncaughtException', (error) => {
  console.error(error);
  // Keep going... 🔥
});

// GOOD - exit cleanly
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error });
  process.exit(1);
});
```

### Mistake 4: Exit Code 0 on Error

```typescript
// BAD - exit 0 means success
main().catch(() => process.exit(0));

// GOOD - exit 1 means error
main().catch(() => process.exit(1));
```

Process managers use exit codes to decide whether to restart.

---

## How This Connects to Senior-Level Thinking

### 1. **Operational Excellence**

- Graceful shutdown (data safety)
- Proper exit codes (monitoring)
- Structured logging (debugging)
- Crash handlers (observability)

### 2. **Defense in Depth**

Multiple layers of error handling:
- Try/catch in business logic
- Express error middleware
- uncaughtException handler
- Process manager restarts

### 3. **User Experience**

- Auto-create vault (first-run experience)
- Clear startup message
- Helpful error messages

### 4. **Production Readiness**

This code works the same locally and in production:
- Same shutdown handling
- Same logging
- Same error handling

---

## Questions to Test Understanding

1. Why use an async main() function instead of top-level code?
2. What's the difference between SIGINT and SIGTERM?
3. Why exit after uncaughtException instead of continuing?
4. Why use exit code 1 for errors?
5. What does `server.close()` actually do?
6. Why auto-create the vault instead of failing?
