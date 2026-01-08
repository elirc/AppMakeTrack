/**
 * Project Status Tool - View all projects and their current state.
 *
 * This tool provides an overview of all active projects:
 * - Status (active, paused, completed, archived)
 * - Time tracked
 * - Recent activity
 * - Linked notes
 *
 * Helps maintain awareness of project portfolio.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabase } from '../../db/index.js';
import type { ToolHandler } from '../server.js';
import { PROJECT_STATUS_LABELS } from '@obsidian-claude/shared';

// ============================================================================
// TOOL DEFINITION
// ============================================================================

const definition: Tool = {
  name: 'project_status',
  description: `View all projects and their current status.

Shows:
- Active projects (what you're working on)
- Paused projects (on hold)
- Recently completed projects
- Time tracked per project

Useful for daily planning and weekly reviews.`,
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'paused', 'completed', 'archived', 'all'],
        description: 'Filter by status. Default: active',
      },
      includeTime: {
        type: 'boolean',
        description: 'Include time tracking summary. Default: true',
      },
    },
    required: [],
  },
};

// ============================================================================
// HANDLER
// ============================================================================

async function handler(args: Record<string, unknown>): Promise<string> {
  const db = getDatabase();

  const statusFilter = (args.status as string) || 'active';
  const includeTime = args.includeTime !== false;

  // Get projects
  let projects = db.getProjects();

  // Filter by status
  if (statusFilter !== 'all') {
    projects = projects.filter((p) => p.status === statusFilter);
  }

  if (projects.length === 0) {
    const filterMsg = statusFilter === 'all' ? '' : ` with status "${statusFilter}"`;
    return `No projects found${filterMsg}.

Use the 'project_create' tool to create a new project.`;
  }

  // Get time data if requested
  const timeByProject = new Map<string, number>();
  if (includeTime) {
    const allTime = db.getAllTimeEntries();
    for (const entry of allTime) {
      if (entry.project) {
        timeByProject.set(
          entry.project,
          (timeByProject.get(entry.project) || 0) + entry.durationMinutes
        );
      }
    }
  }

  // Format projects
  const projectList = projects.map((project) => {
    const statusEmoji = getStatusEmoji(project.status);
    const timeStr = includeTime
      ? formatDuration(timeByProject.get(project.name) || 0)
      : '';

    const lines = [
      `### ${statusEmoji} ${project.name}`,
      '',
      project.description ? `${project.description}` : '*No description*',
      '',
      `**Status:** ${PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS] || project.status}`,
    ];

    if (includeTime) {
      lines.push(`**Time Tracked:** ${timeStr}`);
    }

    if (project.tags && project.tags.length > 0) {
      lines.push(`**Tags:** ${project.tags.join(', ')}`);
    }

    lines.push(`**Created:** ${project.createdAt}`);

    return lines.join('\n');
  }).join('\n\n---\n\n');

  // Summary
  const totalTime = Array.from(timeByProject.values()).reduce((a, b) => a + b, 0);
  const statusSummary = statusFilter === 'all'
    ? `Showing all ${projects.length} projects`
    : `Showing ${projects.length} ${statusFilter} project${projects.length === 1 ? '' : 's'}`;

  return `# Project Status

${statusSummary}
${includeTime ? `**Total Time Tracked:** ${formatDuration(totalTime)}` : ''}

---

${projectList}

---

**Actions:**
- Use 'project_create' to add a new project
- Use 'log_time' with project name to track time
- Filter with status: active, paused, completed, archived, all`;
}

// ============================================================================
// HELPERS
// ============================================================================

function getStatusEmoji(status: string): string {
  const emojis: Record<string, string> = {
    active: '🚀',
    paused: '⏸️',
    completed: '✅',
    archived: '📦',
  };
  return emojis[status] || '📋';
}

function formatDuration(minutes: number): string {
  if (minutes === 0) return '0m';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// ============================================================================
// EXPORT
// ============================================================================

export const projectStatusTool: ToolHandler = {
  definition,
  handler,
};
