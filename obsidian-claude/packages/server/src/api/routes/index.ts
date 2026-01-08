/**
 * Route Index
 *
 * Aggregates and exports all API route modules.
 * This provides a clean single import for app.ts.
 */

export { notesRouter } from './notes.js';
export { dailyRouter } from './daily.js';
export { searchRouter } from './search.js';
export { timeRouter } from './time.js';
export { statsRouter } from './stats.js';
export { growthRouter } from './growth.js';
export { projectsRouter } from './projects.js';
