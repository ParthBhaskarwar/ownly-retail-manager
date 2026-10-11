/**
 * Restock and Restock Reminders Types
 */

import type { InventoryItem } from '@/modules/inventory/types';

export interface RestockVariantLine {
  variantId: string;
  sku: string;
  displayName: string;
  sizeName: string;
  currentStock: number;
  restockQty: number;
  costPriceOverride?: number | null;
  sellingPriceOverride?: number | null;
}

export interface ExecuteRestockInput {
  storeId: string;
  storeCode: string;
  productId: string;
  supplierId?: string;
  supplierName?: string;
  performedBy: string;
  notes?: string;
  lines: RestockVariantLine[];
}

export interface RestockResult {
  productId: string;
  totalQuantity: number;
  totalPurchaseCost: number;
  expectedSalesValue: number;
  potentialProfit: number;
  generatedItems: InventoryItem[];
  barcodes: string[];
}

export interface RestockReminder {
  productId: string;
  productName: string;
  baseSku: string;
  variantId: string;
  variantSku: string;
  sizeName: string;
  currentStock: number;
  minThreshold: number;
  suggestedQuantity: number;
  supplierId?: string | null;
  supplierName?: string;
  costPrice: number;
  sellingPrice: number;
  urgency: 'OUT_OF_STOCK' | 'LOW_STOCK';
}
