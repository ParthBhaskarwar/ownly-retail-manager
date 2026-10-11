/**
 * Store module — Store domain types.
 */

export interface TaxSettings {
  gstEnabled: boolean;
  gstRate: number; // percentage e.g. 18
  inclusiveTax: boolean;
}

export interface InvoiceSettings {
  prefix: string; // e.g. "INV"
  nextNumber: number;
  showGst: boolean;
  termsAndConditions?: string;
}

export interface Store {
  id: string;
  ownerId: string;
  name: string;
  address: string;
  phone: string;
  gstNumber?: string;
  currency: string; // ISO 4217 e.g. "INR"
  taxSettings?: TaxSettings;
  invoiceSettings?: InvoiceSettings;
  logoUrl?: string;
  retailType: string; // RetailType enum value — store module doesn't import retail-template to avoid circular deps
  setupCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Onboarding checklist ─────────────────────────────────────────────────────

export type OnboardingStepKey =
  | 'account_verified'
  | 'retail_type_selected'
  | 'store_details_saved'
  | 'first_staff_added'
  | 'setup_complete';

export interface OnboardingStep {
  key: OnboardingStepKey;
  label: string;
  description: string;
  completed: boolean;
  href: string;
  optional: boolean;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateStoreInput {
  ownerId: string;
  name: string;
  address: string;
  phone: string;
  retailType: string;
  gstNumber?: string;
  currency?: string;
  taxSettings?: TaxSettings;
  invoiceSettings?: InvoiceSettings;
  logoUrl?: string;
}

export interface UpdateStoreInput {
  name?: string;
  address?: string;
  phone?: string;
  retailType?: string;
  gstNumber?: string;
  currency?: string;
  taxSettings?: TaxSettings;
  invoiceSettings?: InvoiceSettings;
  logoUrl?: string;
  setupCompleted?: boolean;
}
