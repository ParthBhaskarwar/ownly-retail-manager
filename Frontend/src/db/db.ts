/**
 * DexieDb — singleton database instance for Ownly.
 *
 * Usage: import { db } from '@/db/db';
 *
 * The singleton is safe in Next.js App Router because:
 * - Dexie/IndexedDB only runs in the browser (client components).
 * - The module is never imported by Server Components.
 * - `typeof window !== 'undefined'` guards handle SSR/prerender.
 *
 * Version upgrade strategy:
 *   - Version 1: initial schema + seed data
 *   - Future versions: add new stores or indexes without re-seeding
 */

import Dexie, { type Table } from 'dexie';
import { SCHEMA_V1 } from './schema';
import type { Category, Subcategory, Supplier } from '@/modules/catalog/types';
import type {
  AttributeDefinition,
  ProductAttributeValue,
  VariantAttributeValue,
} from '@/modules/attributes/types';
import type { Product, ProductVariant } from '@/modules/product/types';
import type { InventoryItem, InventoryMovement } from '@/modules/inventory/types';

// ─── SupplierContact (only used in DB layer, not exported as domain type) ─────
export interface SupplierContact {
  id: string;
  supplierId: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  isPrimary: boolean;
}

// ─── OwnlyDatabase class ──────────────────────────────────────────────────────

class OwnlyDatabase extends Dexie {
  // ── Catalog tables ────────────────────────────────────────────────────────
  categories!: Table<Category>;
  subcategories!: Table<Subcategory>;
  suppliers!: Table<Supplier>;
  supplierContacts!: Table<SupplierContact>;

  // ── Attribute tables ──────────────────────────────────────────────────────
  attributeDefinitions!: Table<AttributeDefinition>;
  productAttributeValues!: Table<ProductAttributeValue>;
  variantAttributeValues!: Table<VariantAttributeValue>;

  // ── Product tables ────────────────────────────────────────────────────────
  products!: Table<Product>;
  productVariants!: Table<ProductVariant>;

  // ── Inventory tables ──────────────────────────────────────────────────────
  inventoryItems!: Table<InventoryItem>;
  inventoryMovements!: Table<InventoryMovement>;

  constructor() {
    super('ownly_db');

    this.version(1)
      .stores(SCHEMA_V1)
      .upgrade(async (tx) => {
        // Seed clothing attribute definitions and categories on first open.
        // Import lazily to avoid circular dependency issues.
        const { seedClothingAttributes } = await import('./seeds/clothing-attributes');
        const { seedClothingCategories } = await import('./seeds/clothing-categories');
        await seedClothingAttributes(tx);
        await seedClothingCategories(tx);
      });
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

// Guard for SSR — IndexedDB is browser-only.
const db = typeof window !== 'undefined' ? new OwnlyDatabase() : (null as unknown as OwnlyDatabase);

export { db };
export type { OwnlyDatabase };
