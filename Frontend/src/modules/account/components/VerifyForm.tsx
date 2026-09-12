'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/shared/components/Button';
import { validateVerificationCode } from '@/shared/validation/validators';

interface VerifyFormProps {
  email: string;
  userId: string;
  /** In dev mode, the actual code is shown to the user */
  devCode?: string;
  onSubmit: (userId: string, code: string) => Promise<void>;
  isLoading?: boolean;
  serverError?: string;
  onResend?: () => void;
}

export function VerifyForm({
  email,
  userId,
  devCode,
  onSubmit,
  isLoading,
  serverError,
  onResend,
}: VerifyFormProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join('');

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const updated = [...digits];
    updated[index] = digit;
    setDigits(updated);
    setError('');

    // Auto-advance focus
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      inputRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateVerificationCode(code);
    if (!result.valid) {
      setError(result.message);
      return;
    }
    await onSubmit(userId, code);
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form" noValidate>
      <div className="verify-info">
        <p className="verify-info__text">
          We sent a 6-digit verification code to{' '}
          <strong>{email}</strong>.
        </p>
        {devCode && (
          <div className="verify-dev-code" role="note">
            <span className="verify-dev-code__label">🔧 Dev Mode:</span>
            <span className="verify-dev-code__value">{devCode}</span>
          </div>
        )}
      </div>

      <div className="verify-code-inputs" onPaste={handlePaste} aria-label="Enter verification code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            id={`verify-digit-${i}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleDigitChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className={`verify-digit-input ${error ? 'verify-digit-input--error' : ''} ${d ? 'verify-digit-input--filled' : ''}`}
            aria-label={`Digit ${i + 1} of 6`}
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
          />
        ))}
      </div>

      {(error || serverError) && (
        <p className="form-error animate-shake" role="alert">
          {error || serverError}
        </p>
      )}

      <Button
        type="submit"
        id="verify-submit-btn"
        isLoading={isLoading}
        fullWidth
        size="lg"
        disabled={code.length < 6}
      >
        Verify Account
      </Button>

      {onResend && (
        <p className="auth-form__footer-text">
          Didn&apos;t receive the code?{' '}
          <button
            type="button"
            id="verify-resend-btn"
            className="link-btn"
            onClick={onResend}
          >
            Resend code
          </button>
        </p>
      )}
    </form>
  );
}
