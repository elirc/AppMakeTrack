/**
 * Log Time Tool - Track time spent on activities.
 *
 * This tool logs time entries to both the daily note and database.
 * Time tracking enables:
 * - Understanding where time actually goes
 * - Weekly review with real data
 * - Project time analysis
 * - Identifying time sinks
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getVaultService } from '../../services/vault.js';
import { getDatabase } from '../../db/index.js';
import type { ToolHandler } from '../server.js';

// ============================================================================
// TOOL DEFINITION
// ============================================================================

const definition: Tool = {
  name: 'log_time',
  description: `Log time spent on an activity. Records to both daily note and database.
Use this to track:
- Time on projects
- Deep work sessions
- Meetings
- Learning time
- Administrative tasks

Time entries are used for weekly reviews and project analysis.`,
  inputSchema: {
    type: 'object',
    properties: {
      activity: {
        type: 'string',
        description: 'What you worked on',
      },
      duration: {
        type: 'number',
        description: 'Duration in minutes',
      },
      project: {
        type: 'string',
        description: 'Optional project name for categorization',
      },
      category: {
        type: 'string',
        enum: ['deep-work', 'meeting', 'learning', 'admin', 'other'],
        description: 'Category of work. Default: other',
      },
    },
    required: ['activity', 'duration'],
  },
};

// ============================================================================
// HANDLER
// ============================================================================

async function handler(args: Record<string, unknown>): Promise<string> {
  const vault = getVaultService();
  const db = getDatabase();

  const activity = args.activity as string;
  const duration = args.duration as number;
  const project = args.project as string | undefined;
  const category = (args.category as string) || 'other';

  if (!activity || activity.trim().length === 0) {
    throw new Error('Activity description is required');
  }

  if (!duration || duration <= 0) {
    throw new Error('Duration must be a positive number');
  }

  // Get today's daily note
  const dailyPath = vault.getDailyNotePath();
  const note = await vault.getOrCreateDailyNote();

  // Format time entry for daily note
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const durationStr = formatDuration(duration);
  const projectStr = project ? ` [${project}]` : '';
  const timeLogEntry = `- ${time} | ${durationStr} | ${activity}${projectStr}`;

  // Find or create Time Log section
  const lines = note.content.split('\n');
  const sectionPattern = /^##\s+Time\s+Log/i;
  let sectionIndex = lines.findIndex((line) => sectionPattern.test(line));

  if (sectionIndex === -1) {
    // Create section before Notes (or at end)
    const notesIndex = lines.findIndex((line) => /^##\s+Notes/i.test(line));
    if (notesIndex !== -1) {
      lines.splice(notesIndex, 0, '## Time Log', '', timeLogEntry, '');
    } else {
      lines.push('', '## Time Log', '', timeLogEntry);
    }
  } else {
    // Find end of section and insert
    let insertIndex = sectionIndex + 1;
    while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
      insertIndex++;
    }
    while (
      insertIndex < lines.length &&
      !lines[insertIndex].startsWith('## ')
    ) {
      insertIndex++;
    }
    lines.splice(insertIndex, 0, timeLogEntry);
  }

  // Write updated content
  const newContent = lines.join('\n');
  await vault.writeNote(dailyPath, newContent);

  // Log to database
  // Note: category is appended to task for storage; can be extracted later if needed
  const taskWithCategory = category !== 'other' ? `[${category}] ${activity}` : activity;
  db.logTime({
    date: now.toISOString().split('T')[0],
    project: project || null,
    task: taskWithCategory,
    durationMinutes: duration,
  });

  // Get today's total
  const todayEntries = db.getTimeEntriesForDate(now.toISOString().split('T')[0]);
  const totalMinutes = todayEntries.reduce((sum, e) => sum + e.durationMinutes, 0);

  return `✓ Logged ${durationStr} for "${activity}"

**Time:** ${time}
**Duration:** ${durationStr}
**Category:** ${category}
${project ? `**Project:** ${project}` : ''}

---

**Today's Total:** ${formatDuration(totalMinutes)} (${todayEntries.length} entries)
**Daily note:** ${dailyPath}`;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

// ============================================================================
// EXPORT
// ============================================================================

export const logTimeTool: ToolHandler = {
  definition,
  handler,
};
