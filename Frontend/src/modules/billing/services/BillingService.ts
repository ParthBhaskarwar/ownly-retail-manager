/**
 * BillingService — Unified service handling POS Billing, Barcode Lookups,
 * Checkout, Returns, Exchanges, and Credit Notes on the Frontend.
 * All operations go through the REST API.
 */

import { apiClient } from '@/lib/apiClient';
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
   * Barcode Lookup — returns a billing-ready item with product/variant context.
   * The backend joins inventory → variant → product and computes effective selling price.
   */
  static async lookupBarcode(barcode: string, _storeId?: string): Promise<{
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
    return apiClient.get(`/api/inventory/barcode/${encodeURIComponent(barcode)}`);
  }

  /**
   * Process Checkout — calls the backend API.
   */
  static async checkout(
    payload: CheckoutPayload,
    _storeId?: string,
    _cashierId?: string
  ): Promise<any> {
    return apiClient.post('/api/billing/checkout', payload);
  }
}

