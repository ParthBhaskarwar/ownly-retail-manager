'use client';

import React from 'react';

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function FormField({ id, label, error, hint, required, children }: FormFieldProps) {
  return (
    <div className={`form-field ${error ? 'form-field--error' : ''}`}>
      <label htmlFor={id} className="form-label">
        {label}
        {required && <span className="form-required" aria-hidden="true">*</span>}
      </label>
      {children}
      {error && (
        <p className="form-error" role="alert" id={`${id}-error`}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3.25a.75.75 0 01-1.5 0V5zm.75 6.5a.875.875 0 110-1.75.875.875 0 010 1.75z"/>
          </svg>
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="form-hint" id={`${id}-hint`}>{hint}</p>
      )}
    </div>
  );
}

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  hasError?: boolean;
}

export function TextInput({ id, hasError, ...props }: TextInputProps) {
  return (
    <input
      id={id}
      className={`form-input ${hasError ? 'form-input--error' : ''}`}
      {...props}
    />
  );
}

interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  hasError?: boolean;
  children: React.ReactNode;
}

export function SelectInput({ id, hasError, children, ...props }: SelectInputProps) {
  return (
    <select
      id={id}
      className={`form-input form-select ${hasError ? 'form-input--error' : ''}`}
      {...props}
    >
      {children}
    </select>
  );
}

interface TextareaInputProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string;
  hasError?: boolean;
}

export function TextareaInput({ id, hasError, ...props }: TextareaInputProps) {
  return (
    <textarea
      id={id}
      className={`form-input form-textarea ${hasError ? 'form-input--error' : ''}`}
      {...props}
    />
  );
}
