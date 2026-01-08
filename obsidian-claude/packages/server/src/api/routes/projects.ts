/**
 * Projects API Routes
 *
 * Handles project tracking:
 * - GET    /api/projects          - List all projects
 * - GET    /api/projects/:id      - Get project details
 * - POST   /api/projects          - Create project
 * - PUT    /api/projects/:id      - Update project
 * - PUT    /api/projects/:id/status - Update project status
 */

import { Router, type Request, type Response } from 'express';
import { getDatabase } from '../../db/index.js';
import { getVaultService } from '../../services/vault.js';
import { createChildLogger } from '../../utils/logger.js';
import {
  validate,
  createProjectSchema,
  updateProjectSchema,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
} from '@obsidian-claude/shared';
import type { ProjectStatus } from '@obsidian-claude/shared';

// ============================================================================
// SETUP
// ============================================================================

const router = Router();
const log = createChildLogger({ module: 'api:projects' });

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

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Parse project data from a note.
 */
function parseProject(note: { id: string; title: string; frontmatter: Record<string, unknown>; body: string }) {
  const frontmatter = note.frontmatter;

  // Parse milestones from body
  const milestones: Array<{ text: string; completed: boolean }> = [];
  const milestonePattern = /^[-*]\s+\[([ xX])\]\s+(.+)$/gm;
  let match;
  while ((match = milestonePattern.exec(note.body)) !== null) {
    milestones.push({
      text: match[2].trim(),
      completed: match[1].toLowerCase() === 'x',
    });
  }

  return {
    id: note.id,
    name: note.title,
    status: (frontmatter.status as ProjectStatus) || 'active',
    goal: (frontmatter.goal as string) || '',
    startedAt: (frontmatter.started as string) || (frontmatter.created as string) || '',
    completedAt: (frontmatter.completed as string) || null,
    milestones,
    totalTimeMinutes: 0, // Would calculate from time entries
    noteCount: 0, // Would count related notes
    notes: [],
  };
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/projects
 * List all projects.
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const statusFilter = req.query.status as ProjectStatus | undefined;

    // Get all project files
    const projectFiles = await vault().getFilesInFolder('projects');

    const projects = [];
    for (const file of projectFiles) {
      const relativePath = vault().getRelativePath(file);
      const note = await vault().readNote(relativePath);

      if (note) {
        const project = parseProject(note);

        // Apply status filter
        if (statusFilter && project.status !== statusFilter) continue;

        projects.push(project);
      }
    }

    // Sort: active first, then by start date
    projects.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    });

    sendSuccess(res, {
      projects,
      statuses: PROJECT_STATUSES.map((s) => ({
        id: s,
        label: PROJECT_STATUS_LABELS[s],
      })),
    });
  })
);

/**
 * GET /api/projects/:id
 * Get project details.
 */
router.get(
  '/:id(*)',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;

    const note = await vault().readNote(id);

    if (!note) {
      return sendError(res, 'NOT_FOUND', 'Project not found', 404);
    }

    const project = parseProject(note);

    // Get related notes (notes that reference this project)
    const { notes: relatedNotes } = db().getNotes({
      tag: null,
      type: null,
      status: null,
      limit: 100,
      offset: 0,
    });

    // Filter to notes that have this project in frontmatter
    // This is simplified - would need better project linking
    project.noteCount = 0;

    // Get time entries for this project
    // Simplified - would query time entries by project name
    project.totalTimeMinutes = 0;

    sendSuccess(res, project);
  })
);

/**
 * POST /api/projects
 * Create a new project.
 *
 * Body:
 * - name: string (required)
 * - goal: string (required)
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const result = validate(createProjectSchema, req.body);

    if (!result.success) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid project data');
    }

    const { name, goal } = result.data;
    const now = new Date().toISOString();
    const filename = `${slugify(name)}/index.md`;

    // Create project folder and note
    const content = `---
title: "${name}"
type: project
status: active
goal: "${goal}"
started: ${now.split('T')[0]}
---

# ${name}

## Goal

${goal}

## Milestones

- [ ]

## Notes

## Time Log

| Date | Duration | Task |
|------|----------|------|

## Retrospective

<!-- Fill in when project completes -->
`;

    try {
      await vault().writeNote(`projects/${filename}`, content);

      const note = await vault().readNote(`projects/${filename}`);
      if (!note) {
        throw new Error('Failed to read created project');
      }

      // Index in database
      db().upsertNote({
        id: note.id,
        title: note.title,
        type: 'project',
        status: 'active',
        createdAt: note.createdAt,
        modifiedAt: note.modifiedAt,
        wordCount: note.wordCount,
        excerpt: note.excerpt,
        tags: note.tags,
      });

      const project = parseProject(note);

      log.info({ projectId: note.id, name }, 'Project created');
      sendSuccess(res, project, 201);
    } catch (error) {
      if ((error as Error).message.includes('already exists')) {
        return sendError(res, 'ALREADY_EXISTS', 'Project with this name already exists', 409);
      }
      throw error;
    }
  })
);

/**
 * PUT /api/projects/:id/status
 * Update project status.
 *
 * Body:
 * - status: ProjectStatus
 */
router.put(
  '/:id(*)/status',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const { status } = req.body;

    if (!status || !PROJECT_STATUSES.includes(status)) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid status');
    }

    const note = await vault().readNote(id);
    if (!note) {
      return sendError(res, 'NOT_FOUND', 'Project not found', 404);
    }

    // Update status
    const updates: Record<string, unknown> = { status };

    if (status === 'completed') {
      updates.completed = new Date().toISOString().split('T')[0];
    }

    await vault().updateNoteFrontmatter(id, updates);

    const updatedNote = await vault().readNote(id);
    if (!updatedNote) {
      return sendError(res, 'INTERNAL_ERROR', 'Failed to read updated project', 500);
    }

    // Update database
    db().upsertNote({
      id: updatedNote.id,
      title: updatedNote.title,
      type: 'project',
      status,
      createdAt: updatedNote.createdAt,
      modifiedAt: updatedNote.modifiedAt,
      wordCount: updatedNote.wordCount,
      excerpt: updatedNote.excerpt,
      tags: updatedNote.tags,
    });

    const project = parseProject(updatedNote);

    log.info({ projectId: id, status }, 'Project status updated');
    sendSuccess(res, project);
  })
);

// ============================================================================
// EXPORT
// ============================================================================

export { router as projectsRouter };
