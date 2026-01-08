/**
 * Server entry point.
 *
 * This is the main entry point that:
 * 1. Initializes the database
 * 2. Initializes the vault
 * 3. Starts the HTTP server
 * 4. Sets up graceful shutdown
 *
 * For MCP mode, use mcp/server.ts instead.
 */

import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './db/index.js';
import { getVaultService } from './services/vault.js';

// ============================================================================
// STARTUP
// ============================================================================

async function main() {
  logger.info('Starting Obsidian-Claude server...');

  // --------------------------------------------------------------------------
  // INITIALIZE VAULT
  // --------------------------------------------------------------------------

  const vault = getVaultService();

  if (!vault.isVaultAccessible()) {
    logger.warn({ vaultPath: config.vaultPath }, 'Vault not found, creating...');
    await vault.initializeVault();
  }

  // --------------------------------------------------------------------------
  // INITIALIZE DATABASE
  // --------------------------------------------------------------------------

  await initDatabase();
  logger.info('Database initialized');

  // TODO: Index vault on startup
  // await indexVault(vault, db);

  // --------------------------------------------------------------------------
  // START HTTP SERVER
  // --------------------------------------------------------------------------

  const app = createApp();

  const server = app.listen(config.port, config.host, () => {
    logger.info(
      { host: config.host, port: config.port },
      'HTTP server listening'
    );
    console.log(`\n  🚀 Server running at http://${config.host}:${config.port}\n`);
  });

  // --------------------------------------------------------------------------
  // GRACEFUL SHUTDOWN
  // --------------------------------------------------------------------------

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Close database
    closeDatabase();

    // Exit
    process.exit(0);
  };

  // Handle shutdown signals
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    shutdown('unhandledRejection');
  });
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
