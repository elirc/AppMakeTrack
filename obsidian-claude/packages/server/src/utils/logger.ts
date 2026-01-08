/**
 * Logging module using Pino.
 *
 * Provides structured logging with:
 * - JSON output in production (machine-readable)
 * - Pretty output in development (human-readable)
 * - Child loggers for context
 * - Performance-optimized
 */

import { pino } from 'pino';
import type { Logger as PinoLogger } from 'pino';
import { config } from '../config/index.js';

// ============================================================================
// LOGGER CREATION
// ============================================================================

/**
 * Create the base logger instance.
 *
 * Configuration is based on the environment:
 * - Development: Pretty printed, colorized, with timestamps
 * - Production: JSON output, minimal overhead
 * - MCP mode: Disabled (stdout is for MCP protocol)
 */
function createLogger() {
  // In MCP mode, disable logging (stdout is for protocol)
  if (config.isMcp) {
    return pino({ level: 'silent' });
  }

  // Development: pretty printing
  if (config.isDev) {
    return pino({
      level: config.logLevel,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  // Production: JSON output
  return pino({
    level: config.logLevel,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * The application logger.
 *
 * Usage:
 * ```typescript
 * import { logger } from './utils/logger.js';
 *
 * // Simple message
 * logger.info('Server started');
 *
 * // With context
 * logger.info({ port: 3000 }, 'Server started');
 *
 * // Different levels
 * logger.debug('Detailed info');
 * logger.info('General info');
 * logger.warn('Warning');
 * logger.error('Error');
 *
 * // With error
 * logger.error({ err: error }, 'Failed to process request');
 * ```
 */
export const logger = createLogger();

/**
 * Create a child logger with bound context.
 *
 * Use this for module-specific loggers that always include context.
 *
 * ```typescript
 * const dbLogger = createChildLogger({ module: 'database' });
 * dbLogger.info('Connected');
 * // Output: { module: 'database', msg: 'Connected' }
 * ```
 */
export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/**
 * Logger type for dependency injection.
 */
export type Logger = typeof logger;
