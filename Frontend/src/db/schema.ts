/**
 * Dexie database schema — Ownly Week 2.
 *
 * Compound index syntax: '[field1+field2]'
 * These map 1-to-1 with the Gate 1 DDL unique constraints and performance indexes.
 *
 * All primary keys are UUID strings (no ++, no auto-increment).
 * Compound index queries use: db.table.where('[a+b]').equals([aVal, bVal])
 */

import type {
  Category,
  Subcategory,
  Supplier,
} from '@/modules/catalog/types';
import type {
  AttributeDefinition,
  ProductAttributeValue,
  VariantAttributeValue,
} from '@/modules/attributes/types';
import type { Product, ProductVariant } from '@/modules/product/types';
import type { InventoryItem, InventoryMovement } from '@/modules/inventory/types';

// Re-export table types so db.ts can use them without re-importing
export type {
  Category,
  Subcategory,
  Supplier,
  AttributeDefinition,
  ProductAttributeValue,
  VariantAttributeValue,
  Product,
  ProductVariant,
  InventoryItem,
  InventoryMovement,
};

/**
 * Schema version 1 store declarations.
 * Format: 'primaryKey, index1, index2, [compound+index]'
 * Only indexed fields need to be declared; all other fields are stored but not indexed.
 */
export const SCHEMA_V1 = {
  // ── Catalog ────────────────────────────────────────────────────────────────
  categories:
    'id, retailTemplateId, storeId, [retailTemplateId+name]',

  subcategories:
    'id, categoryId, storeId, [categoryId+name]',

  suppliers:
    'id, storeId, [storeId+code], [storeId+isActive]',

  supplierContacts:
    'id, supplierId',

  // ── Attribute system ───────────────────────────────────────────────────────
  attributeDefinitions:
    'id, retailTemplateId, [retailTemplateId+isVariantLevel], [retailTemplateId+name]',

  productAttributeValues:
    'id, productId, [productId+attributeDefinitionId], [attributeDefinitionId+value]',

  variantAttributeValues:
    'id, variantId, [variantId+attributeDefinitionId], [attributeDefinitionId+value]',

  // ── Product hierarchy (levels 1 & 2) ───────────────────────────────────────
  products:
    'id, storeId, [storeId+baseSku], [storeId+categoryId], [storeId+subcategoryId], [storeId+supplierId], [storeId+status]',

  productVariants:
    'id, productId, [productId+sku], [productId+isActive]',

  // ── Inventory hierarchy (levels 3 & 4) ────────────────────────────────────
  // CRITICAL: [storeId+barcode] is the compound unique index for barcode-scan lookup.
  inventoryItems:
    'id, storeId, [storeId+barcode], variantId, [variantId+status], [storeId+status], [storeId+purchaseDate]',

  inventoryMovements:
    'id, inventoryItemId, storeId, [storeId+movementType], [storeId+performedAt], [referenceType+referenceId]',
} as const;
