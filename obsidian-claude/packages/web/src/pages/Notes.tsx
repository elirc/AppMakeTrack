/**
 * Notes Browser Page
 *
 * Lists all notes with filtering by type and tags.
 * Provides search and navigation to individual notes.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNotes } from '../hooks/useApi';
import { NOTE_TYPE_LABELS, NOTE_STATUS_LABELS } from '@obsidian-claude/shared';
import styles from './Notes.module.css';

export function Notes() {
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, loading, error } = useNotes({
    type: typeFilter || undefined,
    limit: 50,
  });

  // Filter by search query (client-side for now)
  const filteredNotes = data?.notes.filter((note) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      note.title.toLowerCase().includes(query) ||
      note.excerpt.toLowerCase().includes(query) ||
      note.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  const noteTypes = [
    { value: '', label: 'All Types' },
    { value: 'concept', label: '💡 Concepts' },
    { value: 'solution', label: '🔧 Solutions' },
    { value: 'decision', label: '⚖️ Decisions' },
    { value: 'til', label: '📚 TILs' },
    { value: 'failure', label: '❌ Failures' },
    { value: 'daily', label: '📅 Daily Notes' },
  ];

  return (
    <div className={styles.notes}>
      {/* Filters */}
      <div className={styles.filters}>
        <input
          type="search"
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />

        <div className={styles.typeFilters}>
          {noteTypes.map((type) => (
            <button
              key={type.value}
              className={`${styles.typeButton} ${
                typeFilter === type.value ? styles.typeButtonActive : ''
              }`}
              onClick={() => setTypeFilter(type.value)}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results Summary */}
      <div className={styles.summary}>
        {loading ? (
          'Loading...'
        ) : (
          <>
            Showing {filteredNotes?.length || 0} of {data?.total || 0} notes
          </>
        )}
      </div>

      {/* Notes List */}
      {loading ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
        </div>
      ) : error ? (
        <div className={styles.error}>
          Error loading notes: {error}
        </div>
      ) : filteredNotes?.length === 0 ? (
        <div className={styles.empty}>
          <p>No notes found.</p>
          {searchQuery && (
            <p className={styles.hint}>
              Try a different search term or clear filters.
            </p>
          )}
        </div>
      ) : (
        <div className={styles.notesList}>
          {filteredNotes?.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// NOTE CARD COMPONENT
// ============================================================================

interface NoteCardProps {
  note: {
    id: string;
    title: string;
    type: string;
    status: string;
    tags: string[];
    excerpt: string;
    modifiedAt: string;
  };
}

function NoteCard({ note }: NoteCardProps) {
  const typeIcon = getTypeIcon(note.type);
  const statusIcon = getStatusIcon(note.status);
  const typeLabel = NOTE_TYPE_LABELS[note.type as keyof typeof NOTE_TYPE_LABELS] || note.type;

  return (
    <Link to={`/notes/${note.id}`} className={styles.noteCard}>
      <div className={styles.noteHeader}>
        <span className={styles.noteType}>
          {typeIcon} {typeLabel}
        </span>
        {note.status && (
          <span className={styles.noteStatus}>
            {statusIcon}
          </span>
        )}
      </div>

      <h3 className={styles.noteTitle}>{note.title}</h3>

      <p className={styles.noteExcerpt}>{note.excerpt}</p>

      <div className={styles.noteFooter}>
        <div className={styles.noteTags}>
          {note.tags.slice(0, 3).map((tag) => (
            <span key={tag} className={styles.noteTag}>
              #{tag}
            </span>
          ))}
          {note.tags.length > 3 && (
            <span className={styles.noteTagMore}>
              +{note.tags.length - 3}
            </span>
          )}
        </div>

        <span className={styles.noteDate}>
          {formatDate(note.modifiedAt)}
        </span>
      </div>
    </Link>
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
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
