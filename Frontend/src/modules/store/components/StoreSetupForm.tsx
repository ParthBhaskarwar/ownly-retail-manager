'use client';

import React, { useState } from 'react';
import { FormField, TextInput, TextareaInput, SelectInput } from '@/shared/components/FormField';
import { Button } from '@/shared/components/Button';
import {
  validateRequired,
  validatePhone,
  validateGst,
  collectErrors,
  hasErrors,
  FormErrors,
} from '@/shared/validation/validators';
import type { CreateStoreInput } from '@/modules/store/types';

type StoreFields = 'name' | 'address' | 'phone' | 'gstNumber';

const CURRENCIES = [
  { code: 'INR', label: 'INR — Indian Rupee (₹)' },
  { code: 'USD', label: 'USD — US Dollar ($)' },
  { code: 'EUR', label: 'EUR — Euro (€)' },
  { code: 'GBP', label: 'GBP — British Pound (£)' },
  { code: 'AED', label: 'AED — UAE Dirham (د.إ)' },
  { code: 'SGD', label: 'SGD — Singapore Dollar (S$)' },
];

interface StoreSetupFormProps {
  ownerId: string;
  retailType: string;
  onSubmit: (input: CreateStoreInput) => Promise<void>;
  isLoading?: boolean;
  serverError?: string;
}

export function StoreSetupForm({
  ownerId,
  retailType,
  onSubmit,
  isLoading,
  serverError,
}: StoreSetupFormProps) {
  const [values, setValues] = useState({
    name: '',
    address: '',
    phone: '',
    gstNumber: '',
    currency: 'INR',
    gstEnabled: false,
    gstRate: '18',
  });
  const [errors, setErrors] = useState<FormErrors<StoreFields>>({});

  const set = (field: keyof typeof values) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const validate = (): boolean => {
    const errs = collectErrors<StoreFields>([
      { field: 'name', result: validateRequired(values.name, 'Store name') },
      { field: 'address', result: validateRequired(values.address, 'Address') },
      { field: 'phone', result: validatePhone(values.phone) },
      { field: 'gstNumber', result: validateGst(values.gstNumber) },
    ]);
    setErrors(errs);
    return !hasErrors(errs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit({
      ownerId,
      retailType,
      name: values.name.trim(),
      address: values.address.trim(),
      phone: values.phone.trim(),
      gstNumber: values.gstNumber.trim() || undefined,
      currency: values.currency,
      taxSettings: values.gstEnabled
        ? { gstEnabled: true, gstRate: Number(values.gstRate), inclusiveTax: false }
        : undefined,
      invoiceSettings: {
        prefix: 'INV',
        nextNumber: 1,
        showGst: values.gstEnabled,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="store-setup-form" noValidate>
      <div className="form-section">
        <h3 className="form-section__title">Basic Details</h3>
        <div className="form-grid">
          <FormField id="store-name" label="Store Name" error={errors.name} required>
            <TextInput
              id="store-name"
              type="text"
              placeholder="My Clothing Store"
              value={values.name}
              onChange={set('name')}
              hasError={!!errors.name}
            />
          </FormField>

          <FormField id="store-phone" label="Phone Number" error={errors.phone} required>
            <TextInput
              id="store-phone"
              type="tel"
              placeholder="+91 98765 43210"
              value={values.phone}
              onChange={set('phone')}
              hasError={!!errors.phone}
            />
          </FormField>
        </div>

        <FormField id="store-address" label="Address" error={errors.address} required>
          <TextareaInput
            id="store-address"
            rows={3}
            placeholder="123 Fashion Street, Mumbai, Maharashtra 400001"
            value={values.address}
            onChange={set('address')}
            hasError={!!errors.address}
          />
        </FormField>
      </div>

      <div className="form-section">
        <h3 className="form-section__title">Optional Details</h3>
        <div className="form-grid">
          <FormField
            id="store-currency"
            label="Currency"
            hint="Primary currency for billing and reports."
          >
            <SelectInput
              id="store-currency"
              value={values.currency}
              onChange={set('currency')}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </SelectInput>
          </FormField>

          <FormField
            id="store-gst"
            label="GST Number"
            error={errors.gstNumber}
            hint="15-character GST number (optional)."
          >
            <TextInput
              id="store-gst"
              type="text"
              placeholder="22AAAAA0000A1Z5"
              value={values.gstNumber}
              onChange={set('gstNumber')}
              hasError={!!errors.gstNumber}
              maxLength={15}
              style={{ textTransform: 'uppercase' }}
            />
          </FormField>
        </div>

        <div className="form-toggle-row">
          <label htmlFor="store-gst-enabled" className="form-toggle-label">
            <input
              id="store-gst-enabled"
              type="checkbox"
              className="form-toggle-checkbox"
              checked={values.gstEnabled}
              onChange={(e) => setValues((v) => ({ ...v, gstEnabled: e.target.checked }))}
            />
            Enable GST on billing
          </label>
          {values.gstEnabled && (
            <div className="form-toggle-child animate-fade-in">
              <FormField id="store-gst-rate" label="GST Rate (%)">
                <SelectInput
                  id="store-gst-rate"
                  value={values.gstRate}
                  onChange={set('gstRate')}
                >
                  {['0', '5', '12', '18', '28'].map((r) => (
                    <option key={r} value={r}>{r}%</option>
                  ))}
                </SelectInput>
              </FormField>
            </div>
          )}
        </div>
      </div>

      {serverError && (
        <div className="auth-form__server-error" role="alert">{serverError}</div>
      )}

      <Button
        type="submit"
        id="store-setup-submit-btn"
        isLoading={isLoading}
        fullWidth
        size="lg"
      >
        Save Store Details
      </Button>
    </form>
  );
}
