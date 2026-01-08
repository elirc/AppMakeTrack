# Obsidian-Claude System Architecture

## Overview

A personal knowledge management system integrating Obsidian with Claude Code for note-taking, project tracking, learning logs, and senior engineer growth tracking.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   Claude Code   │  │   Web Dashboard │  │    Obsidian     │              │
│  │   (CLI + MCP)   │  │   (React SPA)   │  │   (Markdown)    │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
│           │                    │                    │                        │
│           │    MCP Protocol    │    REST API        │   File System          │
│           ▼                    ▼                    ▼                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                            BACKEND SERVER                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     Express.js + MCP Server                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │  REST API   │  │ MCP Handler │  │  Services   │  │  File Watch │  │   │
│  │  │  /api/*     │  │  11 Tools   │  │   Layer     │  │   (chokidar)│  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│                            DATA LAYER                                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  Obsidian Vault │  │  SQLite Cache   │  │  FlexSearch     │              │
│  │  (Markdown)     │  │  (Metadata)     │  │  (Full-text)    │              │
│  │  Source of Truth│  │  Fast Queries   │  │  In-memory      │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. FRONTEND

### Technology Stack
| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | React 18 | Industry standard, great for learning |
| Build Tool | Vite | Fast HMR, simple config |
| Styling | CSS Modules | Scoped styles, no runtime overhead |
| State | React Query + Zustand | Server state + client state |
| Routing | React Router v6 | Standard routing solution |
| Icons | Lucide React | Consistent, tree-shakeable |
| Charts | Recharts | Time tracking visualizations |

### Directory Structure
```
packages/web/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── common/          # Button, Input, Modal, etc.
│   │   ├── notes/           # NoteCard, NoteEditor, NoteList
│   │   ├── projects/        # ProjectCard, ProjectBoard
│   │   ├── growth/          # CompetencyMatrix, SkillChart
│   │   └── layout/          # Header, Sidebar, Layout
│   ├── pages/               # Route-level components
│   │   ├── Dashboard.tsx    # Home with stats overview
│   │   ├── Daily.tsx        # Today's daily note
│   │   ├── Notes.tsx        # Browse/search all notes
│   │   ├── Projects.tsx     # Project tracking
│   │   ├── Growth.tsx       # Competency tracking
│   │   ├── Search.tsx       # Full-text search
│   │   └── Settings.tsx     # Configuration
│   ├── hooks/               # Custom React hooks
│   │   ├── useNotes.ts      # Note CRUD operations
│   │   ├── useSearch.ts     # Search functionality
│   │   └── useStats.ts      # Dashboard statistics
│   ├── api/                 # API client functions
│   │   └── client.ts        # Axios/fetch wrapper
│   ├── styles/              # Global styles
│   │   ├── variables.css    # CSS custom properties
│   │   └── global.css       # Reset, typography
│   ├── utils/               # Helper functions
│   ├── types/               # TypeScript types
│   ├── App.tsx              # Root component
│   └── main.tsx             # Entry point
├── public/                  # Static assets
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### Key Pages & Features

#### Dashboard (`/`)
- Today's captures count
- Weekly time logged (chart)
- Active projects summary
- Recent notes list
- Growth streak indicator

#### Daily Note (`/daily`)
- Markdown editor for today's note
- Quick capture input
- Time log table
- Task checklist

#### Notes Browser (`/notes`)
- Grid/list view toggle
- Filter by tags (type, domain, status)
- Sort by date, title
- Note preview cards

#### Note Editor (`/notes/:id`)
- Markdown editor with preview
- Frontmatter editor (tags, status)
- Backlinks sidebar
- Related notes suggestions

#### Projects (`/projects`)
- Kanban board view (active, paused, completed)
- Project detail view with milestones
- Time invested per project

#### Growth Tracker (`/growth`)
- Competency matrix visualization
- Evidence log by dimension
- Monthly snapshots list
- Skill gap analysis

#### Search (`/search`)
- Full-text search input
- Filters (date range, tags, type)
- Results with highlighted matches
- "Ask Past Me" feature

### Component Examples

```tsx
// src/components/notes/NoteCard.tsx
import styles from './NoteCard.module.css';

interface NoteCardProps {
  note: Note;
  onClick: () => void;
}

export function NoteCard({ note, onClick }: NoteCardProps) {
  return (
    <div className={styles.card} onClick={onClick}>
      <h3 className={styles.title}>{note.title}</h3>
      <p className={styles.excerpt}>{note.excerpt}</p>
      <div className={styles.tags}>
        {note.tags.map(tag => (
          <span key={tag} className={styles.tag}>{tag}</span>
        ))}
      </div>
      <time className={styles.date}>{formatDate(note.modified)}</time>
    </div>
  );
}
```

```css
/* src/components/notes/NoteCard.module.css */
.card {
  padding: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.title {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}

.tags {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.tag {
  padding: 0.125rem 0.5rem;
  background: var(--tag-bg);
  border-radius: 4px;
  font-size: 0.75rem;
}
```

---

## 2. BACKEND

### Technology Stack
| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Node.js 20 LTS | Stable, async I/O |
| Framework | Express.js | Simple, widely used |
| MCP SDK | @modelcontextprotocol/sdk | Official MCP library |
| Validation | Zod | Runtime type checking |
| Markdown | gray-matter + remark | Frontmatter + parsing |
| File Watch | chokidar | Cross-platform watching |
| Logging | pino | Fast structured logging |

### Directory Structure
```
packages/server/
├── src/
│   ├── api/                 # REST API routes
│   │   ├── routes/
│   │   │   ├── notes.ts     # /api/notes/*
│   │   │   ├── projects.ts  # /api/projects/*
│   │   │   ├── daily.ts     # /api/daily/*
│   │   │   ├── search.ts    # /api/search/*
│   │   │   ├── growth.ts    # /api/growth/*
│   │   │   ├── stats.ts     # /api/stats/*
│   │   │   └── time.ts      # /api/time/*
│   │   ├── middleware/
│   │   │   ├── error.ts     # Error handling
│   │   │   └── validate.ts  # Request validation
│   │   └── index.ts         # Route aggregation
│   ├── mcp/                 # MCP server implementation
│   │   ├── tools/           # 11 MCP tools
│   │   │   ├── daily.ts
│   │   │   ├── capture.ts
│   │   │   ├── process.ts
│   │   │   ├── ask.ts
│   │   │   ├── log-time.ts
│   │   │   ├── weekly-review.ts
│   │   │   ├── monthly-snapshot.ts
│   │   │   ├── explain.ts
│   │   │   ├── project-status.ts
│   │   │   ├── project-create.ts
│   │   │   └── mode.ts
│   │   └── server.ts        # MCP server setup
│   ├── services/            # Business logic
│   │   ├── vault.ts         # Vault file operations
│   │   ├── notes.ts         # Note CRUD
│   │   ├── search.ts        # Search indexing
│   │   ├── templates.ts     # Template rendering
│   │   ├── time.ts          # Time tracking
│   │   ├── growth.ts        # Competency tracking
│   │   └── stats.ts         # Statistics
│   ├── db/                  # Database layer
│   │   ├── schema.ts        # SQLite schema
│   │   ├── queries.ts       # SQL queries
│   │   └── index.ts         # DB connection
│   ├── watcher/             # File system watcher
│   │   └── index.ts         # Chokidar setup
│   ├── config/              # Configuration
│   │   └── index.ts         # Env vars, defaults
│   ├── utils/               # Utilities
│   │   ├── markdown.ts      # MD parsing helpers
│   │   ├── dates.ts         # Date formatting
│   │   └── paths.ts         # Path utilities
│   ├── types/               # TypeScript types
│   ├── app.ts               # Express app setup
│   └── index.ts             # Entry point
├── tsconfig.json
└── package.json
```

### REST API Endpoints

#### Notes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notes` | List all notes (paginated, filterable) |
| GET | `/api/notes/:id` | Get single note by ID |
| POST | `/api/notes` | Create new note |
| PUT | `/api/notes/:id` | Update note |
| DELETE | `/api/notes/:id` | Delete note |
| GET | `/api/notes/:id/backlinks` | Get notes linking to this note |

#### Daily
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/daily` | Get today's daily note |
| GET | `/api/daily/:date` | Get daily note by date |
| POST | `/api/daily` | Create today's daily note |
| POST | `/api/daily/capture` | Quick capture to daily note |

#### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/:id` | Get project details |
| POST | `/api/projects` | Create project |
| PUT | `/api/projects/:id` | Update project |
| PUT | `/api/projects/:id/status` | Update project status |

#### Search
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=` | Full-text search |
| GET | `/api/search/tags` | List all tags |
| GET | `/api/search/recent` | Recently modified notes |

#### Time Tracking
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/time` | Log time entry |
| GET | `/api/time/daily/:date` | Get time for date |
| GET | `/api/time/weekly` | Get weekly summary |
| GET | `/api/time/project/:id` | Get time by project |

#### Growth
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/growth/competencies` | Get competency matrix |
| POST | `/api/growth/evidence` | Add growth evidence |
| GET | `/api/growth/snapshots` | List monthly snapshots |
| POST | `/api/growth/snapshots` | Generate new snapshot |

#### Stats
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats/dashboard` | Dashboard statistics |
| GET | `/api/stats/weekly` | Weekly activity stats |

### MCP Tools (11 Total)

| Tool | Description | Parameters |
|------|-------------|------------|
| `daily` | Create/get today's daily note | none |
| `capture` | Quick append to daily note | `content`, `section?` |
| `process` | Extract note from daily | `content`, `type`, `title`, `tags` |
| `ask` | Search vault for past solutions | `query` |
| `log-time` | Add time entry | `duration`, `project`, `task` |
| `weekly-review` | Start guided weekly review | `step?` |
| `monthly-snapshot` | Generate growth snapshot | `month?` |
| `explain` | Get prompted to explain concept | `concept` |
| `project-status` | View all projects | none |
| `project-create` | Create new project | `name`, `goal` |
| `mode` | Set proactivity mode | `mode: quiet|nudge|coach` |

### Service Layer Example

```typescript
// src/services/notes.ts
import { db } from '../db';
import { VaultService } from './vault';
import { SearchService } from './search';

export class NotesService {
  constructor(
    private vault: VaultService,
    private search: SearchService
  ) {}

  async list(options: ListOptions): Promise<PaginatedNotes> {
    const { page = 1, limit = 20, tags, type, sort = 'modified' } = options;

    // Query from SQLite cache for speed
    const notes = await db.notes.findMany({
      where: { tags, type },
      orderBy: sort,
      skip: (page - 1) * limit,
      take: limit
    });

    const total = await db.notes.count({ where: { tags, type } });

    return {
      notes,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    };
  }

  async get(id: string): Promise<Note> {
    // Read from vault (source of truth)
    return this.vault.readNote(id);
  }

  async create(data: CreateNoteInput): Promise<Note> {
    const note = await this.vault.createNote(data);
    await this.search.index(note);
    return note;
  }

  async update(id: string, data: UpdateNoteInput): Promise<Note> {
    const note = await this.vault.updateNote(id, data);
    await this.search.reindex(note);
    return note;
  }

  async delete(id: string): Promise<void> {
    await this.vault.deleteNote(id);
    await this.search.remove(id);
  }
}
```

---

## 3. DATABASE

### Storage Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                     DATA ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │  Obsidian Vault │     │  SQLite Cache   │                    │
│  │  (Markdown)     │────▶│  (.cache.db)    │                    │
│  │                 │     │                 │                    │
│  │  • Source of    │     │  • Fast queries │                    │
│  │    truth        │     │  • Metadata     │                    │
│  │  • Git-friendly │     │  • Aggregations │                    │
│  │  • Obsidian     │     │  • Rebuilt on   │                    │
│  │    compatible   │     │    startup      │                    │
│  └─────────────────┘     └─────────────────┘                    │
│           │                       │                              │
│           │                       ▼                              │
│           │              ┌─────────────────┐                    │
│           │              │   FlexSearch    │                    │
│           └─────────────▶│   (In-memory)   │                    │
│                          │                 │                    │
│                          │  • Full-text    │                    │
│                          │  • Sub-ms search│                    │
│                          │  • Fuzzy match  │                    │
│                          └─────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### Vault Structure (File System)
```
C:/Users/Owner/obsidian-vault/
├── daily/                   # Daily notes
│   ├── 2024-01-15.md
│   ├── 2024-01-16.md
│   └── ...
├── notes/                   # All processed notes (flat)
│   ├── react-hooks-rules.md
│   ├── fix-cors-credentials.md
│   └── ...
├── projects/                # Project tracking
│   ├── portfolio-site/
│   │   └── index.md
│   └── api-service/
│       └── index.md
├── growth/                  # Growth tracking
│   ├── competencies.md
│   ├── failures.md
│   └── snapshots/
│       ├── 2024-01.md
│       └── 2024-02.md
├── templates/               # Note templates
│   ├── daily.md
│   ├── concept.md
│   ├── solution.md
│   ├── decision.md
│   ├── failure.md
│   └── project.md
└── .obsidian/               # Obsidian config (git-ignored)
```

### SQLite Schema

```sql
-- Cache database: .cache.db (rebuilt from vault on startup)

-- Notes metadata cache
CREATE TABLE notes (
    id TEXT PRIMARY KEY,           -- File path relative to vault
    title TEXT NOT NULL,
    type TEXT,                     -- concept, solution, decision, etc.
    status TEXT,                   -- seedling, growing, evergreen
    created_at TEXT NOT NULL,      -- ISO timestamp
    modified_at TEXT NOT NULL,     -- ISO timestamp
    word_count INTEGER,
    excerpt TEXT                   -- First 200 chars
);

CREATE INDEX idx_notes_type ON notes(type);
CREATE INDEX idx_notes_status ON notes(status);
CREATE INDEX idx_notes_modified ON notes(modified_at);

-- Tags (many-to-many)
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE note_tags (
    note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX idx_note_tags_tag ON note_tags(tag_id);

-- Links between notes
CREATE TABLE links (
    source_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    target_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    PRIMARY KEY (source_id, target_id)
);

CREATE INDEX idx_links_target ON links(target_id);

-- Time entries
CREATE TABLE time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,            -- YYYY-MM-DD
    project TEXT,
    task TEXT,
    duration_minutes INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_time_date ON time_entries(date);
CREATE INDEX idx_time_project ON time_entries(project);

-- Growth evidence
CREATE TABLE evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dimension TEXT NOT NULL,       -- technical, debugging, architecture, etc.
    description TEXT NOT NULL,
    note_id TEXT REFERENCES notes(id),
    date TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_evidence_dimension ON evidence(dimension);
CREATE INDEX idx_evidence_date ON evidence(date);

-- Settings
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

### Query Examples

```typescript
// src/db/queries.ts

// Get notes with tags
export const getNotesWithTags = `
  SELECT
    n.*,
    GROUP_CONCAT(t.name) as tags
  FROM notes n
  LEFT JOIN note_tags nt ON n.id = nt.note_id
  LEFT JOIN tags t ON nt.tag_id = t.id
  WHERE ($type IS NULL OR n.type = $type)
    AND ($status IS NULL OR n.status = $status)
  GROUP BY n.id
  ORDER BY n.modified_at DESC
  LIMIT $limit OFFSET $offset
`;

// Get backlinks for a note
export const getBacklinks = `
  SELECT n.*
  FROM notes n
  JOIN links l ON n.id = l.source_id
  WHERE l.target_id = $noteId
`;

// Weekly time summary
export const getWeeklyTime = `
  SELECT
    date,
    project,
    SUM(duration_minutes) as total_minutes
  FROM time_entries
  WHERE date >= $startDate AND date <= $endDate
  GROUP BY date, project
  ORDER BY date
`;

// Growth evidence by dimension
export const getEvidenceByDimension = `
  SELECT
    dimension,
    COUNT(*) as count,
    MAX(date) as last_entry
  FROM evidence
  GROUP BY dimension
`;
```

### FlexSearch Configuration

```typescript
// src/services/search.ts
import { Document } from 'flexsearch';

export const searchIndex = new Document({
  document: {
    id: 'id',
    index: ['title', 'content', 'tags'],
    store: ['title', 'excerpt', 'type', 'modified']
  },
  tokenize: 'forward',
  resolution: 9,
  cache: true
});

// Rebuild on startup
export async function rebuildIndex(vault: VaultService) {
  const notes = await vault.getAllNotes();
  for (const note of notes) {
    searchIndex.add({
      id: note.id,
      title: note.title,
      content: note.content,
      tags: note.tags.join(' '),
      excerpt: note.excerpt,
      type: note.type,
      modified: note.modified
    });
  }
}
```

---

## 4. DEVOPS

### Project Structure (Monorepo)

```
obsidian-claude/
├── packages/
│   ├── server/              # Express + MCP server
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── web/                 # React dashboard
│   │   ├── src/
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── shared/              # Shared types and utilities
│       ├── src/
│       └── package.json
├── scripts/                 # Build and setup scripts
│   ├── init-vault.js        # Initialize vault structure
│   └── build.js             # Production build
├── package.json             # Root package.json
├── tsconfig.base.json       # Shared TS config
└── .gitignore
```

### Root package.json

```json
{
  "name": "obsidian-claude",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:web\"",
    "dev:server": "npm run dev -w packages/server",
    "dev:web": "npm run dev -w packages/web",
    "build": "npm run build -w packages/shared && npm run build -w packages/server && npm run build -w packages/web",
    "start": "npm run start -w packages/server",
    "init-vault": "node scripts/init-vault.js",
    "lint": "eslint packages/*/src",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "concurrently": "^8.0.0",
    "eslint": "^8.0.0",
    "typescript": "^5.3.0"
  }
}
```

### Server package.json

```json
{
  "name": "@obsidian-claude/server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@obsidian-claude/shared": "workspace:*",
    "better-sqlite3": "^9.0.0",
    "chokidar": "^3.5.0",
    "cors": "^2.8.0",
    "express": "^4.18.0",
    "flexsearch": "^0.7.0",
    "gray-matter": "^4.0.0",
    "pino": "^8.0.0",
    "pino-pretty": "^10.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.0.0",
    "@types/cors": "^2.8.0",
    "@types/express": "^4.17.0",
    "tsx": "^4.0.0"
  }
}
```

### Web package.json

```json
{
  "name": "@obsidian-claude/web",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@obsidian-claude/shared": "workspace:*",
    "@tanstack/react-query": "^5.0.0",
    "lucide-react": "^0.300.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "recharts": "^2.10.0",
    "zustand": "^4.4.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}
```

### Build & Run Commands

```bash
# Initial setup
npm install
npm run init-vault

# Development (both server and web)
npm run dev

# Production build
npm run build
npm run start

# Individual commands
npm run dev:server    # Server only
npm run dev:web       # Web only
npm run lint          # Lint all packages
npm run typecheck     # Type check all packages
```

### Environment Configuration

```typescript
// packages/server/src/config/index.ts
import { z } from 'zod';

const configSchema = z.object({
  port: z.number().default(3000),
  vaultPath: z.string().default('C:/Users/Owner/obsidian-vault'),
  dbPath: z.string().default('.cache.db'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  mode: z.enum(['quiet', 'nudge', 'coach']).default('quiet')
});

export const config = configSchema.parse({
  port: parseInt(process.env.PORT || '3000'),
  vaultPath: process.env.VAULT_PATH,
  dbPath: process.env.DB_PATH,
  logLevel: process.env.LOG_LEVEL,
  mode: process.env.MODE
});
```

### Claude Code MCP Configuration

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["C:/Users/Owner/obsidian-claude/packages/server/dist/index.js"],
      "env": {
        "VAULT_PATH": "C:/Users/Owner/obsidian-vault",
        "MODE": "mcp"
      }
    }
  }
}
```

### Vault Initialization Script

```javascript
// scripts/init-vault.js
import { mkdir, writeFile, copyFile } from 'fs/promises';
import { join } from 'path';

const VAULT_PATH = process.env.VAULT_PATH || 'C:/Users/Owner/obsidian-vault';

const folders = [
  'daily',
  'notes',
  'projects',
  'growth',
  'growth/snapshots',
  'templates'
];

const templates = [
  'daily.md',
  'concept.md',
  'solution.md',
  'decision.md',
  'failure.md',
  'project.md'
];

async function init() {
  console.log(`Initializing vault at ${VAULT_PATH}`);

  // Create folders
  for (const folder of folders) {
    await mkdir(join(VAULT_PATH, folder), { recursive: true });
    console.log(`Created ${folder}/`);
  }

  // Copy templates
  for (const template of templates) {
    const src = join('vault-template/templates', template);
    const dest = join(VAULT_PATH, 'templates', template);
    await copyFile(src, dest);
    console.log(`Created templates/${template}`);
  }

  // Create initial growth files
  await copyFile(
    'vault-template/growth/competencies.md',
    join(VAULT_PATH, 'growth/competencies.md')
  );

  console.log('Vault initialized successfully!');
}

init().catch(console.error);
```

---

## 5. IMPLEMENTATION PHASES

### Phase 1: Foundation (Core Infrastructure)
- [ ] Set up monorepo structure
- [ ] Create shared types package
- [ ] Build Express server skeleton
- [ ] Implement vault file operations
- [ ] Set up SQLite database and schema
- [ ] Create vault initialization script

### Phase 2: Core Features (Notes & Daily)
- [ ] Implement note CRUD operations
- [ ] Build daily note functionality
- [ ] Add capture/append feature
- [ ] Implement template rendering
- [ ] Set up FlexSearch indexing
- [ ] Build file watcher for sync

### Phase 3: MCP Integration
- [ ] Set up MCP server
- [ ] Implement all 11 MCP tools
- [ ] Test with Claude Code
- [ ] Add mode switching (quiet/nudge/coach)

### Phase 4: Web Dashboard
- [ ] Set up Vite + React
- [ ] Build component library
- [ ] Create Dashboard page
- [ ] Create Daily page
- [ ] Create Notes browser
- [ ] Create Note editor
- [ ] Create Projects page
- [ ] Create Growth tracker
- [ ] Create Search page

### Phase 5: Advanced Features
- [ ] Weekly review workflow
- [ ] Monthly snapshot generation
- [ ] Time tracking aggregations
- [ ] Backlink suggestions
- [ ] "Explain it" prompts

---

## 6. KEY TECHNICAL DECISIONS

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monorepo vs Multi-repo | Monorepo | Shared types, simpler development |
| Database | SQLite | No external dependencies, fast for local use |
| Search | FlexSearch | Sub-ms in-memory search, no server needed |
| State Management | React Query + Zustand | Server state vs client state separation |
| Styling | CSS Modules | Scoped, no runtime, good for learning |
| File watching | chokidar | Cross-platform, battle-tested |
| Combined server | Yes | Single process, simpler to run |
| Source of truth | Markdown files | Obsidian compatible, git-friendly |

---

## 7. FILE COUNTS ESTIMATE

| Package | Files | Lines (est.) |
|---------|-------|--------------|
| shared | ~10 | ~500 |
| server | ~30 | ~2500 |
| web | ~40 | ~3000 |
| scripts | ~3 | ~200 |
| **Total** | **~83** | **~6200** |

This is a moderately complex but very learnable project - great for your senior dev growth!
