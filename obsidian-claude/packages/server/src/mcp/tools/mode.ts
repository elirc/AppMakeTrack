/**
 * Mode Tool - Set Claude's proactivity level.
 *
 * This tool lets the user control how proactive Claude should be:
 * - quiet: Only respond when asked
 * - nudge: Gentle reminders and suggestions
 * - coach: Proactive guidance and prompts
 *
 * The mode is stored in the database and persists across sessions.
 * Tools can check the mode to adjust their behavior.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabase } from '../../db/index.js';
import type { ToolHandler } from '../server.js';

// ============================================================================
// TOOL DEFINITION
// ============================================================================

const definition: Tool = {
  name: 'mode',
  description: `Set or view Claude's proactivity mode.

Modes:
- quiet: Only respond when explicitly asked. No unsolicited suggestions.
- nudge: Gentle reminders (e.g., "Consider logging your time")
- coach: Proactive guidance (e.g., "You haven't captured anything today")

The mode affects how other tools behave and what suggestions are offered.`,
  inputSchema: {
    type: 'object',
    properties: {
      set: {
        type: 'string',
        enum: ['quiet', 'nudge', 'coach'],
        description: 'Set the mode. Omit to view current mode.',
      },
    },
    required: [],
  },
};

// ============================================================================
// HANDLER
// ============================================================================

async function handler(args: Record<string, unknown>): Promise<string> {
  const db = getDatabase();

  const newMode = args.set as string | undefined;

  // Get current mode
  const currentMode = db.getSetting('proactivity_mode') || 'nudge';

  // If no new mode, just show current
  if (!newMode) {
    const modeInfo = getModeInfo(currentMode);
    return `# Current Mode: ${modeInfo.emoji} ${currentMode}

${modeInfo.description}

---

**Available modes:**

🤫 **quiet** - Only respond when asked
${currentMode === 'quiet' ? '   ← current' : ''}

👋 **nudge** - Gentle reminders and suggestions
${currentMode === 'nudge' ? '   ← current' : ''}

🏋️ **coach** - Proactive guidance and prompts
${currentMode === 'coach' ? '   ← current' : ''}

---

Use \`mode set="<mode>"\` to change.`;
  }

  // Validate new mode
  if (!['quiet', 'nudge', 'coach'].includes(newMode)) {
    throw new Error(`Invalid mode: ${newMode}. Must be quiet, nudge, or coach.`);
  }

  // Set new mode
  db.setSetting('proactivity_mode', newMode);

  const modeInfo = getModeInfo(newMode);
  const previousInfo = getModeInfo(currentMode);

  return `# Mode Changed: ${previousInfo.emoji} ${currentMode} → ${modeInfo.emoji} ${newMode}

${modeInfo.description}

---

**What this means:**

${modeInfo.behaviors.map((b) => `- ${b}`).join('\n')}

---

*Mode preference saved. It will persist across sessions.*`;
}

// ============================================================================
// HELPERS
// ============================================================================

interface ModeInfo {
  emoji: string;
  description: string;
  behaviors: string[];
}

function getModeInfo(mode: string): ModeInfo {
  const modes: Record<string, ModeInfo> = {
    quiet: {
      emoji: '🤫',
      description: 'Quiet mode: Claude will only respond when explicitly asked.',
      behaviors: [
        'No unsolicited suggestions',
        'No reminders about logging or capturing',
        'Tools return minimal output',
        'You drive all interactions',
      ],
    },
    nudge: {
      emoji: '👋',
      description: 'Nudge mode: Claude will offer gentle reminders and suggestions.',
      behaviors: [
        'Occasional reminders about time logging',
        'Suggestions when patterns emerge',
        'Weekly review prompts',
        'Balanced between helpful and hands-off',
      ],
    },
    coach: {
      emoji: '🏋️',
      description: 'Coach mode: Claude will proactively guide and prompt you.',
      behaviors: [
        'Daily check-ins and prompts',
        'Proactive learning suggestions',
        'Growth tracking reminders',
        'Regular reflection prompts',
        'Comprehensive feedback',
      ],
    },
  };

  return modes[mode] || modes.nudge;
}

// ============================================================================
// EXPORT
// ============================================================================

export const modeTool: ToolHandler = {
  definition,
  handler,
};
