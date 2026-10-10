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
      <div
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`shell-sidebar ${isOpen ? 'open' : ''}`} id="sidebar" aria-label="Main navigation">
        <div className="shell-sidebar-top">
          <div className="shell-sidebar-logo">
            <img 
              alt="Ownly Retail Logo" 
              src="https://lh3.googleusercontent.com/aida/AEtjO1Ug834MoQjE9U6zQ0nlJsRvydhtLJTWwAaN94FC7dO4m-amUCn0aK4jS0Q5-uHbnoZgCThXGRi8reNFTplJxXe_oWiFdkQbhLPXe0Rpy0n5RQTbrdX919y9tUA0Zw9V_8Ig0zqVGPAkBrsa-UBCjFzUBHYsieOKLXmFv7f66sItKh1x3QiZXLiYQsIOWJsAiaTcneXn95JslNm9CPsnWI4oC2_bYJS0YwMDu269lzJoGRaEOT_KUPKF" 
            />
            <div className="shell-sidebar-logo-text">
              <span className="shell-sidebar-logo-title">Ownly</span>
              <span className="shell-sidebar-logo-subtitle">Retail Manager</span>
            </div>
          </div>

          <nav className="shell-sidebar-nav" aria-label="Primary navigation">
            {Array.from(sections.entries()).map(([section, items]) => (
              <div key={section} className="shell-sidebar-nav-group">
                <div className="shell-sidebar-nav-group-title">{sectionLabels[section] ?? section}</div>
                {items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      id={item.id}
                      className={`shell-sidebar-nav-item ${isActive ? 'active' : ''}`}
                      onClick={onClose}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="sidebar-nav-item__badge">{item.badge}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="shell-sidebar-footer">
          <div className="shell-sidebar-sync">
            <span className="shell-sidebar-sync-status">
              <span className="shell-sidebar-sync-dot"></span>
              Online Sync
            </span>
            <span>v2.4.1</span>
          </div>
        </div>
      </aside>
    </>
  );
}
