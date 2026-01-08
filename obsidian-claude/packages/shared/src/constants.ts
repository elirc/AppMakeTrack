/**
 * Shared constants used throughout the application.
 */

import type {
  NoteType,
  NoteStatus,
  ProjectStatus,
  CompetencyDimension,
  ProactivityMode,
} from './types.js';

// ============================================================================
// NOTE CONSTANTS
// ============================================================================

/**
 * All valid note types.
 * Using a const array allows us to iterate over types at runtime.
 */
export const NOTE_TYPES: readonly NoteType[] = [
  'concept',
  'solution',
  'decision',
  'til',
  'daily',
  'project',
  'failure',
  'reference',
] as const;

/**
 * Human-readable labels for note types.
 */
export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  concept: 'Concept',
  solution: 'Solution',
  decision: 'Decision',
  til: 'TIL',
  daily: 'Daily Note',
  project: 'Project',
  failure: 'Failure Log',
  reference: 'Reference',
};

/**
 * Descriptions for note types (for UI tooltips/help).
 */
export const NOTE_TYPE_DESCRIPTIONS: Record<NoteType, string> = {
  concept: 'A single idea or concept - atomic knowledge',
  solution: 'A bug fix or problem solution you discovered',
  decision: 'An architectural or design decision with rationale',
  til: 'Today I Learned - quick learning nuggets',
  daily: 'Daily note with tasks, time logs, and captures',
  project: 'Project tracking with goals and milestones',
  failure: 'Learning from something that didn\'t work',
  reference: 'Book notes, article summaries, external content',
};

/**
 * All valid note statuses.
 */
export const NOTE_STATUSES: readonly NoteStatus[] = [
  'seedling',
  'growing',
  'evergreen',
] as const;

/**
 * Human-readable labels for note statuses.
 */
export const NOTE_STATUS_LABELS: Record<NoteStatus, string> = {
  seedling: 'Seedling',
  growing: 'Growing',
  evergreen: 'Evergreen',
};

/**
 * Emoji icons for note statuses (for visual display).
 */
export const NOTE_STATUS_ICONS: Record<NoteStatus, string> = {
  seedling: '🌱',
  growing: '🌿',
  evergreen: '🌲',
};

// ============================================================================
// PROJECT CONSTANTS
// ============================================================================

/**
 * All valid project statuses.
 */
export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'active',
  'paused',
  'completed',
  'abandoned',
] as const;

/**
 * Human-readable labels for project statuses.
 */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  abandoned: 'Abandoned',
};

// ============================================================================
// COMPETENCY CONSTANTS
// ============================================================================

/**
 * All competency dimensions for growth tracking.
 */
export const COMPETENCY_DIMENSIONS: readonly CompetencyDimension[] = [
  'technical',
  'debugging',
  'codeQuality',
  'architecture',
  'communication',
  'ownership',
  'mentorship',
] as const;

/**
 * Human-readable labels for competency dimensions.
 */
export const COMPETENCY_LABELS: Record<CompetencyDimension, string> = {
  technical: 'Technical Depth',
  debugging: 'Debugging',
  codeQuality: 'Code Quality',
  architecture: 'Architecture',
  communication: 'Communication',
  ownership: 'Ownership',
  mentorship: 'Mentorship',
};

/**
 * Descriptions for competency dimensions.
 */
export const COMPETENCY_DESCRIPTIONS: Record<CompetencyDimension, string> = {
  technical: 'Deep understanding of tools, languages, and internals',
  debugging: 'Systematic problem-solving and root cause analysis',
  codeQuality: 'Writing maintainable, testable, clean code',
  architecture: 'System design, patterns, and trade-off decisions',
  communication: 'Technical writing, influence, and clarity',
  ownership: 'End-to-end responsibility and reliability',
  mentorship: 'Growing others, teaching, and knowledge sharing',
};

// ============================================================================
// MODE CONSTANTS
// ============================================================================

/**
 * All proactivity modes.
 */
export const PROACTIVITY_MODES: readonly ProactivityMode[] = [
  'quiet',
  'nudge',
  'coach',
] as const;

/**
 * Labels for proactivity modes.
 */
export const PROACTIVITY_MODE_LABELS: Record<ProactivityMode, string> = {
  quiet: 'Quiet',
  nudge: 'Nudge',
  coach: 'Coach',
};

/**
 * Descriptions for proactivity modes.
 */
export const PROACTIVITY_MODE_DESCRIPTIONS: Record<ProactivityMode, string> = {
  quiet: 'Only respond when asked - no proactive prompts',
  nudge: 'Daily prompts for capture review and end-of-session summaries',
  coach: 'Full coaching with weekly reviews and growth tracking prompts',
};

// ============================================================================
// VAULT STRUCTURE CONSTANTS
// ============================================================================

/**
 * Standard folder names in the vault.
 */
export const VAULT_FOLDERS = {
  DAILY: 'daily',
  NOTES: 'notes',
  PROJECTS: 'projects',
  GROWTH: 'growth',
  TEMPLATES: 'templates',
  SNAPSHOTS: 'growth/snapshots',
} as const;

/**
 * Template file names.
 */
export const TEMPLATE_FILES = {
  DAILY: 'daily.md',
  CONCEPT: 'concept.md',
  SOLUTION: 'solution.md',
  DECISION: 'decision.md',
  FAILURE: 'failure.md',
  PROJECT: 'project.md',
} as const;

/**
 * Special file names in the vault.
 */
export const SPECIAL_FILES = {
  COMPETENCIES: 'growth/competencies.md',
  FAILURES: 'growth/failures.md',
} as const;

// ============================================================================
// DATE/TIME CONSTANTS
// ============================================================================

/**
 * Default date format for daily notes.
 */
export const DEFAULT_DATE_FORMAT = 'yyyy-MM-dd';

/**
 * Date format for display.
 */
export const DISPLAY_DATE_FORMAT = 'MMM d, yyyy';

/**
 * Time format for display.
 */
export const DISPLAY_TIME_FORMAT = 'h:mm a';

// ============================================================================
// PAGINATION DEFAULTS
// ============================================================================

/**
 * Default page size for lists.
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Maximum page size allowed.
 */
export const MAX_PAGE_SIZE = 100;

// ============================================================================
// SEARCH CONSTANTS
// ============================================================================

/**
 * Default number of search results.
 */
export const DEFAULT_SEARCH_LIMIT = 20;

/**
 * Maximum search results.
 */
export const MAX_SEARCH_RESULTS = 100;

/**
 * Length of excerpt snippets.
 */
export const EXCERPT_LENGTH = 200;

/**
 * Length of search match snippets.
 */
export const SEARCH_SNIPPET_LENGTH = 100;

// ============================================================================
// FRONTMATTER FIELD NAMES
// ============================================================================

/**
 * Standard frontmatter field names.
 */
export const FRONTMATTER_FIELDS = {
  TITLE: 'title',
  TYPE: 'type',
  STATUS: 'status',
  TAGS: 'tags',
  CREATED: 'created',
  MODIFIED: 'modified',
  PROJECT: 'project',
} as const;

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * API error codes.
 */
export const ERROR_CODES = {
  // General errors
  UNKNOWN: 'UNKNOWN_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',

  // Note errors
  NOTE_NOT_FOUND: 'NOTE_NOT_FOUND',
  NOTE_ALREADY_EXISTS: 'NOTE_ALREADY_EXISTS',
  INVALID_NOTE_TYPE: 'INVALID_NOTE_TYPE',

  // Project errors
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',

  // Vault errors
  VAULT_NOT_FOUND: 'VAULT_NOT_FOUND',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',

  // Search errors
  SEARCH_ERROR: 'SEARCH_ERROR',
  INVALID_QUERY: 'INVALID_QUERY',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
