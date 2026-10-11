'use client';

import React from 'react';
import type { Role } from '@/modules/account/types';
import { useAuthContext } from '@/context/AuthContext';

const ROLES: Array<{ value: Role; label: string; description: string }> = [
  {
    value: 'MANAGER',
    label: 'Manager',
    description: 'Full access except store settings and owner actions.',
  },
  {
    value: 'CASHIER',
    label: 'Cashier',
    description: 'Can process billing and view inventory.',
  },
  {
    value: 'INVENTORY_STAFF',
    label: 'Inventory Staff',
    description: 'Can manage and edit inventory items.',
  },
  {
    value: 'ACCOUNTANT',
    label: 'Accountant',
    description: 'Can view billing, reports, and audit logs.',
  },
  {
    value: 'VIEWER',
    label: 'Viewer',
    description: 'Read-only access to dashboard and inventory.',
  },
];

interface RoleSelectorProps {
  value: Role | '';
  onChange: (role: Role) => void;
  error?: string;
}

export function RoleSelector({ value, onChange, error }: RoleSelectorProps) {
  const { user } = useAuthContext();
  // Only the owner may create managers; the server enforces this too.
  const roles = user?.role === 'OWNER' ? ROLES : ROLES.filter((r) => r.value !== 'MANAGER');

  return (
    <div className="role-selector" role="radiogroup" aria-label="Select staff role">
      {roles.map((role) => (
        <label
          key={role.value}
          className={`role-option ${value === role.value ? 'role-option--selected' : ''}`}
          htmlFor={`role-${role.value}`}
        >
          <input
            id={`role-${role.value}`}
            type="radio"
            name="role"
            value={role.value}
            checked={value === role.value}
            onChange={() => onChange(role.value)}
            className="role-option__input"
          />
          <div className="role-option__body">
            <span className="role-option__label">{role.label}</span>
            <span className="role-option__desc">{role.description}</span>
          </div>
          {value === role.value && (
            <svg className="role-option__check" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
            </svg>
          )}
        </label>
      ))}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
