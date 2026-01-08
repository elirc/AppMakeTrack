/**
 * Dashboard Page
 *
 * The main landing page showing:
 * - Quick stats overview
 * - Recent activity
 * - Today's time summary
 * - Growth progress snapshot
 */

import { useStats, useNotes, useTimeToday } from '../hooks/useApi';
import styles from './Dashboard.module.css';

export function Dashboard() {
  const { data: stats, loading: statsLoading } = useStats();
  const { data: notesData, loading: notesLoading } = useNotes({ limit: 5 });
  const { data: timeData, loading: timeLoading } = useTimeToday();

  return (
    <div className={styles.dashboard}>
      {/* Stats Cards */}
      <section className={styles.statsSection}>
        <h2 className={styles.sectionTitle}>Overview</h2>
        <div className={styles.statsGrid}>
          <StatCard
            icon="📝"
            label="Total Notes"
            value={stats?.totalNotes ?? '-'}
            loading={statsLoading}
          />
          <StatCard
            icon="📅"
            label="Notes Today"
            value={stats?.notesToday ?? '-'}
            loading={statsLoading}
          />
          <StatCard
            icon="📁"
            label="Active Projects"
            value={stats?.activeProjects ?? '-'}
            loading={statsLoading}
          />
          <StatCard
            icon="⏱️"
            label="Time This Week"
            value={stats?.timeThisWeek ? formatMinutes(stats.timeThisWeek) : '-'}
            loading={statsLoading}
          />
        </div>
      </section>

      {/* Two Column Layout */}
      <div className={styles.columns}>
        {/* Recent Notes */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Recent Notes</h2>
          {notesLoading ? (
            <div className={styles.loading}>Loading...</div>
          ) : notesData?.notes.length === 0 ? (
            <div className={styles.empty}>
              No notes yet. Start by capturing something!
            </div>
          ) : (
            <ul className={styles.notesList}>
              {notesData?.notes.map((note) => (
                <li key={note.id} className={styles.noteItem}>
                  <span className={styles.noteIcon}>
                    {getTypeIcon(note.type)}
                  </span>
                  <div className={styles.noteContent}>
                    <a href={`/notes/${note.id}`} className={styles.noteTitle}>
                      {note.title}
                    </a>
                    <span className={styles.noteExcerpt}>{note.excerpt}</span>
                  </div>
                  <span className={styles.noteDate}>
                    {formatDate(note.modifiedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Today's Time */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Today's Time</h2>
          {timeLoading ? (
            <div className={styles.loading}>Loading...</div>
          ) : !timeData?.entries || timeData.entries.length === 0 ? (
            <div className={styles.empty}>
              No time logged today. Use the MCP tools to track time!
            </div>
          ) : (
            <>
              <div className={styles.timeTotal}>
                <span className={styles.timeTotalLabel}>Total:</span>
                <span className={styles.timeTotalValue}>
                  {formatMinutes(timeData.totalMinutes)}
                </span>
              </div>
              <ul className={styles.timeList}>
                {timeData.entries.map((entry) => (
                  <li key={entry.id} className={styles.timeItem}>
                    <span className={styles.timeDuration}>
                      {formatMinutes(entry.duration)}
                    </span>
                    <span className={styles.timeActivity}>{entry.activity}</span>
                    {entry.project && (
                      <span className={styles.timeProject}>{entry.project}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* Quick Actions */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
        <div className={styles.actions}>
          <a href="/daily" className={styles.actionButton}>
            📅 Open Daily Note
          </a>
          <a href="/notes" className={styles.actionButton}>
            📝 Browse Notes
          </a>
          <a href="/growth" className={styles.actionButton}>
            🌱 View Growth
          </a>
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  loading?: boolean;
}

function StatCard({ icon, label, value, loading }: StatCardProps) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statIcon}>{icon}</span>
      <div className={styles.statContent}>
        <span className={styles.statValue}>
          {loading ? '...' : value}
        </span>
        <span className={styles.statLabel}>{label}</span>
      </div>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function getTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    concept: '💡',
    solution: '🔧',
    decision: '⚖️',
    til: '📚',
    failure: '❌',
    daily: '📅',
  };
  return icons[type] || '📄';
}
