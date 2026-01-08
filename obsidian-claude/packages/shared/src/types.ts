/**
 * Core type definitions for the Obsidian-Claude system.
 * These types are shared between server and web packages.
 */

// ============================================================================
// NOTE TYPES
// ============================================================================

/**
 * The type of note - determines template and behavior.
 */
export type NoteType =
  | 'concept'   // A single idea or concept (zettelkasten-style)
  | 'solution'  // A bug fix or problem solution
  | 'decision'  // An architectural or design decision
  | 'til'       // Today I Learned - quick learning nugget
  | 'daily'     // Daily note with tasks and time logs
  | 'project'   // Project tracking note
  | 'failure'   // Learning from something that didn't work
  | 'reference';// Book notes, article summaries

/**
 * Note maturity status - how developed is this note?
 */
export type NoteStatus =
  | 'seedling'  // Just planted - rough ideas
  | 'growing'   // Being developed - adding content
  | 'evergreen';// Mature - well-developed, reviewed

/**
 * Frontmatter extracted from a markdown note.
 */
export interface NoteFrontmatter {
  title?: string;
  type?: NoteType;
  status?: NoteStatus;
  tags?: string[];
  created?: string;  // ISO date string
  modified?: string; // ISO date string
  project?: string;  // Link to project
  [key: string]: unknown; // Allow additional custom fields
}

/**
 * A note in the vault - the core entity.
 */
export interface Note {
  /** Unique identifier - relative file path from vault root */
  id: string;

  /** Note title (from frontmatter or filename) */
  title: string;

  /** Full markdown content including frontmatter */
  content: string;

  /** Parsed frontmatter */
  frontmatter: NoteFrontmatter;

  /** Body content without frontmatter */
  body: string;

  /** Note type */
  type: NoteType | null;

  /** Maturity status */
  status: NoteStatus | null;

  /** All tags (from frontmatter) */
  tags: string[];

  /** ISO timestamp when created */
  createdAt: string;

  /** ISO timestamp when last modified */
  modifiedAt: string;

  /** First ~200 characters of body for previews */
  excerpt: string;

  /** Word count of body */
  wordCount: number;
}

/**
 * Lightweight note for list views - doesn't include full content.
 */
export interface NoteSummary {
  id: string;
  title: string;
  type: NoteType | null;
  status: NoteStatus | null;
  tags: string[];
  createdAt: string;
  modifiedAt: string;
  excerpt: string;
  wordCount: number;
}

// ============================================================================
// DAILY NOTE TYPES
// ============================================================================

/**
 * A time entry logged in a daily note.
 */
export interface TimeEntry {
  id: number;
  date: string;        // YYYY-MM-DD
  project: string | null;
  task: string;
  durationMinutes: number;
  createdAt: string;
}

/**
 * A task item from a daily note.
 */
export interface Task {
  text: string;
  completed: boolean;
  line: number;  // Line number in the file
}

/**
 * Parsed structure of a daily note.
 */
export interface DailyNote extends Note {
  date: string;  // YYYY-MM-DD
  tasks: Task[];
  timeEntries: TimeEntry[];
  wins: string[];      // Items from the "Wins" section
  learned: string[];   // Items from the "Learned Today" section
}

// ============================================================================
// PROJECT TYPES
// ============================================================================

/**
 * Project status.
 */
export type ProjectStatus =
  | 'active'    // Currently being worked on
  | 'paused'    // On hold
  | 'completed' // Finished
  | 'abandoned';// No longer pursuing

/**
 * A milestone within a project.
 */
export interface Milestone {
  text: string;
  completed: boolean;
}

/**
 * A project tracking note.
 */
export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  goal: string;
  startedAt: string;
  completedAt: string | null;
  milestones: Milestone[];
  totalTimeMinutes: number;
  noteCount: number;
  notes: NoteSummary[];
}

// ============================================================================
// GROWTH TRACKING TYPES
// ============================================================================

/**
 * Senior engineer competency dimensions.
 */
export type CompetencyDimension =
  | 'technical'     // Technical depth and understanding
  | 'debugging'     // Systematic problem-solving
  | 'codeQuality'   // Maintainable, testable code
  | 'architecture'  // System design decisions
  | 'communication' // Technical writing, influence
  | 'ownership'     // End-to-end responsibility
  | 'mentorship';   // Growing others

/**
 * Competency level self-assessment.
 */
export type CompetencyLevel =
  | 'junior'   // Learning the basics
  | 'mid'      // Applying consistently
  | 'senior';  // Teaching and leading

/**
 * A piece of evidence for growth in a competency.
 */
export interface Evidence {
  id: number;
  dimension: CompetencyDimension;
  description: string;
  noteId: string | null;  // Link to related note
  date: string;
  createdAt: string;
}

/**
 * Competency assessment snapshot.
 */
export interface CompetencySnapshot {
  dimension: CompetencyDimension;
  level: CompetencyLevel;
  evidenceCount: number;
  lastEvidence: string | null;  // Date of most recent evidence
}

/**
 * Monthly growth snapshot.
 */
export interface GrowthSnapshot {
  month: string;  // YYYY-MM
  createdAt: string;
  competencies: CompetencySnapshot[];
  notesCreated: number;
  timeLoggedMinutes: number;
  topTags: Array<{ tag: string; count: number }>;
  summary: string;
}

// ============================================================================
// SEARCH TYPES
// ============================================================================

/**
 * A search result with highlighted matches.
 */
export interface SearchResult {
  note: NoteSummary;
  matches: SearchMatch[];
  score: number;
}

/**
 * A single match within a search result.
 */
export interface SearchMatch {
  field: 'title' | 'content' | 'tags';
  snippet: string;  // Text around the match
}

/**
 * Search query options.
 */
export interface SearchOptions {
  query: string;
  types?: NoteType[];
  tags?: string[];
  status?: NoteStatus[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// API TYPES
// ============================================================================

/**
 * Pagination metadata.
 */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

/**
 * API error response.
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Standard API response.
 */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

// ============================================================================
// STATS TYPES
// ============================================================================

/**
 * Dashboard statistics.
 */
export interface DashboardStats {
  notesTotal: number;
  notesToday: number;
  projectsActive: number;
  timeThisWeekMinutes: number;
  currentStreak: number;  // Days with notes/captures
  topTags: Array<{ tag: string; count: number }>;
  recentNotes: NoteSummary[];
}

/**
 * Weekly activity summary.
 */
export interface WeeklySummary {
  weekOf: string;  // Start date of week
  captures: number;
  notesProcessed: number;
  timeLoggedMinutes: number;
  projectsWorkedOn: string[];
  tasksCompleted: number;
  tasksIncomplete: number;
  wins: string[];
  learned: string[];
}

// ============================================================================
// SETTINGS TYPES
// ============================================================================

/**
 * Proactivity mode for Claude integration.
 */
export type ProactivityMode =
  | 'quiet'  // Only respond when asked
  | 'nudge'  // Daily prompts for capture review
  | 'coach'; // Full coaching with weekly reviews

/**
 * Application settings.
 */
export interface Settings {
  vaultPath: string;
  mode: ProactivityMode;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;  // 0 = Sunday
  dailyNoteFormat: string;  // Date format for daily note titles
  defaultNoteType: NoteType;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * A wiki-style link between notes.
 */
export interface NoteLink {
  sourceId: string;
  targetId: string;
  context: string;  // Text around the link
}

/**
 * Tag with usage count.
 */
export interface TagCount {
  tag: string;
  count: number;
}

/**
 * Date range for queries.
 */
export interface DateRange {
  from: string;  // ISO date
  to: string;    // ISO date
}
