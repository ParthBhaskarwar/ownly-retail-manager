import { v4 as uuidv4 } from 'uuid';
import { Adapters } from '@/adapters';
import { AuditService } from '@/shared/audit/AuditService';
import { Store, CreateStoreInput, UpdateStoreInput, OnboardingStep, OnboardingStepKey } from '@/modules/store/types';
import { User } from '@/modules/account/types';

const ONBOARDING_KEY = 'ownly:onboarding';

function readOnboarding(userId: string): Partial<Record<OnboardingStepKey, boolean>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`${ONBOARDING_KEY}:${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeOnboarding(userId: string, data: Partial<Record<OnboardingStepKey, boolean>>): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${ONBOARDING_KEY}:${userId}`, JSON.stringify(data));
  }
}

export const StoreService = {
  async getByOwnerId(ownerId: string): Promise<Store | null> {
    return Adapters.store.findByOwnerId(ownerId);
  },

  async getById(id: string): Promise<Store | null> {
    return Adapters.store.findById(id);
  },

  async create(input: CreateStoreInput): Promise<Store> {
    const existing = await Adapters.store.findByOwnerId(input.ownerId);
    if (existing) throw new Error('A store already exists for this owner.');
    const id = uuidv4();
    const store = await Adapters.store.create({ ...input, id });
    await Adapters.user.setStoreId(input.ownerId, id);
    AuditService.log('store.create', input.ownerId, id, { name: input.name });
    return store;
  },

  async update(id: string, userId: string, updates: UpdateStoreInput): Promise<Store> {
    const store = await Adapters.store.update(id, updates);
    AuditService.log('store.update', userId, id);
    return store;
  },

  async markSetupComplete(id: string, userId: string): Promise<Store> {
    const store = await Adapters.store.markSetupComplete(id);
    AuditService.log('store.setup_complete', userId, id);
    return store;
  },

  // ─── Onboarding checklist ────────────────────────────────────────────────────

  getOnboardingSteps(userId: string, store: Store | null, user: Pick<User, 'verifiedAt'>): OnboardingStep[] {
    const saved = readOnboarding(userId);
    return [
      {
        key: 'account_verified',
        label: 'Verify Your Account',
        description: 'Confirm your email address to secure your account.',
        completed: !!user.verifiedAt,
        href: '/verify',
        optional: false,
      },
      {
        key: 'retail_type_selected',
        label: 'Choose Retail Type',
        description: 'Select the type of store you operate.',
        completed: !!store?.retailType || !!saved.retail_type_selected,
        href: '/onboarding/retail-type',
        optional: false,
      },
      {
        key: 'store_details_saved',
        label: 'Set Up Your Store',
        description: 'Add your store name, address, and contact details.',
        completed: !!store?.name || !!saved.store_details_saved,
        href: '/onboarding/store-setup',
        optional: false,
      },
      {
        key: 'first_staff_added',
        label: 'Add Your First Staff Member',
        description: 'Invite a manager or cashier to your store.',
        completed: !!saved.first_staff_added,
        href: '/staff/new',
        optional: true,
      },
      {
        key: 'setup_complete',
        label: 'Setup Complete!',
        description: "You're all set to start managing your store.",
        completed: !!store?.setupCompleted,
        href: '/dashboard',
        optional: false,
      },
    ];
  },

  markOnboardingStep(userId: string, key: OnboardingStepKey): void {
    const current = readOnboarding(userId);
    writeOnboarding(userId, { ...current, [key]: true });
  },
};
