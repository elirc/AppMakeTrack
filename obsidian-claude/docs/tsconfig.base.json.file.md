# tsconfig.base.json - The TypeScript Rulebook

## What This File Is

TypeScript is JavaScript with types. But TypeScript has *hundreds* of configuration options that control:
- What JavaScript version to output
- How strict the type checking should be
- How modules are resolved
- What files to include/exclude

`tsconfig.json` is where you configure all of this. In a monorepo, `tsconfig.base.json` contains shared settings that all packages inherit from.

## My Thought Process

### The Core Question: How Strict Should We Be?

**My philosophy:** Be as strict as possible from day one.

Here's why:

```typescript
// With strict: false
function processUser(user) {  // No error - 'user' is implicitly 'any'
  return user.name.toUpperCase();  // Runtime crash if user is null
}

// With strict: true
function processUser(user) {  // Error: Parameter 'user' implicitly has 'any' type
  return user.name.toUpperCase();
}

// Forced to write:
function processUser(user: User | null): string {
  if (!user) return '';
  return user.name.toUpperCase();  // Now TypeScript knows user is not null
}
```

**Senior insight:** It's much easier to start strict and relax rules than to start loose and tighten later. Loose typing leads to technical debt that's painful to fix.

### Decision: ES2022 Target

**The question:** What JavaScript version should TypeScript output?

**My reasoning:**
```
ES5:  Maximum compatibility, but verbose output, no async/await
ES6:  Classes, arrow functions, but still old
ES2020: Optional chaining, nullish coalescing
ES2022: Top-level await, class fields, .at() method
ESNext: Latest features, might not be supported
```

**My decision:** ES2022. It's:
- Fully supported in Node 20 (our minimum)
- Has all the features we need
- Produces clean, readable output

---

## Line-by-Line Breakdown

### JavaScript Output Settings

```json
"target": "ES2022",
```

**What it does:** Sets the JavaScript version TypeScript outputs.

**Example transformation:**

```typescript
// Your TypeScript (ES2022 features)
const name = user?.name ?? 'Anonymous';
const items = [1, 2, 3];
const last = items.at(-1);

// With target: "ES5" - gets transformed
var name = user === null || user === void 0 ? void 0 : user.name;
name = name !== null && name !== void 0 ? name : 'Anonymous';
var last = items[items.length - 1];

// With target: "ES2022" - stays clean
const name = user?.name ?? 'Anonymous';
const last = items.at(-1);
```

**Senior insight:** Lower targets mean bigger bundles and slower code. Only target older JavaScript if you need to support old browsers. For Node.js, use modern targets.

### Module System

```json
"module": "NodeNext",
"moduleResolution": "NodeNext",
```

**The module system saga:**

JavaScript has had multiple module systems over the years:

| System | Syntax | Era |
|--------|--------|-----|
| CommonJS | `require()` / `module.exports` | Node.js traditional |
| AMD | `define()` / `require()` | Browsers (old) |
| UMD | Both | Universal |
| ES Modules | `import` / `export` | Modern standard |

**Why `NodeNext`?**

Node.js now supports both CommonJS and ES Modules. `NodeNext` tells TypeScript to:
1. Use ES module syntax (`import`/`export`)
2. Understand `.js` extensions in imports
3. Handle the `"type": "module"` in package.json

```typescript
// With NodeNext, you write:
import { readFile } from 'fs/promises';
import { Note } from './types.js';  // Note: .js extension required!

// The .js extension is required because that's what Node.js needs at runtime
// TypeScript compiles .ts → .js, so imports need to reference the output
```

**Common confusion:** "Why `.js` when the file is `.ts`?"

```
Source:  types.ts  →  Compiles to  →  types.js
Import:  import { Note } from './types.js'
                                      ^^^^
                         References the compiled output!
```

### Library Definitions

```json
"lib": ["ES2022"],
```

**What it does:** Includes type definitions for built-in JavaScript features.

Without this, TypeScript wouldn't know about:
- `Array.prototype.at()`
- `Object.hasOwn()`
- `Promise`, `Map`, `Set`
- etc.

**Why not include `DOM`?**

```json
// For browser code:
"lib": ["ES2022", "DOM"]  // Includes window, document, etc.

// For Node.js code:
"lib": ["ES2022"]  // No DOM - we're not in a browser!
```

Including `DOM` in a Node.js project would let you accidentally use `document.querySelector()` which would crash at runtime.

### Strictness Settings

```json
"strict": true,
```

**This single flag enables ALL strict checks:**

| Sub-flag | What it prevents |
|----------|------------------|
| `strictNullChecks` | Using null/undefined without checking |
| `strictFunctionTypes` | Unsafe function type assignments |
| `strictBindCallApply` | Wrong arguments to bind/call/apply |
| `strictPropertyInitialization` | Uninitialized class properties |
| `noImplicitAny` | Implicit `any` types |
| `noImplicitThis` | Implicit `any` for `this` |
| `alwaysStrict` | Emits `"use strict"` in output |
| `useUnknownInCatchVariables` | `catch(e)` where `e` is `unknown` not `any` |

**Senior insight:** Always use `strict: true`. Every single one of these catches real bugs.

```typescript
// Without strictNullChecks:
function greet(name: string) {
  console.log(name.toUpperCase());  // No error
}
greet(null);  // Runtime crash!

// With strictNullChecks:
function greet(name: string) {
  console.log(name.toUpperCase());  // Error: name might be null
}
greet(null);  // Error: null is not assignable to string
```

### Module Interop

```json
"esModuleInterop": true,
```

**The problem it solves:**

CommonJS and ES Modules have different default export semantics:

```javascript
// CommonJS (old style)
module.exports = function() { };  // The function IS the export

// ES Module (modern)
export default function() { };  // The function is ON the export
```

When importing a CommonJS module from ES Modules:

```typescript
// Without esModuleInterop:
import * as express from 'express';
const app = express();  // Works but weird

// With esModuleInterop:
import express from 'express';
const app = express();  // Clean and intuitive
```

**Always enable this.** It makes imports work as you'd expect.

### Performance Optimization

```json
"skipLibCheck": true,
```

**What it does:** Skips type-checking of `.d.ts` files in `node_modules`.

**Why skip?**
1. Massive speedup (node_modules has thousands of type files)
2. Those files are already published and "known good"
3. You can't fix errors in them anyway

**Senior insight:** This is one of the few "less strict" options I enable. The performance gain is worth it.

### Safety Checks

```json
"forceConsistentCasingInFileNames": true,
```

**The problem:**

```typescript
// File: UserService.ts

// On Mac/Windows (case-insensitive filesystem):
import { UserService } from './userservice';  // Works! (but shouldn't)

// On Linux (case-sensitive filesystem):
import { UserService } from './userservice';  // Error: file not found!
```

This flag catches the issue on all platforms.

**Senior insight:** This prevents "works on my machine" bugs. Your CI server is probably Linux, even if you develop on Windows.

```json
"resolveJsonModule": true,
```

**Lets you import JSON files:**

```typescript
import config from './config.json';
console.log(config.apiUrl);  // Typed!
```

Without this flag, TypeScript won't let you import `.json` files.

### Source Maps and Declarations

```json
"declaration": true,
"declarationMap": true,
"sourceMap": true,
```

**What each does:**

| Option | Generates | Purpose |
|--------|-----------|---------|
| `declaration` | `.d.ts` files | Type definitions for consumers |
| `declarationMap` | `.d.ts.map` files | Click-through to original source |
| `sourceMap` | `.js.map` files | Debug compiled JS with original TS |

**Why we need all three:**

```
src/types.ts (your source code)
     ↓ TypeScript compiles
dist/types.js (JavaScript output)
dist/types.d.ts (type declarations)
dist/types.js.map (debug mapping: JS → TS)
dist/types.d.ts.map (type mapping: .d.ts → .ts)
```

**Practical benefit:** When debugging in VS Code, you see your TypeScript, not the compiled JavaScript.

### Directory Structure

```json
"outDir": "dist",
"rootDir": "src",
```

**What it does:**

```
project/
├── src/              ← rootDir (TypeScript source)
│   ├── index.ts
│   └── types.ts
├── dist/             ← outDir (compiled output)
│   ├── index.js
│   ├── index.d.ts
│   └── types.js
└── tsconfig.json
```

**Why separate?**
- Clear separation of source and output
- Easy to `.gitignore` the `dist` folder
- `npm publish` can include only `dist`

### Additional Strictness (Beyond `strict: true`)

```json
"noUncheckedIndexedAccess": true,
```

**One of my favorite strict options. Watch this:**

```typescript
const arr = [1, 2, 3];

// Without noUncheckedIndexedAccess:
const item = arr[5];  // Type: number (but it's actually undefined!)

// With noUncheckedIndexedAccess:
const item = arr[5];  // Type: number | undefined (truthful!)

// Forces you to check:
if (item !== undefined) {
  console.log(item.toFixed(2));  // Now safe!
}
```

**Senior insight:** This catches SO many bugs. Array access isn't always safe, and this flag makes TypeScript honest about it.

```json
"noImplicitReturns": true,
```

**Catches incomplete return paths:**

```typescript
// Without noImplicitReturns:
function getValue(condition: boolean): string {
  if (condition) {
    return "yes";
  }
  // Oops! No return here - returns undefined but type says string
}

// With noImplicitReturns:
function getValue(condition: boolean): string {
  if (condition) {
    return "yes";
  }
  // Error: Not all code paths return a value
}
```

```json
"noFallthroughCasesInSwitch": true,
```

**Catches missing breaks:**

```typescript
// Without noFallthroughCasesInSwitch:
switch (status) {
  case 'active':
    console.log('Active');
    // Oops! Falls through to 'inactive'
  case 'inactive':
    console.log('Inactive');
    break;
}

// With noFallthroughCasesInSwitch:
switch (status) {
  case 'active':
    console.log('Active');
    // Error: Fallthrough case in switch
  case 'inactive':
    console.log('Inactive');
    break;
}
```

```json
"noUnusedLocals": true,
"noUnusedParameters": true,
```

**Catches dead code:**

```typescript
function calculate(a: number, b: number) {  // Error: 'b' is unused
  const multiplier = 2;  // Error: 'multiplier' is unused
  return a;
}
```

**Note:** Sometimes you intentionally have unused parameters. Use underscore prefix:

```typescript
function callback(_event: Event, data: Data) {  // _event = intentionally unused
  return data;
}
```

---

## Common Mistakes

### Mistake 1: Not using strict mode

```json
// BAD - bugs waiting to happen
{
  "compilerOptions": {
    "strict": false
  }
}
```

### Mistake 2: Wrong target for environment

```json
// BAD for Node.js 20 - unnecessarily verbose output
{
  "compilerOptions": {
    "target": "ES5"
  }
}
```

### Mistake 3: Including DOM in Node.js

```json
// BAD - allows browser APIs that will crash
{
  "compilerOptions": {
    "lib": ["ES2022", "DOM"]
  }
}
```

### Mistake 4: Missing moduleResolution

```json
// BAD - uses legacy resolution, import errors
{
  "compilerOptions": {
    "module": "NodeNext"
    // Missing moduleResolution!
  }
}
```

---

## How This Connects to Senior-Level Thinking

### 1. **Defense in Depth**

Each strict flag is a layer of protection. Together, they catch:
- Null pointer bugs
- Type coercion bugs
- Dead code
- Platform-specific bugs
- Module resolution bugs

### 2. **Shift-Left Testing**

"Shift-left" means catching bugs earlier. The cost of a bug:
- Caught by TypeScript: 1 minute to fix
- Caught in code review: 10 minutes
- Caught in testing: 1 hour
- Caught in production: Days + reputation damage

Strict TypeScript is automated code review that runs on every keystroke.

### 3. **Configuration as Documentation**

This file documents project constraints:
- Minimum Node version (implied by target)
- Module system choice
- Code quality standards

New developers read this and understand the project's technical boundaries.

---

## Why This Is a "Base" Config

Individual packages extend this:

```json
// packages/server/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Benefits:**
- Change one setting, all packages update
- Packages can override specific options
- DRY (Don't Repeat Yourself)

---

## Questions to Test Your Understanding

1. Why is `strict: true` better than enabling individual strict flags?
2. What's the difference between `target` and `lib`?
3. Why do we use `.js` extensions in imports with NodeNext?
4. What bugs does `noUncheckedIndexedAccess` catch?
5. Why is `skipLibCheck` acceptable despite being "less strict"?
