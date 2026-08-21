'use client';

import React, { useState } from 'react';
import { FormField, TextInput } from '@/shared/components/FormField';
import { Button } from '@/shared/components/Button';
import { RoleSelector } from './RoleSelector';
import {
  validateRequired,
  validateEmail,
  validatePhone,
  validatePassword,
  collectErrors,
  hasErrors,
  FormErrors,
} from '@/shared/validation/validators';
import type { CreateStaffInput, UpdateStaffInput } from '@/modules/staff/types';
import type { Role } from '@/modules/account/types';
import type { StaffMember } from '@/modules/staff/types';

type StaffFormFields = 'name' | 'email' | 'phone' | 'role' | 'password';

interface CreateStaffFormProps {
  mode: 'create';
  storeId: string;
  onSubmit: (input: CreateStaffInput) => Promise<void>;
  isLoading?: boolean;
  serverError?: string;
}

interface EditStaffFormProps {
  mode: 'edit';
  staffMember: StaffMember;
  onSubmit: (id: string, updates: UpdateStaffInput) => Promise<void>;
  isLoading?: boolean;
  serverError?: string;
}

type StaffFormProps = CreateStaffFormProps | EditStaffFormProps;

export function StaffForm(props: StaffFormProps) {
  const isCreate = props.mode === 'create';
  const existing = props.mode === 'edit' ? props.staffMember : null;

  const [values, setValues] = useState({
    name: existing?.name ?? '',
    email: existing?.email ?? '',
    phone: existing?.phone ?? '',
    role: (existing?.role ?? '') as Role | '',
    password: '',
  });
  const [errors, setErrors] = useState<FormErrors<StaffFormFields>>({});

  const set = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  const validate = (): boolean => {
    const checks: Array<{ field: StaffFormFields; result: { valid: boolean; message?: string } }> = [
      { field: 'name', result: validateRequired(values.name, 'Name') },
      { field: 'email', result: isCreate ? validateEmail(values.email) : { valid: true } },
      { field: 'phone', result: validatePhone(values.phone) },
      { field: 'role', result: values.role ? { valid: true } : { valid: false, message: 'Please select a role.' } },
    ];
    if (isCreate) {
      checks.push({ field: 'password', result: validatePassword(values.password) });
    }
    const errs = collectErrors<StaffFormFields>(checks as Parameters<typeof collectErrors<StaffFormFields>>[0]);
    setErrors(errs);
    return !hasErrors(errs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (props.mode === 'create') {
      await props.onSubmit({
        storeId: props.storeId,
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        role: values.role as Role,
        password: values.password,
      });
    } else {
      await props.onSubmit(props.staffMember.id, {
        name: values.name.trim(),
        phone: values.phone.trim(),
        role: values.role as Role,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="staff-form" noValidate>
      <div className="form-grid">
        <FormField id="staff-name" label="Full Name" error={errors.name} required>
          <TextInput
            id="staff-name"
            type="text"
            autoComplete="name"
            placeholder="Arjun Mehta"
            value={values.name}
            onChange={set('name')}
            hasError={!!errors.name}
          />
        </FormField>

        <FormField id="staff-phone" label="Phone Number" error={errors.phone} required>
          <TextInput
            id="staff-phone"
            type="tel"
            placeholder="+91 98765 43210"
            value={values.phone}
            onChange={set('phone')}
            hasError={!!errors.phone}
          />
        </FormField>
      </div>

      {isCreate && (
        <>
          <FormField id="staff-email" label="Email Address" error={errors.email} required>
            <TextInput
              id="staff-email"
              type="email"
              autoComplete="email"
              placeholder="arjun@yourstore.com"
              value={values.email}
              onChange={set('email')}
              hasError={!!errors.email}
            />
          </FormField>

          <FormField
            id="staff-password"
            label="Temporary Password"
            error={errors.password}
            hint="The staff member can change this after first login."
            required
          >
            <TextInput
              id="staff-password"
              type="password"
              placeholder="Min. 8 chars, one uppercase, one number"
              value={values.password}
              onChange={set('password')}
              hasError={!!errors.password}
            />
          </FormField>
        </>
      )}

      <div className="form-section">
        <h3 className="form-section__title">Role & Permissions</h3>
        <RoleSelector
          value={values.role}
          onChange={(role) => setValues((v) => ({ ...v, role }))}
          error={errors.role}
        />
      </div>

      {props.serverError && (
        <div className="auth-form__server-error" role="alert">{props.serverError}</div>
      )}

      <div className="form-actions">
        <Button
          type="submit"
          id="staff-form-submit-btn"
          isLoading={props.isLoading}
          size="lg"
        >
          {isCreate ? 'Add Staff Member' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
