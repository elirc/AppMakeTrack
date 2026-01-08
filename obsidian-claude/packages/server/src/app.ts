/**
 * Express application setup.
 *
 * This module creates and configures the Express app with:
 * - CORS for frontend access
 * - JSON body parsing
 * - API routes
 * - Error handling
 *
 * Separated from index.ts to allow:
 * - Testing without starting server
 * - Different entry points (HTTP vs MCP)
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

// Import route handlers
import {
  notesRouter,
  dailyRouter,
  searchRouter,
  projectsRouter,
  growthRouter,
  statsRouter,
  timeRouter,
} from './api/routes/index.js';

// ============================================================================
// APP CREATION
// ============================================================================

/**
 * Create and configure the Express application.
 */
export function createApp(): Express {
  const app = express();

  // ==========================================================================
  // MIDDLEWARE
  // ==========================================================================

  // CORS - allow requests from frontend dev server
  app.use(
    cors({
      origin: config.isDev ? 'http://localhost:5173' : false,
      credentials: true,
    })
  );

  // Parse JSON request bodies
  app.use(express.json({ limit: '1mb' }));

  // Request logging (development only)
  if (config.isDev) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.debug(
          {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
          },
          'Request completed'
        );
      });

      next();
    });
  }

  // ==========================================================================
  // API ROUTES
  // ==========================================================================

  // Health check endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    });
  });

  // Mount API routers
  app.use('/api/notes', notesRouter);
  app.use('/api/daily', dailyRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/growth', growthRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/time', timeRouter);

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  // 404 handler for unknown routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route not found: ${req.method} ${req.url}`,
      },
    });
  });

  // Global error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error(
      {
        err,
        method: req.method,
        url: req.url,
      },
      'Unhandled error'
    );

    // Don't expose internal errors in production
    const message = config.isDev ? err.message : 'Internal server error';

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message,
      },
    });
  });

  return app;
}
