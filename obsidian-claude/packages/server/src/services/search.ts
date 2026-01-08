/**
 * Search Service - Full-text search using FlexSearch.
 *
 * This service provides:
 * - Fast in-memory full-text search
 * - Fuzzy matching
 * - Field-specific search (title, content, tags)
 * - Real-time index updates
 *
 * FlexSearch is chosen for:
 * - Sub-millisecond search performance
 * - No external dependencies (in-memory)
 * - Excellent fuzzy matching
 * - Small memory footprint
 */

import FlexSearch from 'flexsearch';
const { Document } = FlexSearch;
import { getVaultService } from './vault.js';
import { getDatabase } from '../db/index.js';
import { createChildLogger } from '../utils/logger.js';
import type { Note, NoteSummary, SearchResult } from '@obsidian-claude/shared';

// ============================================================================
// LOGGER
// ============================================================================

const log = createChildLogger({ module: 'search' });

// ============================================================================
// TYPES
// ============================================================================

interface IndexedDocument {
  id: string;
  title: string;
  content: string;
  tags: string;
  type: string | null;
}

interface SearchOptions {
  types?: string[];
  tags?: string[];
  limit?: number;
  offset?: number;
}

// ============================================================================
// SEARCH SERVICE
// ============================================================================

export class SearchService {
  private index: Document<IndexedDocument, string[]>;
  private initialized = false;

  constructor() {
    // Create a document index with multiple fields
    this.index = new Document<IndexedDocument, string[]>({
      document: {
        id: 'id',
        index: ['title', 'content', 'tags'],
        store: ['title', 'type'],
      },
      tokenize: 'forward',
      resolution: 9,
      cache: 100,
    });

    log.info('Search service created');
  }

  /**
   * Initialize the search index by indexing all notes.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    log.info('Initializing search index...');
    const start = Date.now();

    const vault = getVaultService();
    const files = await vault.getAllMarkdownFiles();

    let indexed = 0;
    for (const file of files) {
      const relativePath = vault.getRelativePath(file);
      const note = await vault.readNote(relativePath);

      if (note) {
        this.indexNote(note);
        indexed++;
      }
    }

    this.initialized = true;
    const duration = Date.now() - start;
    log.info({ indexed, duration: `${duration}ms` }, 'Search index ready');
  }

  /**
   * Index a single note.
   */
  indexNote(note: Note): void {
    this.index.add({
      id: note.id,
      title: note.title,
      content: note.body,
      tags: note.tags.join(' '),
      type: note.type,
    });
  }

  /**
   * Update a note in the index.
   */
  updateNote(note: Note): void {
    // FlexSearch's update is add with same id
    this.indexNote(note);
  }

  /**
   * Remove a note from the index.
   */
  removeNote(noteId: string): void {
    this.index.remove(noteId);
  }

  /**
   * Search for notes matching a query.
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { types, tags, limit = 20, offset = 0 } = options;

    // Ensure index is initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Search across all fields
    const searchResults = this.index.search(query, {
      limit: limit + offset + 50, // Get extra for filtering
      enrich: true,
    });

    // Combine results from different fields
    const resultMap = new Map<string, { score: number; fields: string[] }>();

    for (const fieldResult of searchResults) {
      const field = fieldResult.field as string;
      const results = fieldResult.result as unknown as Array<{
        id: string;
        doc: { title: string; type: string | null };
      }>;

      results.forEach((result, index) => {
        const existing = resultMap.get(result.id);
        const score = results.length - index; // Higher rank = higher score

        if (existing) {
          existing.score += score;
          existing.fields.push(field);
        } else {
          resultMap.set(result.id, { score, fields: [field] });
        }
      });
    }

    // Sort by score
    const sortedIds = Array.from(resultMap.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .map(([id]) => id);

    // Get full note summaries from database
    const db = getDatabase();
    const results: SearchResult[] = [];

    for (const id of sortedIds) {
      const noteSummary = db.getNoteById(id);
      if (!noteSummary) continue;

      // Apply filters
      if (types && types.length > 0) {
        if (!noteSummary.type || !types.includes(noteSummary.type)) continue;
      }

      if (tags && tags.length > 0) {
        const noteTags = noteSummary.tags.map((t) => t.toLowerCase());
        const hasMatchingTag = tags.some((t) => noteTags.includes(t.toLowerCase()));
        if (!hasMatchingTag) continue;
      }

      const matchInfo = resultMap.get(id)!;

      results.push({
        note: noteSummary,
        matches: matchInfo.fields.map((field) => ({
          field: field as 'title' | 'content' | 'tags',
          snippet: '', // Could extract snippets here
        })),
        score: matchInfo.score,
      });

      // Check if we have enough after filtering
      if (results.length >= offset + limit) break;
    }

    // Apply offset and limit
    return results.slice(offset, offset + limit);
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.index = new Document<IndexedDocument, string[]>({
      document: {
        id: 'id',
        index: ['title', 'content', 'tags'],
        store: ['title', 'type'],
      },
      tokenize: 'forward',
      resolution: 9,
      cache: 100,
    });
    this.initialized = false;
    log.info('Search index cleared');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: SearchService | null = null;

export function getSearchService(): SearchService {
  if (!instance) {
    instance = new SearchService();
  }
  return instance;
}
