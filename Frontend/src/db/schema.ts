/**
 * Dexie database schema — Ownly.
 *
 * Compound index syntax: '[field1+field2]'
 * Schema versioning supports seamless offline/local operation.
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

  // ── Product hierarchy ─────────────────────────────────────────────────────
  products:
    'id, storeId, [storeId+baseSku], [storeId+categoryId], [storeId+subcategoryId], [storeId+supplierId], [storeId+status]',

  productVariants:
    'id, productId, [productId+sku], [productId+isActive]',

  // ── Inventory hierarchy ───────────────────────────────────────────────────
  inventoryItems:
    'id, storeId, [storeId+barcode], variantId, [variantId+status], [storeId+status], [storeId+purchaseDate]',

  inventoryMovements:
    'id, inventoryItemId, storeId, [storeId+movementType], [storeId+performedAt], [referenceType+referenceId]',
} as const;

export const SCHEMA_V2 = {
  ...SCHEMA_V1,
  customers: 'id, storeId, [storeId+phone], name',
  invoices: 'id, storeId, invoiceNumber, [storeId+invoiceNumber], customerId, createdAt, status',
  invoiceItems: 'id, invoiceId, inventoryItemId, barcode, productId, variantId',
  payments: 'id, invoiceId, paymentMethod',
  returns: 'id, storeId, returnNumber, originalInvoiceId, createdAt',
  returnItems: 'id, returnId, originalInvoiceItemId, inventoryItemId',
  exchanges: 'id, storeId, exchangeNumber, originalInvoiceId, returnId, replacementInvoiceId',
  creditNotes: 'id, storeId, creditNoteNumber, status, [storeId+creditNoteNumber]',
  auditLogs: 'id, storeId, userId, action, entityType, createdAt',
} as const;
