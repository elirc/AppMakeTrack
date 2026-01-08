# constants.ts - The Single Source of Truth for Values

## What This File Is

Constants are values that never change during runtime. This file centralizes all of them so that:
1. The same values are used everywhere
2. Changes happen in one place
3. Typos are impossible (TypeScript catches them)

## My Thought Process

### Why Not Just Use the Types?

You might wonder: "We already have `type NoteType = 'concept' | 'solution' | ...`. Why do we need constants too?"

**The key insight:** Types exist only at compile time. They disappear when TypeScript compiles to JavaScript.

```typescript
// This exists ONLY in TypeScript
type NoteType = 'concept' | 'solution';

// At runtime, there's NO NoteType to reference
// You can't do this:
for (const type of NoteType) { }  // Error! NoteType doesn't exist at runtime

// But with constants:
export const NOTE_TYPES = ['concept', 'solution'] as const;

// Now you CAN iterate:
for (const type of NOTE_TYPES) {
  console.log(type);  // Works!
}
```

**Rule of thumb:**
- **Types** = What shapes are valid (compile time)
- **Constants** = What values exist (runtime)

---

## Key Patterns Explained

### Pattern 1: `as const` Assertions

```typescript
export const NOTE_TYPES: readonly NoteType[] = [
  'concept',
  'solution',
  // ...
] as const;
```

**What `as const` does:**

```typescript
// Without as const:
const colors = ['red', 'blue'];
// Type: string[]
// Can push, pop, modify

// With as const:
const colors = ['red', 'blue'] as const;
// Type: readonly ['red', 'blue']
// Cannot modify, TypeScript knows exact values
```

**Why it matters:**

```typescript
// Without as const - loose type
const NOTE_TYPES = ['concept', 'solution'];
NOTE_TYPES[0];  // Type: string (not 'concept' specifically)

// With as const - precise type
const NOTE_TYPES = ['concept', 'solution'] as const;
NOTE_TYPES[0];  // Type: 'concept' (exactly!)
```

**Senior insight:** `as const` is how you tell TypeScript "these exact values, nothing else, ever."

### Pattern 2: Record Types for Lookup Tables

```typescript
export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  concept: 'Concept',
  solution: 'Solution',
  // ...
};
```

**What `Record<K, V>` means:**

```typescript
Record<NoteType, string>
// = An object where:
//   - Every key is a NoteType
//   - Every value is a string
//   - ALL NoteTypes must be present
```

**Why this is powerful:**

```typescript
// TypeScript enforces completeness!
const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  concept: 'Concept',
  // Error: Property 'solution' is missing!
};
```

If you add a new `NoteType`, TypeScript will show errors everywhere a `Record<NoteType, ...>` is missing the new type. This prevents forgetting to update related data.

### Pattern 3: Const Objects for Namespacing

```typescript
export const VAULT_FOLDERS = {
  DAILY: 'daily',
  NOTES: 'notes',
  PROJECTS: 'projects',
  // ...
} as const;

// Usage:
const dailyPath = path.join(vaultPath, VAULT_FOLDERS.DAILY);
```

**Why not just strings?**

```typescript
// BAD - typo goes unnoticed
const path = 'dailly';  // Typo! But no error

// GOOD - typo caught
const path = VAULT_FOLDERS.DAILLY;  // Error: Property 'DAILLY' does not exist
```

**Why `as const` on objects?**

```typescript
// Without as const:
const FOLDERS = { DAILY: 'daily' };
FOLDERS.DAILY;  // Type: string

// With as const:
const FOLDERS = { DAILY: 'daily' } as const;
FOLDERS.DAILY;  // Type: 'daily' (literal type)
```

### Pattern 4: Deriving Types from Constants

```typescript
export const ERROR_CODES = {
  UNKNOWN: 'UNKNOWN_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  // ...
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
// Type: 'UNKNOWN_ERROR' | 'NOT_FOUND' | ...
```

**Breaking this down:**

```typescript
typeof ERROR_CODES
// = { readonly UNKNOWN: 'UNKNOWN_ERROR', readonly NOT_FOUND: 'NOT_FOUND', ... }

keyof typeof ERROR_CODES
// = 'UNKNOWN' | 'NOT_FOUND' | ...

typeof ERROR_CODES[keyof typeof ERROR_CODES]
// = 'UNKNOWN_ERROR' | 'NOT_FOUND' | ...
```

**Why derive types from constants?**

Single source of truth! Add a new error code:
```typescript
export const ERROR_CODES = {
  // ...existing
  NEW_ERROR: 'NEW_ERROR',  // Add here
} as const;

// ErrorCode automatically includes 'NEW_ERROR'
// No need to update a separate type definition
```

---

## Organization Philosophy

### Why Group by Domain?

```typescript
// ============================================================================
// NOTE CONSTANTS
// ============================================================================

// Note-related constants here

// ============================================================================
// PROJECT CONSTANTS
// ============================================================================

// Project-related constants here
```

**Benefits:**
1. Easy to find what you need
2. Related things stay together
3. Clear boundaries between domains

### Why Three Things for Each Enum-like Type?

For each conceptual type (NoteType, ProjectStatus, etc.), I provide:

```typescript
// 1. The array of valid values (for iteration, validation)
export const NOTE_TYPES: readonly NoteType[] = [...];

// 2. Human labels (for UI display)
export const NOTE_TYPE_LABELS: Record<NoteType, string> = {...};

// 3. Descriptions (for tooltips, help text)
export const NOTE_TYPE_DESCRIPTIONS: Record<NoteType, string> = {...};
```

**Use cases:**

```tsx
// Dropdown menu
<select>
  {NOTE_TYPES.map(type => (
    <option key={type} value={type}>
      {NOTE_TYPE_LABELS[type]}
    </option>
  ))}
</select>

// Tooltip
<span title={NOTE_TYPE_DESCRIPTIONS[noteType]}>
  {NOTE_TYPE_LABELS[noteType]}
</span>
```

---

## Common Mistakes

### Mistake 1: Forgetting `as const`

```typescript
// BAD - mutable, loose types
export const NOTE_TYPES = ['concept', 'solution'];
NOTE_TYPES.push('invalid');  // Allowed! Shouldn't be

// GOOD - immutable, precise types
export const NOTE_TYPES = ['concept', 'solution'] as const;
NOTE_TYPES.push('invalid');  // Error!
```

### Mistake 2: Incomplete Records

```typescript
// BAD - missing entry, but no error without Record type
const labels = {
  concept: 'Concept',
  // forgot solution!
};

// GOOD - Record enforces completeness
const labels: Record<NoteType, string> = {
  concept: 'Concept',
  // Error: Property 'solution' is missing
};
```

### Mistake 3: Hardcoding Values

```typescript
// BAD - magic string
if (folder === 'daily') { }

// GOOD - use constant
if (folder === VAULT_FOLDERS.DAILY) { }
```

### Mistake 4: Duplicating Constants

```typescript
// BAD - same value in multiple places
// In file1.ts
const EXCERPT_LENGTH = 200;
// In file2.ts
const EXCERPT_LEN = 200;  // Different name, might drift

// GOOD - import from constants
import { EXCERPT_LENGTH } from '@obsidian-claude/shared';
```

---

## How This Connects to Senior-Level Thinking

### 1. **DRY Principle**

Constants are the ultimate DRY. Define once, use everywhere.

### 2. **Type Safety as Documentation**

`Record<NoteType, string>` is self-documenting. You know instantly:
- It covers all note types
- Each maps to a string
- None are missing

### 3. **Maintainability**

When you add a new `NoteType`:
1. Add to the type union
2. TypeScript errors show EVERY place that needs updating
3. You can't forget anything

### 4. **Separation of Concerns**

- `types.ts` = Shape of data
- `constants.ts` = Actual values
- `validation.ts` = Rules for validating (coming next)

Each file has one job.

---

## Questions to Test Understanding

1. Why do we need both `NoteType` (type) and `NOTE_TYPES` (constant)?
2. What does `as const` do and why is it important?
3. How does `Record<NoteType, string>` help catch bugs?
4. Why derive `ErrorCode` type from `ERROR_CODES` constant?
5. What happens if you add a new `NoteType` but forget to update `NOTE_TYPE_LABELS`?
