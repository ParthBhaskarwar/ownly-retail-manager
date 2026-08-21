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
  // Store
  {
    id: 'nav-store',
    label: 'Store Settings',
    href: '/store',
    icon: '⊡',
    permissionKey: 'store:view',
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
  // Inventory (future)
  {
    id: 'nav-inventory',
    label: 'Inventory',
    href: '/inventory',
    icon: '▦',
    permissionKey: 'inventory:view',
    section: 'store',
  },
  // Billing (future)
  {
    id: 'nav-billing',
    label: 'Billing',
    href: '/billing',
    icon: '⊟',
    permissionKey: 'billing:view',
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
  // Reports (future)
  {
    id: 'nav-reports',
    label: 'Reports',
    href: '/reports',
    icon: '⊗',
    permissionKey: 'reports:view',
    section: 'insights',
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
  // Audit (future)
  {
    id: 'nav-audit',
    label: 'Audit Log',
    href: '/audit',
    icon: '⊚',
    permissionKey: 'audit:view',
    section: 'system',
  },
];

/**
 * useNavigation — returns nav items filtered by the current user's role.
 * Role evaluation uses the central permission matrix — never per-item conditionals.
 */
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
