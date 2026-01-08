# package.json - The Project's Identity Card

## What This File Is

Every Node.js project has a `package.json` at its root. Think of it as the project's identity card - it tells everyone (including npm, other developers, and automated tools) what this project is, what it needs, and how to work with it.

## My Thought Process Creating This File

### Decision 1: Monorepo vs. Multi-Repo

**The question I asked myself:** Should this project be one repository with multiple packages (monorepo) or separate repositories for server and web?

**My reasoning:**
```
Monorepo Pros:
  ✓ Shared types between frontend and backend (HUGE win)
  ✓ Single `git clone` to get everything
  ✓ Atomic commits across packages (change API + UI together)
  ✓ Easier to refactor across boundaries
  ✓ One CI/CD pipeline

Monorepo Cons:
  ✗ Larger repository size
  ✗ Slightly more complex setup
  ✗ All packages versioned together

Multi-Repo Pros:
  ✓ Independent versioning
  ✓ Cleaner separation
  ✓ Smaller individual repos

Multi-Repo Cons:
  ✗ Type synchronization nightmare
  ✗ Multiple repos to clone/manage
  ✗ Cross-repo changes need coordination
```

**My decision:** Monorepo. The killer feature is shared types. When your API returns a `Note` object, the frontend should use the *exact same* TypeScript type. In a multi-repo setup, you'd need to publish the types as a separate npm package and keep them in sync. That's a maintenance burden you don't need.

**Senior insight:** This is a classic example of "optimize for developer experience." The monorepo adds 10 minutes of setup complexity but saves hours of type synchronization bugs over the project's lifetime.

### Decision 2: npm Workspaces vs. pnpm/yarn

**The question:** Which package manager and workspace system?

**My reasoning:**
- User said they use npm
- npm workspaces (since npm 7) work well for simple monorepos
- pnpm is faster and more disk-efficient, but adds learning curve
- yarn has good workspaces but another tool to learn

**My decision:** npm workspaces. It's what the user knows, and for a project this size, the performance difference is negligible.

**Senior insight:** Don't optimize prematurely. Use what you know unless there's a compelling reason not to. You can always migrate to pnpm later if npm becomes a bottleneck.

---

## Line-by-Line Breakdown

### Basic Metadata

```json
{
  "name": "obsidian-claude",
```

**Why this name?** It describes what the project does. Naming is hard - good names are:
- Descriptive (tells you what it is)
- Memorable (easy to type and remember)
- Unique (won't conflict with existing packages)

Since this is `"private": true`, the name doesn't need to be globally unique on npm.

```json
  "version": "1.0.0",
```

**Semantic versioning (SemVer):** MAJOR.MINOR.PATCH
- MAJOR: Breaking changes
- MINOR: New features, backward compatible
- PATCH: Bug fixes

For private projects, versioning matters less, but it's good practice.

```json
  "private": true,
```

**Critical for monorepos!** This prevents accidentally publishing the root package to npm. Without this, running `npm publish` could expose your code publicly.

### Workspaces Configuration

```json
  "workspaces": [
    "packages/*"
  ],
```

**What this does:** Tells npm "look in the packages/ folder for sub-packages."

**How it works:**
1. npm scans `packages/*` for folders with `package.json`
2. Links them together so they can import each other
3. Hoists shared dependencies to root `node_modules`
4. Allows `npm run -w @obsidian-claude/server` syntax

**The magic:** When `@obsidian-claude/server` imports `@obsidian-claude/shared`, npm resolves it to the local folder, not a downloaded package.

### Scripts - The Command Center

```json
  "scripts": {
    "dev": "concurrently -n server,web -c blue,green \"npm run dev -w @obsidian-claude/server\" \"npm run dev -w @obsidian-claude/web\"",
```

**Breaking this down:**

1. `concurrently` - Runs multiple commands in parallel
2. `-n server,web` - Names for the output (so you know which log is which)
3. `-c blue,green` - Color coding (server logs blue, web logs green)
4. `npm run dev -w @obsidian-claude/server` - Run dev script in server workspace

**Why not just `&&`?**
```bash
# This runs sequentially - server blocks web
npm run dev:server && npm run dev:web

# This runs both in parallel - what we want
concurrently "npm run dev:server" "npm run dev:web"
```

**Senior insight:** In development, you want fast feedback. Running frontend and backend in parallel means changes reflect immediately. The colored output prevents confusion when both servers log at once.

```json
    "build": "npm run build -w @obsidian-claude/shared && npm run build -w @obsidian-claude/server && npm run build -w @obsidian-claude/web",
```

**Why sequential (`&&`) here?**

Build order matters because of dependencies:
1. `shared` must build first (server and web depend on it)
2. `server` can build next
3. `web` can build next

If we built in parallel, server might try to import shared before shared finishes compiling. The `&&` operator ensures each step completes before the next starts.

**Senior insight:** Development prioritizes speed (parallel). Production prioritizes correctness (sequential with proper ordering).

```json
    "init-vault": "node scripts/init-vault.js",
```

**One-time setup script.** Creates the Obsidian vault structure. I'll explain this script in detail when we create it.

```json
    "clean": "rimraf packages/*/dist packages/*/.cache.db",
```

**Why rimraf instead of `rm -rf`?**
- `rm -rf` is Unix-only (doesn't work on Windows)
- `rimraf` is cross-platform
- You're on Windows, so this matters!

**Senior insight:** Always consider cross-platform compatibility. Even if you develop on one OS, your code might run elsewhere (CI servers, other developers' machines).

```json
    "typecheck": "tsc -b packages/shared packages/server packages/web"
```

**What's `-b` (build mode)?**

TypeScript's build mode:
- Understands project references
- Only recompiles changed files
- Much faster for monorepos

Without `-b`, TypeScript would recompile everything every time.

### DevDependencies

```json
  "devDependencies": {
    "@types/node": "^20.10.0",
```

**What are type definitions?**

Node.js is written in C/C++ and JavaScript. TypeScript doesn't know what `fs.readFile` or `process.env` are without type definitions.

`@types/node` provides these definitions. The `@types/*` namespace on npm is the community-maintained type definitions project (DefinitelyTyped).

```json
    "concurrently": "^8.2.2",
```

**Already explained above.** Parallel command runner.

```json
    "rimraf": "^5.0.5",
```

**Cross-platform `rm -rf`.** The name comes from the Unix command `rm -rf` (remove recursively, force).

```json
    "typescript": "^5.3.3"
```

**Root TypeScript installation.** Even though each package has its own config, having TypeScript at the root:
- Enables `npm run typecheck` from root
- Ensures consistent TypeScript version across packages
- Required for `-b` build mode

### Version Ranges Explained

```json
    "typescript": "^5.3.3"
```

**What does `^` mean?**

| Prefix | Meaning | Example `^5.3.3` allows |
|--------|---------|------------------------|
| `^` | Compatible with version | 5.3.3, 5.3.4, 5.4.0, 5.9.9 (not 6.0.0) |
| `~` | Approximately equivalent | 5.3.3, 5.3.4, 5.3.9 (not 5.4.0) |
| none | Exact version | Only 5.3.3 |

**My choice:** `^` for flexibility. Minor and patch updates are usually safe.

**Senior insight:** For production apps, some teams prefer exact versions with a lockfile. For development tools and personal projects, `^` is fine.

### Engine Requirements

```json
  "engines": {
    "node": ">=20.0.0"
  }
```

**Why Node 20?**
- LTS (Long Term Support) version
- Native `fetch` (no node-fetch needed)
- Better ES modules support
- Performance improvements

**What this does:** When someone runs `npm install`, npm warns if their Node version is too old. It's documentation and a safety check.

---

## Common Mistakes Juniors Make

### Mistake 1: Forgetting `private: true`

```json
// BAD - could accidentally publish
{
  "name": "my-internal-app",
  "version": "1.0.0"
}

// GOOD
{
  "name": "my-internal-app",
  "version": "1.0.0",
  "private": true
}
```

### Mistake 2: Wrong build order

```json
// BAD - parallel build, race condition
"build": "concurrently \"npm run build -w a\" \"npm run build -w b\""

// GOOD - sequential when there are dependencies
"build": "npm run build -w shared && npm run build -w app"
```

### Mistake 3: Platform-specific commands

```json
// BAD - Unix only
"clean": "rm -rf dist"

// GOOD - cross-platform
"clean": "rimraf dist"
```

### Mistake 4: Hardcoded versions

```json
// TOO LOOSE - could break unexpectedly
"dependencies": {
  "express": "*"
}

// TOO STRICT - misses security patches
"dependencies": {
  "express": "4.18.2"
}

// JUST RIGHT - flexible within major version
"dependencies": {
  "express": "^4.18.2"
}
```

---

## How This Connects to Senior-Level Thinking

### 1. **Systems Thinking**

I didn't just create a file - I designed a system. The scripts form a workflow:
- `init-vault` → first-time setup
- `dev` → daily development
- `build` → production deployment
- `clean` → reset state

### 2. **Future-Proofing**

The monorepo structure anticipates needs:
- Need a CLI tool? Add `packages/cli`
- Need mobile support? Add `packages/mobile`
- The foundation supports growth

### 3. **Developer Experience (DX)**

Good DX means:
- Clear, memorable script names
- Helpful output (colors, labels)
- Fast feedback loops (parallel dev)
- Self-documenting configuration

### 4. **Convention Over Configuration**

Using `packages/*` follows common patterns. Another developer seeing this instantly understands the structure.

---

## Questions to Ask Yourself

When creating a `package.json`, ask:

1. **Who will use this?** (Just me? Team? Open source?)
2. **What environments?** (Windows? Mac? Linux? CI?)
3. **What's the dependency graph?** (What depends on what?)
4. **What commands will be run most often?** (Optimize those)
5. **What could go wrong?** (Accidental publish? Version conflicts?)

---

## Try It Yourself

After reading this, you should be able to explain:

1. Why is `private: true` important?
2. What's the difference between `devDependencies` and `dependencies`?
3. Why do we use `&&` for build but `concurrently` for dev?
4. What does `^` mean in version numbers?
5. Why use `rimraf` instead of `rm -rf`?

If you can answer these, you understand this file at a senior level.
