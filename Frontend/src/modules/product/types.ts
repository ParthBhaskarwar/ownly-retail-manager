/**
 * Product module — Product (Level 1) and ProductVariant (Level 2) domain types.
 *
 * Product: the design/style entity. Holds category, pricing baseline, status.
 *          Does NOT hold clothing-specific attributes — those live in ProductAttributeValue.
 * ProductVariant: one row per size/variation of a product. Has its own SKU.
 */

import type { ResolvedAttribute } from '@/modules/attributes/types';
import type { StockSummary } from '@/modules/inventory/types';

// ─── Product Status ───────────────────────────────────────────────────────────

export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';

// ─── Product (Level 1) ────────────────────────────────────────────────────────

export interface Product {
  id: string;
  storeId: string;
  retailTemplateId: string;
  categoryId: string;
  subcategoryId: string | null;
  supplierId: string | null;
  name: string;
  baseSku: string;         // unique per store e.g. 'BDJ-001'
  description?: string;
  baseSellingPrice: number;
  baseCostPrice: number;
  status: ProductStatus;
  imageUrls: string[];     // local file URIs or base64; stored as JSON in Dexie
  createdAt: string;
  updatedAt: string;
  createdBy: string;       // userId
  updatedBy: string;       // userId
}

// ─── ProductVariant (Level 2) ─────────────────────────────────────────────────

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;             // full variant SKU e.g. 'BDJ-001-XL', unique within product
  displayName: string;     // e.g. 'Blue Denim Jacket — XL'
  sellingPriceOverride: number | null;  // null = use product.baseSellingPrice
  costPriceOverride: number | null;     // null = use product.baseCostPrice
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Aggregates ───────────────────────────────────────────────────────────────

/** Product with its resolved category name, supplier name, and attribute values. */
export interface ProductSummary extends Product {
  categoryName: string;
  subcategoryName?: string;
  supplierName?: string;
  variantCount: number;
  totalInStock: number;     // sum of IN_STOCK across all variants
}

/** Full product detail: product + attributes + variants + stock counts per variant. */
export interface ProductDetail extends Product {
  categoryName?: string;
  subcategoryName?: string;
  supplierName?: string;
  attributes: ResolvedAttribute[];
  variants: VariantWithStock[];
}

export interface VariantWithStock extends ProductVariant {
  attributes: ResolvedAttribute[];  // e.g. [{definition: Size, value: 'XL'}]
  stock: StockSummary;
  effectiveSellingPrice: number;   // override ?? product.baseSellingPrice
  effectiveCostPrice: number;      // override ?? product.baseCostPrice
}

// ─── DTOs / Input shapes ──────────────────────────────────────────────────────

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
  /** Product-level attribute values (isVariantLevel = false) */
  attributeValues: Array<{ attributeDefinitionId: string; value: string }>;
  /** Initial variants to create alongside the product */
  variants: CreateVariantInput[];
  createdBy: string;
}

export interface CreateVariantInput {
  sku: string;
  displayName: string;
  sellingPriceOverride?: number;
  costPriceOverride?: number;
  /** Variant-level attribute values (isVariantLevel = true, e.g. Size) */
  attributeValues: Array<{ attributeDefinitionId: string; value: string }>;
  sortOrder?: number;
  /** If provided, immediately creates this many physical InventoryItems + unique barcodes for the variant. */
  initialStock?: {
    quantity: number;
    purchaseCostPrice: number;
    purchaseDate: string; // ISO date
  };
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
  attributeValues?: Array<{ attributeDefinitionId: string; value: string }>;
  updatedBy: string;
}

export interface UpdateVariantInput {
  displayName?: string;
  sellingPriceOverride?: number | null;
  costPriceOverride?: number | null;
  isActive?: boolean;
  attributeValues?: Array<{ attributeDefinitionId: string; value: string }>;
}

// ─── Filter / Search ──────────────────────────────────────────────────────────

export interface ProductSearchFilters {
  storeId: string;
  query?: string;           // name or SKU text search
  categoryId?: string;
  subcategoryId?: string;
  supplierId?: string;
  status?: ProductStatus;
  page?: number;            // 1-indexed, default 1
  pageSize?: number;        // default 20
}

// ─── Week 6 — Photo Intelligence ─────────────────────────────────────────────

export interface PhotoFingerprintResult {
  fingerprint: number[];
  qualityScore: number;
  qualityIssues: string[];
  attributeSuggestions: {
    colours: string[];
    pattern: string;
  };
}

export interface SimilarProduct {
  productId: string;
  name: string;
  baseSku: string;
  similarity: number;
  isPossibleDuplicate: boolean;
  imageUrls: string[];
}

// ─── Week 6 — Product Performance ────────────────────────────────────────────

export interface SizeDemandEntry {
  size: string;
  sold: number;
  inStock: number;
  sellThroughRate: number;
}

export interface ProductPerformanceMetrics {
  productId: string;
  timeToFirstSaleDays: number | null;
  salesVelocity30d: number | null;
  sellThroughRate: number | null;
  avgStockAgeDays: number | null;
  sizeDemand: SizeDemandEntry[];
  computedAt: string;
}

