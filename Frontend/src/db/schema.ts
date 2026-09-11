/**
 * Dexie schema definitions for OwnlyDatabase.
 * V1 — initial schema
 * V2 — adds billing/invoice tables
 */

/**
 * Version 1: catalog, attributes, products, inventory
 */
export const SCHEMA_V1 = {
  // Catalog
  categories:              'id, name, createdAt',
  subcategories:           'id, categoryId, name, createdAt',
  suppliers:               'id, name, createdAt',
  supplierContacts:        'id, supplierId, name',

  // Attributes
  attributeDefinitions:    'id, name, createdAt',
  productAttributeValues:  'id, productId, attributeDefinitionId',
  variantAttributeValues:  'id, variantId, attributeDefinitionId',

  // Products
  products:                'id, categoryId, subcategoryId, supplierId, name, createdAt',
  productVariants:         'id, productId, barcode, createdAt',

  // Inventory
  inventoryItems:          'id, variantId, productId, barcode, status, createdAt',
  inventoryMovements:      'id, inventoryItemId, variantId, type, createdAt',
};

/**
 * Version 2: adds customers, invoices, billing & audit tables.
 * Only new / changed tables need to be listed here.
 */
export const SCHEMA_V2 = {
  ...SCHEMA_V1,

  // Customers & billing
  customers:    'id, storeId, phone, createdAt',
  invoices:     'id, storeId, invoiceNumber, customerId, cashierId, status, createdAt',
  invoiceItems: 'id, invoiceId, productId, variantId, inventoryItemId, barcode, status, createdAt',
  payments:     'id, invoiceId, paymentMethod, status, createdAt',

  // Returns & exchanges
  returns:      'id, storeId, returnNumber, originalInvoiceId, customerId, refundMethod, createdAt',
  returnItems:  'id, returnId, originalInvoiceItemId, inventoryItemId, createdAt',
  exchanges:    'id, storeId, exchangeNumber, originalInvoiceId, returnId, replacementInvoiceId, createdAt',
  creditNotes:  'id, storeId, creditNoteNumber, originalInvoiceId, customerId, status, createdAt',

  // Audit
  auditLogs:    'id, storeId, userId, action, entityType, entityId, createdAt',
};
