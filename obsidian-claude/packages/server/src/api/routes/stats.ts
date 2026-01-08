/**
 * Statistics API Routes
 *
 * Provides dashboard and analytics data:
 * - GET /api/stats/dashboard - Main dashboard stats
 * - GET /api/stats/weekly    - Weekly activity summary
 */

import { Router, type Request, type Response } from 'express';
import { getDatabase } from '../../db/index.js';
import { createChildLogger } from '../../utils/logger.js';

// ============================================================================
// SETUP
// ============================================================================

const router = Router();
const log = createChildLogger({ module: 'api:stats' });

const db = () => getDatabase();

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

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
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
 * GET /api/stats/dashboard
 * Get main dashboard statistics.
 */
router.get(
  '/dashboard',
  asyncHandler(async (req: Request, res: Response) => {
    const dbStats = db().getStats();
    const tags = db().getAllTags();
    const { notes: recentNotes } = db().getNotes({ limit: 5, offset: 0 });

    // Calculate streak (consecutive days with notes)
    // Simplified: just check if there's activity today
    const streak = dbStats.notesToday > 0 ? 1 : 0;

    const stats = {
      notesTotal: dbStats.totalNotes,
      notesToday: dbStats.notesToday,
      projectsActive: dbStats.activeProjects,
      timeThisWeek: dbStats.timeThisWeek,
      timeThisWeekFormatted: formatDuration(dbStats.timeThisWeek),
      currentStreak: streak,
      topTags: tags.slice(0, 5),
      recentNotes,
    };

    log.debug('Dashboard stats retrieved');
    sendSuccess(res, stats);
  })
);

/**
 * GET /api/stats/weekly
 * Get weekly activity summary.
 */
router.get(
  '/weekly',
  asyncHandler(async (req: Request, res: Response) => {
    // Get week boundaries
    const now = new Date();
    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const startStr = formatDate(weekStart);
    const endStr = formatDate(weekEnd);

    // Get time data
    const timeEntries = db().getTimeEntriesForRange(startStr, endStr);
    const timeByProject = db().getTimeByProject(startStr, endStr);

    const totalTime = timeEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
    const projectsWorkedOn = [...new Set(timeEntries.map((e) => e.project).filter(Boolean))] as string[];

    // Note: Would need more complex queries for full weekly summary
    // This is a simplified version

    const summary = {
      weekOf: startStr,
      weekEnd: endStr,
      captures: 0, // Would need to track captures separately
      notesProcessed: 0, // Would need to track this
      timeLoggedMinutes: totalTime,
      timeLoggedFormatted: formatDuration(totalTime),
      projectsWorkedOn,
      timeByProject: timeByProject.map((p) => ({
        project: p.project || '(no project)',
        minutes: p.totalMinutes,
        formatted: formatDuration(p.totalMinutes),
      })),
      tasksCompleted: 0, // Would parse from daily notes
      tasksIncomplete: 0,
      wins: [], // Would parse from daily notes
      learned: [], // Would parse from daily notes
    };

    log.debug({ weekOf: startStr }, 'Weekly stats retrieved');
    sendSuccess(res, summary);
  })
);

// ============================================================================
// EXPORT
// ============================================================================

export { router as statsRouter };
