/**
 * Ask Tool - Search past notes for solutions and knowledge.
 *
 * This tool implements "ask past me" - searching your vault for
 * things you've already learned, solved, or documented.
 * It's the knowledge retrieval counterpart to capture/process.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getSearchService } from '../../services/search.js';
import { getDatabase } from '../../db/index.js';
import type { ToolHandler } from '../server.js';
import type { NoteType } from '@obsidian-claude/shared';

// ============================================================================
// TOOL DEFINITION
// ============================================================================

const definition: Tool = {
  name: 'ask',
  description: `Search your past notes for solutions and knowledge. Use this to:
- Find solutions you've documented before
- Recall concepts you've learned
- Look up decisions and their rationale
- Search for failures to avoid repeating mistakes

Returns relevant notes with excerpts and links.`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What to search for',
      },
      types: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['concept', 'solution', 'decision', 'til', 'failure', 'daily'],
        },
        description: 'Filter by note types. Omit to search all.',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return. Default: 5',
      },
    },
    required: ['query'],
  },
};

// ============================================================================
// HANDLER
// ============================================================================

async function handler(args: Record<string, unknown>): Promise<string> {
  const search = getSearchService();
  const db = getDatabase();

  const query = args.query as string;
  const types = args.types as NoteType[] | undefined;
  const limit = (args.limit as number) || 5;

  if (!query || query.trim().length === 0) {
    throw new Error('Query is required');
  }

  // Perform search
  const results = await search.search(query, { types, limit });

  if (results.length === 0) {
    return `No results found for "${query}"

**Suggestions:**
- Try broader search terms
- Check for typos
- Search for related concepts
- This might be new territory - consider documenting it!`;
  }

  // Format results
  const formatted = results.map((result, index) => {
    const { note } = result;
    const typeEmoji = getTypeEmoji(note.type);
    const statusEmoji = note.status ? getStatusEmoji(note.status) : '';

    return `### ${index + 1}. ${typeEmoji} ${note.title} ${statusEmoji}

**Path:** ${note.id}
**Type:** ${note.type}
${note.tags.length > 0 ? `**Tags:** ${note.tags.join(', ')}` : ''}

${note.excerpt}`;
  }).join('\n\n---\n\n');

  return `# Search Results for "${query}"

Found ${results.length} result${results.length === 1 ? '' : 's'}:

${formatted}

---

*Use the note path to read the full content.*`;
}

// ============================================================================
// HELPERS
// ============================================================================

function getTypeEmoji(type: string | null): string {
  if (!type) return '📄';
  const emojis: Record<string, string> = {
    concept: '💡',
    solution: '🔧',
    decision: '⚖️',
    til: '📚',
    failure: '❌',
    daily: '📅',
  };
  return emojis[type] || '📄';
}

function getStatusEmoji(status: string): string {
  const emojis: Record<string, string> = {
    seedling: '🌱',
    growing: '🌿',
    evergreen: '🌳',
  };
  return emojis[status] || '';
}

// ============================================================================
// EXPORT
// ============================================================================

export const askTool: ToolHandler = {
  definition,
  handler,
};
