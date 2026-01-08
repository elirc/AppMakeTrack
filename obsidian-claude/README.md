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

See the `docs/` folder for detailed documentation on each module:

- `docs/monorepo.file.md` - Project structure and tooling
- `docs/types.file.md` - Type system design
- `docs/database.file.md` - SQLite caching layer
- `docs/vault-service.file.md` - File operations
- `docs/api-routes-overview.file.md` - REST API design
- `docs/mcp-server.file.md` - Claude Code integration
- `docs/web-frontend.file.md` - React dashboard

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
