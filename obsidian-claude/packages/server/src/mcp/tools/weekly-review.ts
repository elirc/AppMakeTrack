/**
 * Weekly Review Tool - Generate guided weekly review.
 *
 * This tool aggregates the week's data and guides reflection:
 * - Time spent (by project and category)
 * - Notes created
 * - Tasks completed
 * - Wins and learnings
 * - Growth evidence collected
 *
 * The weekly review is the key ritual for "capture first, organize later".
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getVaultService } from '../../services/vault.js';
import { getDatabase } from '../../db/index.js';
import type { ToolHandler } from '../server.js';

// ============================================================================
// TOOL DEFINITION
// ============================================================================

const definition: Tool = {
  name: 'weekly_review',
  description: `Generate a weekly review with aggregated data and reflection prompts.

The review includes:
- Time tracking summary (by project and category)
- Notes created this week
- Wins and learnings from daily notes
- Growth evidence collected
- Reflection prompts

Use this at the end of each week to process captures into permanent notes.`,
  inputSchema: {
    type: 'object',
    properties: {
      weekOffset: {
        type: 'number',
        description: 'Weeks back from current. 0 = this week, 1 = last week. Default: 0',
      },
    },
    required: [],
  },
};

// ============================================================================
// HANDLER
// ============================================================================

async function handler(args: Record<string, unknown>): Promise<string> {
  const vault = getVaultService();
  const db = getDatabase();

  const weekOffset = (args.weekOffset as number) || 0;

  // Calculate week boundaries
  const { startDate, endDate } = getWeekBounds(weekOffset);
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  // Gather data
  const timeEntries = db.getTimeEntriesRange(startStr, endStr);
  const notes = db.getNotesCreatedBetween(startStr, endStr);
  const evidence = db.getEvidenceRange(startStr, endStr);

  // Aggregate time by project
  const timeByProject = new Map<string, number>();
  const timeByCategory = new Map<string, number>();
  let totalMinutes = 0;

  for (const entry of timeEntries) {
    totalMinutes += entry.durationMinutes;

    const project = entry.project || '(no project)';
    timeByProject.set(project, (timeByProject.get(project) || 0) + entry.durationMinutes);

    // Extract category from task if present (format: [category] task)
    const categoryMatch = entry.task.match(/^\[([^\]]+)\]/);
    const category = categoryMatch ? categoryMatch[1] : 'other';
    timeByCategory.set(category, (timeByCategory.get(category) || 0) + entry.durationMinutes);
  }

  // Format time breakdown
  const projectBreakdown = Array.from(timeByProject.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([proj, mins]) => `  - ${proj}: ${formatDuration(mins)}`)
    .join('\n');

  const categoryBreakdown = Array.from(timeByCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, mins]) => `  - ${cat}: ${formatDuration(mins)}`)
    .join('\n');

  // Group notes by type
  const notesByType = new Map<string, typeof notes>();
  for (const note of notes) {
    const noteType = note.type || 'other';
    const existing = notesByType.get(noteType) || [];
    existing.push(note);
    notesByType.set(noteType, existing);
  }

  const notesBreakdown = Array.from(notesByType.entries())
    .map(([type, typeNotes]) => {
      const titles = typeNotes.map((n) => `    - ${n.title}`).join('\n');
      return `  **${type}** (${typeNotes.length}):\n${titles}`;
    })
    .join('\n\n');

  // Evidence breakdown
  const evidenceByDim = new Map<string, number>();
  for (const e of evidence) {
    evidenceByDim.set(e.dimension, (evidenceByDim.get(e.dimension) || 0) + 1);
  }

  const evidenceBreakdown = Array.from(evidenceByDim.entries())
    .map(([dim, count]) => `  - ${dim}: ${count} evidence`)
    .join('\n');

  // Build review
  return `# Weekly Review: ${startStr} to ${endStr}

## Time Summary

**Total Tracked:** ${formatDuration(totalMinutes)} (${timeEntries.length} entries)

**By Project:**
${projectBreakdown || '  (no time logged)'}

**By Category:**
${categoryBreakdown || '  (no time logged)'}

---

## Notes Created

**Total:** ${notes.length} notes

${notesBreakdown || '  (no notes created)'}

---

## Growth Evidence

**Total:** ${evidence.length} evidence items

${evidenceBreakdown || '  (no evidence collected)'}

---

## Reflection Prompts

1. **Wins:** What went well this week? What are you proud of?

2. **Learnings:** What's the most important thing you learned?

3. **Challenges:** What was harder than expected? Why?

4. **Process:** What would you do differently next week?

5. **Focus:** What's the ONE thing to focus on next week?

---

## Actions

- [ ] Process any raw captures from daily notes into permanent notes
- [ ] Update project statuses
- [ ] Archive completed work
- [ ] Set intentions for next week

---

*Use the 'process' tool to create permanent notes from your daily captures.*`;
}

// ============================================================================
// HELPERS
// ============================================================================

function getWeekBounds(weekOffset: number): { startDate: Date; endDate: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();

  // Start of this week (Sunday)
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - dayOfWeek - (weekOffset * 7));
  startDate.setHours(0, 0, 0, 0);

  // End of this week (Saturday)
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);

  return { startDate, endDate };
}

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

export const weeklyReviewTool: ToolHandler = {
  definition,
  handler,
};
