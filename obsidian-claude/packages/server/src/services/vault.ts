/**
 * Vault Service - Handles all file operations on the Obsidian vault.
 *
 * This is the core service that:
 * - Reads and parses markdown files
 * - Writes and updates notes
 * - Manages vault structure (folders, templates)
 * - Extracts wiki-links for backlink tracking
 *
 * Design principle: The vault (files) is the source of truth.
 * The database is just a cache for fast queries.
 */

import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative, dirname, basename, extname } from 'path';
import matter from 'gray-matter';
import { config } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';
import { VAULT_FOLDERS, EXCERPT_LENGTH } from '@obsidian-claude/shared';
import type {
  Note,
  NoteSummary,
  NoteType,
  NoteStatus,
  NoteFrontmatter,
} from '@obsidian-claude/shared';

// ============================================================================
// LOGGER
// ============================================================================

const log = createChildLogger({ module: 'vault' });

// ============================================================================
// REGEX PATTERNS
// ============================================================================

/**
 * Matches wiki-style links: [[target]] or [[target|alias]]
 */
const WIKI_LINK_PATTERN = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

/**
 * Matches frontmatter date formats
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

// ============================================================================
// VAULT SERVICE
// ============================================================================

export class VaultService {
  private vaultPath: string;

  constructor(vaultPath: string = config.vaultPath) {
    this.vaultPath = vaultPath;
    log.info({ vaultPath }, 'Vault service initialized');
  }

  // ==========================================================================
  // PATH HELPERS
  // ==========================================================================

  /**
   * Get absolute path for a relative vault path.
   */
  getAbsolutePath(relativePath: string): string {
    return join(this.vaultPath, relativePath);
  }

  /**
   * Get relative path from absolute path.
   */
  getRelativePath(absolutePath: string): string {
    return relative(this.vaultPath, absolutePath);
  }

  /**
   * Get the vault root path.
   */
  getVaultPath(): string {
    return this.vaultPath;
  }

  // ==========================================================================
  // FILE DISCOVERY
  // ==========================================================================

  /**
   * Get all markdown files in the vault.
   */
  async getAllMarkdownFiles(): Promise<string[]> {
    const files: string[] = [];

    async function walkDir(dir: string): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        // Skip hidden files/folders and .obsidian
        if (entry.name.startsWith('.')) continue;

        if (entry.isDirectory()) {
          // Skip templates folder
          if (entry.name === 'templates') continue;
          await walkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    }

    await walkDir(this.vaultPath);
    return files;
  }

  /**
   * Get all markdown files in a specific folder.
   */
  async getFilesInFolder(folder: string): Promise<string[]> {
    const folderPath = this.getAbsolutePath(folder);

    if (!existsSync(folderPath)) {
      return [];
    }

    const entries = await readdir(folderPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => join(folderPath, e.name));
  }

  // ==========================================================================
  // NOTE READING
  // ==========================================================================

  /**
   * Read and parse a note from the vault.
   */
  async readNote(relativePath: string): Promise<Note | null> {
    const absolutePath = this.getAbsolutePath(relativePath);

    if (!existsSync(absolutePath)) {
      log.debug({ path: relativePath }, 'Note not found');
      return null;
    }

    try {
      const content = await readFile(absolutePath, 'utf-8');
      const stats = await stat(absolutePath);

      return this.parseNote(relativePath, content, stats.mtime);
    } catch (error) {
      log.error({ err: error, path: relativePath }, 'Failed to read note');
      throw error;
    }
  }

  /**
   * Parse markdown content into a Note object.
   */
  parseNote(id: string, content: string, modifiedTime?: Date): Note {
    // Parse frontmatter
    const { data: frontmatter, content: body } = matter(content);

    // Extract title
    const title = this.extractTitle(id, frontmatter, body);

    // Get timestamps
    const now = new Date().toISOString();
    const createdAt = this.parseDate(frontmatter.created) ?? now;
    const modifiedAt = modifiedTime?.toISOString() ?? now;

    // Calculate word count
    const wordCount = this.countWords(body);

    // Generate excerpt
    const excerpt = this.generateExcerpt(body);

    return {
      id,
      title,
      content,
      frontmatter: frontmatter as NoteFrontmatter,
      body,
      type: (frontmatter.type as NoteType) ?? null,
      status: (frontmatter.status as NoteStatus) ?? null,
      tags: this.normalizeTags(frontmatter.tags),
      createdAt,
      modifiedAt,
      excerpt,
      wordCount,
    };
  }

  /**
   * Extract title from frontmatter, first heading, or filename.
   */
  private extractTitle(
    id: string,
    frontmatter: Record<string, unknown>,
    body: string
  ): string {
    // 1. Check frontmatter
    if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
      return frontmatter.title.trim();
    }

    // 2. Check first H1 heading
    const h1Match = body.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }

    // 3. Fall back to filename
    const filename = basename(id, extname(id));
    return filename.replace(/-/g, ' ');
  }

  /**
   * Parse a date from frontmatter (handles various formats).
   */
  private parseDate(value: unknown): string | null {
    if (!value) return null;

    // Already a Date object
    if (value instanceof Date) {
      return value.toISOString();
    }

    // String date
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    return null;
  }

  /**
   * Normalize tags to an array of strings.
   */
  private normalizeTags(tags: unknown): string[] {
    if (!tags) return [];

    // Already an array
    if (Array.isArray(tags)) {
      return tags
        .filter((t) => typeof t === 'string')
        .map((t) => t.toLowerCase().trim())
        .filter((t) => t.length > 0);
    }

    // Single string tag
    if (typeof tags === 'string') {
      return [tags.toLowerCase().trim()];
    }

    return [];
  }

  /**
   * Count words in text.
   */
  private countWords(text: string): number {
    // Remove code blocks
    const withoutCode = text.replace(/```[\s\S]*?```/g, '');
    // Split on whitespace
    const words = withoutCode.trim().split(/\s+/);
    return words.filter((w) => w.length > 0).length;
  }

  /**
   * Generate an excerpt from body text.
   */
  private generateExcerpt(body: string): string {
    // Remove headings, code blocks, links
    let text = body
      .replace(/^#+\s+.+$/gm, '') // Headings
      .replace(/```[\s\S]*?```/g, '') // Code blocks
      .replace(/`[^`]+`/g, '') // Inline code
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1') // Wiki links
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Markdown links
      .replace(/[*_~]+/g, '') // Formatting
      .trim();

    // Get first paragraph
    const paragraphs = text.split(/\n\n+/);
    text = paragraphs[0] || '';

    // Truncate
    if (text.length > EXCERPT_LENGTH) {
      text = text.substring(0, EXCERPT_LENGTH).trim() + '...';
    }

    return text;
  }

  // ==========================================================================
  // NOTE WRITING
  // ==========================================================================

  /**
   * Write a note to the vault.
   */
  async writeNote(relativePath: string, content: string): Promise<void> {
    const absolutePath = this.getAbsolutePath(relativePath);

    // Ensure directory exists
    await mkdir(dirname(absolutePath), { recursive: true });

    // Write file
    await writeFile(absolutePath, content, 'utf-8');
    log.debug({ path: relativePath }, 'Note written');
  }

  /**
   * Create a new note with frontmatter.
   */
  async createNote(
    folder: string,
    filename: string,
    options: {
      title: string;
      type?: NoteType;
      tags?: string[];
      content?: string;
    }
  ): Promise<Note> {
    const relativePath = join(folder, filename);

    // Check if already exists
    if (existsSync(this.getAbsolutePath(relativePath))) {
      throw new Error(`Note already exists: ${relativePath}`);
    }

    // Build frontmatter
    const frontmatter: Record<string, unknown> = {
      title: options.title,
      created: new Date().toISOString(),
    };

    if (options.type) {
      frontmatter.type = options.type;
    }

    if (options.tags && options.tags.length > 0) {
      frontmatter.tags = options.tags;
    }

    // Build content
    const content = matter.stringify(options.content || '', frontmatter);

    // Write file
    await this.writeNote(relativePath, content);

    // Return parsed note
    return this.parseNote(relativePath, content);
  }

  /**
   * Update a note's frontmatter.
   */
  async updateNoteFrontmatter(
    relativePath: string,
    updates: Partial<NoteFrontmatter>
  ): Promise<Note> {
    const note = await this.readNote(relativePath);

    if (!note) {
      throw new Error(`Note not found: ${relativePath}`);
    }

    // Merge frontmatter
    const newFrontmatter = {
      ...note.frontmatter,
      ...updates,
      modified: new Date().toISOString(),
    };

    // Rebuild content
    const content = matter.stringify(note.body, newFrontmatter);

    // Write
    await this.writeNote(relativePath, content);

    return this.parseNote(relativePath, content);
  }

  /**
   * Append content to a note.
   */
  async appendToNote(relativePath: string, text: string): Promise<void> {
    const note = await this.readNote(relativePath);

    if (!note) {
      throw new Error(`Note not found: ${relativePath}`);
    }

    // Append to body
    const newBody = note.body.trimEnd() + '\n\n' + text;

    // Rebuild content
    const content = matter.stringify(newBody, note.frontmatter);

    await this.writeNote(relativePath, content);
  }

  /**
   * Delete a note from the vault.
   */
  async deleteNote(relativePath: string): Promise<void> {
    const absolutePath = this.getAbsolutePath(relativePath);

    if (!existsSync(absolutePath)) {
      throw new Error(`Note not found: ${relativePath}`);
    }

    await unlink(absolutePath);
    log.info({ path: relativePath }, 'Note deleted');
  }

  // ==========================================================================
  // LINK EXTRACTION
  // ==========================================================================

  /**
   * Extract wiki-links from note content.
   */
  extractLinks(content: string): Array<{ target: string; context: string }> {
    const links: Array<{ target: string; context: string }> = [];
    const lines = content.split('\n');

    for (const line of lines) {
      let match;
      WIKI_LINK_PATTERN.lastIndex = 0;

      while ((match = WIKI_LINK_PATTERN.exec(line)) !== null) {
        const target = match[1].trim();

        // Get context (surrounding text)
        const start = Math.max(0, match.index - 30);
        const end = Math.min(line.length, match.index + match[0].length + 30);
        const context = line.substring(start, end);

        links.push({
          target: this.normalizeLink(target),
          context,
        });
      }
    }

    return links;
  }

  /**
   * Normalize a wiki-link target to a file path.
   */
  private normalizeLink(target: string): string {
    // Remove any path components for now (just use filename)
    const filename = basename(target);

    // Add .md extension if not present
    if (!filename.endsWith('.md')) {
      return `${filename}.md`;
    }

    return filename;
  }

  // ==========================================================================
  // DAILY NOTES
  // ==========================================================================

  /**
   * Get the path for today's daily note.
   */
  getDailyNotePath(date: Date = new Date()): string {
    const dateStr = this.formatDate(date);
    return join(VAULT_FOLDERS.DAILY, `${dateStr}.md`);
  }

  /**
   * Get or create today's daily note.
   */
  async getOrCreateDailyNote(date: Date = new Date()): Promise<Note> {
    const relativePath = this.getDailyNotePath(date);
    const existing = await this.readNote(relativePath);

    if (existing) {
      return existing;
    }

    // Create from template
    const template = await this.loadTemplate('daily');
    const dateStr = this.formatDate(date);

    // Replace template variables
    const content = template
      .replace(/\{\{date\}\}/g, dateStr)
      .replace(/\{\{title\}\}/g, dateStr);

    await this.writeNote(relativePath, content);

    return (await this.readNote(relativePath))!;
  }

  /**
   * Format date as YYYY-MM-DD.
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // ==========================================================================
  // TEMPLATES
  // ==========================================================================

  /**
   * Load a template file.
   */
  async loadTemplate(name: string): Promise<string> {
    const templatePath = this.getAbsolutePath(
      join(VAULT_FOLDERS.TEMPLATES, `${name}.md`)
    );

    if (!existsSync(templatePath)) {
      log.warn({ template: name }, 'Template not found, using default');
      return this.getDefaultTemplate(name);
    }

    return readFile(templatePath, 'utf-8');
  }

  /**
   * Get a default template if custom template doesn't exist.
   */
  private getDefaultTemplate(name: string): string {
    switch (name) {
      case 'daily':
        return `---
title: "{{date}}"
type: daily
created: {{date}}
---

# {{date}}

## Plan
- [ ]

## Time Log
| Start | End | Duration | Project | Task |
|-------|-----|----------|---------|------|

## Notes

## Wins 🎯

## Learned Today
-
`;

      case 'concept':
        return `---
title: "{{title}}"
type: concept
status: seedling
tags: []
created: {{date}}
---

# {{title}}

## Summary


## Details


## Related
-
`;

      case 'solution':
        return `---
title: "{{title}}"
type: solution
tags: []
created: {{date}}
---

# {{title}}

## Problem


## Solution


## Related
-
`;

      default:
        return `---
title: "{{title}}"
created: {{date}}
---

# {{title}}

`;
    }
  }

  // ==========================================================================
  // VAULT INITIALIZATION
  // ==========================================================================

  /**
   * Initialize vault structure (create folders if needed).
   */
  async initializeVault(): Promise<void> {
    const folders = [
      VAULT_FOLDERS.DAILY,
      VAULT_FOLDERS.NOTES,
      VAULT_FOLDERS.PROJECTS,
      VAULT_FOLDERS.GROWTH,
      VAULT_FOLDERS.TEMPLATES,
      VAULT_FOLDERS.SNAPSHOTS,
    ];

    for (const folder of folders) {
      const folderPath = this.getAbsolutePath(folder);
      await mkdir(folderPath, { recursive: true });
    }

    log.info('Vault structure initialized');
  }

  /**
   * Check if vault exists and is accessible.
   */
  isVaultAccessible(): boolean {
    return existsSync(this.vaultPath);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: VaultService | null = null;

/**
 * Get the vault service instance.
 */
export function getVaultService(): VaultService {
  if (!instance) {
    instance = new VaultService();
  }
  return instance;
}
