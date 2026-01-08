/**
 * Database module - SQLite connection and operations using sql.js.
 *
 * sql.js is a pure JavaScript implementation of SQLite that works
 * without native compilation. It runs SQLite in WebAssembly.
 *
 * Key differences from better-sqlite3:
 * - Async initialization (must load WASM)
 * - Database is in-memory by default (we persist to file manually)
 * - Slightly different API but similar concepts
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';
import { CREATE_TABLES, QUERIES, SCHEMA_VERSION } from './schema.js';
import type {
  NoteSummary,
  TimeEntry,
  Evidence,
  TagCount,
  CompetencyDimension,
} from '@obsidian-claude/shared';

// ============================================================================
// LOGGER
// ============================================================================

const log = createChildLogger({ module: 'database' });

// ============================================================================
// DATABASE CLASS
// ============================================================================

/**
 * Database wrapper providing type-safe operations with sql.js.
 */
export class DatabaseService {
  private db: SqlJsDatabase;
  private dbPath: string;
  private saveTimer: NodeJS.Timeout | null = null;

  private constructor(db: SqlJsDatabase, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  /**
   * Create and initialize the database service.
   * Must be called with await since sql.js requires async init.
   */
  static async create(dbPath: string = config.dbPath): Promise<DatabaseService> {
    log.info({ dbPath }, 'Opening database');

    // Initialize sql.js
    const SQL = await initSqlJs();

    // Load existing database or create new one
    let db: SqlJsDatabase;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
      log.info('Loaded existing database');
    } else {
      db = new SQL.Database();
      log.info('Created new database');
    }

    const service = new DatabaseService(db, dbPath);
    service.initializeSchema();

    log.info('Database initialized');
    return service;
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  private initializeSchema(): void {
    // Create tables
    this.db.run(CREATE_TABLES);

    // Check schema version
    const result = this.db.exec(
      'SELECT MAX(version) as version FROM schema_version'
    );
    const currentVersion = result[0]?.values[0]?.[0] as number | null ?? 0;

    if (currentVersion < SCHEMA_VERSION) {
      log.info(
        { from: currentVersion, to: SCHEMA_VERSION },
        'Running schema migration'
      );
      this.db.run(
        'INSERT INTO schema_version (version) VALUES (?)',
        [SCHEMA_VERSION]
      );
    }

    this.save();
    log.debug({ version: SCHEMA_VERSION }, 'Schema version');
  }

  /**
   * Save database to file (debounced).
   */
  private save(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveImmediate();
    }, 1000);
  }

  /**
   * Save database to file immediately.
   */
  private saveImmediate(): void {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = this.db.export();
      fs.writeFileSync(this.dbPath, Buffer.from(data));
      log.debug('Database saved');
    } catch (error) {
      log.error({ error }, 'Failed to save database');
    }
  }

  // ==========================================================================
  // NOTES
  // ==========================================================================

  upsertNote(note: {
    id: string;
    title: string;
    type: string | null;
    status: string | null;
    createdAt: string;
    modifiedAt: string;
    wordCount: number;
    excerpt: string;
    tags: string[];
  }): void {
    this.db.run(QUERIES.insertNote, [
      note.id,
      note.title,
      note.type,
      note.status,
      note.createdAt,
      note.modifiedAt,
      note.wordCount,
      note.excerpt,
    ]);

    // Update tags
    this.db.run(QUERIES.deleteNoteTags, [note.id]);

    for (const tagName of note.tags) {
      this.db.run(QUERIES.insertTag, [tagName]);
      const tagResult = this.db.exec(QUERIES.getTagId, [tagName]);
      const tagId = tagResult[0]?.values[0]?.[0] as number;
      if (tagId) {
        this.db.run(QUERIES.insertNoteTag, [note.id, tagId]);
      }
    }

    this.save();
    log.debug({ noteId: note.id }, 'Note upserted');
  }

  deleteNote(id: string): void {
    this.db.run(QUERIES.deleteNote, [id]);
    this.save();
    log.debug({ noteId: id }, 'Note deleted');
  }

  getNoteById(id: string): NoteSummary | null {
    const result = this.db.exec(QUERIES.getNoteById, [id]);
    if (!result[0]?.values[0]) return null;

    const row = this.resultToObject(result, 0);
    const tags = this.getTagsForNote(id);
    return this.rowToNoteSummary(row, tags);
  }

  getNotes(options: {
    type?: string | null;
    status?: string | null;
    tag?: string | null;
    limit?: number;
    offset?: number;
  } = {}): { notes: NoteSummary[]; total: number } {
    const { type = null, status = null, tag = null, limit = 20, offset = 0 } = options;

    // Build dynamic query
    let whereClause = '1=1';
    const params: any[] = [];

    if (type) {
      whereClause += ' AND n.type = ?';
      params.push(type);
    }
    if (status) {
      whereClause += ' AND n.status = ?';
      params.push(status);
    }
    if (tag) {
      whereClause += ' AND t.name = ?';
      params.push(tag);
    }

    // Count query
    const countSql = `
      SELECT COUNT(DISTINCT n.id) as count
      FROM notes n
      LEFT JOIN note_tags nt ON n.id = nt.note_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      WHERE ${whereClause}
    `;
    const countResult = this.db.exec(countSql, params);
    const total = (countResult[0]?.values[0]?.[0] as number) || 0;

    // Data query
    const dataSql = `
      SELECT DISTINCT n.*
      FROM notes n
      LEFT JOIN note_tags nt ON n.id = nt.note_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      WHERE ${whereClause}
      ORDER BY n.modified_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataResult = this.db.exec(dataSql, [...params, limit, offset]);

    const notes: NoteSummary[] = [];
    if (dataResult[0]) {
      for (let i = 0; i < dataResult[0].values.length; i++) {
        const row = this.resultToObject(dataResult, i);
        const tags = this.getTagsForNote(row.id as string);
        notes.push(this.rowToNoteSummary(row, tags));
      }
    }

    return { notes, total };
  }

  getTagsForNote(noteId: string): string[] {
    const result = this.db.exec(QUERIES.getTagsForNote, [noteId]);
    if (!result[0]) return [];
    return result[0].values.map((row) => row[0] as string);
  }

  // ==========================================================================
  // TAGS
  // ==========================================================================

  getAllTags(): TagCount[] {
    const result = this.db.exec(QUERIES.getAllTags);
    if (!result[0]) return [];
    return result[0].values.map((row) => ({
      tag: row[0] as string,
      count: row[1] as number,
    }));
  }

  // ==========================================================================
  // LINKS
  // ==========================================================================

  updateLinks(
    sourceId: string,
    links: Array<{ targetId: string; context: string }>
  ): void {
    this.db.run(QUERIES.deleteLinksFromNote, [sourceId]);

    for (const link of links) {
      this.db.run(QUERIES.insertLink, [sourceId, link.targetId, link.context]);
    }

    this.save();
  }

  getBacklinks(noteId: string): Array<NoteSummary & { context: string }> {
    const result = this.db.exec(QUERIES.getBacklinks, [noteId]);
    if (!result[0]) return [];

    const backlinks: Array<NoteSummary & { context: string }> = [];
    for (let i = 0; i < result[0].values.length; i++) {
      const row = this.resultToObject(result, i);
      const tags = this.getTagsForNote(row.id as string);
      backlinks.push({
        ...this.rowToNoteSummary(row, tags),
        context: row.context as string,
      });
    }
    return backlinks;
  }

  // ==========================================================================
  // TIME TRACKING
  // ==========================================================================

  logTime(entry: {
    date: string;
    project: string | null;
    task: string;
    durationMinutes: number;
  }): number {
    this.db.run(QUERIES.insertTimeEntry, [
      entry.date,
      entry.project,
      entry.task,
      entry.durationMinutes,
    ]);

    const result = this.db.exec('SELECT last_insert_rowid()');
    const id = result[0]?.values[0]?.[0] as number;

    this.save();
    log.debug({ entryId: id }, 'Time entry logged');
    return id;
  }

  getTimeEntriesForDate(date: string): TimeEntry[] {
    const result = this.db.exec(QUERIES.getTimeEntriesForDate, [date]);
    return this.resultToTimeEntries(result);
  }

  getTimeEntriesForRange(from: string, to: string): TimeEntry[] {
    const result = this.db.exec(QUERIES.getTimeEntriesForDateRange, [from, to]);
    return this.resultToTimeEntries(result);
  }

  getTimeByProject(
    from: string,
    to: string
  ): Array<{ project: string | null; totalMinutes: number }> {
    const result = this.db.exec(QUERIES.getTimeByProject, [from, to]);
    if (!result[0]) return [];
    return result[0].values.map((row) => ({
      project: row[0] as string | null,
      totalMinutes: row[1] as number,
    }));
  }

  getTimeEntries(date: string): TimeEntry[] {
    return this.getTimeEntriesForDate(date);
  }

  getTimeEntriesRange(from: string, to: string): TimeEntry[] {
    return this.getTimeEntriesForRange(from, to);
  }

  getAllTimeEntries(): TimeEntry[] {
    const result = this.db.exec(QUERIES.getAllTimeEntries);
    return this.resultToTimeEntries(result);
  }

  // ==========================================================================
  // GROWTH EVIDENCE
  // ==========================================================================

  addEvidence(entry: {
    dimension: CompetencyDimension;
    description: string;
    noteId: string | null;
    date: string;
  }): number {
    this.db.run(QUERIES.insertEvidence, [
      entry.dimension,
      entry.description,
      entry.noteId,
      entry.date,
    ]);

    const result = this.db.exec('SELECT last_insert_rowid()');
    const id = result[0]?.values[0]?.[0] as number;

    this.save();
    log.debug({ evidenceId: id }, 'Evidence added');
    return id;
  }

  getEvidenceByDimension(dimension: CompetencyDimension): Evidence[] {
    const result = this.db.exec(QUERIES.getEvidenceByDimension, [dimension]);
    return this.resultToEvidence(result);
  }

  getEvidenceSummary(): Array<{
    dimension: CompetencyDimension;
    count: number;
    lastDate: string | null;
  }> {
    const result = this.db.exec(QUERIES.getEvidenceSummary);
    if (!result[0]) return [];
    return result[0].values.map((row) => ({
      dimension: row[0] as CompetencyDimension,
      count: row[1] as number,
      lastDate: row[2] as string | null,
    }));
  }

  getAllEvidence(): Evidence[] {
    const result = this.db.exec(QUERIES.getAllEvidence);
    return this.resultToEvidence(result);
  }

  getEvidenceRange(from: string, to: string): Evidence[] {
    const result = this.db.exec(QUERIES.getEvidenceRange, [from, to]);
    return this.resultToEvidence(result);
  }

  // ==========================================================================
  // PROJECTS
  // ==========================================================================

  createProject(project: {
    id: string;
    name: string;
    description: string;
    status: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
  }): void {
    this.db.run(QUERIES.insertProject, [
      project.id,
      project.name,
      project.description,
      project.status,
      JSON.stringify(project.tags),
      project.createdAt,
      project.updatedAt,
    ]);
    this.save();
    log.debug({ projectId: project.id }, 'Project created');
  }

  getProjects(): ProjectRow[] {
    const result = this.db.exec(QUERIES.getProjects);
    if (!result[0]) return [];
    return result[0].values.map((row) => this.rowToProject(row, result[0].columns));
  }

  getProjectByName(name: string): ProjectRow | null {
    const result = this.db.exec(QUERIES.getProjectByName, [name]);
    if (!result[0]?.values[0]) return null;
    return this.rowToProject(result[0].values[0], result[0].columns);
  }

  updateProjectStatus(id: string, status: string): void {
    this.db.run(QUERIES.updateProjectStatus, [status, id]);
    this.save();
    log.debug({ projectId: id, status }, 'Project status updated');
  }

  // ==========================================================================
  // SNAPSHOTS
  // ==========================================================================

  saveSnapshot(snapshot: {
    month: string;
    dimensions: Array<{
      dimension: string;
      level: string;
      evidenceCount: number;
    }>;
  }): void {
    this.db.run(QUERIES.insertSnapshot, [
      snapshot.month,
      JSON.stringify(snapshot.dimensions),
    ]);
    this.save();
    log.debug({ month: snapshot.month }, 'Snapshot saved');
  }

  getSnapshots(): Array<{
    id: number;
    month: string;
    dimensions: Array<{
      dimension: string;
      level: string;
      evidenceCount: number;
    }>;
    createdAt: string;
  }> {
    const result = this.db.exec(QUERIES.getSnapshots);
    if (!result[0]) return [];
    return result[0].values.map((row) => ({
      id: row[0] as number,
      month: row[1] as string,
      dimensions: JSON.parse(row[2] as string),
      createdAt: row[3] as string,
    }));
  }

  // ==========================================================================
  // NOTES ADDITIONAL
  // ==========================================================================

  getNotesCreatedBetween(from: string, to: string): NoteSummary[] {
    const result = this.db.exec(QUERIES.getNotesCreatedBetween, [from, to]);
    if (!result[0]) return [];

    const notes: NoteSummary[] = [];
    for (let i = 0; i < result[0].values.length; i++) {
      const row = this.resultToObject(result, i);
      const tags = this.getTagsForNote(row.id as string);
      notes.push(this.rowToNoteSummary(row, tags));
    }
    return notes;
  }

  // ==========================================================================
  // SETTINGS
  // ==========================================================================

  getSetting(key: string): string | null {
    const result = this.db.exec(QUERIES.getSetting, [key]);
    return (result[0]?.values[0]?.[0] as string) ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db.run(QUERIES.setSetting, [key, value]);
    this.save();
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  getStats(): {
    totalNotes: number;
    notesToday: number;
    activeProjects: number;
    timeThisWeek: number;
  } {
    const result = this.db.exec(QUERIES.getStats);
    const row = result[0]?.values[0];
    return {
      totalNotes: (row?.[0] as number) || 0,
      notesToday: (row?.[1] as number) || 0,
      activeProjects: (row?.[2] as number) || 0,
      timeThisWeek: (row?.[3] as number) || 0,
    };
  }

  // ==========================================================================
  // MAINTENANCE
  // ==========================================================================

  clearCache(): void {
    this.db.run('DELETE FROM note_tags');
    this.db.run('DELETE FROM links');
    this.db.run('DELETE FROM notes');
    this.db.run('DELETE FROM tags');
    this.save();
    log.info('Cache cleared');
  }

  close(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveImmediate();
    this.db.close();
    log.info('Database closed');
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private resultToObject(result: any[], rowIndex: number): Record<string, any> {
    const columns = result[0].columns;
    const values = result[0].values[rowIndex];
    const obj: Record<string, any> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = values[i];
    }
    return obj;
  }

  private rowToNoteSummary(row: Record<string, any>, tags: string[]): NoteSummary {
    return {
      id: row.id,
      title: row.title,
      type: row.type as NoteSummary['type'],
      status: row.status as NoteSummary['status'],
      tags,
      createdAt: row.created_at,
      modifiedAt: row.modified_at,
      excerpt: row.excerpt ?? '',
      wordCount: row.word_count,
    };
  }

  private resultToTimeEntries(result: any[]): TimeEntry[] {
    if (!result[0]) return [];
    return result[0].values.map((row: any[]) => ({
      id: row[0] as number,
      date: row[1] as string,
      project: row[2] as string | null,
      task: row[3] as string,
      durationMinutes: row[4] as number,
      createdAt: row[5] as string,
    }));
  }

  private resultToEvidence(result: any[]): Evidence[] {
    if (!result[0]) return [];
    return result[0].values.map((row: any[]) => ({
      id: row[0] as number,
      dimension: row[1] as CompetencyDimension,
      description: row[2] as string,
      noteId: row[3] as string | null,
      date: row[4] as string,
      createdAt: row[5] as string,
    }));
  }

  private rowToProject(row: any[], columns: string[]): ProjectRow {
    const obj: Record<string, any> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = row[i];
    }
    return {
      id: obj.id,
      name: obj.name,
      description: obj.description || '',
      status: obj.status,
      tags: obj.tags ? JSON.parse(obj.tags) : [],
      createdAt: obj.created_at,
      updatedAt: obj.updated_at,
    };
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  status: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: DatabaseService | null = null;
let initPromise: Promise<DatabaseService> | null = null;

/**
 * Get the database instance.
 * Creates it if it doesn't exist.
 */
export async function initDatabase(): Promise<DatabaseService> {
  if (instance) return instance;
  if (initPromise) return initPromise;

  initPromise = DatabaseService.create();
  instance = await initPromise;
  return instance;
}

/**
 * Get the database instance (sync version).
 * Throws if not initialized.
 */
export function getDatabase(): DatabaseService {
  if (!instance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return instance;
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
    initPromise = null;
  }
}
