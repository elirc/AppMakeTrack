/**
 * Note Detail Page
 *
 * Shows a single note with its full content.
 * Displays metadata, content, and backlinks.
 */

import { useLocation } from 'react-router-dom';
import { useNote } from '../hooks/useApi';
import { NOTE_TYPE_LABELS, NOTE_STATUS_LABELS } from '@obsidian-claude/shared';
import styles from './NoteDetail.module.css';

export function NoteDetail() {
  const location = useLocation();
  // Extract note ID from path (everything after /notes/)
  const noteId = location.pathname.replace('/notes/', '');

  const { data: note, loading, error } = useNote(noteId);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Loading note...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <h2>Note not found</h2>
        <p>{error}</p>
        <a href="/notes" className={styles.backLink}>
          ← Back to Notes
        </a>
      </div>
    );
  }

  if (!note) {
    return (
      <div className={styles.error}>
        <h2>Note not found</h2>
        <a href="/notes" className={styles.backLink}>
          ← Back to Notes
        </a>
      </div>
    );
  }

  const typeLabel = NOTE_TYPE_LABELS[note.type as keyof typeof NOTE_TYPE_LABELS] || note.type;
  const statusLabel = NOTE_STATUS_LABELS[note.status as keyof typeof NOTE_STATUS_LABELS] || note.status;

  return (
    <div className={styles.noteDetail}>
      {/* Navigation */}
      <nav className={styles.breadcrumb}>
        <a href="/notes">Notes</a>
        <span className={styles.separator}>/</span>
        <span>{note.title}</span>
      </nav>

      {/* Note Header */}
      <header className={styles.header}>
        <div className={styles.meta}>
          <span className={styles.type}>
            {getTypeIcon(note.type)} {typeLabel}
          </span>
          {note.status && (
            <span className={styles.status}>
              {getStatusIcon(note.status)} {statusLabel}
            </span>
          )}
        </div>

        <h1 className={styles.title}>{note.title}</h1>

        <div className={styles.dates}>
          <span>Created: {formatDate(note.createdAt)}</span>
          <span>Modified: {formatDate(note.modifiedAt)}</span>
        </div>

        {note.tags.length > 0 && (
          <div className={styles.tags}>
            {note.tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                #{tag}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Note Content */}
      <article className={styles.content}>
        <SimpleMarkdown content={note.body} />
      </article>

      {/* Actions */}
      <footer className={styles.actions}>
        <button className={styles.actionButton}>
          Open in Obsidian
        </button>
        <span className={styles.path}>{note.id}</span>
      </footer>
    </div>
  );
}

// ============================================================================
// SIMPLE MARKDOWN RENDERER
// ============================================================================

interface SimpleMarkdownProps {
  content: string;
}

function SimpleMarkdown({ content }: SimpleMarkdownProps) {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let key = 0;
  let inCodeBlock = false;
  let codeContent: string[] = [];

  for (const line of lines) {
    key++;

    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={key} className={styles.codeBlock}>
            <code>{codeContent.join('\n')}</code>
          </pre>
        );
        codeContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

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
    // Lists
    else if (line.startsWith('- ')) {
      elements.push(
        <li key={key} className={styles.listItem}>
          {line.slice(2)}
        </li>
      );
    }
    // Numbered lists
    else if (line.match(/^\d+\. /)) {
      elements.push(
        <li key={key} className={styles.listItem}>
          {line.replace(/^\d+\. /, '')}
        </li>
      );
    }
    // Blockquotes
    else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={key} className={styles.blockquote}>
          {line.slice(2)}
        </blockquote>
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
          {renderInlineFormatting(line)}
        </p>
      );
    }
  }

  return <>{elements}</>;
}

function renderInlineFormatting(text: string): React.ReactNode {
  // Simple inline code replacement
  const parts = text.split(/`([^`]+)`/);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className={styles.inlineCode}>
        {part}
      </code>
    ) : (
      part
    )
  );
}

// ============================================================================
// HELPERS
// ============================================================================

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

function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    seedling: '🌱',
    growing: '🌿',
    evergreen: '🌳',
  };
  return icons[status] || '';
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
