/**
 * Server configuration module.
 *
 * This module handles all configuration for the server, including:
 * - Environment variables
 * - Default values
 * - Validation
 *
 * Configuration is loaded once at startup and should not change during runtime.
 */

import { z } from 'zod';
import { join } from 'path';
import { homedir } from 'os';

// ============================================================================
// SCHEMA DEFINITION
// ============================================================================

/**
 * Configuration schema with validation and defaults.
 *
 * Using Zod for config validation provides:
 * 1. Runtime type checking
 * 2. Default values
 * 3. Environment variable transformation
 * 4. Clear error messages on misconfiguration
 */
const configSchema = z.object({
  // Server settings
  port: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(65535))
    .default('3000'),

  host: z.string().default('localhost'),

  // Vault settings
  vaultPath: z.string().default(join(homedir(), 'obsidian-vault')),

  // Database settings
  dbPath: z.string().optional(),

  // Logging
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Mode
  mode: z.enum(['development', 'production', 'mcp']).default('development'),

  // Proactivity mode for Claude integration
  proactivityMode: z.enum(['quiet', 'nudge', 'coach']).default('quiet'),
});

// ============================================================================
// ENVIRONMENT LOADING
// ============================================================================

/**
 * Load configuration from environment variables.
 *
 * Environment variable names follow the convention:
 * - OBSIDIAN_CLAUDE_PORT
 * - OBSIDIAN_CLAUDE_VAULT_PATH
 * - etc.
 *
 * This prefix prevents conflicts with other applications.
 */
function loadFromEnv(): Record<string, string | undefined> {
  const prefix = 'OBSIDIAN_CLAUDE_';

  return {
    port: process.env[`${prefix}PORT`] ?? process.env.PORT,
    host: process.env[`${prefix}HOST`],
    vaultPath: process.env[`${prefix}VAULT_PATH`] ?? process.env.VAULT_PATH,
    dbPath: process.env[`${prefix}DB_PATH`],
    logLevel: process.env[`${prefix}LOG_LEVEL`] ?? process.env.LOG_LEVEL,
    mode: process.env[`${prefix}MODE`] ?? process.env.NODE_ENV,
    proactivityMode: process.env[`${prefix}PROACTIVITY_MODE`],
  };
}

// ============================================================================
// CONFIG CREATION
// ============================================================================

/**
 * Create the configuration object.
 *
 * This function:
 * 1. Loads environment variables
 * 2. Filters out undefined values
 * 3. Validates against the schema
 * 4. Returns a frozen (immutable) config object
 */
function createConfig() {
  const envConfig = loadFromEnv();

  // Filter out undefined values so defaults can apply
  const filteredConfig = Object.fromEntries(
    Object.entries(envConfig).filter(([, value]) => value !== undefined)
  );

  // Parse and validate
  const result = configSchema.safeParse(filteredConfig);

  if (!result.success) {
    console.error('Configuration error:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  // Derive additional values
  const config = {
    ...result.data,
    // Default database path is inside the vault
    dbPath: result.data.dbPath ?? join(result.data.vaultPath, '.cache.db'),
    // Is development mode?
    isDev: result.data.mode === 'development',
    // Is MCP mode? (running as Claude Code extension)
    isMcp: result.data.mode === 'mcp',
  };

  // Freeze to prevent accidental mutation
  return Object.freeze(config);
}

// ============================================================================
// EXPORT
// ============================================================================

/**
 * The application configuration.
 *
 * This is a singleton - created once when the module loads.
 * It's frozen (immutable) to prevent accidental changes.
 *
 * Usage:
 * ```typescript
 * import { config } from './config/index.js';
 * console.log(config.port);  // 3000
 * console.log(config.vaultPath);  // /Users/you/obsidian-vault
 * ```
 */
export const config = createConfig();

/**
 * Type of the configuration object.
 * Useful for type hints when passing config around.
 */
export type Config = typeof config;

// ============================================================================
// DEBUG OUTPUT
// ============================================================================

// In development, log the config (but not sensitive values)
if (config.isDev) {
  console.log('Configuration loaded:');
  console.log(`  port: ${config.port}`);
  console.log(`  host: ${config.host}`);
  console.log(`  vaultPath: ${config.vaultPath}`);
  console.log(`  dbPath: ${config.dbPath}`);
  console.log(`  logLevel: ${config.logLevel}`);
  console.log(`  mode: ${config.mode}`);
}
