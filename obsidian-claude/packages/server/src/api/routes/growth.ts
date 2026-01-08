/**
 * Growth Tracking API Routes
 *
 * Handles competency tracking and evidence:
 * - GET  /api/growth/competencies - Get competency summary
 * - POST /api/growth/evidence     - Add growth evidence
 * - GET  /api/growth/evidence/:dimension - Get evidence for dimension
 * - GET  /api/growth/snapshots    - List monthly snapshots
 * - POST /api/growth/snapshots    - Generate new snapshot
 */

import { Router, type Request, type Response } from 'express';
import { getDatabase } from '../../db/index.js';
import { getVaultService } from '../../services/vault.js';
import { createChildLogger } from '../../utils/logger.js';
import {
  validate,
  addEvidenceSchema,
  COMPETENCY_DIMENSIONS,
  COMPETENCY_LABELS,
  COMPETENCY_DESCRIPTIONS,
} from '@obsidian-claude/shared';
import type { CompetencyDimension, CompetencySnapshot } from '@obsidian-claude/shared';

// ============================================================================
// SETUP
// ============================================================================

const router = Router();
const log = createChildLogger({ module: 'api:growth' });

const db = () => getDatabase();
const vault = () => getVaultService();

// ============================================================================
// HELPERS
// ============================================================================

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: (err?: Error) => void) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

function sendError(res: Response, code: string, message: string, status = 400): void {
  res.status(status).json({ success: false, error: { code, message } });
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Determine competency level based on evidence count.
 */
function getLevel(evidenceCount: number): 'junior' | 'mid' | 'senior' {
  if (evidenceCount >= 20) return 'senior';
  if (evidenceCount >= 10) return 'mid';
  return 'junior';
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/growth/competencies
 * Get competency summary across all dimensions.
 */
router.get(
  '/competencies',
  asyncHandler(async (req: Request, res: Response) => {
    const evidenceSummary = db().getEvidenceSummary();

    // Build full competency matrix
    const competencies: CompetencySnapshot[] = COMPETENCY_DIMENSIONS.map(
      (dimension) => {
        const evidence = evidenceSummary.find((e) => e.dimension === dimension);
        const count = evidence?.count ?? 0;

        return {
          dimension,
          level: getLevel(count),
          evidenceCount: count,
          lastEvidence: evidence?.lastDate ?? null,
        };
      }
    );

    sendSuccess(res, {
      competencies,
      dimensions: COMPETENCY_DIMENSIONS.map((d) => ({
        id: d,
        label: COMPETENCY_LABELS[d],
        description: COMPETENCY_DESCRIPTIONS[d],
      })),
    });
  })
);

/**
 * POST /api/growth/evidence
 * Add a new piece of growth evidence.
 *
 * Body:
 * - dimension: CompetencyDimension (required)
 * - description: string (required)
 * - noteId: string (optional) - Link to related note
 */
router.post(
  '/evidence',
  asyncHandler(async (req: Request, res: Response) => {
    const result = validate(addEvidenceSchema, req.body);

    if (!result.success) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid evidence data');
    }

    const { dimension, description, noteId } = result.data;

    // Validate note exists if provided
    if (noteId) {
      const note = await vault().readNote(noteId);
      if (!note) {
        return sendError(res, 'NOT_FOUND', 'Linked note not found', 404);
      }
    }

    const id = db().addEvidence({
      dimension: dimension as CompetencyDimension,
      description,
      noteId: noteId || null,
      date: formatDate(new Date()),
    });

    log.info({ id, dimension }, 'Evidence added');

    sendSuccess(res, {
      id,
      dimension,
      description,
      noteId,
      date: formatDate(new Date()),
    }, 201);
  })
);

/**
 * GET /api/growth/evidence/:dimension
 * Get all evidence for a specific dimension.
 */
router.get(
  '/evidence/:dimension',
  asyncHandler(async (req: Request, res: Response) => {
    const dimension = req.params.dimension as CompetencyDimension;

    if (!COMPETENCY_DIMENSIONS.includes(dimension)) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid competency dimension');
    }

    const evidence = db().getEvidenceByDimension(dimension);

    sendSuccess(res, {
      dimension,
      label: COMPETENCY_LABELS[dimension],
      description: COMPETENCY_DESCRIPTIONS[dimension],
      evidence,
      level: getLevel(evidence.length),
    });
  })
);

/**
 * GET /api/growth/snapshots
 * List monthly snapshots.
 */
router.get(
  '/snapshots',
  asyncHandler(async (req: Request, res: Response) => {
    // Read from growth/snapshots folder
    const snapshotsFolder = 'growth/snapshots';
    const files = await vault().getFilesInFolder(snapshotsFolder);

    const snapshots = [];
    for (const file of files) {
      const relativePath = vault().getRelativePath(file);
      const note = await vault().readNote(relativePath);
      if (note) {
        snapshots.push({
          id: relativePath,
          month: note.title,
          createdAt: note.createdAt,
        });
      }
    }

    // Sort by date descending
    snapshots.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    sendSuccess(res, snapshots);
  })
);

/**
 * POST /api/growth/snapshots
 * Generate a new monthly snapshot.
 */
router.post(
  '/snapshots',
  asyncHandler(async (req: Request, res: Response) => {
    const now = new Date();
    const month = now.toISOString().substring(0, 7); // YYYY-MM
    const filename = `${month}.md`;
    const filepath = `growth/snapshots/${filename}`;

    // Check if already exists
    const existing = await vault().readNote(filepath);
    if (existing) {
      return sendError(res, 'ALREADY_EXISTS', 'Snapshot for this month already exists', 409);
    }

    // Gather data for snapshot
    const evidenceSummary = db().getEvidenceSummary();
    const stats = db().getStats();
    const tags = db().getAllTags();

    // Build snapshot content
    const competencyLines = COMPETENCY_DIMENSIONS.map((dim) => {
      const evidence = evidenceSummary.find((e) => e.dimension === dim);
      const count = evidence?.count ?? 0;
      const level = getLevel(count);
      return `- **${COMPETENCY_LABELS[dim]}**: ${level} (${count} evidence entries)`;
    }).join('\n');

    const topTagsLines = tags.slice(0, 5).map((t) => `- ${t.tag}: ${t.count}`).join('\n');

    const content = `---
title: "${month}"
type: snapshot
created: ${now.toISOString()}
---

# Growth Snapshot: ${month}

## Summary

- **Total Notes**: ${stats.totalNotes}
- **Active Projects**: ${stats.activeProjects}
- **Time This Week**: ${Math.round(stats.timeThisWeek / 60)}h

## Competency Levels

${competencyLines}

## Top Tags

${topTagsLines}

## Reflections

<!-- Add your reflections here -->

## Goals for Next Month

- [ ]
`;

    await vault().writeNote(filepath, content);

    log.info({ month }, 'Growth snapshot generated');

    sendSuccess(res, {
      id: filepath,
      month,
      createdAt: now.toISOString(),
    }, 201);
  })
);

// ============================================================================
// EXPORT
// ============================================================================

export { router as growthRouter };
