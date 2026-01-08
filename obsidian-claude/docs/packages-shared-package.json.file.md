# packages/shared/package.json - The Shared Contract

## What This File Is

This is the package.json for our shared types package. It's a library that both the server and web packages will import from.

## Why a Shared Package?

**The problem without shared types:**

```typescript
// In server/src/api/notes.ts
interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: Date;  // Server uses Date object
}

// In web/src/types/note.ts
interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;  // Frontend uses ISO string... wait, that's different!
}
```

**The result:** Types drift apart. The server sends `Date`, frontend expects `string`. Bugs happen.

**With shared types:**

```typescript
// In shared/src/types.ts
export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;  // ISO string - single source of truth
}

// server/src/api/notes.ts
import { Note } from '@obsidian-claude/shared';

// web/src/hooks/useNotes.ts
import { Note } from '@obsidian-claude/shared';
```

**One definition, used everywhere.** Change it once, both packages update.

---

## Line-by-Line Breakdown

### Package Identity

```json
{
  "name": "@obsidian-claude/shared",
```

**The `@` scoped package name:**

| Style | Example | Use case |
|-------|---------|----------|
| Unscoped | `shared` | Simple, but might conflict with npm package |
| Scoped | `@obsidian-claude/shared` | Namespaced, no conflicts |

**Why scoped?**
- Clear ownership: "This is part of obsidian-claude"
- Won't conflict with a public npm package called `shared`
- Groups all our packages together in node_modules

```json
  "version": "1.0.0",
```

In a monorepo with workspaces, versions matter less because packages are linked locally, not downloaded. But keeping them consistent is good hygiene.

### Module System Declaration

```json
  "type": "module",
```

**This is crucial!** It tells Node.js:
- Use ES Modules (import/export)
- NOT CommonJS (require/module.exports)

**Without this line:**
```javascript
// Your code
export function hello() { }

// Node.js error:
// SyntaxError: Unexpected token 'export'
```

**With `"type": "module"`:**
```javascript
// Works!
export function hello() { }
```

**Senior insight:** ES Modules are the future. Always use `"type": "module"` for new projects.

### Entry Points

```json
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
```

**What these do:**

| Field | Who uses it | What it points to |
|-------|-------------|-------------------|
| `main` | Node.js/bundlers | The JavaScript code |
| `types` | TypeScript | The type declarations |

**When someone imports:**
```typescript
import { Note } from '@obsidian-claude/shared';
//                   ↑
// Node/bundler loads: dist/index.js
// TypeScript loads:   dist/index.d.ts
```

### The Exports Field (Modern Approach)

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
```

**Why both `main` and `exports`?**

- `main`/`types`: Legacy support (older tools)
- `exports`: Modern standard (Node 12+)

**What `exports` provides:**

1. **Encapsulation** - Only expose what you want:
```json
"exports": {
  ".": "./dist/index.js",           // import from '@pkg'
  "./utils": "./dist/utils.js"       // import from '@pkg/utils'
  // "./internal" NOT listed = can't import internal!
}
```

2. **Conditional exports** - Different code for different environments:
```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",    // TypeScript
    "import": "./dist/index.js",     // ES Modules
    "require": "./dist/index.cjs"    // CommonJS
  }
}
```

**Our case:** We only need ES Modules, so we just have `types` and `import`.

**The order matters!** TypeScript needs `types` to come first:
```json
// CORRECT - types first
{
  "types": "./dist/index.d.ts",
  "import": "./dist/index.js"
}

// WRONG - types after import (some tools break)
{
  "import": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```

### Scripts

```json
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
```

**Minimal scripts for a library:**

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `tsc` | One-time compile for production |
| `dev` | `tsc --watch` | Continuous compile during development |

**What `--watch` does:**
```
$ npm run dev
Starting compilation in watch mode...
Found 0 errors. Watching for file changes.

# You edit src/types.ts...

File change detected. Starting incremental compilation...
Found 0 errors. Watching for file changes.
```

It recompiles whenever you save a file. Essential for development.

### DevDependencies

```json
  "devDependencies": {
    "typescript": "^5.3.3"
  }
```

**Why TypeScript in devDependencies, not dependencies?**

| Type | When installed | When needed |
|------|---------------|-------------|
| `dependencies` | Always | Runtime (in production) |
| `devDependencies` | Only in development | Build time only |

TypeScript is a compiler. After it compiles `.ts` → `.js`, you don't need it anymore. The output JavaScript runs without TypeScript installed.

**Senior insight:** Keep production dependencies minimal. Your deployed code shouldn't include build tools.

---

## How Workspaces Link This Package

When you run `npm install` at the root:

```
node_modules/
├── @obsidian-claude/
│   └── shared/  →  symlink to packages/shared/
├── typescript/
└── ...
```

**The symlink is the magic.** When server does:
```typescript
import { Note } from '@obsidian-claude/shared';
```

Node.js resolves `@obsidian-claude/shared` to the symlink, which points to `packages/shared/dist/index.js`.

**This means:**
- No publishing to npm needed
- Changes immediately available
- One `npm install` sets everything up

---

## Common Mistakes

### Mistake 1: Forgetting `"type": "module"`

```json
// BAD - Node.js defaults to CommonJS
{
  "name": "@my/package"
}

// Error when using import/export syntax!
```

### Mistake 2: Wrong `types` path

```json
// BAD - points to source, not compiled output
{
  "types": "src/index.ts"
}

// Should be:
{
  "types": "dist/index.d.ts"
}
```

### Mistake 3: Missing `types` in exports

```json
// BAD - TypeScript can't find types
"exports": {
  ".": "./dist/index.js"
}

// GOOD
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  }
}
```

### Mistake 4: TypeScript in dependencies

```json
// BAD - shipping build tools to production
"dependencies": {
  "typescript": "^5.3.3"
}

// GOOD
"devDependencies": {
  "typescript": "^5.3.3"
}
```

---

## The Philosophy of Shared Packages

### Single Source of Truth

Shared packages enforce consistency:
- Types defined once
- Validation logic shared
- Constants shared (error codes, status values)

### Contract-Driven Development

The shared package is a *contract* between frontend and backend:

```typescript
// The contract says: API returns Note[]
export interface Note {
  id: string;
  title: string;
}

// Server MUST return this shape
// Client CAN rely on this shape
```

When the contract changes, TypeScript breaks builds on both sides. This is good! It forces you to update both.

### What Belongs in Shared?

| Include | Don't Include |
|---------|---------------|
| Type definitions | Implementation details |
| Validation schemas (zod) | Database queries |
| Constants/enums | Server-only config |
| Utility types | React components |
| API response shapes | Express middleware |

**Rule of thumb:** If both frontend and backend need it, it goes in shared.

---

## Questions to Test Understanding

1. Why do we use `@obsidian-claude/` as a scope prefix?
2. What's the difference between `main` and `exports`?
3. Why is `"type": "module"` required?
4. Why is TypeScript a devDependency, not a dependency?
5. How does npm workspaces link packages locally?
