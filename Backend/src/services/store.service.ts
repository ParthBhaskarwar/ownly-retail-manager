/**
 * StoreService — store profile and onboarding.
 *
 * Ported from Frontend/src/modules/store/services/StoreService.ts.
 *
 * The onboarding checklist previously lived in localStorage; it is now derived
 * from actual data (is the user verified? does a store exist? is there staff?),
 * which is more honest — the checklist can no longer disagree with reality.
 */

import { randomUUID } from 'crypto';
import { db } from '@/db/client';
import { AppError } from '@/shared/AppError';
import { AuditService } from './audit.service';
import type { Store } from '@/types/domain';

/** jsonb columns come back parsed; stringify on the way in. */
function serializeJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export const StoreService = {
  async getByOwnerId(ownerId: string): Promise<Store | null> {
    return (await db('stores').where({ owner_id: ownerId }).first()) ?? null;
  },

  async getById(id: string): Promise<Store | null> {
    return (await db('stores').where({ id }).first()) ?? null;
  },

  /**
   * Creates the store and links it to the owner. Both writes happen in one
   * transaction — a store with no owner link would leave the account stuck in
   * onboarding with no way to retry (the create would fail as a duplicate).
   */
  async create(
    ownerId: string,
    input: {
      name: string;
      address: string;
      phone: string;
      retailType: string;
      currency?: string;
      gstNumber?: string;
      taxSettings?: unknown;
      invoiceSettings?: unknown;
    }
  ): Promise<Store> {
    const existing = await this.getByOwnerId(ownerId);
    if (existing) throw AppError.conflict('A store already exists for this owner.');

    const id = randomUUID();

    return db.transaction(async (trx) => {
      await trx('stores').insert({
        id,
        owner_id: ownerId,
        name: input.name.trim(),
        address: input.address,
        phone: input.phone,
        gst_number: input.gstNumber ?? null,
        currency: input.currency ?? 'INR',
        tax_settings: serializeJson(input.taxSettings),
        invoice_settings: serializeJson(input.invoiceSettings),
        retail_type: input.retailType,
        setup_completed: false,
      });

      await trx('users').where({ id: ownerId }).update({ store_id: id, updated_at: new Date() });

      await AuditService.log(
        { action: 'store.create', userId: ownerId, storeId: id, entityType: 'store', entityId: id, meta: { name: input.name } },
        trx
      );

      return (await trx('stores').where({ id }).first()) as Store;
    });
  },

  async update(
    id: string,
    userId: string,
    updates: Partial<{
      name: string;
      address: string;
      phone: string;
      gstNumber: string;
      currency: string;
      logoUrl: string;
      taxSettings: unknown;
      invoiceSettings: unknown;
    }>
  ): Promise<Store> {
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.address !== undefined) patch.address = updates.address;
    if (updates.phone !== undefined) patch.phone = updates.phone;
    if (updates.gstNumber !== undefined) patch.gst_number = updates.gstNumber;
    if (updates.currency !== undefined) patch.currency = updates.currency;
    if (updates.logoUrl !== undefined) patch.logo_url = updates.logoUrl;
    if (updates.taxSettings !== undefined) patch.tax_settings = serializeJson(updates.taxSettings);
    if (updates.invoiceSettings !== undefined) patch.invoice_settings = serializeJson(updates.invoiceSettings);

    const updated = await db('stores').where({ id }).update(patch).returning('*');
    if (!updated.length) throw AppError.notFound(`Store ${id} not found`);

    await AuditService.log({ action: 'store.update', userId, storeId: id, entityType: 'store', entityId: id });
    return updated[0] as Store;
  },

  async markSetupComplete(id: string, userId: string): Promise<Store> {
    const updated = await db('stores')
      .where({ id })
      .update({ setup_completed: true, updated_at: new Date() })
      .returning('*');
    if (!updated.length) throw AppError.notFound(`Store ${id} not found`);

    await AuditService.log({ action: 'store.setup_complete', userId, storeId: id });
    return updated[0] as Store;
  },

  /** Derived onboarding state — computed from data, not stored flags. */
  async getOnboardingState(userId: string): Promise<{
    accountVerified: boolean;
    retailTypeSelected: boolean;
    storeDetailsSaved: boolean;
    staffAdded: boolean;
    setupCompleted: boolean;
  }> {
    const user = await db('users').where({ id: userId }).first();
    const store = user?.storeId ? await this.getById(user.storeId) : null;
    const staffCount = store
      ? await db('users').where({ store_id: store.id }).whereNot({ id: userId }).count<{ count: number }[]>('* as count').first()
      : undefined;

    return {
      accountVerified: Boolean(user?.verifiedAt),
      retailTypeSelected: Boolean(store?.retailType),
      storeDetailsSaved: Boolean(store?.name && store?.address && store?.phone),
      staffAdded: Number(staffCount?.count ?? 0) > 0,
      setupCompleted: Boolean(store?.setupCompleted),
    };
  },
};
