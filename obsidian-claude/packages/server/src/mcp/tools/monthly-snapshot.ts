/**
 * Monthly Snapshot Tool - Generate growth snapshot for the month.
 *
 * This tool creates a point-in-time record of growth across all
 * competency dimensions. Snapshots enable:
 * - Tracking progress over time
 * - Identifying growth patterns
 * - Recognizing achievements
 * - Finding areas needing attention
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getVaultService } from '../../services/vault.js';
import { getDatabase } from '../../db/index.js';
import type { ToolHandler } from '../server.js';
import { COMPETENCY_DIMENSIONS, type CompetencyDimension } from '@obsidian-claude/shared';

// Label mapping for dimensions
const DIMENSION_LABELS: Record<CompetencyDimension, string> = {
  technical: 'Technical Skills',
  debugging: 'Debugging',
  codeQuality: 'Code Quality',
  architecture: 'Architecture',
  communication: 'Communication',
  ownership: 'Ownership',
  mentorship: 'Mentorship',
};

// ============================================================================
// TOOL DEFINITION
// ============================================================================

const definition: Tool = {
  name: 'monthly_snapshot',
  description: `Generate a monthly growth snapshot across all competency dimensions.

The snapshot records:
- Current level in each dimension (junior/mid/senior)
- Evidence collected this month
- Total evidence per dimension
- Progress since last snapshot

Creates a permanent record in the vault and database.`,
  inputSchema: {
    type: 'object',
    properties: {
      month: {
        type: 'string',
        description: 'Month in YYYY-MM format. Defaults to current month.',
      },
    },
    required: [],
  },
};

// ============================================================================
// HANDLER
// ============================================================================

async function handler(args: Record<string, unknown>): Promise<string> {
  const vault = getVaultService();
  const db = getDatabase();

  // Parse month
  let monthStr: string;
  if (args.month && typeof args.month === 'string') {
    monthStr = args.month;
  } else {
    const now = new Date();
    monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  // Check for existing snapshot
  const existingSnapshots = db.getSnapshots();
  const existing = existingSnapshots.find((s) => s.month === monthStr);
  if (existing) {
    return `A snapshot already exists for ${monthStr}.

To view it, check the monthly snapshots folder in your vault.
To regenerate, delete the existing snapshot first.`;
  }

  // Get all evidence
  const allEvidence = db.getAllEvidence();

  // Calculate levels
  const dimensionData: Array<{
    dimension: CompetencyDimension;
    label: string;
    total: number;
    level: string;
    thisMonth: number;
  }> = [];

  for (const dim of COMPETENCY_DIMENSIONS) {
    const dimEvidence = allEvidence.filter((e) => e.dimension === dim);
    const total = dimEvidence.length;
    const level = getLevel(total);

    // Count evidence from this month
    const monthStart = `${monthStr}-01`;
    const monthEnd = `${monthStr}-31`; // Simplified, works for comparison
    const thisMonth = dimEvidence.filter(
      (e) => e.date >= monthStart && e.date <= monthEnd
    ).length;

    dimensionData.push({
      dimension: dim,
      label: DIMENSION_LABELS[dim],
      total,
      level,
      thisMonth,
    });
  }

  // Get previous snapshot for comparison
  const previousSnapshot = existingSnapshots
    .filter((s) => s.month < monthStr)
    .sort((a, b) => b.month.localeCompare(a.month))[0];

  // Build dimension breakdown
  const dimensionBreakdown = dimensionData
    .map((d) => {
      const levelEmoji = getLevelEmoji(d.level);
      const changeStr = d.thisMonth > 0 ? ` (+${d.thisMonth} this month)` : '';
      return `| ${d.label} | ${levelEmoji} ${d.level} | ${d.total}${changeStr} |`;
    })
    .join('\n');

  // Calculate overall stats
  const totalEvidence = dimensionData.reduce((sum, d) => sum + d.total, 0);
  const totalThisMonth = dimensionData.reduce((sum, d) => sum + d.thisMonth, 0);
  const averageLevel = calculateAverageLevel(dimensionData);

  // Save snapshot to database
  const snapshotData = {
    month: monthStr,
    dimensions: dimensionData.map((d) => ({
      dimension: d.dimension,
      level: d.level,
      evidenceCount: d.total,
    })),
  };

  db.saveSnapshot(snapshotData);

  // Create vault note
  const snapshotContent = buildSnapshotNote(
    monthStr,
    dimensionData,
    totalEvidence,
    totalThisMonth,
    averageLevel,
    previousSnapshot
  );

  const filename = `${monthStr}-snapshot.md`;
  await vault.createNote('growth/snapshots', filename, {
    title: `Growth Snapshot: ${monthStr}`,
    type: 'monthly-snapshot' as any,
    content: snapshotContent,
    tags: ['growth', 'snapshot'],
  });

  return `# Monthly Snapshot: ${monthStr}

## Overview

**Total Evidence:** ${totalEvidence} items
**Added This Month:** ${totalThisMonth} items
**Average Level:** ${averageLevel}

## Dimensions

| Dimension | Level | Evidence |
|-----------|-------|----------|
${dimensionBreakdown}

---

${getInsights(dimensionData, previousSnapshot)}

---

Snapshot saved to growth/snapshots/${filename}`;
}

// ============================================================================
// HELPERS
// ============================================================================

function getLevel(evidenceCount: number): string {
  if (evidenceCount >= 20) return 'senior';
  if (evidenceCount >= 10) return 'mid';
  return 'junior';
}

function getLevelEmoji(level: string): string {
  const emojis: Record<string, string> = {
    junior: '🌱',
    mid: '🌿',
    senior: '🌳',
  };
  return emojis[level] || '📊';
}

function calculateAverageLevel(
  data: Array<{ level: string }>
): string {
  const levelValues: Record<string, number> = {
    junior: 1,
    mid: 2,
    senior: 3,
  };

  const sum = data.reduce((acc, d) => acc + levelValues[d.level], 0);
  const avg = sum / data.length;

  if (avg >= 2.5) return 'senior';
  if (avg >= 1.5) return 'mid';
  return 'junior';
}

function getInsights(
  data: Array<{ dimension: string; label: string; total: number; thisMonth: number }>,
  previousSnapshot: any | undefined
): string {
  const insights: string[] = [];

  // Find strongest and weakest
  const sorted = [...data].sort((a, b) => b.total - a.total);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  insights.push(`**Strongest Area:** ${strongest.label} (${strongest.total} evidence)`);
  insights.push(`**Growth Opportunity:** ${weakest.label} (${weakest.total} evidence)`);

  // Most active this month
  const mostActive = [...data].sort((a, b) => b.thisMonth - a.thisMonth)[0];
  if (mostActive.thisMonth > 0) {
    insights.push(`**Most Active:** ${mostActive.label} (+${mostActive.thisMonth} this month)`);
  }

  // Compare to previous
  if (previousSnapshot) {
    insights.push(`\n**Compared to ${previousSnapshot.month}:** Progress tracking available`);
  } else {
    insights.push('\n*This is your first snapshot - future ones will show progress.*');
  }

  return '## Insights\n\n' + insights.join('\n');
}

function buildSnapshotNote(
  month: string,
  data: Array<{ dimension: string; label: string; level: string; total: number; thisMonth: number }>,
  totalEvidence: number,
  totalThisMonth: number,
  averageLevel: string,
  previousSnapshot: any | undefined
): string {
  const dimensionTable = data
    .map((d) => `| ${d.label} | ${d.level} | ${d.total} | ${d.thisMonth} |`)
    .join('\n');

  return `# Growth Snapshot: ${month}

## Summary

- **Total Evidence:** ${totalEvidence}
- **Added This Month:** ${totalThisMonth}
- **Average Level:** ${averageLevel}

## Dimensions

| Dimension | Level | Total | This Month |
|-----------|-------|-------|------------|
${dimensionTable}

## Reflections

*Add your reflections on growth this month:*

### What improved?

### What needs focus?

### Goals for next month?

---

*Generated on ${new Date().toISOString().split('T')[0]}*`;
}

// ============================================================================
// EXPORT
// ============================================================================

export const monthlySnapshotTool: ToolHandler = {
  definition,
  handler,
};
