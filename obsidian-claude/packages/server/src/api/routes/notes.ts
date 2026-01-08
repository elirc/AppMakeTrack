/**
 * Notes API Routes
 *
 * Handles CRUD operations for notes:
 * - GET    /api/notes          - List notes (paginated, filtered)
 * - GET    /api/notes/:id      - Get single note
 * - POST   /api/notes          - Create note
 * - PUT    /api/notes/:id      - Update note
 * - DELETE /api/notes/:id      - Delete note
 * - GET    /api/notes/:id/backlinks - Get backlinks to note
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { getDatabase } from '../../db/index.js';
import { getVaultService } from '../../services/vault.js';
import { createChildLogger } from '../../utils/logger.js';
import {
  validate,
  formatErrors,
  createNoteSchema,
  updateNoteSchema,
  paginationSchema,
} from '@obsidian-claude/shared';
import type { Note, NoteSummary, NoteType, NoteStatus, ApiResponse, NoteFrontmatter } from '@obsidian-claude/shared';

// ============================================================================
// SETUP
// ============================================================================

const router = Router();
const log = createChildLogger({ module: 'api:notes' });

// Get service instances
const db = () => getDatabase();
const vault = () => getVaultService();

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Wrap async route handlers to catch errors.
 * Express doesn't handle async errors by default.
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Send a success response.
 */
function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data } as ApiResponse<T>);
}

/**
 * Send an error response.
 */
function sendError(
  res: Response,
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>
): void {
  res.status(status).json({
    success: false,
    error: { code, message, details },
  });
}

/**
 * Generate a filename from a title.
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/notes
 * List notes with pagination and filtering.
 *
 * Query params:
 * - page: number (default 1)
 * - limit: number (default 20, max 100)
 * - type: NoteType filter
 * - status: NoteStatus filter
 * - tag: string filter
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    // Validate pagination params
    const paginationResult = validate(paginationSchema, {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });

    if (!paginationResult.success) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid pagination parameters', 400, {
        errors: formatErrors(paginationResult.errors),
      });
    }

    const { page = 1, limit = 20 } = paginationResult.data;
    const offset = (page - 1) * limit;

    // Extract filters
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const tag = req.query.tag as string | undefined;

    // Query database
    const { notes, total } = db().getNotes({
      type: type || null,
      status: status || null,
      tag: tag || null,
      limit,
      offset,
    });

    log.debug({ count: notes.length, total, page, limit }, 'Notes listed');

    sendSuccess(res, {
      notes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

/**
 * GET /api/notes/:id
 * Get a single note by ID (file path).
 *
 * The ID is URL-encoded (e.g., notes%2Fmy-note.md).
 */
router.get(
  '/:id(*)',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;

    if (!id) {
      return sendError(res, 'VALIDATION_ERROR', 'Note ID is required', 400);
    }

    // Read from vault (source of truth)
    const note = await vault().readNote(id);

    if (!note) {
      return sendError(res, 'NOT_FOUND', `Note not found: ${id}`, 404);
    }

    log.debug({ noteId: id }, 'Note retrieved');
    sendSuccess(res, note);
  })
);

/**
 * POST /api/notes
 * Create a new note.
 *
 * Body:
 * - title: string (required)
 * - type: NoteType (required)
 * - content: string (optional)
 * - tags: string[] (optional)
 * - project: string (optional)
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    // Validate input
    const result = validate(createNoteSchema, req.body);

    if (!result.success) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid note data', 400, {
        errors: formatErrors(result.errors),
      });
    }

    const { title, type, content, tags, project } = result.data;

    // Determine folder based on type
    const folder = type === 'project' ? 'projects' : 'notes';

    // Generate filename
    const filename = `${slugify(title)}.md`;

    try {
      // Create note in vault
      const note = await vault().createNote(folder, filename, {
        title,
        type: type as NoteType,
        content,
        tags,
      });

      // Index in database
      db().upsertNote({
        id: note.id,
        title: note.title,
        type: note.type,
        status: note.status,
        createdAt: note.createdAt,
        modifiedAt: note.modifiedAt,
        wordCount: note.wordCount,
        excerpt: note.excerpt,
        tags: note.tags,
      });

      // Extract and store links
      const links = vault().extractLinks(note.content);
      db().updateLinks(
        note.id,
        links.map((l) => ({ targetId: `notes/${l.target}`, context: l.context }))
      );

      log.info({ noteId: note.id, title }, 'Note created');
      sendSuccess(res, note, 201);
    } catch (error) {
      if ((error as Error).message.includes('already exists')) {
        return sendError(res, 'ALREADY_EXISTS', 'A note with this title already exists', 409);
      }
      throw error;
    }
  })
);

/**
 * PUT /api/notes/:id
 * Update an existing note.
 *
 * Body (all optional):
 * - title: string
 * - content: string
 * - type: NoteType
 * - status: NoteStatus
 * - tags: string[]
 */
router.put(
  '/:id(*)',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;

    if (!id) {
      return sendError(res, 'VALIDATION_ERROR', 'Note ID is required', 400);
    }

    // Check note exists
    const existing = await vault().readNote(id);
    if (!existing) {
      return sendError(res, 'NOT_FOUND', `Note not found: ${id}`, 404);
    }

    // Validate input
    const result = validate(updateNoteSchema, req.body);

    if (!result.success) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid update data', 400, {
        errors: formatErrors(result.errors),
      });
    }

    const updates = result.data;

    // If content is being updated, write the whole file
    if (updates.content !== undefined) {
      // Merge frontmatter updates
      const newFrontmatter: NoteFrontmatter = { ...existing.frontmatter };
      if (updates.title) newFrontmatter.title = updates.title;
      if (updates.type) newFrontmatter.type = updates.type as NoteType;
      if (updates.status) newFrontmatter.status = updates.status as NoteStatus;
      if (updates.tags) newFrontmatter.tags = updates.tags;
      newFrontmatter.modified = new Date().toISOString();

      // Rebuild content with gray-matter
      const matter = await import('gray-matter');
      const newContent = matter.default.stringify(updates.content, newFrontmatter);

      await vault().writeNote(id, newContent);
    } else if (Object.keys(updates).length > 0) {
      // Just update frontmatter - cast to Partial<NoteFrontmatter> since Zod validated the types
      await vault().updateNoteFrontmatter(id, updates as Partial<NoteFrontmatter>);
    }

    // Re-read the updated note
    const note = await vault().readNote(id);

    if (!note) {
      return sendError(res, 'INTERNAL_ERROR', 'Failed to read updated note', 500);
    }

    // Update database cache
    db().upsertNote({
      id: note.id,
      title: note.title,
      type: note.type,
      status: note.status,
      createdAt: note.createdAt,
      modifiedAt: note.modifiedAt,
      wordCount: note.wordCount,
      excerpt: note.excerpt,
      tags: note.tags,
    });

    // Update links
    const links = vault().extractLinks(note.content);
    db().updateLinks(
      note.id,
      links.map((l) => ({ targetId: `notes/${l.target}`, context: l.context }))
    );

    log.info({ noteId: id }, 'Note updated');
    sendSuccess(res, note);
  })
);

/**
 * DELETE /api/notes/:id
 * Delete a note.
 */
router.delete(
  '/:id(*)',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;

    if (!id) {
      return sendError(res, 'VALIDATION_ERROR', 'Note ID is required', 400);
    }

    // Check note exists
    const existing = await vault().readNote(id);
    if (!existing) {
      return sendError(res, 'NOT_FOUND', `Note not found: ${id}`, 404);
    }

    // Delete from vault
    await vault().deleteNote(id);

    // Delete from database (CASCADE handles related records)
    db().deleteNote(id);

    log.info({ noteId: id }, 'Note deleted');
    sendSuccess(res, { deleted: true, id });
  })
);

/**
 * GET /api/notes/:id/backlinks
 * Get notes that link to this note.
 */
router.get(
  '/:id(*)/backlinks',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;

    if (!id) {
      return sendError(res, 'VALIDATION_ERROR', 'Note ID is required', 400);
    }

    // Get backlinks from database
    const backlinks = db().getBacklinks(id);

    log.debug({ noteId: id, count: backlinks.length }, 'Backlinks retrieved');
    sendSuccess(res, backlinks);
  })
);

// ============================================================================
// EXPORT
// ============================================================================

export { router as notesRouter };
