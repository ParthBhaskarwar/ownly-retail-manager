/**
 * Inventory module — InventoryItem (Level 3) and InventoryMovement (Level 4).
 *
 * InventoryItem: one row per physical piece. Has a unique barcode per store.
 *   purchase_cost_price is a SNAPSHOT — does not change when supplier prices change.
 *
 * InventoryMovement: append-only event log. Every status change creates a movement.
 */

// ─── Inventory Status ─────────────────────────────────────────────────────────

export type InventoryStatus =
  | 'IN_STOCK'
  | 'RESERVED'
  | 'SOLD'
  | 'RETURNED_TO_STOCK'
  | 'RETURNED_DAMAGED'
  | 'DAMAGED'
  | 'LOST'
  | 'TRANSFERRED_OUT'
  | 'EXCHANGED'
  | 'DEFECTIVE'
  | 'SUPPLIER_RETURN';

/** Display order for the inventory status filter tabs. */
export const ALL_INVENTORY_STATUSES: InventoryStatus[] = [
  'IN_STOCK', 'SOLD', 'RESERVED', 'RETURNED_TO_STOCK', 'EXCHANGED',
  'DAMAGED', 'DEFECTIVE', 'RETURNED_DAMAGED', 'LOST', 'SUPPLIER_RETURN',
  'TRANSFERRED_OUT',
];

/** Human labels — the plan's §2.8 vocabulary, not the raw enum. */
export const STATUS_LABELS: Record<InventoryStatus, string> = {
  IN_STOCK: 'Available',
  RESERVED: 'Reserved',
  SOLD: 'Sold',
  RETURNED_TO_STOCK: 'Returned',
  RETURNED_DAMAGED: 'Returned Damaged',
  DAMAGED: 'Damaged',
  DEFECTIVE: 'Defective',
  LOST: 'Missing',
  EXCHANGED: 'Exchanged',
  SUPPLIER_RETURN: 'Supplier Return',
  TRANSFERRED_OUT: 'Transferred Out',
};

// ─── Movement Types ───────────────────────────────────────────────────────────

export type MovementType =
  | 'PURCHASE'
  | 'SALE'
  | 'RETURN_TO_STOCK'
  | 'RETURN_DAMAGED'
  | 'DAMAGE_WRITE_OFF'
  | 'LOSS_WRITE_OFF'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'MANUAL_ADJUSTMENT'
  | 'EXCHANGE'
  | 'DEFECT_WRITE_OFF'
  | 'SUPPLIER_RETURN';

/**
 * The movement type that explains each status transition, so the UI never
 * has to ask the user to pick both.
 */
export const MOVEMENT_FOR_STATUS: Record<InventoryStatus, MovementType> = {
  IN_STOCK: 'MANUAL_ADJUSTMENT',
  RESERVED: 'MANUAL_ADJUSTMENT',
  SOLD: 'SALE',
  RETURNED_TO_STOCK: 'RETURN_TO_STOCK',
  RETURNED_DAMAGED: 'RETURN_DAMAGED',
  DAMAGED: 'DAMAGE_WRITE_OFF',
  DEFECTIVE: 'DEFECT_WRITE_OFF',
  LOST: 'LOSS_WRITE_OFF',
  EXCHANGED: 'EXCHANGE',
  SUPPLIER_RETURN: 'SUPPLIER_RETURN',
  TRANSFERRED_OUT: 'TRANSFER_OUT',
};

export type MovementReferenceType =
  | 'INVOICE'
  | 'RETURN_TRANSACTION'
  | 'MANUAL_ADJUSTMENT'
  | 'PURCHASE_ENTRY';

// ─── InventoryItem (Level 3) ──────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  storeId: string;
  variantId: string;
  barcode: string;
  /** SNAPSHOT: cost paid for this physical piece at time of entry.
   *  Does NOT change when supplier cost changes later. */
  purchaseCostPrice: number;
  purchaseDate: string;    // ISO date string
  status: InventoryStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

// ─── InventoryMovement (Level 4) ─────────────────────────────────────────────

export interface InventoryMovement {
  id: string;
  storeId: string;
  inventoryItemId: string;
  movementType: MovementType;
  fromStatus: InventoryStatus;
  toStatus: InventoryStatus;
  referenceType: MovementReferenceType;
  referenceId: string;
  performedBy: string;     // userId
  performedAt: string;     // ISO datetime
  notes?: string;
}

// ─── Aggregates ───────────────────────────────────────────────────────────────

/** Per-variant stock count aggregate. Recomputed from InventoryItems. */
export interface StockSummary {
  variantId: string;
  inStock: number;
  reserved: number;
  sold: number;
  returned: number;
  damaged: number;
  lost: number;
  total: number;           // total physical items ever entered
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface AddStockInput {
  storeId: string;
  variantId: string;
  quantity: number;
  purchaseCostPrice: number;
  purchaseDate: string;
  /** Optional: provide pre-existing barcodes (e.g. manufacturer barcodes).
   *  Length must equal quantity. If omitted, barcodes are auto-generated. */
  barcodes?: string[];
  performedBy: string;
  notes?: string;
}

export interface UpdateInventoryStatusInput {
  inventoryItemId: string;
  newStatus: InventoryStatus;
  movementType: MovementType;
  referenceType: MovementReferenceType;
  referenceId: string;
  performedBy: string;
  notes?: string;
}

export interface InventorySearchFilters {
  storeId: string;
  status?: InventoryStatus;
  variantId?: string;
  barcode?: string;
  purchaseDateFrom?: string;
  purchaseDateTo?: string;
  page?: number;
  pageSize?: number;
}

// ─── List / valuation / alerts (Week 3) ───────────────────────────────────────

/** An inventory item joined to the context the list view displays. */
export interface InventoryItemRow extends InventoryItem {
  productId: string;
  productName: string;
  variantSku: string;
  variantDisplayName: string;
  size: string | null;
  categoryName: string | null;
  supplierName: string | null;
  sellingPrice: number;
  ageDays: number;
}

export interface StockValuation {
  itemCount: number;
  stockCostValue: number;
  expectedSalesValue: number;
  potentialGrossProfit: number;
}

export interface LowStockVariant {
  variantId: string;
  productId: string;
  productName: string;
  variantSku: string;
  size: string | null;
  inStock: number;
}

export interface AgeingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  count: number;
}

export interface StockAlerts {
  lowStockThreshold: number;
  lowStock: LowStockVariant[];
  outOfStock: LowStockVariant[];
  ageing: AgeingBucket[];
}

export interface InventoryListFilters {
  query?: string;
  status?: InventoryStatus;
  categoryId?: string;
  supplierId?: string;
  size?: string;
  page?: number;
  pageSize?: number;
}
