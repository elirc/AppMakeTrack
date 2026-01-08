/**
 * Daily Notes API Routes
 *
 * Handles daily note operations:
 * - GET    /api/daily          - Get today's daily note
 * - GET    /api/daily/:date    - Get daily note for specific date
 * - POST   /api/daily/capture  - Quick capture to today's note
 */

import { Router, type Request, type Response } from 'express';
import { getDatabase } from '../../db/index.js';
import { getVaultService } from '../../services/vault.js';
import { createChildLogger } from '../../utils/logger.js';
import { validate, formatErrors, captureSchema } from '@obsidian-claude/shared';
import type { DailyNote, CaptureInput } from '@obsidian-claude/shared';

// ============================================================================
// SETUP
// ============================================================================

const router = Router();
const log = createChildLogger({ module: 'api:daily' });

const db = () => getDatabase();
const vault = () => getVaultService();

// ============================================================================
// HELPERS
// ============================================================================

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
) {
  return (req: Request, res: Response, next: (err?: Error) => void) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

function sendError(
  res: Response,
  code: string,
  message: string,
  status = 400
): void {
  res.status(status).json({
    success: false,
    error: { code, message },
  });
}

/**
 * Parse a date string (YYYY-MM-DD) or return today.
 */
function parseDate(dateStr?: string): Date {
  if (!dateStr) {
    return new Date();
  }

  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }

  const [, year, month, day] = match;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

  if (isNaN(date.getTime())) {
    throw new Error('Invalid date.');
  }

  return date;
}

/**
 * Format date as YYYY-MM-DD.
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Parse time entries from a daily note's content.
 */
function parseTimeEntries(content: string): Array<{
  start: string;
  end: string;
  duration: string;
  project: string;
  task: string;
}> {
  const entries: Array<{
    start: string;
    end: string;
    duration: string;
    project: string;
    task: string;
  }> = [];

  // Match table rows: | Start | End | Duration | Project | Task |
  const tableRowPattern = /^\|\s*(\d{1,2}:\d{2})\s*\|\s*(\d{1,2}:\d{2})?\s*\|\s*([^|]*)\s*\|\s*([^|]*)\s*\|\s*([^|]*)\s*\|/gm;

  let match;
  while ((match = tableRowPattern.exec(content)) !== null) {
    const [, start, end, duration, project, task] = match;

    // Skip header row
    if (start === 'Start' || start.includes('-')) continue;

    entries.push({
      start: start.trim(),
      end: end?.trim() || '',
      duration: duration.trim(),
      project: project.trim(),
      task: task.trim(),
    });
  }

  return entries;
}

/**
 * Parse tasks from a daily note's content.
 */
function parseTasks(content: string): Array<{
  text: string;
  completed: boolean;
  line: number;
}> {
  const tasks: Array<{ text: string; completed: boolean; line: number }> = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Match: - [ ] Task or - [x] Task
    const match = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (match) {
      tasks.push({
        text: match[2].trim(),
        completed: match[1].toLowerCase() === 'x',
        line: index + 1,
      });
    }
  });

  return tasks;
}

/**
 * Parse a section's content (e.g., ## Wins or ## Learned Today).
 */
function parseSection(content: string, sectionName: string): string[] {
  const items: string[] = [];

  // Find section
  const sectionPattern = new RegExp(`^##\\s+${sectionName}\\s*$`, 'im');
  const sectionMatch = content.match(sectionPattern);

  if (!sectionMatch) return items;

  // Get content after section heading until next heading
  const startIndex = sectionMatch.index! + sectionMatch[0].length;
  const nextHeadingMatch = content.substring(startIndex).match(/^##\s+/m);
  const endIndex = nextHeadingMatch
    ? startIndex + nextHeadingMatch.index!
    : content.length;

  const sectionContent = content.substring(startIndex, endIndex);

  // Extract list items
  const listItemPattern = /^[-*]\s+(.+)$/gm;
  let match;
  while ((match = listItemPattern.exec(sectionContent)) !== null) {
    const item = match[1].trim();
    if (item && !item.startsWith('[')) {
      // Exclude task items
      items.push(item);
    }
  }

  return items;
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/daily
 * Get today's daily note (creates if doesn't exist).
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const note = await vault().getOrCreateDailyNote();

    // Enhance with parsed data
    const dailyNote: DailyNote = {
      ...note,
      date: formatDate(new Date()),
      tasks: parseTasks(note.content),
      timeEntries: [], // Would need to map to TimeEntry type
      wins: parseSection(note.content, 'Wins'),
      learned: parseSection(note.content, 'Learned Today'),
    };

    log.debug({ date: dailyNote.date }, 'Daily note retrieved');
    sendSuccess(res, dailyNote);
  })
);

/**
 * GET /api/daily/:date
 * Get daily note for a specific date.
 *
 * @param date - YYYY-MM-DD format
 */
router.get(
  '/:date',
  asyncHandler(async (req: Request, res: Response) => {
    let date: Date;
    try {
      date = parseDate(req.params.date);
    } catch {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid date format. Use YYYY-MM-DD.');
    }

    const note = await vault().getOrCreateDailyNote(date);
    const dateStr = formatDate(date);

    const dailyNote: DailyNote = {
      ...note,
      date: dateStr,
      tasks: parseTasks(note.content),
      timeEntries: [],
      wins: parseSection(note.content, 'Wins'),
      learned: parseSection(note.content, 'Learned Today'),
    };

    log.debug({ date: dateStr }, 'Daily note retrieved');
    sendSuccess(res, dailyNote);
  })
);

/**
 * POST /api/daily/capture
 * Quick capture to today's daily note.
 *
 * Body:
 * - content: string (required) - The text to capture
 * - section: 'plan' | 'notes' | 'wins' | 'learned' (optional)
 */
router.post(
  '/capture',
  asyncHandler(async (req: Request, res: Response) => {
    // Validate input
    const result = validate(captureSchema, req.body);

    if (!result.success) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid capture data', 400);
    }

    const { content, section } = result.data;

    // Get or create today's note
    const dailyPath = vault().getDailyNotePath();
    const note = await vault().getOrCreateDailyNote();

    // Determine where to append
    let appendText = content;
    let targetSection = 'Notes';

    if (section) {
      switch (section) {
        case 'plan':
          targetSection = 'Plan';
          appendText = `- [ ] ${content}`;
          break;
        case 'notes':
          targetSection = 'Notes';
          break;
        case 'wins':
          targetSection = 'Wins';
          appendText = `- ${content}`;
          break;
        case 'learned':
          targetSection = 'Learned Today';
          appendText = `- ${content}`;
          break;
      }
    }

    // Find section and append
    const lines = note.content.split('\n');
    const sectionPattern = new RegExp(`^##\\s+${targetSection}`, 'i');
    let sectionIndex = lines.findIndex((line) => sectionPattern.test(line));

    if (sectionIndex === -1) {
      // Section not found, append to end
      lines.push('', `## ${targetSection}`, appendText);
    } else {
      // Find next section or end
      let insertIndex = sectionIndex + 1;
      while (
        insertIndex < lines.length &&
        !lines[insertIndex].startsWith('## ')
      ) {
        insertIndex++;
      }
      // Insert before next section (or at end of current section)
      lines.splice(insertIndex, 0, appendText);
    }

    const newContent = lines.join('\n');
    await vault().writeNote(dailyPath, newContent);

    // Update database cache
    const updatedNote = await vault().readNote(dailyPath);
    if (updatedNote) {
      db().upsertNote({
        id: updatedNote.id,
        title: updatedNote.title,
        type: updatedNote.type,
        status: updatedNote.status,
        createdAt: updatedNote.createdAt,
        modifiedAt: updatedNote.modifiedAt,
        wordCount: updatedNote.wordCount,
        excerpt: updatedNote.excerpt,
        tags: updatedNote.tags,
      });
    }

    log.info({ section: targetSection }, 'Captured to daily note');
    sendSuccess(res, {
      captured: true,
      section: targetSection,
      date: formatDate(new Date()),
    });
  })
);

// ============================================================================
// EXPORT
// ============================================================================

export { router as dailyRouter };
