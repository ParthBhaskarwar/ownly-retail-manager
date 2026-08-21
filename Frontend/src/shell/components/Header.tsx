'use client';

import React from 'react';
import { useStoreContext } from '@/context/StoreContext';

interface HeaderProps {
  onMenuToggle: () => void;
  title?: string;
}

export function Header({ onMenuToggle, title }: HeaderProps) {
  const { store } = useStoreContext();

  return (
    <header className="app-header" id="app-header">
      {/* Mobile hamburger */}
      <button
        className="header-menu-btn"
        onClick={onMenuToggle}
        aria-label="Toggle navigation menu"
        id="header-menu-toggle"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 5h16M2 10h16M2 15h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Page title / breadcrumb */}
      <div className="header-title">
        {title && <h1 className="header-page-title">{title}</h1>}
      </div>

      {/* Store name chip */}
      {store && (
        <div className="header-store-chip">
          <span className="header-store-chip__dot" aria-hidden="true" />
          <span className="header-store-chip__name">{store.name}</span>
        </div>
      )}
    </header>
  );
}
