/**
 * Time Tracking API Routes
 *
 * Handles time logging:
 * - POST /api/time           - Log a time entry
 * - GET  /api/time/today     - Get today's time entries
 * - GET  /api/time/week      - Get this week's summary
 * - GET  /api/time/project/:name - Get time for a project
 */

import { Router, type Request, type Response } from 'express';
import { getDatabase } from '../../db/index.js';
import { createChildLogger } from '../../utils/logger.js';
import { validate, logTimeSchema } from '@obsidian-claude/shared';

// ============================================================================
// SETUP
// ============================================================================

const router = Router();
const log = createChildLogger({ module: 'api:time' });

const db = () => getDatabase();

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

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/time
 * Log a time entry.
 *
 * Body:
 * - project: string (optional)
 * - task: string (required)
 * - durationMinutes: number (required)
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const result = validate(logTimeSchema, req.body);

    if (!result.success) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid time entry');
    }

    const { project, task, durationMinutes } = result.data;
    const date = formatDate(new Date());

    const id = db().logTime({
      date,
      project: project || null,
      task,
      durationMinutes,
    });

    log.info(
      { id, project, task, duration: formatDuration(durationMinutes) },
      'Time logged'
    );

    sendSuccess(res, {
      id,
      date,
      project,
      task,
      durationMinutes,
      durationFormatted: formatDuration(durationMinutes),
    }, 201);
  })
);

/**
 * GET /api/time/today
 * Get today's time entries and total.
 */
router.get(
  '/today',
  asyncHandler(async (req: Request, res: Response) => {
    const today = formatDate(new Date());
    const entries = db().getTimeEntriesForDate(today);

    const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);

    sendSuccess(res, {
      date: today,
      entries,
      totalMinutes,
      totalFormatted: formatDuration(totalMinutes),
    });
  })
);

/**
 * GET /api/time/week
 * Get this week's time summary.
 */
router.get(
  '/week',
  asyncHandler(async (req: Request, res: Response) => {
    const now = new Date();
    const weekStart = getWeekStart(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const startStr = formatDate(weekStart);
    const endStr = formatDate(weekEnd);

    const entries = db().getTimeEntriesForRange(startStr, endStr);
    const byProject = db().getTimeByProject(startStr, endStr);

    const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);

    // Group by day
    const byDay: Record<string, number> = {};
    for (const entry of entries) {
      byDay[entry.date] = (byDay[entry.date] || 0) + entry.durationMinutes;
    }

    sendSuccess(res, {
      weekStart: startStr,
      weekEnd: endStr,
      totalMinutes,
      totalFormatted: formatDuration(totalMinutes),
      byDay: Object.entries(byDay).map(([date, minutes]) => ({
        date,
        minutes,
        formatted: formatDuration(minutes),
      })),
      byProject: byProject.map((p) => ({
        project: p.project || '(no project)',
        minutes: p.totalMinutes,
        formatted: formatDuration(p.totalMinutes),
      })),
    });
  })
);

/**
 * GET /api/time/project/:name
 * Get time entries for a specific project.
 */
router.get(
  '/project/:name',
  asyncHandler(async (req: Request, res: Response) => {
    const projectName = req.params.name;

    // Get last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const startStr = formatDate(startDate);
    const endStr = formatDate(endDate);

    const allEntries = db().getTimeEntriesForRange(startStr, endStr);
    const projectEntries = allEntries.filter(
      (e) => e.project?.toLowerCase() === projectName.toLowerCase()
    );

    const totalMinutes = projectEntries.reduce(
      (sum, e) => sum + e.durationMinutes,
      0
    );

    sendSuccess(res, {
      project: projectName,
      entries: projectEntries,
      totalMinutes,
      totalFormatted: formatDuration(totalMinutes),
    });
  })
);

// ============================================================================
// EXPORT
// ============================================================================

export { router as timeRouter };
