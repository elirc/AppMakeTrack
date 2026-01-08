/**
 * Search API Routes
 *
 * Handles search operations:
 * - GET /api/search        - Full-text search
 * - GET /api/search/tags   - List all tags
 * - GET /api/search/recent - Recently modified notes
 */

import { Router, type Request, type Response } from 'express';
import { getDatabase } from '../../db/index.js';
import { getSearchService } from '../../services/search.js';
import { createChildLogger } from '../../utils/logger.js';
import { validate, searchQuerySchema } from '@obsidian-claude/shared';

// ============================================================================
// SETUP
// ============================================================================

const router = Router();
const log = createChildLogger({ module: 'api:search' });

const db = () => getDatabase();
const search = () => getSearchService();

// ============================================================================
// HELPERS
// ============================================================================

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: (err?: Error) => void) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

function sendSuccess<T>(res: Response, data: T): void {
  res.json({ success: true, data });
}

function sendError(res: Response, code: string, message: string, status = 400): void {
  res.status(status).json({ success: false, error: { code, message } });
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/search
 * Full-text search across notes.
 *
 * Query params:
 * - q: string (required) - Search query
 * - types: NoteType[] (optional) - Filter by note types
 * - tags: string[] (optional) - Filter by tags
 * - limit: number (optional, default 20)
 * - offset: number (optional, default 0)
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query.q as string;

    if (!query || query.trim().length === 0) {
      return sendError(res, 'VALIDATION_ERROR', 'Search query is required');
    }

    // Parse array params
    const types = req.query.types
      ? (Array.isArray(req.query.types) ? req.query.types : [req.query.types])
      : undefined;
    const tags = req.query.tags
      ? (Array.isArray(req.query.tags) ? req.query.tags : [req.query.tags])
      : undefined;

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    try {
      // Use search service for full-text search
      const results = await search().search(query, {
        types: types as string[],
        tags: tags as string[],
        limit,
        offset,
      });

      log.debug(
        { query, resultCount: results.length },
        'Search completed'
      );

      sendSuccess(res, {
        query,
        results,
        limit,
        offset,
      });
    } catch (error) {
      log.error({ err: error, query }, 'Search failed');
      sendError(res, 'SEARCH_ERROR', 'Search failed', 500);
    }
  })
);

/**
 * GET /api/search/tags
 * Get all tags with usage counts.
 */
router.get(
  '/tags',
  asyncHandler(async (req: Request, res: Response) => {
    const tags = db().getAllTags();

    log.debug({ tagCount: tags.length }, 'Tags retrieved');
    sendSuccess(res, tags);
  })
);

/**
 * GET /api/search/recent
 * Get recently modified notes.
 *
 * Query params:
 * - limit: number (optional, default 10, max 50)
 */
router.get(
  '/recent',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const { notes } = db().getNotes({ limit, offset: 0 });

    log.debug({ count: notes.length }, 'Recent notes retrieved');
    sendSuccess(res, notes);
  })
);

// ============================================================================
// EXPORT
// ============================================================================

export { router as searchRouter };
