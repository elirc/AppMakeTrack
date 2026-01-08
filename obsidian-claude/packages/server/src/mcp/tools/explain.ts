/**
 * Explain Tool - Learning prompt generator.
 *
 * This tool generates prompts that encourage deeper learning.
 * It's based on the Feynman Technique: if you can't explain
 * something simply, you don't understand it well enough.
 *
 * The tool prompts the user to explain concepts in their own words,
 * which surfaces gaps in understanding.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getVaultService } from '../../services/vault.js';
import type { ToolHandler } from '../server.js';

// ============================================================================
// TOOL DEFINITION
// ============================================================================

const definition: Tool = {
  name: 'explain',
  description: `Generate a learning prompt for a concept. Uses the Feynman Technique:
1. Pick a concept
2. Explain it simply (as if to a child)
3. Identify gaps in your explanation
4. Simplify and use analogies

Returns a structured prompt to guide your explanation. Your response becomes
a TIL or concept note.`,
  inputSchema: {
    type: 'object',
    properties: {
      concept: {
        type: 'string',
        description: 'The concept to explain',
      },
      context: {
        type: 'string',
        description: 'Optional context (e.g., "in the context of React")',
      },
      difficulty: {
        type: 'string',
        enum: ['basic', 'intermediate', 'advanced'],
        description: 'Target difficulty level. Default: intermediate',
      },
    },
    required: ['concept'],
  },
};

// ============================================================================
// HANDLER
// ============================================================================

async function handler(args: Record<string, unknown>): Promise<string> {
  const concept = args.concept as string;
  const context = args.context as string | undefined;
  const difficulty = (args.difficulty as string) || 'intermediate';

  if (!concept || concept.trim().length === 0) {
    throw new Error('Concept is required');
  }

  const contextStr = context ? ` (in the context of ${context})` : '';
  const difficultyPrompts = getDifficultyPrompts(difficulty);

  return `# Explain: ${concept}${contextStr}

## The Feynman Technique

You truly understand something when you can explain it simply.
Let's test your understanding of **${concept}**.

---

## Step 1: Simple Explanation

Explain ${concept} as if you were teaching someone who has never
heard of it before. Use plain language, no jargon.

**Your explanation:**
> (Write your explanation here)

---

## Step 2: Identify Gaps

What parts of your explanation felt unclear or hand-wavy?
Where did you struggle to find the right words?

**Gaps I noticed:**
> (List areas you're unsure about)

---

## Step 3: Go Deeper

${difficultyPrompts.questions}

---

## Step 4: Analogies

What real-world analogy could help explain ${concept}?
Think of something familiar that works the same way.

**Analogy:**
> "${concept} is like _____ because _____"

---

## Step 5: One-Sentence Summary

Now, condense everything into ONE clear sentence that captures
the essence of ${concept}.

**Summary:**
> (Your one-sentence explanation)

---

## Next Steps

1. Fill in your answers above
2. Research any gaps you identified
3. Use the 'capture' tool to save key insights
4. Use the 'process' tool to create a permanent concept note

---

*This prompt was generated to help deepen your understanding.
Teaching is the best way to learn.*`;
}

// ============================================================================
// HELPERS
// ============================================================================

function getDifficultyPrompts(difficulty: string): { questions: string } {
  switch (difficulty) {
    case 'basic':
      return {
        questions: `Answer these foundational questions:

1. **What is it?** Define it in your own words.
2. **Why does it exist?** What problem does it solve?
3. **When would you use it?** Give a simple example.`,
      };

    case 'advanced':
      return {
        questions: `Answer these advanced questions:

1. **How does it work internally?** Explain the mechanism.
2. **What are the trade-offs?** Pros and cons.
3. **When would you NOT use it?** Edge cases and limitations.
4. **How does it compare to alternatives?** Similar approaches.
5. **What's a non-obvious insight?** Something that surprises people.`,
      };

    case 'intermediate':
    default:
      return {
        questions: `Answer these intermediate questions:

1. **How does it work?** Explain the key mechanism.
2. **What problem does it solve?** Be specific.
3. **What are the main use cases?** Give 2-3 examples.
4. **What are common mistakes?** Pitfalls to avoid.`,
      };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const explainTool: ToolHandler = {
  definition,
  handler,
};
