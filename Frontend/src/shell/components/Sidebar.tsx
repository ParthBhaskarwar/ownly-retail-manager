'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNavigation } from '@/shell/hooks/useNavigation';
import { useAuthContext } from '@/context/AuthContext';
import { RoleBadge } from '@/shared/components/Badge';
import type { Role } from '@/modules/account/types';

const sectionLabels: Record<string, string> = {
  main:     'Main',
  store:    'Store',
  people:   'People',
  insights: 'Insights',
  system:   'System',
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { sections } = useNavigation();
  const { user, logout } = useAuthContext();
  const pathname = usePathname();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`app-sidebar ${isOpen ? 'open' : ''}`} id="sidebar" aria-label="Main navigation">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand__logo">O</div>
          <div className="sidebar-brand__text">
            <span className="sidebar-brand__name">Ownly</span>
            <span className="sidebar-brand__tagline">Retail Manager</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {Array.from(sections.entries()).map(([section, items]) => (
            <div key={section} className="sidebar-section">
              <span className="sidebar-section__label">{sectionLabels[section] ?? section}</span>
              <ul>
                {items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        id={item.id}
                        className={`sidebar-nav-item ${isActive ? 'sidebar-nav-item--active' : ''}`}
                        onClick={onClose}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <span className="sidebar-nav-item__icon" aria-hidden="true">{item.icon}</span>
                        <span className="sidebar-nav-item__label">{item.label}</span>
                        {item.badge && (
                          <span className="sidebar-nav-item__badge">{item.badge}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* User profile */}
        {user && (
          <div className="sidebar-footer">
            <div className="sidebar-user">
              <div className="sidebar-user__avatar">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="sidebar-user__info">
                <span className="sidebar-user__name">{user.name}</span>
                <RoleBadge role={user.role as Role} />
              </div>
            </div>
            <button
              id="sidebar-logout-btn"
              className="sidebar-logout"
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 2.75C2 1.784 2.784 1 3.75 1h5.5a.75.75 0 0 1 0 1.5h-5.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h5.5a.75.75 0 0 1 0 1.5h-5.5A1.75 1.75 0 0 1 2 13.25V2.75zm10.44 4.5-1.97-1.97a.75.75 0 0 0-1.06 1.06l.72.72H6.75a.75.75 0 0 0 0 1.5h3.38l-.72.72a.75.75 0 1 0 1.06 1.06l1.97-1.97a.75.75 0 0 0 0-1.06z"/>
              </svg>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
