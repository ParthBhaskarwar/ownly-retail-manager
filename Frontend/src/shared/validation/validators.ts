/**
 * Centralized validation utilities.
 * Used by all forms — never duplicated per-component.
 */

export type ValidationResult = { valid: true } | { valid: false; message: string };

// ─── Field validators ────────────────────────────────────────────────────────

export function validateEmail(email: string): ValidationResult {
  const trimmed = email.trim();
  if (!trimmed) return { valid: false, message: 'Email is required.' };
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(trimmed)) return { valid: false, message: 'Enter a valid email address.' };
  return { valid: true };
}

export function validatePhone(phone: string): ValidationResult {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return { valid: false, message: 'Phone number is required.' };
  if (digits.length < 7 || digits.length > 15)
    return { valid: false, message: 'Enter a valid phone number (7–15 digits).' };
  return { valid: true };
}

export function validatePassword(password: string): ValidationResult {
  if (!password) return { valid: false, message: 'Password is required.' };
  if (password.length < 8)
    return { valid: false, message: 'Password must be at least 8 characters.' };
  if (!/[A-Z]/.test(password))
    return { valid: false, message: 'Password must contain at least one uppercase letter.' };
  if (!/[0-9]/.test(password))
    return { valid: false, message: 'Password must contain at least one number.' };
  return { valid: true };
}

export function validateConfirmPassword(
  password: string,
  confirm: string
): ValidationResult {
  if (!confirm) return { valid: false, message: 'Please confirm your password.' };
  if (password !== confirm) return { valid: false, message: 'Passwords do not match.' };
  return { valid: true };
}

export function validateRequired(value: string, fieldName: string): ValidationResult {
  if (!value.trim()) return { valid: false, message: `${fieldName} is required.` };
  return { valid: true };
}

export function validateGst(gst: string): ValidationResult {
  if (!gst) return { valid: true }; // optional field
  const re = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!re.test(gst.toUpperCase()))
    return { valid: false, message: 'Enter a valid 15-character GST number.' };
  return { valid: true };
}

export function validateVerificationCode(code: string): ValidationResult {
  if (!code) return { valid: false, message: 'Verification code is required.' };
  if (!/^\d{6}$/.test(code.trim()))
    return { valid: false, message: 'Enter the 6-digit verification code.' };
  return { valid: true };
}

// ─── Form-level validator ────────────────────────────────────────────────────

export type FormErrors<T extends string> = Partial<Record<T, string>>;

export function collectErrors<T extends string>(
  checks: Array<{ field: T; result: ValidationResult }>
): FormErrors<T> {
  const errors: FormErrors<T> = {};
  for (const { field, result } of checks) {
    if (!result.valid) {
      errors[field] = result.message;
    }
  }
  return errors;
}

export function hasErrors<T extends string>(errors: FormErrors<T>): boolean {
  return Object.values(errors).some(Boolean);
}
