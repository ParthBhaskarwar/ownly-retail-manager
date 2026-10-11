import { StoreService } from '../src/modules/store/services/StoreService';
import type { Store } from '../src/modules/store/types';

const base = {
  id: 's1', ownerId: 'u1', name: 'Shop', address: '1 Street', phone: '+919000000001',
  currency: 'INR', retailType: 'CLOTHING_FASHION', setupCompleted: false,
  createdAt: '', updatedAt: '',
} as Store;

const steps = (store: Store | null, verified = true) =>
  StoreService.getOnboardingSteps('u1', store, { verifiedAt: verified ? '2026-01-01' : undefined } as never, false);
const byKey = (list: ReturnType<typeof steps>, key: string) => list.find((s) => s.key === key)!;
const percent = (list: ReturnType<typeof steps>) => {
  const req = list.filter((s) => !s.optional);
  return Math.round((req.filter((s) => s.completed).length / req.length) * 100);
};

describe('onboarding checklist', () => {
  test('a store with a blank address is NOT complete and names what is missing', () => {
    const l = steps({ ...base, address: '' });
    expect(byKey(l, 'store_details_saved').completed).toBe(false);
    expect(byKey(l, 'store_details_saved').description).toMatch(/address/);
    expect(percent(l)).toBeLessThan(100);
  });

  test('blank phone also blocks completion', () => {
    expect(byKey(steps({ ...base, phone: '  ' }), 'store_details_saved').completed).toBe(false);
  });

  test('GST enabled without a GSTIN is incomplete', () => {
    const l = steps({ ...base, taxSettings: { gstEnabled: true, gstRate: 18, inclusiveTax: false } });
    expect(byKey(l, 'store_details_saved').completed).toBe(false);
    expect(byKey(l, 'store_details_saved').description).toMatch(/GSTIN/);
  });

  test('"setup complete" cannot be 100% while details are missing, even if the flag is set', () => {
    const l = steps({ ...base, address: '', setupCompleted: true });
    expect(byKey(l, 'setup_complete').completed).toBe(false);
    expect(percent(l)).toBeLessThan(100);
  });

  test('everything present reaches 100%', () => {
    const l = steps({ ...base, gstNumber: '27AAAAA0000A1Z5', setupCompleted: true, taxSettings: { gstEnabled: true, gstRate: 18, inclusiveTax: false } });
    expect(percent(l)).toBe(100);
  });

  test('unverified account holds the percentage back', () => {
    expect(percent(steps({ ...base, setupCompleted: true }, false))).toBeLessThan(100);
  });
});
