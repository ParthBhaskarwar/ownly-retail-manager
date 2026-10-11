/**
 * Domain types — the API contract.
 *
 * These mirror the shapes in Frontend/src/modules/<domain>/types.ts exactly.
 * The frontend consumes these responses directly, so any change here is a
 * breaking API change and must be mirrored on the frontend.
 *
 * All timestamps are ISO strings, all ids are UUID strings, all money values
 * are numbers (see db/pg-mapping.ts for the NUMERIC parser that guarantees
 * prices arrive as numbers rather than strings).
 */

// ─── Account / Staff ──────────────────────────────────────────────────────────

export type Role = 'OWNER' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF' | 'ACCOUNTANT' | 'VIEWER';

export const ALL_ROLES: Role[] = [
  'OWNER', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'ACCOUNTANT', 'VIEWER',
];

export interface User {
  id: string;
  storeId: string | null;
  name: string;
  email: string;
  phone: string;
  role: Role;
  isActive: boolean;
  verifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
  deviceInfo: DeviceInfo | null;
  createdAt: string;
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  language: string;
}

export interface AuthResult {
  user: User;
  session: Session;
  token: string;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export interface TaxSettings {
  gstEnabled: boolean;
  gstRate: number;
  inclusiveTax: boolean;
}

export interface InvoiceSettings {
  prefix: string;
  nextNumber: number;
  showGst: boolean;
  termsAndConditions?: string;
}

export interface Store {
  id: string;
  ownerId: string;
  name: string;
  address: string;
  phone: string;
  gstNumber?: string;
  currency: string;
  taxSettings?: TaxSettings;
  invoiceSettings?: InvoiceSettings;
  logoUrl?: string;
  retailType: string;
  setupCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  retailTemplateId: string;
  storeId: string | null;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Subcategory {
  id: string;
  categoryId: string;
  storeId: string | null;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Supplier {
  id: string;
  storeId: string;
  name: string;
  code: string;
  gstin?: string;
  address?: string;
  paymentTerms?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Attributes ───────────────────────────────────────────────────────────────

export type AttributeDataType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'ENUM';

export interface AttributeDefinition {
  id: string;
  retailTemplateId: string;
  name: string;
  dataType: AttributeDataType;
  isRequired: boolean;
  isVariantLevel: boolean;
  /** JSON-serialized string[] — kept as a string to match the frontend contract. */
  enumValues: string | null;
  /** JSON-serialized string[] of applicable category names, or null/empty for global. */
  applicableCategories?: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface ResolvedAttribute {
  definition: AttributeDefinition;
  value: string;
}

export interface AttributeValueInput {
  attributeDefinitionId: string;
  value: string;
}

// ─── Product ──────────────────────────────────────────────────────────────────

export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';

export interface Product {
  id: string;
  storeId: string;
  retailTemplateId: string;
  categoryId: string;
  subcategoryId: string | null;
  supplierId: string | null;
  name: string;
  baseSku: string;
  description?: string;
  baseSellingPrice: number;
  baseCostPrice: number;
  status: ProductStatus;
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  displayName: string;
  sellingPriceOverride: number | null;
  costPriceOverride: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSummary extends Product {
  categoryName: string;
  subcategoryName?: string;
  supplierName?: string;
  variantCount: number;
  totalInStock: number;
}

export interface VariantWithStock extends ProductVariant {
  attributes: ResolvedAttribute[];
  stock: StockSummary;
  effectiveSellingPrice: number;
  effectiveCostPrice: number;
}

export interface ProductDetail extends Product {
  categoryName?: string;
  subcategoryName?: string;
  supplierName?: string;
  attributes: ResolvedAttribute[];
  variants: VariantWithStock[];
}

export interface CreateVariantInput {
  sku: string;
  displayName: string;
  sellingPriceOverride?: number;
  costPriceOverride?: number;
  attributeValues: AttributeValueInput[];
  sortOrder?: number;
  /** If present, opening stock is created for this variant in the same transaction. */
  initialStock?: {
    quantity: number;
    purchaseCostPrice: number;
    purchaseDate: string;
  };
}

export interface CreateProductInput {
  storeId: string;
  retailTemplateId: string;
  categoryId: string;
  subcategoryId?: string;
  supplierId?: string;
  name: string;
  baseSku: string;
  description?: string;
  baseSellingPrice: number;
  baseCostPrice: number;
  status?: ProductStatus;
  imageUrls?: string[];
  attributeValues: AttributeValueInput[];
  variants: CreateVariantInput[];
  createdBy: string;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  categoryId?: string;
  subcategoryId?: string | null;
  supplierId?: string | null;
  baseSellingPrice?: number;
  baseCostPrice?: number;
  status?: ProductStatus;
  imageUrls?: string[];
  attributeValues?: AttributeValueInput[];
  updatedBy: string;
}

export interface UpdateVariantInput {
  displayName?: string;
  sellingPriceOverride?: number | null;
  costPriceOverride?: number | null;
  isActive?: boolean;
  attributeValues?: AttributeValueInput[];
}

export interface ProductSearchFilters {
  storeId: string;
  query?: string;
  categoryId?: string;
  subcategoryId?: string;
  supplierId?: string;
  status?: ProductStatus;
  page?: number;
  pageSize?: number;
}

// ─── Inventory ────────────────────────────────────────────────────────────────

/** Item lifecycle statuses. Mirrors plan §2.8 — see migration 004. */
export type InventoryStatus =
  | 'IN_STOCK' | 'RESERVED' | 'SOLD' | 'RETURNED_TO_STOCK'
  | 'RETURNED_DAMAGED' | 'DAMAGED' | 'LOST' | 'TRANSFERRED_OUT'
  | 'EXCHANGED' | 'DEFECTIVE' | 'SUPPLIER_RETURN';

export const ALL_INVENTORY_STATUSES: InventoryStatus[] = [
  'IN_STOCK', 'RESERVED', 'SOLD', 'RETURNED_TO_STOCK', 'RETURNED_DAMAGED',
  'DAMAGED', 'LOST', 'TRANSFERRED_OUT', 'EXCHANGED', 'DEFECTIVE', 'SUPPLIER_RETURN',
];

export type MovementType =
  | 'PURCHASE' | 'SALE' | 'RETURN_TO_STOCK' | 'RETURN_DAMAGED'
  | 'DAMAGE_WRITE_OFF' | 'LOSS_WRITE_OFF' | 'TRANSFER_OUT' | 'TRANSFER_IN'
  | 'MANUAL_ADJUSTMENT' | 'EXCHANGE' | 'DEFECT_WRITE_OFF' | 'SUPPLIER_RETURN'
  | 'RESTOCK';

export const ALL_MOVEMENT_TYPES: MovementType[] = [
  'PURCHASE', 'SALE', 'RETURN_TO_STOCK', 'RETURN_DAMAGED', 'DAMAGE_WRITE_OFF',
  'LOSS_WRITE_OFF', 'TRANSFER_OUT', 'TRANSFER_IN', 'MANUAL_ADJUSTMENT',
  'EXCHANGE', 'DEFECT_WRITE_OFF', 'SUPPLIER_RETURN', 'RESTOCK',
];

/** Statuses that count as physically present and sellable. */
export const IN_STOCK_STATUSES: InventoryStatus[] = ['IN_STOCK', 'RETURNED_TO_STOCK'];

export type MovementReferenceType =
  | 'INVOICE' | 'RETURN_TRANSACTION' | 'MANUAL_ADJUSTMENT' | 'PURCHASE_ENTRY'
  | 'RESTOCK_BATCH';

export interface InventoryItem {
  id: string;
  storeId: string;
  variantId: string;
  barcode: string;
  /** SNAPSHOT of the cost paid for this specific physical piece. */
  purchaseCostPrice: number;
  purchaseDate: string;
  status: InventoryStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  storeId: string;
  inventoryItemId: string;
  movementType: MovementType;
  fromStatus: InventoryStatus;
  toStatus: InventoryStatus;
  referenceType: MovementReferenceType;
  referenceId: string;
  performedBy: string;
  performedAt: string;
  notes?: string;
}

export interface StockSummary {
  variantId: string;
  inStock: number;
  reserved: number;
  sold: number;
  returned: number;
  damaged: number;
  lost: number;
  total: number;
}

export interface AddStockInput {
  storeId: string;
  variantId: string;
  quantity: number;
  purchaseCostPrice: number;
  purchaseDate: string;
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
  /** Exact item id — backs the item detail page. */
  itemId?: string;
  variantId?: string;
  barcode?: string;
  /** Free text across barcode, variant SKU and product name. */
  query?: string;
  categoryId?: string;
  supplierId?: string;
  /** Size attribute value, e.g. 'XL'. */
  size?: string;
  purchaseDateFrom?: string;
  purchaseDateTo?: string;
  page?: number;
  pageSize?: number;
}

/** An inventory item joined to the context a list view needs to show. */
export interface InventoryItemRow extends InventoryItem {
  productId: string;
  productName: string;
  variantSku: string;
  variantDisplayName: string;
  size: string | null;
  categoryName: string | null;
  supplierName: string | null;
  /** Variant override, else the product's base price. */
  sellingPrice: number;
  /** Whole days between purchaseDate and today. */
  ageDays: number;
}

// ─── Valuation & alerts (plan §2.8) ───────────────────────────────────────────

export interface StockValuation {
  itemCount: number;
  /** Σ purchase cost of items physically in stock. */
  stockCostValue: number;
  /** Σ effective selling price of those same items. */
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

// ─── Restocking (plan Week 5) ─────────────────────────────────────────────────

/** One size/variant line in a manual restock request. */
export interface RestockLineInput {
  variantId: string;
  quantity: number;
  purchaseCostPrice: number;
  purchaseDate: string; // YYYY-MM-DD
}

/** Full restock request for one batch operation. */
export interface RestockInput {
  storeId: string;
  performedBy: string;
  lines: RestockLineInput[];
  notes?: string;
}

/** Result for one variant within a restock batch. */
export interface RestockBatchLine {
  variantId: string;
  itemsCreated: InventoryItem[];
}

export interface RestockBatchResult {
  batchId: string;
  totalUnits: number;
  lines: RestockBatchLine[];
}

// ─── Week 6 — Photo Intelligence ──────────────────────────────────────────────

/**
 * Result of analysing one product photo (POST /api/products/analyze-photo).
 * Quality checks need no model, so they are present even when photo AI is
 * unavailable; suggestions and similar products need the embedding model.
 */
export interface PhotoAnalysisResult {
  /** false when the CLIP model is disabled or failed to load. */
  aiAvailable: boolean;
  /** 0–1 quality score (resolution, brightness, contrast, sharpness). */
  qualityScore: number;
  /** Human-readable quality issues detected (empty = good quality). */
  qualityIssues: string[];
  /** Colour / pattern suggestions to pre-fill product attributes (null without AI). */
  attributeSuggestions: {
    colours: string[];
    pattern: string;
    patternConfidence: number;
  } | null;
  /** Existing products that look like this photo, best first. */
  similar: SimilarProduct[];
  /** Similarity at/above which a match is flagged as a possible duplicate. */
  duplicateThreshold: number;
  /** Why AI parts are missing, when they are. */
  message?: string;
}

/**
 * A product returned by the similar-product search.
 * Similarity is the cosine similarity between CLIP image embeddings.
 */
export interface SimilarProduct {
  productId: string;
  name: string;
  baseSku: string;
  similarity: number;
  /** Warning flag: true when similarity >= the configured duplicate threshold. */
  isPossibleDuplicate: boolean;
  imageUrls: string[];
}

// ─── Week 6 — Product Performance ────────────────────────────────────────────

/** Per-size sell-through breakdown entry. */
export interface SizeDemandEntry {
  size: string;
  sold: number;
  inStock: number;
  /** sold / (sold + inStock), 0–1. */
  sellThroughRate: number;
}

/**
 * All performance metrics for a single product.
 * Any field may be null when insufficient data exists (e.g. never stocked).
 */
export interface ProductPerformanceMetrics {
  productId: string;
  /** Days from first inventory item to first invoice sale. null = never sold. */
  timeToFirstSaleDays: number | null;
  /** Units sold per day averaged over the last 30 days. */
  salesVelocity30d: number | null;
  /** sold / (sold + inStock) across all variants, 0–1. null = no stock ever. */
  sellThroughRate: number | null;
  /** Average (NOW() - purchase_date) in days for currently in-stock items. */
  avgStockAgeDays: number | null;
  /** Per-size sell-through breakdown. Empty when no size attribute exists. */
  sizeDemand: SizeDemandEntry[];
  /** ISO timestamp of when these metrics were last computed. */
  computedAt: string;
}
