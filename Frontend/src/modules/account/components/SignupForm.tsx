'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FormField, TextInput } from '@/shared/components/FormField';
import { Button } from '@/shared/components/Button';
import {
  validateEmail,
  validatePhone,
  validatePassword,
  validateConfirmPassword,
  validateRequired,
  collectErrors,
  hasErrors,
  FormErrors,
} from '@/shared/validation/validators';
import type { SignUpInput } from '@/modules/account/types';

type SignupFields = 'name' | 'email' | 'phone' | 'password' | 'confirmPassword';

interface SignupFormProps {
  onSubmit: (input: SignUpInput) => Promise<void>;
  isLoading?: boolean;
  serverError?: string;
}

export function SignupForm({ onSubmit, isLoading, serverError }: SignupFormProps) {
  const [values, setValues] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<FormErrors<SignupFields>>({});
  const [showPassword, setShowPassword] = useState(false);

  const set = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  const validate = (): boolean => {
    const errs = collectErrors<SignupFields>([
      { field: 'name', result: validateRequired(values.name, 'Full name') },
      { field: 'email', result: validateEmail(values.email) },
      { field: 'phone', result: validatePhone(values.phone) },
      { field: 'password', result: validatePassword(values.password) },
      { field: 'confirmPassword', result: validateConfirmPassword(values.password, values.confirmPassword) },
    ]);
    setErrors(errs);
    return !hasErrors(errs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit({
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      password: values.password,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form" noValidate>
      <div className="auth-form__fields">
        <FormField id="signup-name" label="Full Name" error={errors.name} required>
          <TextInput
            id="signup-name"
            type="text"
            autoComplete="name"
            placeholder="Priya Sharma"
            value={values.name}
            onChange={set('name')}
            hasError={!!errors.name}
            aria-describedby={errors.name ? 'signup-name-error' : undefined}
          />
        </FormField>

        <FormField id="signup-email" label="Email Address" error={errors.email} required>
          <TextInput
            id="signup-email"
            type="email"
            autoComplete="email"
            placeholder="priya@yourstore.com"
            value={values.email}
            onChange={set('email')}
            hasError={!!errors.email}
          />
        </FormField>

        <FormField id="signup-phone" label="Phone Number" error={errors.phone} required>
          <TextInput
            id="signup-phone"
            type="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            value={values.phone}
            onChange={set('phone')}
            hasError={!!errors.phone}
          />
        </FormField>

        <FormField
          id="signup-password"
          label="Password"
          error={errors.password}
          hint="At least 8 characters, one uppercase letter, one number."
          required
        >
          <div className="input-password-wrapper">
            <TextInput
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a strong password"
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

        <FormField id="signup-confirm" label="Confirm Password" error={errors.confirmPassword} required>
          <TextInput
            id="signup-confirm"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat your password"
            value={values.confirmPassword}
            onChange={set('confirmPassword')}
            hasError={!!errors.confirmPassword}
          />
        </FormField>
      </div>

      {serverError && (
        <div className="auth-form__server-error" role="alert">
          {serverError}
        </div>
      )}

      <Button
        type="submit"
        id="signup-submit-btn"
        isLoading={isLoading}
        fullWidth
        size="lg"
      >
        Create Account
      </Button>

      <p className="auth-form__footer-text">
        Already have an account?{' '}
        <Link href="/login" id="signup-login-link">Sign in</Link>
      </p>
    </form>
  );
}
