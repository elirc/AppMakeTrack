/**
 * Daily Tool - Get or create today's daily note.
 *
 * This tool is idempotent - calling it multiple times returns the same note.
 * If no daily note exists for today, it creates one from the template.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getVaultService } from '../../services/vault.js';
import { getDatabase } from '../../db/index.js';
import type { ToolHandler } from '../server.js';

// ============================================================================
// TOOL DEFINITION
// ============================================================================

const definition: Tool = {
  name: 'daily',
  description: `Get or create today's daily note. Returns the current daily note content including:
- Plan section with tasks
- Time log
- Notes section
- Wins
- What you learned

If no daily note exists for today, creates one from the template.`,
  inputSchema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Optional date in YYYY-MM-DD format. Defaults to today.',
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

  // Parse date if provided
  let date = new Date();
  if (args.date && typeof args.date === 'string') {
    const parsed = new Date(args.date);
    if (!isNaN(parsed.getTime())) {
      date = parsed;
    }
  }

  // Get or create the daily note
  const note = await vault.getOrCreateDailyNote(date);

  // Update database cache
  db.upsertNote({
    id: note.id,
    title: note.title,
    type: 'daily',
    status: null,
    createdAt: note.createdAt,
    modifiedAt: note.modifiedAt,
    wordCount: note.wordCount,
    excerpt: note.excerpt,
    tags: note.tags,
  });

  // Format response
  const dateStr = date.toISOString().split('T')[0];

  return `# Daily Note: ${dateStr}

**Path:** ${note.id}
**Word Count:** ${note.wordCount}

---

${note.body}`;
}

// ============================================================================
// EXPORT
// ============================================================================

export const dailyTool: ToolHandler = {
  definition,
  handler,
};
