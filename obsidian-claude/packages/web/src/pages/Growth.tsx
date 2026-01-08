/**
 * Growth Tracking Page
 *
 * Displays the competency matrix and evidence tracking.
 * Shows progress across all growth dimensions.
 */

import { useGrowthSummary } from '../hooks/useApi';
import {
  COMPETENCY_DIMENSIONS,
  COMPETENCY_LABELS,
  COMPETENCY_DESCRIPTIONS,
  type CompetencyDimension
} from '@obsidian-claude/shared';
import styles from './Growth.module.css';

export function Growth() {
  const { data, loading, error } = useGrowthSummary();

  // Merge API data with dimension definitions
  const dimensions = COMPETENCY_DIMENSIONS.map((dim) => {
    const apiData = data?.dimensions.find((d) => d.id === dim);
    return {
      id: dim,
      label: COMPETENCY_LABELS[dim],
      description: COMPETENCY_DESCRIPTIONS[dim],
      count: apiData?.count || 0,
      level: apiData?.level || 'junior',
    };
  });

  const totalEvidence = dimensions.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className={styles.growth}>
      {/* Overview */}
      <section className={styles.overview}>
        <h2 className={styles.sectionTitle}>Growth Overview</h2>
        <div className={styles.overviewStats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{totalEvidence}</span>
            <span className={styles.statLabel}>Total Evidence</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {dimensions.filter((d) => d.level === 'senior').length}
            </span>
            <span className={styles.statLabel}>Senior Dimensions</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {dimensions.filter((d) => d.level === 'mid').length}
            </span>
            <span className={styles.statLabel}>Mid Dimensions</span>
          </div>
        </div>
      </section>

      {/* Competency Matrix */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Competency Matrix</h2>

        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : error ? (
          <div className={styles.error}>Error: {error}</div>
        ) : (
          <div className={styles.matrix}>
            {dimensions.map((dim) => (
              <DimensionCard
                key={dim.id}
                dimension={dim}
              />
            ))}
          </div>
        )}
      </section>

      {/* Level Legend */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Level Guidelines</h2>
        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <span className={`${styles.levelBadge} ${styles.levelJunior}`}>
              🌱 Junior
            </span>
            <span className={styles.legendDescription}>
              0-9 evidence items. Learning fundamentals.
            </span>
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.levelBadge} ${styles.levelMid}`}>
              🌿 Mid
            </span>
            <span className={styles.legendDescription}>
              10-19 evidence items. Consistent application.
            </span>
          </div>
          <div className={styles.legendItem}>
            <span className={`${styles.levelBadge} ${styles.levelSenior}`}>
              🌳 Senior
            </span>
            <span className={styles.legendDescription}>
              20+ evidence items. Teaching others.
            </span>
          </div>
        </div>
      </section>

      {/* Tips */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How to Add Evidence</h2>
        <div className={styles.tips}>
          <p>Evidence is collected through your daily work:</p>
          <ul className={styles.tipsList}>
            <li>Document solutions when you solve problems</li>
            <li>Record decisions and their rationale</li>
            <li>Note what you learn each day (TILs)</li>
            <li>Reflect on failures and lessons learned</li>
            <li>Use weekly reviews to process raw captures</li>
          </ul>
          <p className={styles.tipsNote}>
            Use the <code>monthly_snapshot</code> MCP tool to generate growth reports.
          </p>
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// DIMENSION CARD
// ============================================================================

interface DimensionCardProps {
  dimension: {
    id: string;
    label: string;
    description: string;
    count: number;
    level: string;
  };
}

function DimensionCard({ dimension }: DimensionCardProps) {
  const { label, description, count, level } = dimension;
  const progress = Math.min(count / 20, 1) * 100;
  const nextMilestone = level === 'junior' ? 10 : level === 'mid' ? 20 : null;

  return (
    <div className={styles.dimensionCard}>
      <div className={styles.dimensionHeader}>
        <h3 className={styles.dimensionTitle}>{label}</h3>
        <span className={`${styles.levelBadge} ${styles[`level${capitalize(level)}`]}`}>
          {getLevelIcon(level)} {level}
        </span>
      </div>

      <p className={styles.dimensionDescription}>{description}</p>

      <div className={styles.progressSection}>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className={styles.progressLabel}>
          <span>{count} evidence</span>
          {nextMilestone && (
            <span className={styles.nextMilestone}>
              {nextMilestone - count} to next level
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getLevelIcon(level: string): string {
  const icons: Record<string, string> = {
    junior: '🌱',
    mid: '🌿',
    senior: '🌳',
  };
  return icons[level] || '📊';
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
