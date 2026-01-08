/**
 * Projects Page
 *
 * Lists all projects with their status and time tracking.
 * Allows filtering by project status.
 */

import { useState } from 'react';
import { useProjects } from '../hooks/useApi';
import { PROJECT_STATUS_LABELS } from '@obsidian-claude/shared';
import styles from './Projects.module.css';

export function Projects() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { data: projects, loading, error } = useProjects();

  // Filter projects by status
  const filteredProjects = projects?.filter((project) => {
    if (statusFilter === 'all') return true;
    return project.status === statusFilter;
  });

  // Group by status for stats
  const statusCounts = projects?.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  ) || {};

  const statusFilters = [
    { value: 'all', label: 'All', icon: '📋' },
    { value: 'active', label: 'Active', icon: '🚀' },
    { value: 'paused', label: 'Paused', icon: '⏸️' },
    { value: 'completed', label: 'Completed', icon: '✅' },
    { value: 'archived', label: 'Archived', icon: '📦' },
  ];

  return (
    <div className={styles.projects}>
      {/* Stats */}
      <section className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>📋</span>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{projects?.length || 0}</span>
            <span className={styles.statLabel}>Total Projects</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>🚀</span>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{statusCounts.active || 0}</span>
            <span className={styles.statLabel}>Active</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>✅</span>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{statusCounts.completed || 0}</span>
            <span className={styles.statLabel}>Completed</span>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className={styles.filters}>
        {statusFilters.map((filter) => (
          <button
            key={filter.value}
            className={`${styles.filterButton} ${
              statusFilter === filter.value ? styles.filterButtonActive : ''
            }`}
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.icon} {filter.label}
            {filter.value !== 'all' && statusCounts[filter.value] !== undefined && (
              <span className={styles.filterCount}>
                {statusCounts[filter.value]}
              </span>
            )}
          </button>
        ))}
      </section>

      {/* Projects List */}
      <section className={styles.section}>
        {loading ? (
          <div className={styles.loading}>Loading projects...</div>
        ) : error ? (
          <div className={styles.error}>Error: {error}</div>
        ) : filteredProjects?.length === 0 ? (
          <div className={styles.empty}>
            <p>No projects found.</p>
            <p className={styles.hint}>
              Use the <code>project_create</code> MCP tool to create a project.
            </p>
          </div>
        ) : (
          <div className={styles.projectsList}>
            {filteredProjects?.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>

      {/* Tips */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Project Management Tips</h2>
        <div className={styles.tips}>
          <ul className={styles.tipsList}>
            <li>Use <code>project_create</code> to start tracking a new project</li>
            <li>Use <code>log_time project="name"</code> to track time</li>
            <li>Use <code>project_status</code> to view all projects</li>
            <li>Review project status in your weekly reviews</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// PROJECT CARD
// ============================================================================

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    description: string;
    status: string;
    createdAt: string;
  };
}

function ProjectCard({ project }: ProjectCardProps) {
  const statusLabel =
    PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS] ||
    project.status;
  const statusIcon = getStatusIcon(project.status);

  return (
    <div className={styles.projectCard}>
      <div className={styles.projectHeader}>
        <h3 className={styles.projectName}>{project.name}</h3>
        <span
          className={`${styles.statusBadge} ${
            styles[`status${capitalize(project.status)}`]
          }`}
        >
          {statusIcon} {statusLabel}
        </span>
      </div>

      <p className={styles.projectDescription}>
        {project.description || 'No description'}
      </p>

      <div className={styles.projectFooter}>
        <span className={styles.projectDate}>
          Created: {formatDate(project.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    active: '🚀',
    paused: '⏸️',
    completed: '✅',
    archived: '📦',
  };
  return icons[status] || '📋';
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
