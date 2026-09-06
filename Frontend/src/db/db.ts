/**
 * DexieDb — singleton database instance for Ownly.
 */

import Dexie, { type Table } from 'dexie';
import { SCHEMA_V1, SCHEMA_V2 } from './schema';
import type { Category, Subcategory, Supplier } from '@/modules/catalog/types';
import type {
  AttributeDefinition,
  ProductAttributeValue,
  VariantAttributeValue,
} from '@/modules/attributes/types';
import type { Product, ProductVariant } from '@/modules/product/types';
import type { InventoryItem, InventoryMovement } from '@/modules/inventory/types';

export interface SupplierContact {
  id: string;
  supplierId: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  isPrimary: boolean;
}

export interface Customer {
  id: string;
  storeId?: string;
  name: string;
  phone: string;
  email?: string;
  totalPurchases: number;
  createdAt: string;
}

export interface Invoice {
  id: string;
  storeId?: string;
  invoiceNumber: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  cashierId: string;
  subtotal: number;
  discountType?: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  discountAmount: number;
  discountAppliedBy?: string;
  taxAmount: number;
  grandTotal: number;
  amountPaid: number;
  changeGiven: number;
  status: 'COMPLETED' | 'PARTIALLY_RETURNED' | 'FULLY_RETURNED' | 'EXCHANGED' | 'CANCELLED';
  notes?: string;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  variantId: string;
  inventoryItemId: string;
  barcode: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  finalPrice: number;
  status: 'ACTIVE' | 'RETURNED' | 'EXCHANGED';
  createdAt: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'CREDIT_NOTE';
  amount: number;
  transactionReference?: string;
  status: 'COMPLETED' | 'REFUNDED';
  createdAt: string;
}

export interface Return {
  id: string;
  returnNumber: string;
  storeId?: string;
  originalInvoiceId: string;
  customerId?: string;
  processedBy: string;
  totalRefundAmount: number;
  refundMethod: 'CASH' | 'UPI' | 'CARD' | 'CREDIT_NOTE' | 'EXCHANGE';
  notes?: string;
  createdAt: string;
}

export interface ReturnItem {
  id: string;
  returnId: string;
  originalInvoiceItemId: string;
  inventoryItemId: string;
  condition: 'RESELLABLE' | 'DAMAGED' | 'DEFECTIVE' | 'OPENED_USED' | 'OTHER';
  reason?: string;
  refundAmount: number;
  inventoryAction: 'RETURN_TO_STOCK' | 'RETURN_DAMAGED';
  createdAt: string;
}

export interface Exchange {
  id: string;
  exchangeNumber: string;
  storeId?: string;
  originalInvoiceId: string;
  returnId: string;
  replacementInvoiceId: string;
  processedBy: string;
  returnedValue: number;
  replacementValue: number;
  differenceAmount: number;
  paymentStatus: 'BALANCED' | 'CUSTOMER_PAID' | 'REFUND_ISSUED' | 'CREDIT_NOTE_ISSUED';
  createdAt: string;
}

export interface CreditNote {
  id: string;
  creditNoteNumber: string;
  storeId?: string;
  originalInvoiceId: string;
  returnId?: string;
  customerId?: string;
  originalAmount: number;
  remainingAmount: number;
  status: 'ACTIVE' | 'REDEEMED' | 'EXPIRED';
  expiryDate?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  storeId?: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, any>;
  createdAt: string;
}

class OwnlyDatabase extends Dexie {
  categories!: Table<Category>;
  subcategories!: Table<Subcategory>;
  suppliers!: Table<Supplier>;
  supplierContacts!: Table<SupplierContact>;
  attributeDefinitions!: Table<AttributeDefinition>;
  productAttributeValues!: Table<ProductAttributeValue>;
  variantAttributeValues!: Table<VariantAttributeValue>;
  products!: Table<Product>;
  productVariants!: Table<ProductVariant>;
  inventoryItems!: Table<InventoryItem>;
  inventoryMovements!: Table<InventoryMovement>;

  customers!: Table<Customer>;
  invoices!: Table<Invoice>;
  invoiceItems!: Table<InvoiceItem>;
  payments!: Table<Payment>;
  returns!: Table<Return>;
  returnItems!: Table<ReturnItem>;
  exchanges!: Table<Exchange>;
  creditNotes!: Table<CreditNote>;
  auditLogs!: Table<AuditLog>;

  constructor() {
    super('ownly_db');

    this.version(1).stores(SCHEMA_V1);

    this.version(2).stores(SCHEMA_V2);
  }
}

const db = typeof window !== 'undefined' ? new OwnlyDatabase() : (null as unknown as OwnlyDatabase);

export { db };
export type { OwnlyDatabase };
