/**
 * Process Tool - Create a permanent note from captured content.
 *
 * This tool extracts content from daily notes into permanent notes.
 * It's the second step in the "capture first, organize later" workflow.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getVaultService } from '../../services/vault.js';
import { getDatabase } from '../../db/index.js';
import type { ToolHandler } from '../server.js';
import type { NoteType } from '@obsidian-claude/shared';

// ============================================================================
// TOOL DEFINITION
// ============================================================================

const definition: Tool = {
  name: 'process',
  description: `Create a permanent note from captured content. Use this to extract and organize knowledge from daily notes into:
- concept: A single idea or concept (atomic knowledge)
- solution: A bug fix or problem solution
- decision: An architectural or design decision
- til: Today I Learned - quick learning nugget
- failure: Learning from something that didn't work

The note will be created in the notes/ folder with proper frontmatter.`,
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title for the new note',
      },
      type: {
        type: 'string',
        enum: ['concept', 'solution', 'decision', 'til', 'failure'],
        description: 'Type of note to create',
      },
      content: {
        type: 'string',
        description: 'The content for the note body',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags to apply to the note',
      },
    },
    required: ['title', 'type', 'content'],
  },
};

// ============================================================================
// HANDLER
// ============================================================================

async function handler(args: Record<string, unknown>): Promise<string> {
  const vault = getVaultService();
  const db = getDatabase();

  const title = args.title as string;
  const type = args.type as NoteType;
  const content = args.content as string;
  const tags = (args.tags as string[]) || [];

  if (!title || title.trim().length === 0) {
    throw new Error('Title is required');
  }

  if (!type) {
    throw new Error('Type is required');
  }

  if (!content || content.trim().length === 0) {
    throw new Error('Content is required');
  }

  // Generate filename from title
  const filename = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  // Create the note
  try {
    const note = await vault.createNote('notes', `${filename}.md`, {
      title,
      type,
      content,
      tags,
    });

    // Index in database
    db.upsertNote({
      id: note.id,
      title: note.title,
      type: note.type,
      status: note.status,
      createdAt: note.createdAt,
      modifiedAt: note.modifiedAt,
      wordCount: note.wordCount,
      excerpt: note.excerpt,
      tags: note.tags,
    });

    // Extract and store links
    const links = vault.extractLinks(note.content);
    if (links.length > 0) {
      db.updateLinks(
        note.id,
        links.map((l) => ({ targetId: `notes/${l.target}`, context: l.context }))
      );
    }

    return `✓ Created ${type} note: "${title}"

**Path:** ${note.id}
**Type:** ${type}
**Status:** seedling 🌱
**Tags:** ${tags.length > 0 ? tags.join(', ') : '(none)'}
**Word Count:** ${note.wordCount}

The note has been indexed and is searchable.`;
  } catch (error) {
    if ((error as Error).message.includes('already exists')) {
      throw new Error(`A note with title "${title}" already exists`);
    }
    throw error;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const processTool: ToolHandler = {
  definition,
  handler,
};
