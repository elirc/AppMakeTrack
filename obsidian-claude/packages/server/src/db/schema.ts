/**
 * Database schema definitions.
 *
 * This module contains SQL statements for creating the database schema.
 * The schema is designed to cache metadata from the vault for fast queries,
 * while the vault (markdown files) remains the source of truth.
 *
 * Design principles:
 * 1. The vault is the source of truth - database is a cache
 * 2. Database can be rebuilt from vault at any time
 * 3. Optimize for read-heavy workloads (lists, searches, aggregations)
 * 4. Keep writes simple (insert/update on file change)
 */

// ============================================================================
// SCHEMA VERSION
// ============================================================================

/**
 * Schema version for migrations.
 * Increment this when making schema changes.
 */
export const SCHEMA_VERSION = 1;

// ============================================================================
// TABLE CREATION
// ============================================================================

/**
 * SQL statements to create all tables.
 */
export const CREATE_TABLES = `
  -- Schema version tracking
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Notes metadata cache
  -- This caches parsed frontmatter and computed values from markdown files
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,              -- File path relative to vault root
    title TEXT NOT NULL,              -- From frontmatter or filename
    type TEXT,                        -- Note type (concept, solution, etc.)
    status TEXT,                      -- Note status (seedling, growing, evergreen)
    created_at TEXT NOT NULL,         -- ISO timestamp
    modified_at TEXT NOT NULL,        -- ISO timestamp
    word_count INTEGER DEFAULT 0,     -- Word count of body
    excerpt TEXT                      -- First ~200 chars for preview
  );

  -- Index for common queries
  CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
  CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
  CREATE INDEX IF NOT EXISTS idx_notes_modified ON notes(modified_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);

  -- Tags (normalized for efficient querying)
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  -- Index for tag name lookups
  CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

  -- Note-Tag junction table (many-to-many)
  CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
  );

  -- Index for finding notes by tag
  CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);

  -- Links between notes (for backlinks feature)
  CREATE TABLE IF NOT EXISTS links (
    source_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL,          -- May reference non-existent note
    context TEXT,                     -- Text around the link
    PRIMARY KEY (source_id, target_id)
  );

  -- Index for finding backlinks (notes that link TO a note)
  CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);

  -- Time entries (time tracking data)
  CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,               -- YYYY-MM-DD
    project TEXT,                     -- Project name (optional)
    task TEXT NOT NULL,               -- Task description
    duration_minutes INTEGER NOT NULL,-- Duration in minutes
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Indexes for time queries
  CREATE INDEX IF NOT EXISTS idx_time_date ON time_entries(date);
  CREATE INDEX IF NOT EXISTS idx_time_project ON time_entries(project);

  -- Growth evidence entries
  CREATE TABLE IF NOT EXISTS evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dimension TEXT NOT NULL,          -- Competency dimension
    description TEXT NOT NULL,        -- What you did/learned
    note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
    date TEXT NOT NULL,               -- YYYY-MM-DD
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Index for evidence queries
  CREATE INDEX IF NOT EXISTS idx_evidence_dimension ON evidence(dimension);
  CREATE INDEX IF NOT EXISTS idx_evidence_date ON evidence(date DESC);

  -- Application settings
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Projects table
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    tags TEXT,                            -- JSON array of tags
    created_at TEXT NOT NULL DEFAULT (date('now')),
    updated_at TEXT NOT NULL DEFAULT (date('now'))
  );

  -- Index for project queries
  CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
  CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);

  -- Growth snapshots (monthly point-in-time records)
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT UNIQUE NOT NULL,           -- YYYY-MM format
    data TEXT NOT NULL,                   -- JSON with dimension levels
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Index for snapshot queries
  CREATE INDEX IF NOT EXISTS idx_snapshots_month ON snapshots(month DESC);
`;

// ============================================================================
// PREPARED STATEMENT DEFINITIONS
// ============================================================================

/**
 * SQL for common queries.
 * Using prepared statements for performance and SQL injection prevention.
 */
export const QUERIES = {
  // Notes
  insertNote: `
    INSERT INTO notes (id, title, type, status, created_at, modified_at, word_count, excerpt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      type = excluded.type,
      status = excluded.status,
      modified_at = excluded.modified_at,
      word_count = excluded.word_count,
      excerpt = excluded.excerpt
  `,

  deleteNote: `DELETE FROM notes WHERE id = ?`,

  getNoteById: `SELECT * FROM notes WHERE id = ?`,

  getAllNotes: `
    SELECT * FROM notes
    ORDER BY modified_at DESC
  `,

  getNotesWithFilters: `
    SELECT DISTINCT n.*
    FROM notes n
    LEFT JOIN note_tags nt ON n.id = nt.note_id
    LEFT JOIN tags t ON nt.tag_id = t.id
    WHERE ($type IS NULL OR n.type = $type)
      AND ($status IS NULL OR n.status = $status)
      AND ($tag IS NULL OR t.name = $tag)
    ORDER BY n.modified_at DESC
    LIMIT $limit OFFSET $offset
  `,

  countNotes: `
    SELECT COUNT(DISTINCT n.id) as count
    FROM notes n
    LEFT JOIN note_tags nt ON n.id = nt.note_id
    LEFT JOIN tags t ON nt.tag_id = t.id
    WHERE ($type IS NULL OR n.type = $type)
      AND ($status IS NULL OR n.status = $status)
      AND ($tag IS NULL OR t.name = $tag)
  `,

  // Tags
  insertTag: `INSERT OR IGNORE INTO tags (name) VALUES (?)`,

  getTagId: `SELECT id FROM tags WHERE name = ?`,

  getAllTags: `
    SELECT t.name, COUNT(nt.note_id) as count
    FROM tags t
    LEFT JOIN note_tags nt ON t.id = nt.tag_id
    GROUP BY t.id
    ORDER BY count DESC
  `,

  // Note-Tag relationships
  insertNoteTag: `INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)`,

  deleteNoteTags: `DELETE FROM note_tags WHERE note_id = ?`,

  getTagsForNote: `
    SELECT t.name
    FROM tags t
    JOIN note_tags nt ON t.id = nt.tag_id
    WHERE nt.note_id = ?
  `,

  // Links
  insertLink: `
    INSERT OR REPLACE INTO links (source_id, target_id, context)
    VALUES (?, ?, ?)
  `,

  deleteLinksFromNote: `DELETE FROM links WHERE source_id = ?`,

  getBacklinks: `
    SELECT n.*, l.context
    FROM notes n
    JOIN links l ON n.id = l.source_id
    WHERE l.target_id = ?
  `,

  getOutgoingLinks: `
    SELECT target_id, context
    FROM links
    WHERE source_id = ?
  `,

  // Time entries
  insertTimeEntry: `
    INSERT INTO time_entries (date, project, task, duration_minutes)
    VALUES (?, ?, ?, ?)
  `,

  getTimeEntriesForDate: `
    SELECT * FROM time_entries
    WHERE date = ?
    ORDER BY created_at DESC
  `,

  getTimeEntriesForDateRange: `
    SELECT * FROM time_entries
    WHERE date >= ? AND date <= ?
    ORDER BY date, created_at
  `,

  getTimeByProject: `
    SELECT project, SUM(duration_minutes) as total_minutes
    FROM time_entries
    WHERE date >= ? AND date <= ?
    GROUP BY project
    ORDER BY total_minutes DESC
  `,

  getTotalTimeForDate: `
    SELECT SUM(duration_minutes) as total
    FROM time_entries
    WHERE date = ?
  `,

  // Evidence
  insertEvidence: `
    INSERT INTO evidence (dimension, description, note_id, date)
    VALUES (?, ?, ?, ?)
  `,

  getEvidenceByDimension: `
    SELECT * FROM evidence
    WHERE dimension = ?
    ORDER BY date DESC
  `,

  getEvidenceSummary: `
    SELECT
      dimension,
      COUNT(*) as count,
      MAX(date) as last_date
    FROM evidence
    GROUP BY dimension
  `,

  // Settings
  getSetting: `SELECT value FROM settings WHERE key = ?`,

  setSetting: `
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `,

  // Statistics
  getStats: `
    SELECT
      (SELECT COUNT(*) FROM notes) as total_notes,
      (SELECT COUNT(*) FROM notes WHERE date(modified_at) = date('now')) as notes_today,
      (SELECT COUNT(*) FROM notes WHERE type = 'project' AND status = 'active') as active_projects,
      (SELECT COALESCE(SUM(duration_minutes), 0) FROM time_entries
       WHERE date >= date('now', '-7 days')) as time_this_week
  `,

  // Schema version
  getSchemaVersion: `SELECT MAX(version) as version FROM schema_version`,

  setSchemaVersion: `INSERT INTO schema_version (version) VALUES (?)`,

  // Projects
  insertProject: `
    INSERT INTO projects (id, name, description, status, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,

  getProjects: `
    SELECT * FROM projects
    ORDER BY status = 'active' DESC, updated_at DESC
  `,

  getProjectsByStatus: `
    SELECT * FROM projects
    WHERE status = ?
    ORDER BY updated_at DESC
  `,

  getProjectByName: `SELECT * FROM projects WHERE name = ?`,

  getProjectById: `SELECT * FROM projects WHERE id = ?`,

  updateProjectStatus: `
    UPDATE projects
    SET status = ?, updated_at = date('now')
    WHERE id = ?
  `,

  // Snapshots
  insertSnapshot: `
    INSERT INTO snapshots (month, data)
    VALUES (?, ?)
  `,

  getSnapshots: `
    SELECT * FROM snapshots
    ORDER BY month DESC
  `,

  getSnapshotByMonth: `SELECT * FROM snapshots WHERE month = ?`,

  // Additional time queries
  getAllTimeEntries: `
    SELECT * FROM time_entries
    ORDER BY date DESC, created_at DESC
  `,

  // Additional evidence queries
  getAllEvidence: `
    SELECT * FROM evidence
    ORDER BY date DESC
  `,

  getEvidenceRange: `
    SELECT * FROM evidence
    WHERE date >= ? AND date <= ?
    ORDER BY date DESC
  `,

  // Additional notes queries
  getNotesCreatedBetween: `
    SELECT * FROM notes
    WHERE date(created_at) >= ? AND date(created_at) <= ?
    ORDER BY created_at DESC
  `,
} as const;
