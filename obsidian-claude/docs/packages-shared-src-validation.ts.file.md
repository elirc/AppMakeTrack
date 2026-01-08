# validation.ts - Runtime Type Safety with Zod

## What This File Is

TypeScript types disappear at runtime. When your API receives data from a user, TypeScript can't protect you - the data could be anything. This file uses **Zod** to validate data at runtime.

## The Problem We're Solving

```typescript
// You define a type
interface CreateNoteInput {
  title: string;
  type: NoteType;
}

// Your API endpoint
app.post('/api/notes', (req, res) => {
  const input: CreateNoteInput = req.body;  // DANGEROUS!
  // TypeScript trusts you, but req.body could be:
  // - { title: 123 }  (wrong type)
  // - { }  (missing fields)
  // - { title: "<script>alert('xss')</script>" }  (malicious)
  // - anything!
});
```

**TypeScript's type assertion is a lie.** It doesn't actually check the data.

## My Thought Process

### Why Zod?

I evaluated several validation libraries:

| Library | Pros | Cons |
|---------|------|------|
| **Zod** | Great TypeScript inference, chainable API | Slightly larger bundle |
| Yup | Popular, good ecosystem | Weaker TS inference |
| Joi | Very mature, feature-rich | Made for Node, poor TS |
| io-ts | Excellent TS, functional style | Steep learning curve |
| AJV | Fast, JSON Schema based | Verbose, separate types |

**I chose Zod because:**
1. **Type inference** - Schema → TypeScript type automatically
2. **Chainable API** - `z.string().min(1).max(200)`
3. **Good errors** - Tells you exactly what's wrong
4. **Tree-shakeable** - Only include what you use

### The Core Principle: Schema = Single Source of Truth

```typescript
// OLD WAY - types and validation separate (can drift!)
interface CreateNoteInput {
  title: string;
  type: NoteType;
}

function validate(input: unknown): CreateNoteInput {
  if (typeof input.title !== 'string') throw Error();
  if (input.title.length > 200) throw Error();  // Wait, the type doesn't say max 200!
}

// ZOD WAY - schema IS the type
const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  type: noteTypeSchema,
});

type CreateNoteInput = z.infer<typeof createNoteSchema>;
// Type is automatically derived - can't drift!
```

---

## Key Patterns Explained

### Pattern 1: Basic Type Schemas

```typescript
// String with constraints
z.string()              // Any string
z.string().min(1)       // Non-empty
z.string().max(200)     // Max length
z.string().email()      // Email format
z.string().url()        // URL format

// Numbers
z.number()              // Any number
z.number().int()        // Integer only
z.number().min(0)       // Non-negative
z.number().max(100)     // Max value

// Booleans
z.boolean()

// Arrays
z.array(z.string())     // Array of strings
z.array(z.number()).min(1).max(10)  // 1-10 numbers
```

### Pattern 2: Enum Schemas from Constants

```typescript
// Our constants file has:
export const NOTE_TYPES = ['concept', 'solution', ...] as const;

// Create a Zod enum from it:
export const noteTypeSchema = z.enum(NOTE_TYPES as unknown as [string, ...string[]]);
```

**Why the weird cast?**

Zod's `z.enum()` expects a tuple type `[string, ...string[]]` (at least one element). TypeScript's `as const` creates a `readonly` tuple, which needs conversion.

**The benefit:**
```typescript
// Schema validates against exact values
noteTypeSchema.parse('concept');  // ✓ Valid
noteTypeSchema.parse('invalid');  // ✗ Error: Invalid enum value
```

### Pattern 3: Object Schemas

```typescript
export const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  type: noteTypeSchema,
  content: z.string().max(100000).optional(),
  tags: tagsSchema.optional(),
});
```

**Key concepts:**

```typescript
// Required field
title: z.string()

// Optional field - can be undefined or missing
content: z.string().optional()

// Nullable field - can be null
content: z.string().nullable()

// Optional AND nullable
content: z.string().optional().nullable()
```

### Pattern 4: Custom Refinements

```typescript
export const isoDateSchema = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Invalid ISO date string' }
);
```

**What `.refine()` does:**

1. First, Zod validates it's a string
2. Then, runs your custom function
3. If function returns false, validation fails

**More complex example:**

```typescript
export const filePathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (val) => !val.includes('..') && !val.startsWith('/'),
    { message: 'Invalid file path - no parent traversal or absolute paths' }
  );
```

This prevents path traversal attacks:
```typescript
filePathSchema.parse('notes/my-note.md');     // ✓ Valid
filePathSchema.parse('../../../etc/passwd'); // ✗ Error! Contains '..'
filePathSchema.parse('/etc/passwd');          // ✗ Error! Absolute path
```

**Security insight:** Validation is your first line of defense. Never trust user input.

### Pattern 5: Regex Validation

```typescript
export const slugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9-]+$/, 'Must be lowercase alphanumeric with hyphens');
```

**Use cases:**
- URL slugs: `my-note-title`
- IDs: `abc123`
- Dates: `/^\d{4}-\d{2}-\d{2}$/` for `YYYY-MM-DD`

### Pattern 6: Type Inference

```typescript
// Define schema
export const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  type: noteTypeSchema,
  content: z.string().optional(),
});

// Infer type FROM schema
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
// Result:
// {
//   title: string;
//   type: 'concept' | 'solution' | ...;
//   content?: string | undefined;
// }
```

**This is the magic!** Your TypeScript type is always in sync with your validation. Change the schema, the type updates automatically.

---

## Validation Helper Functions

### Safe Parsing (Never Throws)

```typescript
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}
```

**Why not just use `.parse()`?**

```typescript
// .parse() throws on invalid data
try {
  const data = createNoteSchema.parse(input);
} catch (error) {
  // Handle error
}

// .safeParse() returns a result object
const result = createNoteSchema.safeParse(input);
if (result.success) {
  // Use result.data
} else {
  // Handle result.error
}
```

**I prefer safe parsing because:**
1. Explicit error handling (can't forget)
2. Type narrowing works automatically
3. No try/catch boilerplate
4. Functional style

### Error Formatting

```typescript
export function formatErrors(error: z.ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }

  return formatted;
}
```

**What this produces:**

```typescript
// Input with errors:
{ title: '', type: 'invalid', tags: ['', 'a'.repeat(100)] }

// Formatted errors:
{
  'title': ['String must contain at least 1 character(s)'],
  'type': ['Invalid enum value'],
  'tags.0': ['String must contain at least 1 character(s)'],
  'tags.1': ['String must contain at most 50 character(s)']
}
```

This format is perfect for displaying errors in forms next to each field.

### Type Guard Functions

```typescript
export function isValidNoteType(value: unknown): value is z.infer<typeof noteTypeSchema> {
  return noteTypeSchema.safeParse(value).success;
}
```

**What's a type guard?**

```typescript
function processType(input: unknown) {
  // TypeScript doesn't know what input is
  console.log(input.toUpperCase());  // Error!

  // Use type guard
  if (isValidNoteType(input)) {
    // TypeScript now knows input is NoteType
    console.log(input.toUpperCase());  // Works!
  }
}
```

The `value is X` return type tells TypeScript "if this returns true, the value is type X."

---

## Security Considerations

### Input Validation Protects Against:

1. **Type confusion** - Expecting string, getting number
2. **Injection attacks** - SQL, XSS, command injection
3. **Buffer overflow** - Extremely long strings
4. **Path traversal** - `../../../etc/passwd`
5. **Denial of service** - Arrays with millions of items

### Our Defenses:

```typescript
// Max lengths prevent DoS
z.string().max(100000)  // 100KB max content
z.array(...).max(20)    // Max 20 tags

// Path validation prevents traversal
.refine((val) => !val.includes('..'))

// Regex ensures expected format
.regex(/^[a-z0-9-]+$/)  // Only safe characters
```

---

## Using Validation in API Endpoints

```typescript
// In your Express route
app.post('/api/notes', (req, res) => {
  const result = validate(createNoteSchema, req.body);

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: formatErrors(result.errors),
      },
    });
  }

  // TypeScript now knows result.data is CreateNoteInput
  const note = await noteService.create(result.data);
  return res.json({ success: true, data: note });
});
```

**The pattern:**
1. Validate input immediately
2. Return 400 with errors if invalid
3. Proceed with typed, validated data

---

## Common Mistakes

### Mistake 1: Trusting `as` Type Assertions

```typescript
// BAD - no runtime validation
const input = req.body as CreateNoteInput;

// GOOD - actual validation
const result = validate(createNoteSchema, req.body);
```

### Mistake 2: Using .parse() Without Try/Catch

```typescript
// BAD - crash on invalid input!
const input = createNoteSchema.parse(req.body);

// GOOD - handle errors gracefully
const result = createNoteSchema.safeParse(req.body);
```

### Mistake 3: Validating Too Late

```typescript
// BAD - validate deep in the code
async function createNote(input: CreateNoteInput) {
  // ... do stuff
  if (!isValidNoteType(input.type)) throw Error();  // Too late!
}

// GOOD - validate at the boundary
app.post('/api/notes', (req, res) => {
  const result = validate(createNoteSchema, req.body);  // First thing!
  if (!result.success) return res.status(400)...
});
```

### Mistake 4: Separate Types and Schemas

```typescript
// BAD - can drift apart
interface CreateNoteInput {
  title: string;
  maxLength?: number;  // Added here but not in schema!
}

const createNoteSchema = z.object({
  title: z.string(),
  // Forgot maxLength!
});

// GOOD - derive type from schema
const createNoteSchema = z.object({
  title: z.string(),
  maxLength: z.number().optional(),
});
type CreateNoteInput = z.infer<typeof createNoteSchema>;
```

---

## How This Connects to Senior-Level Thinking

### 1. **Defense in Depth**

Validation is one layer of security. Combined with:
- Type system (compile time)
- Validation (runtime, at boundary)
- Database constraints (storage layer)
- Output encoding (display layer)

### 2. **Fail Fast**

Invalid data should fail immediately at the API boundary, not deep in business logic where it's harder to debug.

### 3. **Single Source of Truth**

Schema → Type inference means one definition, used everywhere. No drift, no sync issues.

### 4. **User Experience**

Good error messages help users fix their input:
```typescript
// BAD error
"Invalid input"

// GOOD error (from Zod)
{
  "title": ["String must contain at least 1 character(s)"],
  "type": ["Invalid enum value. Expected 'concept' | 'solution' | ..."]
}
```

---

## Questions to Test Understanding

1. Why can't TypeScript types protect you at runtime?
2. What's the difference between `.parse()` and `.safeParse()`?
3. How does `z.infer<typeof schema>` keep types and validation in sync?
4. Why validate at the API boundary instead of deeper in the code?
5. How does the `filePathSchema` prevent security vulnerabilities?
6. When would you use a type guard like `isValidNoteType()`?
