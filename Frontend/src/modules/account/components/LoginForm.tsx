'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FormField, TextInput } from '@/shared/components/FormField';
import { Button } from '@/shared/components/Button';
import {
  validateEmail,
  validateRequired,
  collectErrors,
  hasErrors,
  FormErrors,
} from '@/shared/validation/validators';
import type { LoginInput } from '@/modules/account/types';

type LoginFields = 'email' | 'password';

interface LoginFormProps {
  onSubmit: (input: LoginInput) => Promise<void>;
  isLoading?: boolean;
  serverError?: string;
}

export function LoginForm({ onSubmit, isLoading, serverError }: LoginFormProps) {
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FormErrors<LoginFields>>({});
  const [showPassword, setShowPassword] = useState(false);

  const set = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  const validate = (): boolean => {
    const errs = collectErrors<LoginFields>([
      { field: 'email', result: validateEmail(values.email) },
      { field: 'password', result: validateRequired(values.password, 'Password') },
    ]);
    setErrors(errs);
    return !hasErrors(errs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit({ email: values.email.trim(), password: values.password });
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form" noValidate>
      <div className="auth-form__fields">
        <FormField id="login-email" label="Email Address" error={errors.email} required>
          <TextInput
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@yourstore.com"
            value={values.email}
            onChange={set('email')}
            hasError={!!errors.email}
          />
        </FormField>

        <FormField id="login-password" label="Password" error={errors.password} required>
          <div className="input-password-wrapper">
            <TextInput
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Your password"
              value={values.password}
              onChange={set('password')}
              hasError={!!errors.password}
            />
            <button
              type="button"
              className="input-password-toggle"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">{showPassword ? 'visibility_off' : 'visibility'}</span>
            </button>
          </div>
        </FormField>
      </div>

      {serverError && (
        <div className="auth-form__server-error animate-shake" role="alert">
          {serverError}
        </div>
      )}

      <Button
        type="submit"
        id="login-submit-btn"
        isLoading={isLoading}
        fullWidth
        size="lg"
      >
        Sign In
      </Button>

      <p className="auth-form__footer-text">
        Don&apos;t have an account?{' '}
        <Link href="/signup" id="login-signup-link">Create one</Link>
      </p>
    </form>
  );
}
