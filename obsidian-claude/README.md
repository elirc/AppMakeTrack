# Obsidian Claude

Personal knowledge management system integrating Obsidian with Claude Code.

## Overview

This project combines:
- **Obsidian** as the markdown-based vault for all notes
- **Claude Code** via MCP tools for intelligent capture and processing
- **Web Dashboard** for visual browsing and growth tracking

### Philosophy: Capture First, Organize Later

1. **Capture** - Quick notes to daily note during work
2. **Review** - Weekly processing of raw captures
3. **Process** - Extract permanent notes from daily captures
4. **Grow** - Track progress across competency dimensions

## Architecture

```
obsidian-claude/
├── packages/
│   ├── shared/          # Shared types and validation
│   ├── server/          # Express API + MCP server
│   └── web/             # React dashboard
└── docs/                # Teaching documentation
```

## Quick Start

```bash
# Install dependencies
npm install

# Initialize Obsidian vault (creates folders and templates)
npm run init-vault

# Start development servers
npm run dev

# Or start individually:
npm run dev:server   # API server on port 3000
npm run dev:web      # React app on port 5173
```

## MCP Tools

Available tools for Claude Code:

| Tool | Purpose |
|------|---------|
| `daily` | Get/create today's daily note |
| `capture` | Quick capture to daily note section |
| `process` | Create permanent note from capture |
| `ask` | Search past notes for knowledge |
| `log_time` | Track time spent on activities |
| `weekly_review` | Generate weekly review |
| `monthly_snapshot` | Create growth snapshot |
| `explain` | Generate learning prompts |
| `project_status` | View all projects |
| `project_create` | Create new project |
| `mode` | Set proactivity level |

## Note Types

- **concept** - Atomic knowledge (one idea per note)
- **solution** - Bug fixes and problem solutions
- **decision** - Architectural and design decisions
- **til** - Today I Learned quick nuggets
- **failure** - Learning from mistakes

## Growth Dimensions

Track progress across 7 competency areas:

1. **Technical** - Core coding skills
2. **Debugging** - Problem-solving ability
3. **Code Quality** - Clean code practices
4. **Architecture** - System design
5. **Communication** - Docs and collaboration
6. **Ownership** - Initiative and follow-through
7. **Mentorship** - Helping others grow

## Configuration

The server reads configuration from environment variables or `config/default.json`:

```json
{
  "vaultPath": "C:/Users/Owner/obsidian-vault",
  "port": 3000,
  "dbPath": "./data/.cache.db"
}
```

## Project Structure

The `docs/` folder holds one teaching doc per module, named after the file
it explains. A sensible reading order:

1. `docs/package.json.file.md` + `docs/tsconfig.base.json.file.md` — the monorepo wiring
2. `docs/packages-shared-src-types.ts.file.md` and `-validation.ts.file.md` — the shared contract both server and web import
3. `docs/packages-server-src-services-vault.ts.file.md` — file operations; the vault is the source of truth
4. `docs/packages-server-src-db-index.ts.file.md` + `-db-schema.ts.file.md` — the sql.js cache layer
5. `docs/api-routes-overview.file.md` then `docs/packages-server-src-api-routes-notes.ts.file.md` — the REST surface
6. `docs/mcp-server.file.md` — how Claude Code drives the same services
7. `docs/web-frontend.file.md` — the React dashboard

## Learning from this codebase

Three exercises, easiest first. Each has a check you can actually run.

1. **Trace a capture.** Start at `packages/server/src/mcp/tools/capture.ts`
   and follow one `capture` call: tool handler → `getVaultService()` →
   `appendToNote()` → today's daily note on disk. **Check**: you can point
   at the `switch (section)` in the capture handler that decides *which
   section* of the daily note the text lands in, and at the call that
   creates the note if today's doesn't exist (`getOrCreateDailyNote`, in
   `packages/server/src/services/vault.ts`).
2. **Add a 12th MCP tool.** Every tool in `packages/server/src/mcp/tools/`
   is the same shape: a `definition: Tool` constant plus a handler,
   registered in `mcp/server.ts`. Add a `streak` tool that reports how many
   consecutive days have a daily note. **Check**: the tool appears in
   Claude Code's tool list and returns the right number against a vault
   where you deleted yesterday's note.
3. **Wire up the missing file watcher.** `chokidar` is in
   `packages/server/package.json` but never imported, so edits made
   directly in Obsidian don't update the SQLite cache or the FlexSearch
   index until the file is next read. Watch the vault directory, and on
   `change` re-index that one note. **Check**: edit a note's title in
   Obsidian (or any editor) while the server runs, then hit
   `GET /api/search?q=<new title>` — it should match without restarting
   the server. Decide and write down: what should happen on `unlink`?

## Development

```bash
# Type checking
npm run typecheck

# Build all packages
npm run build

# Clean build artifacts
npm run clean
```

## License

Private project for personal use.
