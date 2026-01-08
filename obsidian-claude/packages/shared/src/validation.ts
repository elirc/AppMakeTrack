/**
 * Validation schemas using Zod.
 * These schemas validate data at runtime and provide type inference.
 */

import { z } from 'zod';
import {
  NOTE_TYPES,
  NOTE_STATUSES,
  PROJECT_STATUSES,
  COMPETENCY_DIMENSIONS,
  PROACTIVITY_MODES,
} from './constants.js';

// ============================================================================
// BASE SCHEMAS
// ============================================================================

/**
 * ISO date string validation.
 */
export const isoDateSchema = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Invalid ISO date string' }
);

/**
 * Slug/ID validation - lowercase, hyphens, no spaces.
 */
export const slugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9-]+$/, 'Must be lowercase alphanumeric with hyphens');

/**
 * File path validation - relative path within vault.
 */
export const filePathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (val) => !val.includes('..') && !val.startsWith('/'),
    { message: 'Invalid file path - no parent traversal or absolute paths' }
  );

// ============================================================================
// NOTE SCHEMAS
// ============================================================================

/**
 * Note type enum schema.
 */
export const noteTypeSchema = z.enum(NOTE_TYPES as unknown as [string, ...string[]]);

/**
 * Note status enum schema.
 */
export const noteStatusSchema = z.enum(NOTE_STATUSES as unknown as [string, ...string[]]);

/**
 * Tags array schema.
 */
export const tagsSchema = z.array(z.string().min(1).max(50)).max(20);

/**
 * Schema for creating a new note.
 */
export const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  type: noteTypeSchema,
  content: z.string().max(100000).optional(),
  tags: tagsSchema.optional(),
  project: z.string().max(200).optional(),
});

/**
 * Schema for updating an existing note.
 */
export const updateNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(100000).optional(),
  type: noteTypeSchema.optional(),
  status: noteStatusSchema.optional(),
  tags: tagsSchema.optional(),
});

/**
 * Schema for quick capture input.
 */
export const captureSchema = z.object({
  content: z.string().min(1).max(10000),
  section: z.enum(['plan', 'notes', 'wins', 'learned']).optional(),
});

// ============================================================================
// TIME TRACKING SCHEMAS
// ============================================================================

/**
 * Schema for logging time.
 */
export const logTimeSchema = z.object({
  project: z.string().max(200).optional(),
  task: z.string().min(1).max(500),
  durationMinutes: z.number().int().min(1).max(1440), // Max 24 hours
});

/**
 * Schema for time entry query.
 */
export const timeQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  project: z.string().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

// ============================================================================
// PROJECT SCHEMAS
// ============================================================================

/**
 * Project status enum schema.
 */
export const projectStatusSchema = z.enum(PROJECT_STATUSES as unknown as [string, ...string[]]);

/**
 * Schema for creating a project.
 */
export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  goal: z.string().min(1).max(1000),
});

/**
 * Schema for updating a project.
 */
export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  goal: z.string().min(1).max(1000).optional(),
  status: projectStatusSchema.optional(),
});

// ============================================================================
// GROWTH TRACKING SCHEMAS
// ============================================================================

/**
 * Competency dimension enum schema.
 */
export const competencyDimensionSchema = z.enum(
  COMPETENCY_DIMENSIONS as unknown as [string, ...string[]]
);

/**
 * Schema for adding growth evidence.
 */
export const addEvidenceSchema = z.object({
  dimension: competencyDimensionSchema,
  description: z.string().min(1).max(1000),
  noteId: filePathSchema.optional(),
});

// ============================================================================
// SEARCH SCHEMAS
// ============================================================================

/**
 * Schema for search query parameters.
 */
export const searchQuerySchema = z.object({
  query: z.string().min(1).max(200),
  types: z.array(noteTypeSchema).optional(),
  tags: tagsSchema.optional(),
  status: z.array(noteStatusSchema).optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

// ============================================================================
// SETTINGS SCHEMAS
// ============================================================================

/**
 * Proactivity mode enum schema.
 */
export const proactivityModeSchema = z.enum(
  PROACTIVITY_MODES as unknown as [string, ...string[]]
);

/**
 * Schema for application settings.
 */
export const settingsSchema = z.object({
  vaultPath: z.string().min(1),
  mode: proactivityModeSchema,
  weekStartsOn: z.number().int().min(0).max(6),
  dailyNoteFormat: z.string().min(1).max(50),
  defaultNoteType: noteTypeSchema,
});

// ============================================================================
// PAGINATION SCHEMAS
// ============================================================================

/**
 * Schema for pagination parameters.
 */
export const paginationSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

// ============================================================================
// TYPE INFERENCE
// ============================================================================

// Infer TypeScript types from Zod schemas
// This ensures types and validation stay in sync

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type CaptureInput = z.infer<typeof captureSchema>;
export type LogTimeInput = z.infer<typeof logTimeSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AddEvidenceInput = z.infer<typeof addEvidenceSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type PaginationParams = z.infer<typeof paginationSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate data against a schema, returning a result object.
 * Never throws - always returns success or error.
 */
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

/**
 * Format Zod errors into a human-readable object.
 */
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

/**
 * Check if a value is a valid note type.
 */
export function isValidNoteType(value: unknown): value is z.infer<typeof noteTypeSchema> {
  return noteTypeSchema.safeParse(value).success;
}

/**
 * Check if a value is a valid note status.
 */
export function isValidNoteStatus(value: unknown): value is z.infer<typeof noteStatusSchema> {
  return noteStatusSchema.safeParse(value).success;
}

/**
 * Check if a value is a valid project status.
 */
export function isValidProjectStatus(value: unknown): value is z.infer<typeof projectStatusSchema> {
  return projectStatusSchema.safeParse(value).success;
}
