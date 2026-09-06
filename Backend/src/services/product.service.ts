/**
 * ProductService — Product (level 1) and ProductVariant (level 2).
 *
 * Ported from Frontend/src/modules/product/services/ProductService.ts with two
 * deliberate improvements that the move to SQL makes possible:
 *
 * 1. createProduct is now ONE transaction covering product + attribute values
 *    + variants + opening stock. Previously these were sequential writes, so a
 *    failure partway through left an orphaned product with some variants.
 *
 * 2. getProductDetail / searchProducts no longer issue a query per variant.
 *    The old code did ~20 round-trips for one product page and hundreds for a
 *    product list, which is unusable against a hosted database.
 *
 * The returned shapes are unchanged, so the UI needs no modification.
 */

import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { db } from '@/db/client';
import { AppError } from '@/shared/AppError';
import { AuditService } from './audit.service';
import { AttributeService, toDefinition, type AttributeDefinitionRow } from './attribute.service';
import { InventoryService } from './inventory.service';
import type {
  CreateProductInput,
  CreateVariantInput,
  Product,
  ProductDetail,
  ProductSearchFilters,
  ProductSummary,
  ProductVariant,
  ResolvedAttribute,
  UpdateProductInput,
  UpdateVariantInput,
  VariantWithStock,
} from '@/types/domain';

export const ProductService = {
  /**
   * Creates a product, its attribute values, its variants, and each variant's
   * opening stock (with unique barcodes) as a single atomic unit.
   */
  async createProduct(input: CreateProductInput): Promise<Product> {
    return db.transaction(async (trx) => {
      const clash = await trx('products')
        .where({ store_id: input.storeId, base_sku: input.baseSku })
        .first();
      if (clash) {
        throw AppError.conflict(`A product with SKU "${input.baseSku}" already exists in this store.`);
      }

      const productId = randomUUID();

      await trx('products').insert({
        id: productId,
        store_id: input.storeId,
        retail_template_id: input.retailTemplateId,
        category_id: input.categoryId,
        subcategory_id: input.subcategoryId ?? null,
        supplier_id: input.supplierId ?? null,
        name: input.name,
        base_sku: input.baseSku,
        description: input.description ?? null,
        base_selling_price: input.baseSellingPrice,
        base_cost_price: input.baseCostPrice,
        status: input.status ?? 'ACTIVE',
        image_urls: JSON.stringify([]),
        created_by: input.createdBy,
        updated_by: input.createdBy,
      });

      await AttributeService.setProductAttributeValues(productId, input.attributeValues, trx);

      for (const [index, variant] of input.variants.entries()) {
        await createVariantInTrx(trx, {
          productId,
          storeId: input.storeId,
          performedBy: input.createdBy,
          input: { ...variant, sortOrder: index },
        });
      }

      await AuditService.log(
        {
          action: 'product.create', userId: input.createdBy, storeId: input.storeId,
          entityType: 'product', entityId: productId,
          meta: { name: input.name, baseSku: input.baseSku, variantCount: input.variants.length },
        },
        trx
      );

      return (await trx('products').where({ id: productId }).first()) as Product;
    });
  },

  async updateProduct(storeId: string, id: string, updates: UpdateProductInput): Promise<Product> {
    const before = (await db('products').where({ id, store_id: storeId }).first()) as Product | undefined;
    if (!before) throw AppError.notFound(`Product ${id} not found`);

    const patch: Record<string, unknown> = { updated_by: updates.updatedBy, updated_at: new Date() };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.categoryId !== undefined) patch.category_id = updates.categoryId;
    if (updates.subcategoryId !== undefined) patch.subcategory_id = updates.subcategoryId;
    if (updates.supplierId !== undefined) patch.supplier_id = updates.supplierId;
    if (updates.baseSellingPrice !== undefined) patch.base_selling_price = updates.baseSellingPrice;
    if (updates.baseCostPrice !== undefined) patch.base_cost_price = updates.baseCostPrice;
    if (updates.status !== undefined) patch.status = updates.status;

    const [after] = (await db('products').where({ id }).update(patch).returning('*')) as Product[];

    // Price changes are sensitive — audit them with before/after values.
    if (updates.baseSellingPrice !== undefined || updates.baseCostPrice !== undefined) {
      await AuditService.log({
        action: 'product.price_change', userId: updates.updatedBy, storeId,
        entityType: 'product', entityId: id,
        meta: {
          old: { baseSellingPrice: before.baseSellingPrice, baseCostPrice: before.baseCostPrice },
          new: { baseSellingPrice: after.baseSellingPrice, baseCostPrice: after.baseCostPrice },
        },
      });
    } else {
      await AuditService.log({
        action: 'product.update', userId: updates.updatedBy, storeId,
        entityType: 'product', entityId: id, meta: { ...updates },
      });
    }

    return after;
  },

  /** Product + resolved attributes + variants with stock, in a fixed number of queries. */
  async getProductDetail(storeId: string, id: string): Promise<ProductDetail | null> {
    const product = (await db('products').where({ id, store_id: storeId }).first()) as Product | undefined;
    if (!product) return null;

    const [defRows, productValues, variants] = await Promise.all([
      db('attribute_definitions').where({ retail_template_id: product.retailTemplateId }),
      db('product_attribute_values').where({ product_id: id }),
      db('product_variants').where({ product_id: id }).orderBy('sort_order', 'asc') as Promise<ProductVariant[]>,
    ]);

    const defMap = new Map(
      (defRows as AttributeDefinitionRow[]).map((d) => [d.id, toDefinition(d)])
    );

    const resolve = (values: Array<{ attributeDefinitionId: string; value: string }>): ResolvedAttribute[] =>
      values
        .map((v) => {
          const definition = defMap.get(v.attributeDefinitionId);
          return definition ? { definition, value: v.value } : null;
        })
        .filter((x): x is ResolvedAttribute => x !== null);

    const variantIds = variants.map((v) => v.id);

    const [variantValues, stockMap] = await Promise.all([
      variantIds.length
        ? db('variant_attribute_values').whereIn('variant_id', variantIds)
        : Promise.resolve([] as Array<{ variantId: string; attributeDefinitionId: string; value: string }>),
      InventoryService.getStockSummaries(variantIds),
    ]);

    const valuesByVariant = new Map<string, Array<{ attributeDefinitionId: string; value: string }>>();
    for (const v of variantValues as Array<{ variantId: string; attributeDefinitionId: string; value: string }>) {
      const list = valuesByVariant.get(v.variantId) ?? [];
      list.push(v);
      valuesByVariant.set(v.variantId, list);
    }

    const variantsWithStock: VariantWithStock[] = variants.map((v) => ({
      ...v,
      attributes: resolve(valuesByVariant.get(v.id) ?? []),
      stock: stockMap.get(v.id)!,
      effectiveSellingPrice: v.sellingPriceOverride ?? product.baseSellingPrice,
      effectiveCostPrice: v.costPriceOverride ?? product.baseCostPrice,
    }));

    return {
      ...product,
      attributes: resolve(productValues as Array<{ attributeDefinitionId: string; value: string }>),
      variants: variantsWithStock,
    };
  },

  /** Paginated search with category/supplier names and total stock joined in. */
  async searchProducts(filters: ProductSearchFilters): Promise<{ items: ProductSummary[]; total: number }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;

    const base = db('products as p').where('p.store_id', filters.storeId);
    if (filters.categoryId) base.andWhere('p.category_id', filters.categoryId);
    if (filters.subcategoryId) base.andWhere('p.subcategory_id', filters.subcategoryId);
    if (filters.supplierId) base.andWhere('p.supplier_id', filters.supplierId);
    if (filters.status) base.andWhere('p.status', filters.status);
    if (filters.query) {
      const term = `%${filters.query.trim()}%`;
      base.andWhere((qb) => qb.whereILike('p.name', term).orWhereILike('p.base_sku', term));
    }

    const countRow = await base.clone().count<{ count: number }[]>('* as count').first();

    const rows = (await base
      .clone()
      .leftJoin('categories as c', 'c.id', 'p.category_id')
      .leftJoin('subcategories as sc', 'sc.id', 'p.subcategory_id')
      .leftJoin('suppliers as s', 's.id', 'p.supplier_id')
      .select(
        'p.*',
        db.ref('c.name').as('category_name'),
        db.ref('sc.name').as('subcategory_name'),
        db.ref('s.name').as('supplier_name')
      )
      .orderBy('p.created_at', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize)) as Array<Product & {
        categoryName: string | null;
        subcategoryName: string | null;
        supplierName: string | null;
      }>;

    const productIds = rows.map((r) => r.id);

    // One query for variant counts + in-stock totals across the whole page.
    const stockRows = productIds.length
      ? ((await db('product_variants as v')
          .leftJoin('inventory_items as i', function join() {
            this.on('i.variant_id', '=', 'v.id').andOnIn('i.status', ['IN_STOCK', 'RETURNED_TO_STOCK']);
          })
          .select('v.product_id')
          .countDistinct('v.id as variant_count')
          .count('i.id as in_stock')
          .whereIn('v.product_id', productIds)
          .groupBy('v.product_id')) as Array<{
            productId: string; variantCount: number; inStock: number;
          }>)
      : [];

    const statsByProduct = new Map(stockRows.map((r) => [r.productId, r]));

    const items: ProductSummary[] = rows.map((row) => {
      const stats = statsByProduct.get(row.id);
      const { categoryName, subcategoryName, supplierName, ...product } = row;
      return {
        ...(product as Product),
        categoryName: categoryName ?? '—',
        subcategoryName: subcategoryName ?? undefined,
        supplierName: supplierName ?? undefined,
        variantCount: Number(stats?.variantCount ?? 0),
        totalInStock: Number(stats?.inStock ?? 0),
      };
    });

    return { items, total: Number(countRow?.count ?? 0) };
  },
};

// ─── Variants ─────────────────────────────────────────────────────────────────

async function createVariantInTrx(
  trx: Knex.Transaction,
  args: { productId: string; storeId: string; performedBy: string; input: CreateVariantInput }
): Promise<ProductVariant> {
  const { productId, storeId, performedBy, input } = args;

  const clash = await trx('product_variants').where({ product_id: productId, sku: input.sku }).first();
  if (clash) {
    throw AppError.conflict(`A variant with SKU "${input.sku}" already exists for this product.`);
  }

  const variantId = randomUUID();

  await trx('product_variants').insert({
    id: variantId,
    product_id: productId,
    sku: input.sku,
    display_name: input.displayName,
    selling_price_override: input.sellingPriceOverride ?? null,
    cost_price_override: input.costPriceOverride ?? null,
    is_active: true,
    sort_order: input.sortOrder ?? 0,
  });

  await AttributeService.setVariantAttributeValues(variantId, input.attributeValues, trx);

  if (input.initialStock && input.initialStock.quantity > 0) {
    await InventoryService.addStock(
      {
        storeId,
        variantId,
        quantity: input.initialStock.quantity,
        purchaseCostPrice: input.initialStock.purchaseCostPrice,
        purchaseDate: input.initialStock.purchaseDate,
        performedBy,
      },
      input.sku,
      trx
    );
  }

  return (await trx('product_variants').where({ id: variantId }).first()) as ProductVariant;
}

export const VariantService = {
  async createVariant(
    storeId: string,
    productId: string,
    performedBy: string,
    input: CreateVariantInput
  ): Promise<ProductVariant> {
    const product = await db('products').where({ id: productId, store_id: storeId }).first();
    if (!product) throw AppError.notFound(`Product ${productId} not found`);

    return db.transaction((trx) => createVariantInTrx(trx, { productId, storeId, performedBy, input }));
  },

  async updateVariant(
    storeId: string,
    productId: string,
    variantId: string,
    updates: UpdateVariantInput
  ): Promise<ProductVariant> {
    const product = await db('products').where({ id: productId, store_id: storeId }).first();
    if (!product) throw AppError.notFound(`Product ${productId} not found`);

    return db.transaction(async (trx) => {
      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (updates.displayName !== undefined) patch.display_name = updates.displayName;
      if (updates.sellingPriceOverride !== undefined) patch.selling_price_override = updates.sellingPriceOverride;
      if (updates.costPriceOverride !== undefined) patch.cost_price_override = updates.costPriceOverride;
      if (updates.isActive !== undefined) patch.is_active = updates.isActive;

      const [updated] = (await trx('product_variants')
        .where({ id: variantId, product_id: productId })
        .update(patch)
        .returning('*')) as ProductVariant[];
      if (!updated) throw AppError.notFound(`Variant ${variantId} not found`);

      if (updates.attributeValues) {
        await AttributeService.setVariantAttributeValues(variantId, updates.attributeValues, trx);
      }

      return updated;
    });
  },
};
