/**
 * CatalogService — categories, subcategories and suppliers.
 *
 * Ported from Frontend/src/modules/catalog/.
 *
 * Categories and subcategories are visible to a store when they are either
 * global system rows (store_id IS NULL, seeded per retail template) or owned
 * by that store. Suppliers are always store-owned.
 */

import { randomUUID } from 'crypto';
import { db } from '@/db/client';
import { AppError } from '@/shared/AppError';
import { AuditService } from './audit.service';
import type { Category, Subcategory, Supplier } from '@/types/domain';

export const CatalogService = {
  // ── Categories ──────────────────────────────────────────────────────────────

  async listCategories(retailTemplateId: string, storeId: string | null): Promise<Category[]> {
    return db('categories')
      .where({ retail_template_id: retailTemplateId, is_active: true })
      .andWhere((qb) => {
        qb.whereNull('store_id');
        if (storeId) qb.orWhere({ store_id: storeId });
      })
      .orderBy('sort_order', 'asc');
  },

  async createCategory(
    storeId: string,
    actorId: string,
    input: { retailTemplateId: string; name: string }
  ): Promise<Category> {
    const id = randomUUID();
    await db('categories').insert({
      id,
      retail_template_id: input.retailTemplateId,
      store_id: storeId,
      name: input.name.trim(),
      is_system: false,
      is_active: true,
      sort_order: 999,
    });
    await AuditService.log({
      action: 'category.create', userId: actorId, storeId,
      entityType: 'category', entityId: id, meta: { name: input.name },
    });
    return (await db('categories').where({ id }).first()) as Category;
  },

  // ── Subcategories ───────────────────────────────────────────────────────────

  async listSubcategories(categoryId: string, storeId: string | null): Promise<Subcategory[]> {
    return db('subcategories')
      .where({ category_id: categoryId, is_active: true })
      .andWhere((qb) => {
        qb.whereNull('store_id');
        if (storeId) qb.orWhere({ store_id: storeId });
      })
      .orderBy('sort_order', 'asc');
  },

  async createSubcategory(
    storeId: string,
    actorId: string,
    input: { categoryId: string; name: string }
  ): Promise<Subcategory> {
    const id = randomUUID();
    await db('subcategories').insert({
      id,
      category_id: input.categoryId,
      store_id: storeId,
      name: input.name.trim(),
      is_system: false,
      is_active: true,
      sort_order: 999,
    });
    await AuditService.log({
      action: 'subcategory.create', userId: actorId, storeId,
      entityType: 'subcategory', entityId: id, meta: { name: input.name },
    });
    return (await db('subcategories').where({ id }).first()) as Subcategory;
  },

  // ── Suppliers ───────────────────────────────────────────────────────────────

  async listSuppliers(storeId: string, includeInactive = false): Promise<Supplier[]> {
    const query = db('suppliers').where({ store_id: storeId });
    if (!includeInactive) query.andWhere({ is_active: true });
    return query.orderBy('name', 'asc');
  },

  async getSupplier(storeId: string, id: string): Promise<Supplier> {
    const row = await db('suppliers').where({ id, store_id: storeId }).first();
    if (!row) throw AppError.notFound('Supplier not found.');
    return row as Supplier;
  },

  async createSupplier(
    storeId: string,
    actorId: string,
    input: {
      name: string; code: string; gstin?: string;
      address?: string; paymentTerms?: string; notes?: string;
    }
  ): Promise<Supplier> {
    const code = input.code.trim().toUpperCase();

    const clash = await db('suppliers').where({ store_id: storeId, code }).first();
    if (clash) throw AppError.conflict(`A supplier with code "${code}" already exists.`);

    const id = randomUUID();
    await db('suppliers').insert({
      id,
      store_id: storeId,
      name: input.name.trim(),
      code,
      gstin: input.gstin ?? null,
      address: input.address ?? null,
      payment_terms: input.paymentTerms ?? null,
      notes: input.notes ?? null,
      is_active: true,
    });

    await AuditService.log({
      action: 'supplier.create', userId: actorId, storeId,
      entityType: 'supplier', entityId: id, meta: { name: input.name, code },
    });

    return this.getSupplier(storeId, id);
  },

  async updateSupplier(
    storeId: string,
    actorId: string,
    id: string,
    updates: Partial<{
      name: string; gstin: string; address: string;
      paymentTerms: string; notes: string; isActive: boolean;
    }>
  ): Promise<Supplier> {
    await this.getSupplier(storeId, id); // scope check

    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.gstin !== undefined) patch.gstin = updates.gstin;
    if (updates.address !== undefined) patch.address = updates.address;
    if (updates.paymentTerms !== undefined) patch.payment_terms = updates.paymentTerms;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.isActive !== undefined) patch.is_active = updates.isActive;

    await db('suppliers').where({ id, store_id: storeId }).update(patch);

    await AuditService.log({
      action: 'supplier.update', userId: actorId, storeId,
      entityType: 'supplier', entityId: id, meta: { ...updates },
    });

    return this.getSupplier(storeId, id);
  },
};
