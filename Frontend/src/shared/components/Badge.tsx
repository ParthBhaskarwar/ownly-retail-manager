'use client';

import React from 'react';
import type { Role } from '@/modules/account/types';

type BadgeVariant = 'brand' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

const variantClass: Record<BadgeVariant, string> = {
  brand:   'badge--brand',
  success: 'badge--success',
  warning: 'badge--warning',
  error:   'badge--error',
  info:    'badge--info',
  neutral: 'badge--neutral',
};

export function Badge({ children, variant = 'neutral', size = 'md' }: BadgeProps) {
  return (
    <span className={`badge ${variantClass[variant]} ${size === 'sm' ? 'badge--sm' : ''}`}>
      {children}
    </span>
  );
}

// ─── Role badge ───────────────────────────────────────────────

const roleVariantMap: Record<Role, BadgeVariant> = {
  OWNER:          'brand',
  MANAGER:        'info',
  CASHIER:        'success',
  INVENTORY_STAFF:'warning',
  ACCOUNTANT:     'error',
  VIEWER:         'neutral',
};

const roleLabels: Record<Role, string> = {
  OWNER:          'Owner',
  MANAGER:        'Manager',
  CASHIER:        'Cashier',
  INVENTORY_STAFF:'Inventory',
  ACCOUNTANT:     'Accountant',
  VIEWER:         'Viewer',
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge variant={roleVariantMap[role]} size="sm">
      {roleLabels[role]}
    </Badge>
  );
}

// ─── Status badge ─────────────────────────────────────────────

export function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? 'success' : 'neutral'} size="sm">
      {isActive ? 'Active' : 'Inactive'}
    </Badge>
  );
}
