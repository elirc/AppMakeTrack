# packages/server/package.json - Backend Dependencies Explained

## What This File Is

This is the package.json for our backend server. It's more complex than the shared package because the server does more: HTTP API, MCP server, database, search indexing and logging (file watching is declared but not wired up yet — see the chokidar section below).

## My Thought Process

### Choosing Each Dependency

I'll explain why each dependency was chosen and what alternatives I considered.

---

## Dependencies (Runtime)

### @modelcontextprotocol/sdk

```json
"@modelcontextprotocol/sdk": "^1.0.0"
```

**What it is:** The official SDK for building MCP (Model Context Protocol) servers.

**Why we need it:** To integrate with Claude Code. MCP is how Claude Code talks to external tools.

**What it provides:**
- Protocol handling (JSON-RPC over stdio)
- Tool registration
- Type definitions

**No alternatives** - this is the official SDK.

### @obsidian-claude/shared

```json
"@obsidian-claude/shared": "workspace:*"
```

**What is `workspace:*`?**

This is npm workspace syntax meaning "use the local package at any version."

```
workspace:*     → Any local version
workspace:^1.0  → Local version matching ^1.0
```

**Why `*`?** In a monorepo, we always want the latest local version. Version matching doesn't matter because it's all one codebase.

### sql.js

```json
"sql.js": "^1.10.2"
```

**What it is:** SQLite compiled to WebAssembly — the whole database engine
runs inside Node with no native binary.

**The choice, honestly:** the original plan was `better-sqlite3`
(synchronous, native, fastest):

| Library | Style | Speed | Binary? |
|---------|-------|-------|---------|
| better-sqlite3 | Synchronous | Very fast | Yes (native) |
| sql.js | Async init, sync queries | Slower | No (WASM) |
| sqlite3 | Async (callbacks) | Medium | Yes (native) |

What shipped is `sql.js` — check `packages/server/package.json` and the
"must load WASM" comments in `packages/server/src/db/index.ts`. The native
binary's one listed con ("compilation on install can fail on some systems")
is exactly what decides it on a machine where node-gyp builds are flaky:
a dependency that always installs beats one that is faster when it installs.

**What sql.js costs you, visible in this codebase:**

- `DatabaseService.create()` is async because the WASM module must load
  first — that's why `initDatabase()` is awaited in
  `packages/server/src/index.ts` before the server starts.
- Nothing is written to disk automatically. The database lives in memory,
  and `db/index.ts` persists it by serializing the whole database
  (`fs.writeFileSync(this.dbPath, Buffer.from(data))`). Crash between
  writes and you lose whatever wasn't flushed — acceptable for a metadata
  *cache* whose source of truth is the markdown vault, unacceptable if this
  were the primary store. That distinction is the design insight.

### chokidar

```json
"chokidar": "^3.5.3"
```

**What it is:** Cross-platform file system watcher.

> **Status:** declared but not yet wired up — grep the server source for
> `chokidar` and you'll find no import. The vault is currently read from
> disk on demand by `VaultService`, so edits made directly in Obsidian
> don't invalidate the SQLite cache until the relevant code path re-reads
> the file. Connecting this dependency is the best open exercise in the
> repo — see "Learning from this codebase" in the root README.

**Why not Node's built-in `fs.watch`?**

```javascript
// Node's fs.watch - problematic
fs.watch('./vault', (eventType, filename) => {
  // eventType is often wrong on macOS
  // filename is sometimes null
  // Multiple events for single change
  // Doesn't watch recursively
});

// chokidar - reliable
const watcher = chokidar.watch('./vault', { ignoreInitial: true });
watcher.on('change', (path) => {
  // Consistent behavior across platforms
  // Recursive by default
  // Debounced, no duplicates
});
```

**Senior insight:** Don't fight platform differences. Use battle-tested libraries that handle them.

### cors

```json
"cors": "^2.8.5"
```

**What it is:** Express middleware for CORS (Cross-Origin Resource Sharing).

**Why we need it:**

```
Frontend: http://localhost:5173 (Vite dev server)
Backend:  http://localhost:3000 (Express)
```

These are different origins. Without CORS headers, the browser blocks requests.

```javascript
// Without cors - browser blocks the request
app.get('/api/notes', ...)

// With cors - browser allows it
app.use(cors());
app.get('/api/notes', ...)
```

### express

```json
"express": "^4.18.2"
```

**What it is:** The most popular Node.js web framework.

**Why Express over alternatives:**

| Framework | Learning Curve | Speed | Ecosystem |
|-----------|---------------|-------|-----------|
| Express | Low | Good | Massive |
| Fastify | Medium | Faster | Growing |
| Koa | Medium | Good | Medium |
| Hono | Low | Fast | Small |

**Why I chose Express:**
1. You're learning - Express has the most tutorials/docs
2. Simplest mental model
3. Huge middleware ecosystem
4. "Good enough" performance for local app

**When I'd choose Fastify:** If performance was critical or I wanted built-in validation.

### flexsearch

```json
"flexsearch": "^0.7.43"
```

**What it is:** Fast, memory-efficient full-text search.

**Why not alternatives:**

| Library | Speed | Size | Features |
|---------|-------|------|----------|
| FlexSearch | Fastest | Small | Good |
| Lunr.js | Fast | Medium | Good |
| MiniSearch | Fast | Tiny | Basic |
| Elasticsearch | Fast | Huge | Enterprise |

**Why FlexSearch:**
- Sub-millisecond searches
- In-memory (no external service)
- Fuzzy matching built-in
- Perfect for local app with <10K notes

### gray-matter

```json
"gray-matter": "^4.0.3"
```

**What it is:** Parses YAML frontmatter from markdown files.

```markdown
---
title: My Note
tags: [react, hooks]
---

# Content here
```

```javascript
const matter = require('gray-matter');
const { data, content } = matter(fileContents);
// data = { title: 'My Note', tags: ['react', 'hooks'] }
// content = '# Content here'
```

**Why gray-matter:**
- De facto standard for frontmatter
- Used by Gatsby, Next.js, many static site generators
- Handles edge cases well

### pino + pino-pretty

```json
"pino": "^8.17.2",
"pino-pretty": "^10.3.1"
```

**What they are:**
- `pino`: Fast JSON logger
- `pino-pretty`: Makes JSON logs readable in development

**Why not console.log?**

```javascript
// console.log - unstructured
console.log('Note created', note.id);
// Output: Note created abc123

// pino - structured
logger.info({ noteId: note.id }, 'Note created');
// Output (JSON): {"level":30,"time":1705123456,"noteId":"abc123","msg":"Note created"}
// Output (pretty): [10:30:56] INFO: Note created (noteId: "abc123")
```

**Why structured logging matters:**
1. **Searchable** - Can filter by noteId
2. **Parseable** - Tools can analyze logs
3. **Context** - Always know what happened with what data
4. **Production-ready** - Switch off pretty printing for JSON

**Why pino over winston/bunyan?**
- Fastest logger (10x faster than winston)
- Simple API
- Great TypeScript support

---

## DevDependencies (Build-time only)

### @types/* packages

```json
"@types/better-sqlite3": "^7.6.8",
"@types/cors": "^2.8.17",
"@types/express": "^4.17.21"
```

**What these are:** TypeScript type definitions for JavaScript libraries.

**Why they're devDependencies:** Only needed during development/compilation. The JavaScript runtime doesn't need them.

### tsx

```json
"tsx": "^4.7.0"
```

**What it is:** TypeScript execution for Node.js.

**Why not ts-node?**

| Tool | Speed | ESM Support | Watch Mode |
|------|-------|-------------|------------|
| tsx | Fast | Great | Built-in |
| ts-node | Slow | Tricky | Needs nodemon |
| esbuild-register | Fast | Good | Needs nodemon |

**tsx advantages:**
- Just works with ESM (no config)
- Built-in watch mode (`tsx watch`)
- Uses esbuild (fast compilation)

```bash
# ts-node way (slow, config needed)
ts-node --esm --experimental-specifier-resolution=node src/index.ts

# tsx way (just works)
tsx src/index.ts
```

---

## Scripts Explained

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "start:mcp": "node dist/mcp/server.js"
}
```

### dev
```bash
tsx watch src/index.ts
```
- `tsx`: Run TypeScript directly
- `watch`: Restart on file changes
- Result: Fast feedback loop during development

### build
```bash
tsc
```
- Compile TypeScript to JavaScript
- Output goes to `dist/`
- For production deployment

### start
```bash
node dist/index.js
```
- Run the compiled JavaScript
- Used in production
- After running `build`

### start:mcp
```bash
node dist/mcp/server.js
```
- Separate entry point for MCP server
- Used by Claude Code
- Runs the MCP protocol handler only (no HTTP)

---

## Common Mistakes

### Mistake 1: Wrong dependency type

```json
// BAD - TypeScript in dependencies (ships to production)
"dependencies": {
  "typescript": "^5.0.0"
}

// GOOD - TypeScript in devDependencies
"devDependencies": {
  "typescript": "^5.0.0"
}
```

### Mistake 2: Missing type definitions

```json
// BAD - using express without types
"dependencies": {
  "express": "^4.18.0"
}
// Result: TypeScript doesn't know Express types

// GOOD - include type definitions
"devDependencies": {
  "@types/express": "^4.17.0"
}
```

### Mistake 3: Forgetting workspace protocol

```json
// BAD - tries to download from npm
"dependencies": {
  "@obsidian-claude/shared": "^1.0.0"
}

// GOOD - uses local workspace
"dependencies": {
  "@obsidian-claude/shared": "workspace:*"
}
```

---

## How This Connects to Senior-Level Thinking

### 1. **Dependency Evaluation**

Seniors don't just `npm install` the first package they find. They:
- Compare alternatives
- Check maintenance status
- Consider bundle size
- Evaluate for the use case

### 2. **Production vs Development**

Understanding which dependencies are needed at runtime vs build time:
- Reduces production bundle size
- Speeds up deployment
- Reduces attack surface

### 3. **Platform Considerations**

Choosing cross-platform solutions (chokidar over fs.watch) prevents "works on my machine" bugs.

### 4. **Performance Awareness**

Choosing pino over winston, better-sqlite3 over sqlite3 - small decisions that add up to a responsive application.

---

## Questions to Test Understanding

1. Why is `@obsidian-claude/shared` listed as `workspace:*`?
2. What's the difference between `dependencies` and `devDependencies`?
3. Why use `tsx` instead of `ts-node`?
4. Why is `better-sqlite3` synchronous, and when is that okay?
5. What problem does `chokidar` solve that `fs.watch` doesn't?
6. Why do we need `pino-pretty` separately from `pino`?
