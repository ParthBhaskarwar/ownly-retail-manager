'use client';

import { useMemo } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { evaluatePermission, PermissionKey } from '@/config/permissions';
import type { Role } from '@/modules/account/types';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  permissionKey: PermissionKey | null; // null = always visible
  badge?: string;
  section?: string;
}

const ALL_NAV_ITEMS: NavItem[] = [
  // Main
  {
    id: 'nav-dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    icon: '◈',
    permissionKey: 'dashboard:view',
    section: 'main',
  },
  // POS Billing
  {
    id: 'nav-billing',
    label: 'POS Billing',
    href: '/billing',
    icon: '⊟',
    permissionKey: 'billing:view',
    section: 'store',
  },
  // Invoices History
  {
    id: 'nav-invoices',
    label: 'Invoices & Receipts',
    href: '/invoices',
    icon: '📄',
    permissionKey: 'billing:view',
    section: 'store',
  },
  // Returns
  {
    id: 'nav-returns',
    label: 'Returns & Refunds',
    href: '/returns',
    icon: '↩',
    permissionKey: 'returns:create',
    section: 'store',
  },
  // Exchanges
  {
    id: 'nav-exchanges',
    label: 'Product Exchanges',
    href: '/exchanges',
    icon: '⇄',
    permissionKey: 'exchanges:create',
    section: 'store',
  },
  // Products
  {
    id: 'nav-products',
    label: 'Products',
    href: '/products',
    icon: '⊞',
    permissionKey: 'inventory:view',
    section: 'store',
  },
  // Manual Restock
  {
    id: 'nav-restock',
    label: 'Restock',
    href: '/restock',
    icon: '⚡',
    permissionKey: 'inventory:edit',
    section: 'store',
  },
  // Week 7 — AI-assisted restock
  {
    id: 'nav-ai-restock',
    label: 'AI Restock',
    href: '/ai-restock',
    icon: '✦',
    permissionKey: 'inventory:edit',
    section: 'store',
  },
  // Inventory
  {
    id: 'nav-inventory',
    label: 'Inventory Ledger',
    href: '/inventory',
    icon: '▦',
    permissionKey: 'inventory:view',
    section: 'store',
  },
  // Barcode Management
  {
    id: 'nav-barcodes',
    label: 'Barcodes',
    href: '/inventory/barcodes',
    icon: '⠿',
    permissionKey: 'inventory:view',
    section: 'store',
  },
  // Staff
  {
    id: 'nav-staff',
    label: 'Staff',
    href: '/staff',
    icon: '⊕',
    permissionKey: 'staff:view',
    section: 'people',
  },
  // Reports
  {
    id: 'nav-reports',
    label: 'Reports',
    href: '/reports',
    icon: '⊗',
    permissionKey: 'reports:view',
    section: 'insights',
  },
  // Week 7 — AI evaluation and prediction history
  {
    id: 'nav-ai-insights',
    label: 'AI Insights',
    href: '/ai-insights',
    icon: '◎',
    permissionKey: 'reports:view',
    section: 'insights',
  },
  // Backup & Safety
  {
    id: 'nav-backup',
    label: 'Backup & Safety',
    href: '/backup',
    icon: '💾',
    permissionKey: 'settings:view',
    section: 'system',
  },
  // Settings
  {
    id: 'nav-settings',
    label: 'Settings',
    href: '/settings',
    icon: '⊙',
    permissionKey: 'settings:view',
    section: 'system',
  },
];

export function useNavigation() {
  const { user } = useAuthContext();

  const navItems = useMemo(() => {
    if (!user) return [];
    return ALL_NAV_ITEMS.filter((item) => {
      if (item.permissionKey === null) return true;
      return evaluatePermission(user.role as Role, item.permissionKey);
    });
  }, [user]);

  const sections = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of navItems) {
      const section = item.section ?? 'main';
      if (!map.has(section)) map.set(section, []);
      map.get(section)!.push(item);
    }
    return map;
  }, [navItems]);

  return { navItems, sections };
}
