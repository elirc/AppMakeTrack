/**
 * Layout Component
 *
 * Provides the consistent page structure:
 * - Sidebar navigation
 * - Header with search
 * - Main content area
 */

import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import styles from './Layout.module.css';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/daily', label: 'Daily Note', icon: '📅' },
    { path: '/notes', label: 'Notes', icon: '📝' },
    { path: '/growth', label: 'Growth', icon: '🌱' },
    { path: '/projects', label: 'Projects', icon: '📁' },
  ];

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>🔮</span>
          <span className={styles.logoText}>Obsidian Claude</span>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.modeIndicator}>
            <span className={styles.modeIcon}>👋</span>
            <span className={styles.modeLabel}>Nudge Mode</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.pageTitle}>
            {getPageTitle(location.pathname)}
          </h1>

          <div className={styles.headerActions}>
            <input
              type="search"
              placeholder="Search notes..."
              className={styles.searchInput}
            />
          </div>
        </header>

        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}

function getPageTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard';
  if (pathname.startsWith('/daily')) return 'Daily Note';
  if (pathname.startsWith('/notes')) return 'Notes';
  if (pathname === '/growth') return 'Growth Tracking';
  if (pathname === '/projects') return 'Projects';
  return 'Obsidian Claude';
}
