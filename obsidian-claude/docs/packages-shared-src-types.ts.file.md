# types.ts - The Type System Architecture

## What This File Is

This is the most important file in the shared package. It defines every data shape that flows through our system. When frontend requests notes from the backend, both sides agree on exactly what a "Note" looks like because they both import from here.

## My Thought Process

### The Core Philosophy: Types as Documentation

Good types serve three purposes:
1. **Compiler enforcement** - Catch errors before runtime
2. **Documentation** - Developers understand data shapes
3. **Autocompletion** - IDEs help you write correct code

I'll explain each type decision and why I made it.

---

## Section: Note Types

### Choosing Between `type` vs `enum` vs `interface`

**The question:** How should I represent the different kinds of notes?

```typescript
// Option 1: Enum
enum NoteType {
  Concept = 'concept',
  Solution = 'solution',
}

// Option 2: Union type
type NoteType = 'concept' | 'solution';

// Option 3: Object const
const NoteType = {
  Concept: 'concept',
  Solution: 'solution',
} as const;
```

**My analysis:**

| Approach | Pros | Cons |
|----------|------|------|
| Enum | Familiar, autocomplete | Compiles to object, can't extend |
| Union type | Zero runtime cost, flexible | No reverse lookup |
| Const object | Both runtime values and types | More verbose |

**My decision: Union type**

```typescript
export type NoteType =
  | 'concept'
  | 'solution'
  | 'decision'
  // ...
```

**Why:**
1. **Zero runtime overhead** - It's just a type, doesn't exist at runtime
2. **Simple** - Easy to read and understand
3. **Extensible** - Can add new types easily
4. **Matches markdown** - The frontmatter will have `type: concept`, which is a string

**When I'd choose differently:**
- **Enum:** When you need reverse lookup (`NoteType[0]`)
- **Const object:** When you need both runtime values and type safety

### The Note Interface - Core Design Decisions

```typescript
export interface Note {
  /** Unique identifier - relative file path from vault root */
  id: string;
```

**Decision: File path as ID**

| Option | Pros | Cons |
|--------|------|------|
| UUID | Globally unique | Doesn't survive file rename, need mapping |
| Hash | Content-addressable | Changes when content changes |
| File path | Intuitive, matches filesystem | Must handle renames |

**Why file path:**
- The vault IS the database - files are the source of truth
- Obsidian uses paths for linking (`[[notes/my-note]]`)
- Simplest mapping: note ↔ file

```typescript
  /** Full markdown content including frontmatter */
  content: string;

  /** Parsed frontmatter */
  frontmatter: NoteFrontmatter;

  /** Body content without frontmatter */
  body: string;
```

**Decision: Store both raw and parsed**

**Why both `content` and `body`?**

```markdown
---
title: My Note
tags: [react, hooks]
---

# My Note

The actual content starts here.
```

- `content` = Everything (for writing back to file)
- `frontmatter` = Parsed YAML (for queries)
- `body` = Just the markdown body (for display, search, word count)

**This is a classic trade-off:**
- More memory used (storing overlapping data)
- But: No re-parsing needed when you need different parts

**Senior insight:** Parse once, store multiple views. Parsing is expensive; memory is cheap.

```typescript
  /** ISO timestamp when created */
  createdAt: string;

  /** ISO timestamp when last modified */
  modifiedAt: string;
```

**Decision: ISO strings, not Date objects**

| Format | Serialization | Parsing | Comparison |
|--------|--------------|---------|------------|
| `Date` object | Needs `toISOString()` | Needs `new Date()` | Works |
| ISO string | Already a string | Just use it | String comparison works! |
| Unix timestamp | Compact | Needs conversion | Number comparison |

**Why ISO strings:**
1. JSON-friendly - No serialization issues
2. Human-readable - "2024-01-15T10:30:00Z" is readable
3. Sortable - String comparison works for ISO dates!
4. Universal - Same format everywhere

```typescript
  /** First ~200 characters of body for previews */
  excerpt: string;
```

**Decision: Pre-compute excerpts**

**Why not compute on-demand?**

```typescript
// Option 1: On-demand (seems simpler)
function getExcerpt(note: Note): string {
  return note.body.slice(0, 200);
}

// Option 2: Pre-computed (what I chose)
interface Note {
  excerpt: string;  // Already computed
}
```

**Why pre-compute:**
- List views show many notes
- Computing 100 excerpts on every render = slow
- Compute once when indexing, use many times

**Senior insight:** Pre-computation is a form of caching. Identify operations that happen often and move them earlier in the pipeline.

### NoteSummary - The Lightweight Version

```typescript
export interface NoteSummary {
  id: string;
  title: string;
  type: NoteType | null;
  // ... but NO content, NO body
}
```

**Why two interfaces?**

| Use Case | Interface | Why |
|----------|-----------|-----|
| List views | `NoteSummary` | Don't need full content |
| Note editor | `Note` | Need everything |
| Search results | `NoteSummary` | Content in `SearchMatch` |

**The payload difference:**

```typescript
// Full Note: ~5KB average (with content)
// NoteSummary: ~200 bytes

// Loading 100 notes for a list:
// Full: 500KB of data
// Summary: 20KB of data
```

**Senior insight:** Design your types for your use cases. Different views need different data shapes.

---

## Section: The `null` vs `undefined` Decision

```typescript
type: NoteType | null;  // Can be null
project?: string;       // Can be undefined (optional)
```

**When to use which:**

| Scenario | Use | Example |
|----------|-----|---------|
| Field might not exist | `?` (optional) | `project?: string` |
| Field exists but has no value | `null` | `type: NoteType | null` |
| Field must exist and have value | Required | `id: string` |

**My reasoning:**

```typescript
// A note always HAS a type field, but might not have a value yet
type: NoteType | null;

// A note might not have a project associated
project?: string;  // The field might not exist at all
```

**The semantic difference:**
- `null` = "I looked, there's nothing there"
- `undefined` = "I didn't even look" or "This doesn't apply"

**In database terms:**
- `null` = NULL value in column
- `undefined` = Column doesn't exist for this row

---

## Section: API Types

### The `ApiResponse` Pattern

```typescript
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };
```

**This is a discriminated union** - a powerful TypeScript pattern.

**How it works:**

```typescript
const response: ApiResponse<Note> = await fetchNote('123');

if (response.success) {
  // TypeScript KNOWS response.data exists here
  console.log(response.data.title);  // ✓ Works!
} else {
  // TypeScript KNOWS response.error exists here
  console.log(response.error.message);  // ✓ Works!
}

// Without the check:
console.log(response.data);  // ✗ Error: Property 'data' doesn't exist on type
```

**The magic:** The `success` field "discriminates" between the two variants. TypeScript narrows the type based on which variant you're in.

**Why not throw errors instead?**

```typescript
// Option 1: Throw errors
async function fetchNote(id: string): Promise<Note> {
  // throws if error
}

// Option 2: Return result type
async function fetchNote(id: string): Promise<ApiResponse<Note>> {
  // never throws, error in return value
}
```

**Why I chose result types:**
1. **Explicit error handling** - You can't forget to handle errors
2. **Type-safe errors** - Error shape is typed
3. **No try/catch needed** - Just if/else
4. **Composable** - Easy to chain operations

**Senior insight:** This pattern comes from functional programming (Result/Either types). It makes error handling explicit and impossible to forget.

### Input Types vs Entity Types

```typescript
// Entity (what exists in the system)
export interface Note {
  id: string;           // System-generated
  createdAt: string;    // System-generated
  modifiedAt: string;   // System-generated
  // ...
}

// Input (what the user provides)
export interface CreateNoteInput {
  title: string;        // User provides
  type: NoteType;       // User provides
  content?: string;     // User optionally provides
}
```

**Why separate types?**

When creating a note, the user doesn't provide:
- `id` (we generate it from the file path)
- `createdAt` (we use current time)
- `modifiedAt` (we use current time)
- `excerpt` (we compute it)
- `wordCount` (we compute it)

**If we used the same type:**

```typescript
// BAD - what does the user put for id?
function createNote(note: Note): Note {
  // User has to provide id, createdAt, etc.
}

// GOOD - only ask for what user can provide
function createNote(input: CreateNoteInput): Note {
  return {
    id: generateId(),
    createdAt: new Date().toISOString(),
    ...input,
  };
}
```

**The pattern:**
- `Note` = Full entity with all fields
- `CreateNoteInput` = Only user-provided fields
- `UpdateNoteInput` = Only modifiable fields (all optional)

---

## Section: Advanced Type Patterns

### Index Signatures for Flexibility

```typescript
export interface NoteFrontmatter {
  title?: string;
  type?: NoteType;
  // ... known fields

  [key: string]: unknown; // Allow any additional fields
}
```

**What this does:**

```typescript
const frontmatter: NoteFrontmatter = {
  title: 'My Note',
  type: 'concept',
  customField: 'anything',  // Allowed by index signature
  anotherCustom: 123,       // Also allowed
};
```

**Why allow unknown fields?**
- Markdown frontmatter is flexible
- Users might add custom fields
- We shouldn't reject notes with extra fields

**Why `unknown` instead of `any`?**

```typescript
[key: string]: unknown;  // SAFE - forces type checking
[key: string]: any;      // UNSAFE - disables type checking
```

With `unknown`:
```typescript
const value = frontmatter['customField'];  // Type: unknown
console.log(value.toUpperCase());  // Error! Must check type first

if (typeof value === 'string') {
  console.log(value.toUpperCase());  // Works! TypeScript knows it's string
}
```

### Generic Types for Reusability

```typescript
export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}
```

**The `<T>` is a type parameter** - it makes the interface reusable:

```typescript
// For notes
type NotesResponse = PaginatedResponse<NoteSummary>;
// Becomes: { data: NoteSummary[], pagination: Pagination }

// For projects
type ProjectsResponse = PaginatedResponse<Project>;
// Becomes: { data: Project[], pagination: Pagination }
```

**Without generics, you'd write:**

```typescript
interface PaginatedNotes {
  data: NoteSummary[];
  pagination: Pagination;
}

interface PaginatedProjects {
  data: Project[];
  pagination: Pagination;
}

// Repetitive!
```

**Senior insight:** Generics are about DRY (Don't Repeat Yourself). If you see similar shapes with different inner types, reach for generics.

---

## File Organization Principles

### Why This Organization?

```typescript
// ============================================================================
// NOTE TYPES
// ============================================================================

// Related types grouped together

// ============================================================================
// API TYPES
// ============================================================================

// More related types
```

**The organization:**
1. **Core entities first** (Note, Project, etc.)
2. **Input types near their entities** (CreateNoteInput near Note)
3. **API types together** (Response wrappers, errors)
4. **Utility types last** (Helpers used throughout)

**Why comment banners?**
- Types files get long
- Visual separation helps navigation
- IDE outline view shows sections

### Export Everything

```typescript
export type NoteType = ...
export interface Note { ... }
```

**Why export everything?**

In a types file, everything is meant to be used elsewhere. No private types in a shared package.

**The index.ts pattern:**

```typescript
// packages/shared/src/index.ts
export * from './types.js';
export * from './constants.js';  // if we add more files
```

Then consumers import from the package:

```typescript
import { Note, NoteType } from '@obsidian-claude/shared';
```

---

## Common Type Mistakes

### Mistake 1: Overly Loose Types

```typescript
// BAD - too loose
interface Note {
  data: any;  // What's in here? Who knows!
}

// GOOD - specific
interface Note {
  frontmatter: NoteFrontmatter;
  body: string;
}
```

### Mistake 2: Not Using Union Types

```typescript
// BAD - any string
interface Note {
  type: string;  // Could be "asdfasdf"
}

// GOOD - restricted to valid values
interface Note {
  type: NoteType;  // Only valid types
}
```

### Mistake 3: Mixing null and undefined

```typescript
// BAD - inconsistent
interface Note {
  type: NoteType | null;
  status: NoteStatus | undefined;
  project?: string | null;  // Three ways to be empty!
}

// GOOD - consistent
interface Note {
  type: NoteType | null;      // Can be empty
  status: NoteStatus | null;  // Can be empty
  project?: string;           // Optional field
}
```

### Mistake 4: Dates as Date Objects in API

```typescript
// BAD - Date doesn't serialize properly
interface Note {
  createdAt: Date;  // Becomes weird in JSON
}

// GOOD - ISO string
interface Note {
  createdAt: string;  // "2024-01-15T10:30:00Z"
}
```

---

## How This Connects to Senior-Level Thinking

### 1. **Domain Modeling**

These types model our domain (knowledge management). Good domain modeling:
- Captures business concepts precisely
- Makes invalid states unrepresentable
- Serves as documentation

### 2. **API Design**

Input types vs entity types is API design. The shape of your types determines:
- What clients can send
- What clients receive
- How errors are handled

### 3. **Performance Awareness**

`NoteSummary` vs `Note` is about payload size. Seniors think about:
- How much data flows over the network
- What data each view needs
- Trade-offs between normalization and convenience

### 4. **Maintainability**

Good types are:
- Self-documenting (meaningful names)
- Extensible (can add fields without breaking)
- Consistent (same patterns throughout)

---

## Questions to Test Understanding

1. Why did I choose union types over enums for `NoteType`?
2. What's the difference between `type: NoteType | null` and `type?: NoteType`?
3. Why do we have both `Note` and `NoteSummary`?
4. How does the discriminated union in `ApiResponse` help TypeScript?
5. Why use ISO strings instead of Date objects?
6. What does `[key: string]: unknown` do in `NoteFrontmatter`?
