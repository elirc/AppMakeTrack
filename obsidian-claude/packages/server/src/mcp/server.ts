/**
 * MCP Server - Model Context Protocol server for Claude Code integration.
 *
 * This module creates an MCP server that exposes tools for:
 * - Daily note management
 * - Quick captures
 * - Note processing
 * - Search ("ask past me")
 * - Time logging
 * - Weekly reviews
 * - Monthly snapshots
 * - Learning prompts
 * - Project status
 * - Mode switching
 *
 * The MCP protocol uses JSON-RPC over stdio.
 * Claude Code connects to this as an MCP server.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { initDatabase, getDatabase } from '../db/index.js';
import { getVaultService } from '../services/vault.js';
import { getSearchService } from '../services/search.js';

// Import tool handlers
import { dailyTool } from './tools/daily.js';
import { captureTool } from './tools/capture.js';
import { processTool } from './tools/process.js';
import { askTool } from './tools/ask.js';
import { logTimeTool } from './tools/log-time.js';
import { weeklyReviewTool } from './tools/weekly-review.js';
import { monthlySnapshotTool } from './tools/monthly-snapshot.js';
import { explainTool } from './tools/explain.js';
import { projectStatusTool } from './tools/project-status.js';
import { projectCreateTool } from './tools/project-create.js';
import { modeTool } from './tools/mode.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ToolHandler {
  definition: Tool;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

// ============================================================================
// TOOL REGISTRY
// ============================================================================

/**
 * All available MCP tools.
 * Each tool has a definition (for listing) and a handler (for execution).
 */
const tools: ToolHandler[] = [
  dailyTool,
  captureTool,
  processTool,
  askTool,
  logTimeTool,
  weeklyReviewTool,
  monthlySnapshotTool,
  explainTool,
  projectStatusTool,
  projectCreateTool,
  modeTool,
];

// Create lookup map for fast tool finding
const toolMap = new Map<string, ToolHandler>();
for (const tool of tools) {
  toolMap.set(tool.definition.name, tool);
}

// ============================================================================
// SERVER SETUP
// ============================================================================

/**
 * Create and configure the MCP server.
 */
function createServer(): Server {
  const server = new Server(
    {
      name: 'obsidian-claude',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // ---------------------------------------------------------------------------
  // LIST TOOLS
  // ---------------------------------------------------------------------------

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((t) => t.definition),
    };
  });

  // ---------------------------------------------------------------------------
  // CALL TOOL
  // ---------------------------------------------------------------------------

  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;

    const tool = toolMap.get(name);
    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await tool.handler(args || {});
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize services before starting the server.
 */
async function initialize(): Promise<void> {
  // Initialize vault
  const vault = getVaultService();
  if (!vault.isVaultAccessible()) {
    await vault.initializeVault();
  }

  // Initialize database (async with sql.js)
  await initDatabase();

  // Initialize search index
  const search = getSearchService();
  await search.initialize();
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  // Initialize services
  await initialize();

  // Create server
  const server = createServer();

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is for MCP protocol)
  console.error('MCP server started');
}

// Run
main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
