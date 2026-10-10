'use client';

import React from 'react';
import { useStoreContext } from '@/context/StoreContext';

interface HeaderProps {
  onMenuToggle: () => void;
  title?: string;
}

import { useAuthContext } from '@/context/AuthContext';

export function Header({ onMenuToggle, title }: HeaderProps) {
  const { store } = useStoreContext();
  const { user } = useAuthContext();

  return (
    <header className="shell-header" id="app-header">
      <div className="shell-header-left">
        <button className="shell-mobile-hamburger" onClick={onMenuToggle} aria-label="Toggle navigation menu">
          <span className="material-symbols-outlined">menu</span>
        </button>

        {store && (
          <div className="shell-header-chip">
            <span className="header-store-chip__dot" aria-hidden="true" />
            <span>{store.name}</span>
            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-ink-secondary)' }}>expand_more</span>
          </div>
        )}

        <div className="shell-header-shift">
          <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--color-ink-secondary)' }}>schedule</span>
          <span className="shell-header-shift-text">Shift #1 • Open</span>
        </div>
      </div>

      <div className="shell-header-right">
        <div className="shell-header-search">
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-ink-secondary)' }}>search</span>
          <span className="shell-header-search-input">Search orders, items...</span>
          <kbd className="shell-header-kbd">⌘K</kbd>
        </div>

        <button className="shell-header-btn">
          <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>notifications</span>
          <span className="shell-header-badge"></span>
        </button>

        <div className="shell-header-divider"></div>

        {user && (
          <button className="shell-header-user">
            <div className="shell-header-avatar">
               {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="shell-header-user-info">
              <span className="shell-header-user-name">{user.name}</span>
              <span className="shell-header-user-role">{user.role}</span>
            </div>
          </button>
        )}
      </div>
    </header>
  );
}
