/**
 * Daily Note Page
 *
 * Shows today's daily note (or a specific date).
 * Renders the markdown content with sections highlighted.
 */

import { useParams } from 'react-router-dom';
import { useDailyNote } from '../hooks/useApi';
import styles from './Daily.module.css';

export function Daily() {
  const { date } = useParams<{ date?: string }>();
  const { data: note, loading, error } = useDailyNote(date);

  // Date navigation
  const today = new Date().toISOString().split('T')[0];
  const selectedDate = date || today;
  const displayDate = new Date(selectedDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Loading daily note...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>Error loading daily note: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className={styles.daily}>
      {/* Date Navigation */}
      <div className={styles.dateNav}>
        <button
          className={styles.dateButton}
          onClick={() => navigateDay(-1, selectedDate)}
        >
          ← Previous
        </button>
        <span className={styles.dateDisplay}>{displayDate}</span>
        <button
          className={styles.dateButton}
          onClick={() => navigateDay(1, selectedDate)}
          disabled={selectedDate >= today}
        >
          Next →
        </button>
      </div>

      {/* Daily Note Content */}
      <article className={styles.noteContent}>
        <h1 className={styles.noteTitle}>{note?.title || 'Daily Note'}</h1>

        {note?.body ? (
          <div className={styles.markdown}>
            <MarkdownRenderer content={note.body} />
          </div>
        ) : (
          <div className={styles.empty}>
            <p>No content yet for this day.</p>
            <p className={styles.hint}>
              Use Claude Code with the <code>capture</code> tool to add content!
            </p>
          </div>
        )}
      </article>

      {/* Quick Tips */}
      <aside className={styles.tips}>
        <h3 className={styles.tipsTitle}>Quick Tips</h3>
        <ul className={styles.tipsList}>
          <li>Use <code>capture section="plan"</code> to add tasks</li>
          <li>Use <code>capture section="wins"</code> to record wins</li>
          <li>Use <code>capture section="learned"</code> for TILs</li>
          <li>Use <code>log_time</code> to track time</li>
        </ul>
      </aside>
    </div>
  );
}

// ============================================================================
// MARKDOWN RENDERER (Simple)
// ============================================================================

interface MarkdownRendererProps {
  content: string;
}

function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Simple markdown parsing - in production, use a proper library
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let key = 0;

  for (const line of lines) {
    key++;

    // Headers
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={key} className={styles.h2}>
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={key} className={styles.h3}>
          {line.slice(4)}
        </h3>
      );
    }
    // Task items
    else if (line.startsWith('- [ ] ')) {
      elements.push(
        <div key={key} className={styles.task}>
          <input type="checkbox" disabled />
          <span>{line.slice(6)}</span>
        </div>
      );
    } else if (line.startsWith('- [x] ')) {
      elements.push(
        <div key={key} className={`${styles.task} ${styles.taskDone}`}>
          <input type="checkbox" checked disabled />
          <span>{line.slice(6)}</span>
        </div>
      );
    }
    // List items
    else if (line.startsWith('- ')) {
      elements.push(
        <li key={key} className={styles.listItem}>
          {line.slice(2)}
        </li>
      );
    }
    // Time log entries (formatted as "- HH:MM | duration | activity")
    else if (line.match(/^- \d{2}:\d{2} \|/)) {
      const parts = line.slice(2).split(' | ');
      elements.push(
        <div key={key} className={styles.timeEntry}>
          <span className={styles.timeTime}>{parts[0]}</span>
          <span className={styles.timeDuration}>{parts[1]}</span>
          <span className={styles.timeActivity}>{parts[2]}</span>
        </div>
      );
    }
    // Empty lines
    else if (line.trim() === '') {
      elements.push(<br key={key} />);
    }
    // Regular paragraphs
    else if (line.trim()) {
      elements.push(
        <p key={key} className={styles.paragraph}>
          {line}
        </p>
      );
    }
  }

  return <>{elements}</>;
}

// ============================================================================
// HELPERS
// ============================================================================

function navigateDay(offset: number, currentDate: string): void {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + offset);
  const newDate = date.toISOString().split('T')[0];
  window.location.href = `/daily/${newDate}`;
}
