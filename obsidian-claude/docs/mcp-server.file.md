# MCP Server - The Claude Code Bridge

## What This Module Does

The MCP (Model Context Protocol) server is the bridge between Claude Code and your Obsidian vault. It exposes tools that Claude can call to interact with your notes, time tracking, and growth system.

When you're in Claude Code and say "capture this to my daily note" or "what did I learn about React hooks?", the MCP tools make that possible.

---

## My Design Thought Process

### Why MCP Instead of Direct API Calls?

I could have made Claude call our REST API directly:

```typescript
// Alternative: Claude calls REST API
fetch('http://localhost:3000/api/daily/capture', {
  method: 'POST',
  body: JSON.stringify({ content: '...', section: 'notes' }),
});
```

Instead, I used MCP:

```typescript
// MCP: Claude uses tools
// Claude calls: capture({ content: '...', section: 'notes' })
```

**Why MCP wins:**

1. **Native Integration** - MCP is built into Claude Code, feels natural
2. **Typed Schema** - Tools have JSON Schema, Claude knows the parameters
3. **Error Handling** - MCP handles errors gracefully
4. **Discovery** - Claude can list available tools automatically
5. **No HTTP Overhead** - Direct stdio communication

### The Tool Registry Pattern

```typescript
interface ToolHandler {
  definition: Tool;      // Schema for Claude
  handler: Function;     // Actual implementation
}

const tools: ToolHandler[] = [
  dailyTool,
  captureTool,
  // ...
];

const toolMap = new Map<string, ToolHandler>();
for (const tool of tools) {
  toolMap.set(tool.definition.name, tool);
}
```

**Why this pattern?**

1. **Single Source of Truth** - Definition and handler together
2. **Easy to Add Tools** - Just add to the array
3. **Fast Lookup** - Map for O(1) tool finding
4. **Self-Documenting** - Tools describe themselves

---

## The Tool Architecture

Each tool follows the same structure:

```
packages/server/src/mcp/tools/
├── daily.ts           # Get/create daily note
├── capture.ts         # Quick capture to daily note
├── process.ts         # Create permanent note
├── ask.ts             # Search past notes
├── log-time.ts        # Track time
├── weekly-review.ts   # Generate weekly review
├── monthly-snapshot.ts # Growth snapshot
├── explain.ts         # Learning prompts
├── project-status.ts  # View projects
├── project-create.ts  # Create project
└── mode.ts            # Set proactivity level
```

### Tool Anatomy

Every tool has the same structure:

```typescript
// 1. Definition - tells Claude what this tool does
const definition: Tool = {
  name: 'tool_name',
  description: `What this tool does and when to use it.
Multiple lines with examples are encouraged.`,
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '...' },
      param2: { type: 'number', description: '...' },
    },
    required: ['param1'],
  },
};

// 2. Handler - actual implementation
async function handler(args: Record<string, unknown>): Promise<string> {
  // Extract and validate args
  const param1 = args.param1 as string;

  // Do the work
  const result = await doSomething(param1);

  // Return formatted string
  return `✓ Did the thing\n\n**Result:** ${result}`;
}

// 3. Export
export const toolNameTool: ToolHandler = {
  definition,
  handler,
};
```

---

## Tool-by-Tool Breakdown

### daily

**Purpose:** Get or create today's daily note.

**Why it exists:** Every workflow starts with the daily note. This tool ensures one always exists.

**Key insight:** Idempotent - calling multiple times returns same note.

```typescript
// Input
{ date?: "2024-01-15" }  // Optional, defaults to today

// Output: The daily note content with metadata
```

### capture

**Purpose:** Quick capture to a section of the daily note.

**Why it exists:** Lowest friction way to save information. Don't organize, just capture.

**Sections:**
- `plan` - Adds as task (`- [ ] content`)
- `notes` - Freeform notes
- `wins` - Achievements (`- content`)
- `learned` - TILs (`- content`)

**Key insight:** Finds sections by heading, creates if missing.

### process

**Purpose:** Create permanent note from captured content.

**Why it exists:** The "organize later" part of "capture first, organize later".

**Note types:**
- `concept` - Atomic knowledge
- `solution` - Bug fix/problem solution
- `decision` - Architectural decision
- `til` - Today I Learned
- `failure` - Learning from mistakes

**Key insight:** Auto-generates filename, indexes in database.

### ask

**Purpose:** Search past notes for knowledge.

**Why it exists:** Your vault becomes a searchable knowledge base.

**Key insight:** Uses FlexSearch for full-text search, returns excerpts.

### log_time

**Purpose:** Track time spent on activities.

**Why it exists:** Enables data-driven weekly reviews.

**Key insight:** Logs to both daily note (human-readable) and database (queryable).

### weekly_review

**Purpose:** Generate aggregated weekly review.

**Why it exists:** Core ritual for processing captures and reflecting.

**Includes:**
- Time by project and category
- Notes created
- Evidence collected
- Reflection prompts

**Key insight:** Aggregates data, doesn't just list it.

### monthly_snapshot

**Purpose:** Point-in-time growth record.

**Why it exists:** Track progress over time, not just current state.

**Key insight:** Saves to both vault (readable) and database (queryable).

### explain

**Purpose:** Generate learning prompts.

**Why it exists:** Feynman Technique - teaching reveals gaps.

**Key insight:** Returns structured prompt, not just questions.

### project_status

**Purpose:** View all projects and their state.

**Why it exists:** Portfolio awareness during planning.

**Key insight:** Includes time tracking summary.

### project_create

**Purpose:** Create new project.

**Why it exists:** Projects organize time and notes.

**Key insight:** Creates both database entry and vault note.

### mode

**Purpose:** Set Claude's proactivity level.

**Why it exists:** User controls how "helpful" Claude is.

**Modes:**
- `quiet` - Only respond when asked
- `nudge` - Gentle reminders
- `coach` - Proactive guidance

**Key insight:** Persists in database, affects tool behavior.

---

## Error Handling Strategy

### Input Validation

```typescript
async function handler(args: Record<string, unknown>): Promise<string> {
  const title = args.title as string;

  if (!title || title.trim().length === 0) {
    throw new Error('Title is required');  // MCP converts to error response
  }

  // ... rest of handler
}
```

**Pattern:** Validate early, throw with clear message.

### Service Errors

```typescript
try {
  const note = await vault.createNote(...);
} catch (error) {
  if ((error as Error).message.includes('already exists')) {
    throw new Error(`A note with title "${title}" already exists`);
  }
  throw error;  // Re-throw unknown errors
}
```

**Pattern:** Catch known errors, provide context, re-throw unknown.

### MCP Error Response

The server wraps all tool calls:

```typescript
try {
  const result = await tool.handler(args || {});
  return { content: [{ type: 'text', text: result }] };
} catch (error) {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,  // Tells Claude this is an error
  };
}
```

---

## Output Formatting

### Success Pattern

```typescript
return `✓ Created ${type} note: "${title}"

**Path:** ${note.id}
**Type:** ${type}
**Status:** seedling 🌱
**Tags:** ${tags.join(', ') || '(none)'}

The note has been indexed and is searchable.`;
```

**Elements:**
1. ✓ checkmark for success
2. One-line summary
3. Blank line
4. Key-value details in bold
5. Optional next steps

### Error Pattern

```typescript
throw new Error('Title is required');
// Becomes: "Error: Title is required"
```

**Keep errors concise.** Claude will add context.

---

## Integration with Services

```typescript
async function handler(args: Record<string, unknown>): Promise<string> {
  // Get services (lazy initialization)
  const vault = getVaultService();
  const db = getDatabase();
  const search = getSearchService();

  // Use services
  const note = await vault.createNote(...);
  db.upsertNote(...);
  search.index(note);

  // Return result
  return '...';
}
```

**Pattern:** Tools are thin orchestration layers. Business logic lives in services.

---

## Testing Strategy (Future)

```typescript
describe('capture tool', () => {
  it('captures to notes section', async () => {
    const result = await handler({
      content: 'Test note',
      section: 'notes'
    });

    expect(result).toContain('✓ Captured');
    expect(result).toContain('Test note');
  });

  it('requires content', async () => {
    await expect(handler({ content: '' }))
      .rejects.toThrow('Content is required');
  });
});
```

---

## Common Patterns Across Tools

### 1. Lazy Service Access

```typescript
const vault = getVaultService();  // Not at module load
```

### 2. Type Casting Args

```typescript
const title = args.title as string;
const tags = (args.tags as string[]) || [];
```

### 3. Default Values

```typescript
const section = (args.section as string) || 'notes';
const limit = (args.limit as number) || 5;
```

### 4. Date Handling

```typescript
const now = new Date();
const dateStr = now.toISOString().split('T')[0];  // YYYY-MM-DD
const timeStr = now.toLocaleTimeString();         // HH:MM:SS
```

### 5. Markdown Formatting

```typescript
return `# Title

**Bold label:** value

- List item 1
- List item 2

---

*Italic footer*`;
```

---

## Senior-Level Considerations

### 1. Tool Design

- Tools should do ONE thing well
- Description is critical - Claude uses it to decide when to call
- Input schema should be strict but forgiving

### 2. Error Messages

- Always actionable ("Title is required" not "Invalid input")
- Include what went wrong and how to fix it
- Don't expose internal errors to users

### 3. Performance

- Tools should be fast (< 100ms ideal)
- Avoid expensive operations in tools
- Batch database operations where possible

### 4. Extensibility

- Adding new tools: create file, add to registry
- Each tool is independent
- Registry handles discovery automatically

---

## Questions to Test Understanding

1. Why use MCP instead of a REST API for Claude integration?
2. What's the purpose of the tool definition vs handler split?
3. How does the tool registry enable easy tool discovery?
4. Why throw errors instead of returning error strings?
5. What makes a good tool description for Claude?
6. Why are services accessed lazily in handlers?
