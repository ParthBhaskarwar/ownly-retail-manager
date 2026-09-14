/**
 * ProductService — talks to the backend products API.
 *
 * Same exported shape as before, so ProductList, ProductSearch, the product
 * detail page and the Add Product form need no changes.
 *
 * The heavy lifting moved server-side: creating a product with variants and
 * opening stock is now ONE request in ONE database transaction, and
 * getProductDetail is one request instead of ~20 sequential reads.
 */

import { apiClient } from '@/lib/apiClient';
import type {
  Product,
  ProductDetail,
  ProductSummary,
  ProductVariant,
  CreateProductInput,
  CreateVariantInput,
  UpdateProductInput,
  UpdateVariantInput,
  ProductSearchFilters,
  PhotoFingerprintResult,
  SimilarProduct,
  ProductPerformanceMetrics,
} from '@/modules/product/types';

export const ProductService = {
  /**
   * Creates a product with its attributes, variants and each variant's
   * opening stock (one unique barcode per physical unit).
   *
   * storeId/createdBy in the input are ignored by the server — it derives
   * both from the caller's token so a client cannot write into another store.
   */
  async createProduct(input: CreateProductInput): Promise<Product> {
    const { product } = await apiClient.post<{ product: Product }>('/api/products', {
      retailTemplateId: input.retailTemplateId,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      supplierId: input.supplierId,
      name: input.name,
      baseSku: input.baseSku,
      description: input.description,
      baseSellingPrice: input.baseSellingPrice,
      baseCostPrice: input.baseCostPrice,
      status: input.status,
      attributeValues: input.attributeValues,
      variants: input.variants,
    });
    return product;
  },

  /**
   * Update a product. Logs price changes to audit trail.
   */
  async updateProduct(
    id: string,
    updates: UpdateProductInput,
    storeId: string
  ): Promise<Product> {
    const before = await Adapters.product.findById(id);
    if (!before) throw new Error(`Product ${id} not found`);

    const after = await Adapters.product.update(id, updates);

    // Audit price changes explicitly — they are sensitive
    if (
      updates.baseSellingPrice !== undefined ||
      updates.baseCostPrice !== undefined
    ) {
      AuditService.log('product.price_change', id, storeId, {
        old: { baseSellingPrice: before.baseSellingPrice, baseCostPrice: before.baseCostPrice },
        new: { baseSellingPrice: after.baseSellingPrice, baseCostPrice: after.baseCostPrice },
      });
    } else {
      AuditService.log('product.update', id, storeId, { ...updates });
    }

    return after;
  },

  async getProductDetail(id: string): Promise<ProductDetail | null> {
    try {
      const { product } = await apiClient.get<{ product: ProductDetail }>(`/api/products/${id}`);
      return product;
    } catch (err) {
      // A missing product is a normal outcome here (stale link, deleted row);
      // the page renders its "not found" state rather than an error.
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  },

  async searchProducts(
    filters: ProductSearchFilters
  ): Promise<{ items: ProductSummary[]; total: number }> {
    return apiClient.get<{ items: ProductSummary[]; total: number }>('/api/products', {
      query: {
        query: filters.query,
        categoryId: filters.categoryId,
        subcategoryId: filters.subcategoryId,
        supplierId: filters.supplierId,
        status: filters.status,
        page: filters.page,
        pageSize: filters.pageSize,
      },
    });
  },

  // ── Week 6: Photo intelligence ────────────────────────────────────────────

  /**
   * Upload a base64 image for a saved product. The backend computes the DCT
   * fingerprint offline and persists it. Returns quality score, issues, and
   * attribute suggestions.
   */
  async uploadFingerprint(
    productId: string,
    base64Image: string
  ): Promise<PhotoFingerprintResult> {
    return apiClient.post<PhotoFingerprintResult>(
      `/api/products/${productId}/fingerprint`,
      { image: base64Image }
    );
  },

  /**
   * Find products visually similar to the given product (requires fingerprint).
   * Returns `{ enabled: false }` when the product has no fingerprint.
   */
  async getSimilarProducts(
    productId: string,
    limit = 5
  ): Promise<{ enabled: boolean; similar: SimilarProduct[]; duplicateThreshold?: number }> {
    return apiClient.get<{ enabled: boolean; similar: SimilarProduct[]; duplicateThreshold?: number }>(
      `/api/products/${productId}/similar`,
      { query: { limit } }
    );
  },

  // ── Week 6: Performance analytics ────────────────────────────────────────

  /**
   * Get (or compute) performance metrics for a product.
   * Pass refresh=true to force re-computation from raw data.
   */
  async getPerformanceMetrics(
    productId: string,
    refresh = false
  ): Promise<ProductPerformanceMetrics> {
    const { metrics } = await apiClient.get<{ metrics: ProductPerformanceMetrics }>(
      `/api/products/${productId}/performance`,
      { query: refresh ? { refresh: 'true' } : {} }
    );
    return metrics;
  },

  /**
   * Trigger a full store-wide performance metrics refresh.
   */
  async refreshAllPerformanceMetrics(): Promise<{ refreshed: number }> {
    return apiClient.post<{ refreshed: number }>(
      '/api/products/performance/refresh',
      {}
    );
  },
};

export const VariantService = {
  async createVariant(
    productId: string,
    input: CreateVariantInput,
    _storeId?: string,
    _performedBy?: string
  ): Promise<ProductVariant> {
    const { variant } = await apiClient.post<{ variant: ProductVariant }>(
      `/api/products/${productId}/variants`,
      input
    );
    return variant;
  },

  async updateVariant(
    id: string,
    updates: UpdateVariantInput,
    productId?: string
  ): Promise<ProductVariant> {
    if (!productId) {
      throw new Error('updateVariant requires the productId that owns this variant.');
    }
    const { variant } = await apiClient.put<{ variant: ProductVariant }>(
      `/api/products/${productId}/variants/${id}`,
      updates
    );
    return variant;
  },
};
