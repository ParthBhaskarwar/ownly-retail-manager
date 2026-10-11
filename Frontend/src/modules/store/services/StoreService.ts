/**
 * StoreService — talks to the backend store API.
 *
 * Signatures are unchanged so StoreContext, StoreSetupForm, the onboarding
 * pages and the dashboard checklist all work without modification.
 *
 * The onboarding checklist used to be tracked in localStorage, which could
 * drift out of sync with reality (a cleared browser looked like un-done
 * setup). It is now derived on the server from the actual data, so the
 * checklist can no longer disagree with the database.
 */

import { apiClient, setToken } from '@/lib/apiClient';
import {
  Store,
  CreateStoreInput,
  UpdateStoreInput,
  OnboardingStep,
  OnboardingStepKey,
} from '@/modules/store/types';
import { User } from '@/modules/account/types';

interface OnboardingState {
  accountVerified: boolean;
  retailTypeSelected: boolean;
  storeDetailsSaved: boolean;
  staffAdded: boolean;
  setupCompleted: boolean;
}

export const StoreService = {
  async getByOwnerId(_ownerId: string): Promise<Store | null> {
    const { store } = await apiClient.get<{ store: Store | null }>('/api/store');
    return store;
  },

  async getById(_id: string): Promise<Store | null> {
    const { store } = await apiClient.get<{ store: Store | null }>('/api/store');
    return store;
  },

  /**
   * Creates the store. The response carries a fresh token because creating
   * the store changes the caller's storeId, which is baked into the JWT.
   */
  async create(input: CreateStoreInput): Promise<Store> {
    const { store, token } = await apiClient.post<{ store: Store; token: string }>('/api/store', {
      name: input.name,
      address: input.address,
      phone: input.phone,
      retailType: input.retailType,
      currency: input.currency,
      gstNumber: input.gstNumber,
      taxSettings: input.taxSettings,
    });
    if (token) setToken(token);
    return store;
  },

  async update(_id: string, _userId: string, updates: UpdateStoreInput): Promise<Store> {
    const { store } = await apiClient.put<{ store: Store }>('/api/store', updates);
    return store;
  },

  async markSetupComplete(_id: string, _userId: string): Promise<Store> {
    const { store } = await apiClient.post<{ store: Store }>('/api/store/complete-setup');
    return store;
  },

  // ─── Onboarding checklist ───────────────────────────────────────────────────

  async fetchOnboardingState(): Promise<OnboardingState> {
    return apiClient.get<OnboardingState>('/api/store/onboarding');
  },

  /**
   * Builds the checklist. Kept synchronous with the same arguments as before
   * so DashboardPage did not need changing — it derives everything from the
   * store and user objects the caller already holds.
   */
  getOnboardingSteps(
    _userId: string,
    store: Store | null,
    user: Pick<User, 'verifiedAt'>,
    staffAdded?: boolean
  ): OnboardingStep[] {
    // Judge the real details, not just that a store row exists.
    const missing: string[] = [];
    if (!store?.name?.trim()) missing.push('store name');
    if (!store?.address?.trim()) missing.push('address');
    if (!store?.phone?.trim()) missing.push('phone');
    if (store?.taxSettings?.gstEnabled && !store?.gstNumber?.trim()) missing.push('GSTIN');
    const detailsDone = !!store && missing.length === 0;
    const verified = !!user.verifiedAt;
    const typeDone = !!store?.retailType;

    return [
      {
        key: 'account_verified',
        label: 'Verify Your Account',
        description: 'Confirm your email address to secure your account.',
        completed: verified,
        href: '/verify',
        optional: false,
      },
      {
        key: 'retail_type_selected',
        label: 'Choose Retail Type',
        description: 'Select the type of store you operate.',
        completed: typeDone,
        href: '/onboarding/retail-type',
        optional: false,
      },
      {
        key: 'store_details_saved',
        label: 'Set Up Your Store',
        description: detailsDone
          ? 'Store name, address and contact details are saved.'
          : store
            ? `Still missing: ${missing.join(', ')}.`
            : 'Add your store name, address, and contact details.',
        completed: detailsDone,
        href: store ? '/settings' : '/onboarding/store-setup',
        optional: false,
      },
      {
        key: 'first_staff_added',
        label: 'Add Your First Staff Member',
        description: 'Invite a manager or cashier to your store.',
        completed: staffAdded === true,
        href: '/staff/new',
        optional: true,
      },
      {
        key: 'setup_complete',
        label: 'Mark Setup Complete',
        description: 'Confirm your store setup is finished and unlock full access.',
        // Auto-complete this step if the store already has setupCompleted = true.
        // It is optional so the completion percentage reflects the three core steps
        // (verified account, retail type, store details) rather than requiring the
        // owner to click a separate "complete setup" button before reaching 100%.
        completed: !!store?.setupCompleted && verified && typeDone && detailsDone,
        href: '/onboarding/complete',
        optional: true,
      },
    ];
  },

  /**
   * No-op retained for call-site compatibility. Progress is now derived from
   * server data rather than recorded client-side.
   */
  markOnboardingStep(_userId: string, _key: OnboardingStepKey): void {
    /* intentionally empty — see fetchOnboardingState() */
  },
};
