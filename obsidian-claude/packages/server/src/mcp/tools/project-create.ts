/**
 * Project Create Tool - Create a new project.
 *
 * This tool creates a project entry in the database and optionally
 * a project note in the vault. Projects help organize:
 * - Time tracking (log time to specific projects)
 * - Related notes (link notes to projects)
 * - Status tracking (active, paused, completed, archived)
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getVaultService } from '../../services/vault.js';
import { getDatabase } from '../../db/index.js';
import type { ToolHandler } from '../server.js';

// ============================================================================
// TOOL DEFINITION
// ============================================================================

const definition: Tool = {
  name: 'project_create',
  description: `Create a new project for tracking work.

Projects enable:
- Time tracking by project
- Linking notes to projects
- Status tracking (active → completed)
- Portfolio overview

Also creates a project note in the vault for documentation.`,
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Project name (used for time logging)',
      },
      description: {
        type: 'string',
        description: 'Brief project description',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for categorization',
      },
      createNote: {
        type: 'boolean',
        description: 'Create a project note in the vault. Default: true',
      },
    },
    required: ['name'],
  },
};

// ============================================================================
// HANDLER
// ============================================================================

async function handler(args: Record<string, unknown>): Promise<string> {
  const vault = getVaultService();
  const db = getDatabase();

  const name = args.name as string;
  const description = (args.description as string) || '';
  const tags = (args.tags as string[]) || [];
  const createNote = args.createNote !== false;

  if (!name || name.trim().length === 0) {
    throw new Error('Project name is required');
  }

  // Check for existing project
  const existing = db.getProjectByName(name);
  if (existing) {
    throw new Error(`Project "${name}" already exists`);
  }

  // Create project in database
  const now = new Date().toISOString().split('T')[0];
  const project = {
    id: generateId(),
    name: name.trim(),
    description,
    status: 'active' as const,
    tags,
    createdAt: now,
    updatedAt: now,
  };

  db.createProject(project);

  // Create project note if requested
  let notePath: string | null = null;
  if (createNote) {
    const filename = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    const noteContent = buildProjectNote(name, description, tags);

    try {
      const note = await vault.createNote('projects', `${filename}.md`, {
        title: name,
        type: 'project' as any,
        content: noteContent,
        tags: ['project', ...tags],
      });
      notePath = note.id;
    } catch (error) {
      // Note creation failed, but project still created in DB
      console.error('Failed to create project note:', error);
    }
  }

  return `✓ Created project: "${name}"

**Status:** 🚀 active
**Description:** ${description || '(none)'}
**Tags:** ${tags.length > 0 ? tags.join(', ') : '(none)'}
${notePath ? `**Note:** ${notePath}` : ''}

---

**Next steps:**
- Use 'log_time' with project="${name}" to track time
- Use 'capture' to add notes about this project
- Use 'project_status' to view all projects`;
}

// ============================================================================
// HELPERS
// ============================================================================

function generateId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function buildProjectNote(
  name: string,
  description: string,
  tags: string[]
): string {
  const today = new Date().toISOString().split('T')[0];

  return `# ${name}

${description || '*Add project description here*'}

## Status

- **Started:** ${today}
- **Status:** Active 🚀

## Goals

- [ ] Define project goals
- [ ] Break down into milestones

## Notes

*Add project-related notes and links here*

## Time Log Summary

*Time entries will be tracked via the 'log_time' tool*

## Key Decisions

*Document important decisions made during this project*

## Learnings

*What did you learn from this project?*

---

*Created on ${today}*`;
}

// ============================================================================
// EXPORT
// ============================================================================

export const projectCreateTool: ToolHandler = {
  definition,
  handler,
};
