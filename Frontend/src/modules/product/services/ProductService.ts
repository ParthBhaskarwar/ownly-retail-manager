import { v4 as uuidv4 } from 'uuid';
import { Adapters } from '@/adapters';
import { AuditService } from '@/shared/audit/AuditService';
import type {
  Product,
  ProductDetail,
  ProductSummary,
  VariantWithStock,
  CreateProductInput,
  CreateVariantInput,
  UpdateProductInput,
  ProductSearchFilters,
} from '@/modules/product/types';
import type { ResolvedAttribute } from '@/modules/attributes/types';

// ─── ProductService ───────────────────────────────────────────────────────────

export const ProductService = {
  /**
   * Create a product with its attribute values and initial variants.
   * All writes are composed into a logical unit — Dexie transactions per
   * sub-operation ensure no partial state.
   */
  async createProduct(input: CreateProductInput): Promise<Product> {
    // 1. Enforce SKU uniqueness per store
    const existing = await Adapters.product.findBySku(input.storeId, input.baseSku);
    if (existing) {
      throw new Error(
        `A product with SKU "${input.baseSku}" already exists in this store.`
      );
    }

    const productId = uuidv4();
    const now = new Date().toISOString();

    // 2. Create the product
    const product = await Adapters.product.create({
      id: productId,
      storeId: input.storeId,
      retailTemplateId: input.retailTemplateId,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId ?? null,
      supplierId: input.supplierId ?? null,
      name: input.name,
      baseSku: input.baseSku,
      description: input.description,
      baseSellingPrice: input.baseSellingPrice,
      baseCostPrice: input.baseCostPrice,
      status: input.status ?? 'ACTIVE',
      imageUrls: [],
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    });

    // 3. Create product-level attribute values
    if (input.attributeValues.length > 0) {
      await Adapters.attribute.setProductAttributeValues(productId, input.attributeValues);
    }

    // 4. Create initial variants
    for (let i = 0; i < input.variants.length; i++) {
      await VariantService.createVariant(productId, { ...input.variants[i], sortOrder: i });
    }

    AuditService.log('product.create', productId, input.storeId, {
      name: input.name,
      baseSku: input.baseSku,
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

  /**
   * Get full product detail: product + resolved attributes + variants + stock.
   */
  async getProductDetail(id: string): Promise<ProductDetail | null> {
    const product = await Adapters.product.findById(id);
    if (!product) return null;

    // Resolve product-level attributes
    const attrValues = await Adapters.attribute.getProductAttributeValues(id);
    const attrDefs = await Adapters.attribute.findDefinitionsByTemplate(product.retailTemplateId);
    const defMap = new Map(attrDefs.map((d) => [d.id, d]));

    const attributes: ResolvedAttribute[] = attrValues
      .map((av) => {
        const def = defMap.get(av.attributeDefinitionId);
        if (!def) return null;
        return { definition: def, value: av.value };
      })
      .filter(Boolean) as ResolvedAttribute[];

    // Resolve variants with their attributes and stock
    const rawVariants = await Adapters.productVariant.findByProductId(id);
    const variants: VariantWithStock[] = await Promise.all(
      rawVariants.map(async (v) => {
        const variantAttrValues = await Adapters.attribute.getVariantAttributeValues(v.id);
        const variantAttributes: ResolvedAttribute[] = variantAttrValues
          .map((av) => {
            const def = defMap.get(av.attributeDefinitionId);
            return def ? { definition: def, value: av.value } : null;
          })
          .filter(Boolean) as ResolvedAttribute[];

        const stock = await Adapters.inventoryItem.getStockSummary(v.id);

        return {
          ...v,
          attributes: variantAttributes,
          stock,
          effectiveSellingPrice: v.sellingPriceOverride ?? product.baseSellingPrice,
          effectiveCostPrice: v.costPriceOverride ?? product.baseCostPrice,
        };
      })
    );

    return { ...product, attributes, variants };
  },

  /**
   * Search products with filters. Resolves category names and stock counts.
   */
  async searchProducts(
    filters: ProductSearchFilters
  ): Promise<{ items: ProductSummary[]; total: number }> {
    const { items: rawItems, total } = await Adapters.product.search(filters);

    // Resolve category names and variant/stock counts in parallel
    const items = await Promise.all(
      rawItems.map(async (p) => {
        const [category, variants] = await Promise.all([
          Adapters.category.findById(p.categoryId),
          Adapters.productVariant.findByProductId(p.id),
        ]);

        // Aggregate stock across all variants
        const stockSummaries = await Promise.all(
          variants.map((v) => Adapters.inventoryItem.getStockSummary(v.id))
        );
        const totalInStock = stockSummaries.reduce((sum, s) => sum + s.inStock, 0);

        return {
          ...p,
          categoryName: category?.name ?? '—',
          variantCount: variants.length,
          totalInStock,
        } satisfies ProductSummary;
      })
    );

    return { items, total };
  },
};

// ─── VariantService ───────────────────────────────────────────────────────────

export const VariantService = {
  async createVariant(productId: string, input: CreateVariantInput): Promise<import('@/modules/product/types').ProductVariant> {
    // Enforce SKU uniqueness within product
    const existing = await Adapters.productVariant.findBySku(productId, input.sku);
    if (existing) {
      throw new Error(`A variant with SKU "${input.sku}" already exists for this product.`);
    }

    const variantId = uuidv4();
    const variant = await Adapters.productVariant.create({ ...input, id: variantId, productId });

    // Create variant-level attribute values
    if (input.attributeValues.length > 0) {
      await Adapters.attribute.setVariantAttributeValues(variantId, input.attributeValues);
    }

    return variant;
  },

  async updateVariant(
    id: string,
    updates: import('@/modules/product/types').UpdateVariantInput
  ): Promise<import('@/modules/product/types').ProductVariant> {
    const variant = await Adapters.productVariant.update(id, updates);

    // Update attribute values if provided
    if (updates.attributeValues) {
      await Adapters.attribute.setVariantAttributeValues(id, updates.attributeValues);
    }

    return variant;
  },
};
