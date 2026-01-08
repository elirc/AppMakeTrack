/**
 * Capture Tool - Quick capture to today's daily note.
 *
 * This tool appends content to a specific section of the daily note.
 * It's the fastest way to record thoughts, tasks, wins, or learnings.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getVaultService } from '../../services/vault.js';
import { getDatabase } from '../../db/index.js';
import type { ToolHandler } from '../server.js';

// ============================================================================
// TOOL DEFINITION
// ============================================================================

const definition: Tool = {
  name: 'capture',
  description: `Quick capture to today's daily note. Appends content to a specific section:
- plan: Adds as a task (- [ ] content)
- notes: Adds to Notes section
- wins: Adds to Wins section with bullet
- learned: Adds to Learned Today section with bullet

Use this for fast, low-friction note-taking during work.`,
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The text to capture',
      },
      section: {
        type: 'string',
        enum: ['plan', 'notes', 'wins', 'learned'],
        description: 'Which section to add to. Defaults to notes.',
      },
    },
    required: ['content'],
  },
};

// ============================================================================
// HANDLER
// ============================================================================

async function handler(args: Record<string, unknown>): Promise<string> {
  const vault = getVaultService();
  const db = getDatabase();

  const content = args.content as string;
  const section = (args.section as string) || 'notes';

  if (!content || content.trim().length === 0) {
    throw new Error('Content is required');
  }

  // Get or create today's daily note
  const dailyPath = vault.getDailyNotePath();
  const note = await vault.getOrCreateDailyNote();

  // Determine target section and format
  let targetSection: string;
  let appendText: string;

  switch (section) {
    case 'plan':
      targetSection = 'Plan';
      appendText = `- [ ] ${content}`;
      break;
    case 'wins':
      targetSection = 'Wins';
      appendText = `- ${content}`;
      break;
    case 'learned':
      targetSection = 'Learned Today';
      appendText = `- ${content}`;
      break;
    case 'notes':
    default:
      targetSection = 'Notes';
      appendText = content;
      break;
  }

  // Find section and insert content
  const lines = note.content.split('\n');
  const sectionPattern = new RegExp(`^##\\s+${targetSection}`, 'i');
  let sectionIndex = lines.findIndex((line) => sectionPattern.test(line));

  if (sectionIndex === -1) {
    // Section not found, append at end
    lines.push('', `## ${targetSection}`, appendText);
  } else {
    // Find the end of the section (next heading or end of file)
    let insertIndex = sectionIndex + 1;

    // Skip empty lines right after heading
    while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
      insertIndex++;
    }

    // Find next section
    while (
      insertIndex < lines.length &&
      !lines[insertIndex].startsWith('## ')
    ) {
      insertIndex++;
    }

    // Insert before next section (or at end of content)
    lines.splice(insertIndex, 0, appendText);
  }

  // Write updated content
  const newContent = lines.join('\n');
  await vault.writeNote(dailyPath, newContent);

  // Update database cache
  const updatedNote = await vault.readNote(dailyPath);
  if (updatedNote) {
    db.upsertNote({
      id: updatedNote.id,
      title: updatedNote.title,
      type: 'daily',
      status: null,
      createdAt: updatedNote.createdAt,
      modifiedAt: updatedNote.modifiedAt,
      wordCount: updatedNote.wordCount,
      excerpt: updatedNote.excerpt,
      tags: updatedNote.tags,
    });
  }

  const timestamp = new Date().toLocaleTimeString();

  return `✓ Captured to ${targetSection} at ${timestamp}

**Added:**
${appendText}

**Daily note:** ${dailyPath}`;
}

// ============================================================================
// EXPORT
// ============================================================================

export const captureTool: ToolHandler = {
  definition,
  handler,
};
