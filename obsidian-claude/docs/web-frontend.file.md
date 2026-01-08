# Web Frontend - The React Dashboard

## What This Package Does

The web frontend is a React SPA (Single Page Application) that provides a visual interface for your personal knowledge system. While Claude Code integration happens through MCP tools, the web dashboard lets you:

- View your notes in a browsable interface
- See today's daily note
- Track growth across competency dimensions
- Monitor project status
- Review time tracking data

---

## My Design Thought Process

### Why a Separate Web App?

I could have built everything into Claude Code:

```
Option A: CLI-only
- All interactions through MCP tools
- No visual dashboard
- Simpler, but less discoverable
```

Instead, I built a web dashboard:

```
Option B: Web Dashboard + MCP Tools
- MCP tools for fast captures during work
- Web dashboard for review and browsing
- Best of both worlds
```

**Why web wins:**

1. **Visual Overview** - See patterns at a glance
2. **Easy Browsing** - Click through notes, not type commands
3. **Growth Visualization** - Progress bars, matrices
4. **Accessibility** - Anyone can use a web interface

### Technology Choices

**React + Vite:**
- Fast development with HMR
- Modern tooling, great DX
- Widely understood, easy to maintain

**CSS Modules:**
- Scoped styles (no global pollution)
- No extra dependencies (vs styled-components)
- Easy to trace styles to components

**No State Management Library:**
- Local state with useState
- API hooks for data fetching
- Simple enough for this app size
- Can add Redux/Zustand later if needed

---

## Architecture Overview

```
packages/web/
├── src/
│   ├── main.tsx          # Entry point
│   ├── App.tsx           # Routing setup
│   ├── components/       # Shared components
│   │   ├── Layout.tsx    # Page layout with sidebar
│   │   └── *.module.css  # Component styles
│   ├── pages/            # Route components
│   │   ├── Dashboard.tsx # Main landing page
│   │   ├── Daily.tsx     # Daily note viewer
│   │   ├── Notes.tsx     # Notes browser
│   │   ├── NoteDetail.tsx# Single note view
│   │   ├── Growth.tsx    # Competency matrix
│   │   └── Projects.tsx  # Project list
│   ├── hooks/            # Custom hooks
│   │   └── useApi.ts     # Data fetching hooks
│   └── styles/           # Global styles
│       └── global.css    # CSS variables, reset
├── public/               # Static assets
├── index.html            # HTML template
├── vite.config.ts        # Vite configuration
└── package.json
```

---

## Component Patterns

### Layout Component

```tsx
export function Layout({ children }: LayoutProps) {
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <Nav />
      </aside>
      <main className={styles.main}>
        <Header />
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
```

**Pattern: Layout Wrapper**
- Consistent structure across all pages
- Sidebar navigation always visible
- Header with search

### Page Components

```tsx
export function Dashboard() {
  const { data: stats, loading } = useStats();

  return (
    <div className={styles.dashboard}>
      {loading ? <Loading /> : <StatsGrid stats={stats} />}
    </div>
  );
}
```

**Pattern: Data Loading in Pages**
- Pages own their data fetching
- Loading/error states at page level
- Components receive data as props

---

## API Hooks

### Generic Hook Pattern

```typescript
function useApi<T>(url: string, options?: { immediate?: boolean }): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
```

**Why custom hooks:**
1. Encapsulate fetch logic
2. Type-safe responses
3. Consistent loading/error handling
4. Easy to upgrade to react-query later

### Specific Hooks

```typescript
export function useStats() {
  return useApi<DashboardStats>('/api/stats/dashboard');
}

export function useDailyNote(date?: string) {
  const url = date ? `/api/daily/${date}` : '/api/daily';
  return useApi<DailyNoteData>(url);
}

export function useNotes(filters?: NoteFilters) {
  const params = buildQueryParams(filters);
  return useApi<NotesResponse>(`/api/notes?${params}`);
}
```

**Pattern: Domain-Specific Hooks**
- Hide URL construction
- Type the response
- Consistent API across app

---

## Styling Strategy

### CSS Custom Properties (Theming)

```css
:root {
  /* Colors */
  --color-bg-primary: #1e1e1e;
  --color-accent: #7c3aed;

  /* Typography */
  --font-size-base: 1rem;

  /* Spacing */
  --spacing-4: 1rem;

  /* Border Radius */
  --radius-md: 0.375rem;
}
```

**Why variables:**
- Single source of truth
- Easy theme changes
- Consistent spacing/sizing

### CSS Modules

```tsx
// Component
import styles from './Dashboard.module.css';

return <div className={styles.dashboard}>...</div>;
```

```css
/* Dashboard.module.css */
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}
```

**Benefits:**
- Scoped to component (no global conflicts)
- Clear what styles belong where
- IDE support for class names

---

## Page Breakdown

### Dashboard

**Purpose:** Quick overview of everything.

**Sections:**
1. Stats cards (total notes, today's notes, projects, time)
2. Recent notes list
3. Today's time summary
4. Quick action buttons

**Key insight:** Dashboard should answer "What's my current state?"

### Daily

**Purpose:** View today's (or any day's) daily note.

**Features:**
- Date navigation (previous/next)
- Markdown rendering
- Section highlighting (Plan, Notes, Wins, Learned)
- Time entry formatting

**Key insight:** Read-only view - edits happen in Obsidian or via MCP.

### Notes

**Purpose:** Browse and filter all notes.

**Features:**
- Type filtering (concept, solution, etc.)
- Search within results
- Card-based layout
- Excerpt preview

**Key insight:** Discovery-oriented - help users find what they need.

### NoteDetail

**Purpose:** Read a single note in full.

**Features:**
- Full markdown rendering
- Metadata display (type, status, tags)
- Breadcrumb navigation
- Path display for Obsidian

**Key insight:** Reading experience - clean, focused.

### Growth

**Purpose:** Visualize competency progress.

**Features:**
- Progress bars per dimension
- Level badges (junior/mid/senior)
- Evidence counts
- Tips for adding evidence

**Key insight:** Gamification - make progress visible.

### Projects

**Purpose:** Project portfolio overview.

**Features:**
- Status filtering
- Project cards with metadata
- Status badges
- Tips for project management

**Key insight:** High-level view - not project details.

---

## Rendering Markdown

I implemented simple markdown rendering inline:

```tsx
function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  return lines.map((line, i) => {
    if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>;
    if (line.startsWith('- ')) return <li key={i}>{line.slice(2)}</li>;
    // ...
    return <p key={i}>{line}</p>;
  });
}
```

**Why inline rendering:**
- No external dependencies
- Handles our specific markdown patterns
- Easy to customize

**Production improvement:**
- Use react-markdown or remark
- Syntax highlighting for code
- Link handling for wiki-links

---

## Error Handling

### API Errors

```tsx
const { data, loading, error } = useNotes();

if (loading) return <Spinner />;
if (error) return <ErrorMessage message={error} />;
return <NotesList notes={data.notes} />;
```

**Pattern: Explicit Error States**
- Always handle loading
- Always handle errors
- Never assume data exists

### Empty States

```tsx
{notes.length === 0 ? (
  <EmptyState
    message="No notes found"
    hint="Use Claude Code to create notes"
  />
) : (
  <NotesList notes={notes} />
)}
```

**Pattern: Helpful Empty States**
- Explain what's missing
- Suggest how to fix it
- Never show blank screens

---

## Senior-Level Considerations

### 1. Performance

- Pagination for large lists
- Client-side filtering for small sets
- Lazy loading for route components (could add)

### 2. Accessibility

- Semantic HTML (header, nav, main, article)
- Keyboard navigation (links, buttons)
- Color contrast in dark theme

### 3. Maintainability

- Components do one thing
- Styles co-located with components
- Types imported from shared package

### 4. Extensibility

- Easy to add new pages (add component, add route)
- Easy to add new hooks (follow pattern)
- Theme changes in one file

---

## Future Improvements

### What I'd Add Next

1. **React Query** - Better caching, refetching
2. **Note Editing** - CRUD in the UI
3. **Search** - Global search with results page
4. **Dark/Light Toggle** - Theme preference
5. **Responsive Design** - Mobile support

### What I'd Refactor

1. **Markdown Renderer** - Use a library
2. **State Management** - If app grows larger
3. **Testing** - Add component tests
4. **Error Boundaries** - Catch render errors

---

## Questions to Test Understanding

1. Why use CSS Modules instead of styled-components?
2. What's the benefit of domain-specific API hooks?
3. Why handle loading/error states in page components?
4. How does the Layout component provide consistency?
5. Why implement simple markdown rendering inline?
6. What makes an "empty state" helpful?
