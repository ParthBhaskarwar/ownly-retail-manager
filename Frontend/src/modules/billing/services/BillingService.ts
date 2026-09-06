/**
 * BillingService — Unified service handling POS Billing, Barcode Lookups,
 * Checkout, Returns, Exchanges, and Credit Notes on the Frontend.
 * Supports both API mode and Dexie IndexedDB offline fallback.
 */

import { db } from '@/db/db';
import { v4 as uuidv4 } from 'uuid';
import { getAuthHeaders } from '@/shared/utils/auth';
import type { CartItem, PaymentSplit } from '../types';

export interface CheckoutPayload {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  items: CartItem[];
  discountType?: 'PERCENTAGE' | 'FIXED';
  discountValue?: number;
  discountAmount?: number;
  discountAppliedBy?: string;
  taxAmount?: number;
  payments: PaymentSplit[];
  notes?: string;
}

export class BillingService {
  /**
   * Barcode Lookup — tries API first, then falls back to Dexie IndexedDB.
   */
  static async lookupBarcode(barcode: string, storeId: string = 'default-store'): Promise<{
    inventoryItemId: string;
    barcode: string;
    productId: string;
    productName: string;
    variantId: string;
    variantName: string;
    sku: string;
    unitPrice: number;
    status: string;
  }> {
    // 1. Try API lookup
    try {
      const res = await fetch(`/api/inventory/barcode/${encodeURIComponent(barcode)}`, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        return await res.json();
      }

      if (res.status === 400 || res.status === 404) {
        const errData = await res.json().catch(() => ({ error: 'Barcode error' }));
        throw new Error(errData.error || 'Barcode not available');
      }
    } catch (err: any) {
      if (err.message && (
        err.message.includes('sold') ||
        err.message.includes('damaged') ||
        err.message.includes('not found') ||
        err.message.includes('unavailable') ||
        err.message.includes('not in')
      )) {
        throw err;
      }
      // Network failure → proceed to Dexie offline fallback
    }

    // 2. Dexie IndexedDB Fallback
    if (typeof window === 'undefined' || !db) {
      throw new Error('Barcode not found and offline database unavailable');
    }

    const invItem = await db.inventoryItems
      .where('barcode')
      .equals(barcode)
      .first()
      .catch(() => null);

    if (!invItem) {
      throw new Error(`Barcode ${barcode} not found in database`);
    }

    if (invItem.status === 'SOLD') {
      throw new Error(`Item with barcode ${barcode} has already been sold`);
    }

    if (['DAMAGED', 'RETURNED_DAMAGED', 'LOST'].includes(invItem.status)) {
      throw new Error(`Item with barcode ${barcode} is damaged or unavailable`);
    }

    if (!['IN_STOCK', 'RETURNED_TO_STOCK'].includes(invItem.status)) {
      throw new Error(`Item ${barcode} is not in sellable stock (Status: ${invItem.status})`);
    }

    const variant = await db.productVariants.get(invItem.variantId).catch(() => null);
    const product = variant ? await db.products.get(variant.productId).catch(() => null) : null;

    const unitPrice = variant?.sellingPriceOverride ?? product?.baseSellingPrice ?? 0;

    return {
      inventoryItemId: invItem.id,
      barcode: invItem.barcode,
      productId: product?.id || 'prod-unknown',
      productName: product?.name || 'Retail Item',
      variantId: invItem.variantId,
      variantName: variant?.displayName || variant?.sku || 'Default Variant',
      sku: variant?.sku || 'SKU-001',
      unitPrice,
      status: invItem.status,
    };
  }

  /**
   * Process Checkout — API mode with Dexie fallback
   */
  static async checkout(
    payload: CheckoutPayload,
    storeId: string = 'default-store',
    cashierId: string = 'cashier-1'
  ): Promise<any> {
    // 1. Try API Checkout
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        return await res.json();
      }

      const errData = await res.json().catch(() => ({}));
      if (res.status === 400 || res.status === 401) {
        throw new Error((errData as any).error || 'Checkout failed');
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
        throw err;
      }
    }

    // 2. Dexie Offline Fallback Checkout
    if (typeof window === 'undefined' || !db) {
      throw new Error('Offline database unavailable');
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = (await db.invoices.count().catch(() => 0)) + 1;
    const invoiceNumber = `INV-${dateStr}-${count.toString().padStart(4, '0')}`;
    const invoiceId = uuidv4();

    let subtotal = 0;
    const invoiceItemsList = [];

    for (const item of payload.items) {
      const invRecord = await db.inventoryItems.get(item.inventoryItemId).catch(() => null);
      if (invRecord && invRecord.status === 'SOLD') {
        throw new Error(`Item ${item.barcode} is already sold`);
      }

      subtotal += item.finalPrice;
      invoiceItemsList.push({
        id: uuidv4(),
        invoiceId,
        productId: item.productId,
        variantId: item.variantId,
        inventoryItemId: item.inventoryItemId,
        barcode: item.barcode,
        productName: item.productName,
        variantName: item.variantName,
        quantity: 1,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        finalPrice: item.finalPrice,
        status: 'ACTIVE' as const,
        createdAt: new Date().toISOString(),
      });

      if (invRecord) {
        await db.inventoryItems.put({
          ...invRecord,
          status: 'SOLD',
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const calcDiscount = payload.discountAmount || 0;
    const calcTax = payload.taxAmount || 0;
    const grandTotal = Math.max(0, subtotal - calcDiscount + calcTax);

    let totalPaid = 0;
    const paymentsList = [];
    for (const p of payload.payments) {
      totalPaid += p.amount;
      paymentsList.push({
        id: uuidv4(),
        invoiceId,
        paymentMethod: p.paymentMethod,
        amount: p.amount,
        transactionReference: p.transactionReference,
        status: 'COMPLETED' as const,
        createdAt: new Date().toISOString(),
      });
    }

    const changeGiven = Math.max(0, totalPaid - grandTotal);

    const newInvoice = {
      id: invoiceId,
      storeId,
      invoiceNumber,
      customerId: payload.customerId,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      cashierId,
      subtotal,
      discountType: payload.discountType,
      discountValue: payload.discountValue || 0,
      discountAmount: calcDiscount,
      discountAppliedBy: payload.discountAppliedBy || cashierId,
      taxAmount: calcTax,
      grandTotal,
      amountPaid: totalPaid,
      changeGiven,
      status: 'COMPLETED' as const,
      notes: payload.notes,
      createdAt: new Date().toISOString(),
    };

    await db.invoices.add(newInvoice);
    await db.invoiceItems.bulkAdd(invoiceItemsList);
    await db.payments.bulkAdd(paymentsList);

    return {
      id: invoiceId,
      invoiceNumber,
      grandTotal,
      amountPaid: totalPaid,
      changeGiven,
      createdAt: newInvoice.createdAt,
    };
  }
}
