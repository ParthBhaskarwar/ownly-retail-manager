/**
 * InventoryService — physical items (level 3) and movements (level 4).
 *
 * Ported from Frontend/src/modules/inventory/services/InventoryItemService.ts,
 * keeping the barcode semantics that were verified against Gate 2:
 *
 *   - one InventoryItem + one PURCHASE movement per physical piece
 *   - the barcode's trailing sequence is scoped to the STORE, never to the
 *     variant. The SKU segment is truncated to 8 chars, so sibling variants
 *     ('BLUDENJA-M' / 'BLUDENJA-L') collapse to the same text; a
 *     variant-scoped sequence would hand both the identical barcode.
 *   - purchase_cost_price is a per-item SNAPSHOT and never back-fills.
 *
 * Postgres makes this stronger than the IndexedDB version: the whole batch
 * runs in one transaction, so a unique-violation on `(store_id, barcode)`
 * rolls the entire batch back and the retry cannot double-insert.
 */

import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { db } from '@/db/client';
import { AppError } from '@/shared/AppError';
import { AuditService } from './audit.service';
import {
  IN_STOCK_STATUSES,
  type AddStockInput,
  type AgeingBucket,
  type InventoryItem,
  type InventoryItemRow,
  type InventoryMovement,
  type InventorySearchFilters,
  type LowStockVariant,
  type RestockBatchLine,
  type RestockBatchResult,
  type RestockInput,
  type StockAlerts,
  type StockSummary,
  type StockValuation,
  type UpdateInventoryStatusInput,
} from '@/types/domain';

const PG_UNIQUE_VIOLATION = '23505';
const MAX_BARCODE_RETRIES = 3;

/**
 * A variant with fewer than this many units in stock raises a low-stock
 * alert. Plan §2.8 requires the alert but does not fix a number; this is a
 * documented default, and belongs in store settings once that screen exists.
 */
const LOW_STOCK_THRESHOLD = 3;

/** Stock-ageing buckets, measured in days since purchase (plan §2.8). */
const AGEING_BUCKETS: Omit<AgeingBucket, 'count'>[] = [
  { label: '0–30 days',  minDays: 0,  maxDays: 30 },
  { label: '31–60 days', minDays: 31, maxDays: 60 },
  { label: '61–90 days', minDays: 61, maxDays: 90 },
  { label: '90+ days',   minDays: 91, maxDays: null },
];

// ─── Barcode generation ───────────────────────────────────────────────────────

/**
 * Short human-readable store prefix. Cosmetic only — uniqueness is guaranteed
 * by the (store_id, barcode) unique constraint plus the store-wide sequence.
 */
export function deriveStoreCode(storeId: string): string {
  return storeId.replace(/-/g, '').slice(0, 6).toUpperCase();
}

function generateBarcode(storeId: string, variantSku: string, sequence: number): string {
  const skuPart = variantSku.replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase();
  return `${deriveStoreCode(storeId)}-${skuPart}-${String(sequence).padStart(5, '0')}`;
}

/**
 * Next free sequence for the store, taken from the highest already issued
 * rather than a row count, so it stays correct even if items are removed.
 * Barcodes with no numeric suffix (manufacturer-supplied) are ignored.
 */
async function nextBarcodeSequence(conn: Knex | Knex.Transaction, storeId: string): Promise<number> {
  const result = await conn('inventory_items')
    .where({ store_id: storeId })
    .max<{ max: number | null }[]>(
      conn.raw(`CAST(NULLIF(SUBSTRING(barcode FROM '([0-9]+)$'), '') AS INTEGER)`) as never
    );
  const max = (result?.[0] as { max?: number | null } | undefined)?.max ?? 0;
  return Number(max) + 1;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === PG_UNIQUE_VIOLATION;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const InventoryService = {
  /**
   * Creates `quantity` physical items for a variant, each with its own unique
   * barcode, plus one PURCHASE movement each.
   *
   * Exported so ProductService can call it inside its own transaction when a
   * product is created with opening stock.
   */
  async addStock(
    input: AddStockInput,
    variantSku: string,
    existingTrx?: Knex.Transaction
  ): Promise<InventoryItem[]> {
    const { storeId, variantId, quantity, purchaseCostPrice, purchaseDate, performedBy, notes } = input;

    if (quantity < 1) throw AppError.badRequest('Quantity must be at least 1.');

    if (input.barcodes && input.barcodes.length !== quantity) {
      throw AppError.badRequest(
        `Barcode count (${input.barcodes.length}) does not match quantity (${quantity}).`
      );
    }

    const run = async (trx: Knex.Transaction): Promise<InventoryItem[]> => {
      if (input.barcodes) {
        const clashes = await trx('inventory_items')
          .where({ store_id: storeId })
          .whereIn('barcode', input.barcodes)
          .pluck('barcode');
        if (clashes.length) {
          throw AppError.conflict(
            `The following barcodes already exist in this store: ${clashes.join(', ')}`
          );
        }
      }

      const batchRef = randomUUID();

      for (let attempt = 0; ; attempt++) {
        const seqStart = input.barcodes ? 0 : await nextBarcodeSequence(trx, storeId);

        const items = Array.from({ length: quantity }, (_, i) => ({
          id: randomUUID(),
          store_id: storeId,
          variant_id: variantId,
          barcode: input.barcodes ? input.barcodes[i] : generateBarcode(storeId, variantSku, seqStart + i),
          purchase_cost_price: purchaseCostPrice,
          purchase_date: purchaseDate,
          status: 'IN_STOCK' as const,
          created_by: performedBy,
        }));

        try {
          const inserted = (await trx('inventory_items').insert(items).returning('*')) as InventoryItem[];

          await trx('inventory_movements').insert(
            inserted.map((item) => ({
              id: randomUUID(),
              store_id: storeId,
              inventory_item_id: item.id,
              movement_type: 'PURCHASE' as const,
              from_status: 'IN_STOCK' as const, // initial entry — no prior status
              to_status: 'IN_STOCK' as const,
              reference_type: 'PURCHASE_ENTRY' as const,
              reference_id: batchRef,
              performed_by: performedBy,
              notes: notes ?? null,
            }))
          );

          await AuditService.log(
            {
              action: 'inventory.add_stock', userId: performedBy, storeId,
              entityType: 'variant', entityId: variantId,
              meta: { quantity, purchaseCostPrice, purchaseDate, batchRef },
            },
            trx
          );

          return inserted;
        } catch (err) {
          // Auto-generated barcodes can collide if another request issued the
          // same sequence between our MAX() read and this insert. The whole
          // insert rolled back, so recomputing and retrying is safe.
          const canRetry =
            !input.barcodes && isUniqueViolation(err) && attempt < MAX_BARCODE_RETRIES - 1;
          if (!canRetry) throw err;
        }
      }
    };

    // A savepoint when nested inside an outer transaction; a real transaction otherwise.
    return existingTrx ? run(existingTrx) : db.transaction(run);
  },

  /** Billing hook — indexed lookup on (store_id, barcode). */
  async findByBarcode(storeId: string, barcode: string): Promise<InventoryItem | null> {
    return (await db('inventory_items').where({ store_id: storeId, barcode }).first()) ?? null;
  },

  /** One item with its joined display context — backs the item detail page. */
  async getRowById(storeId: string, itemId: string): Promise<InventoryItemRow | null> {
    const { items } = await this.search({ storeId, itemId, pageSize: 1 });
    return items[0] ?? null;
  },

  async findById(storeId: string, id: string): Promise<InventoryItem> {
    const row = await db('inventory_items').where({ id, store_id: storeId }).first();
    if (!row) throw AppError.notFound(`Inventory item ${id} not found`);
    return row as InventoryItem;
  },

  /**
   * Changes an item's status and appends the movement that explains it.
   * The two writes are one transaction: a status with no movement would break
   * the "every item traceable from creation to current status" requirement.
   */
  async updateStatus(storeId: string, input: UpdateInventoryStatusInput): Promise<InventoryItem> {
    return db.transaction(async (trx) => {
      const item = (await trx('inventory_items')
        .where({ id: input.inventoryItemId, store_id: storeId })
        .first()) as InventoryItem | undefined;
      if (!item) throw AppError.notFound(`Inventory item ${input.inventoryItemId} not found`);

      const [updated] = (await trx('inventory_items')
        .where({ id: item.id })
        .update({ status: input.newStatus, updated_at: new Date() })
        .returning('*')) as InventoryItem[];

      await trx('inventory_movements').insert({
        id: randomUUID(),
        store_id: storeId,
        inventory_item_id: item.id,
        movement_type: input.movementType,
        from_status: item.status,
        to_status: input.newStatus,
        reference_type: input.referenceType,
        reference_id: input.referenceId,
        performed_by: input.performedBy,
        notes: input.notes ?? null,
      });

      await AuditService.log(
        {
          action: 'inventory.status_change', userId: input.performedBy, storeId,
          entityType: 'inventory_item', entityId: item.id,
          meta: { from: item.status, to: input.newStatus, movementType: input.movementType },
        },
        trx
      );

      return updated;
    });
  },

  /**
   * Stock counts per variant, computed in SQL.
   * Accepts many variantIds so callers (product detail, product list) can get
   * every variant's counts in ONE query instead of one query per variant.
   */
  async getStockSummaries(variantIds: string[], conn: Knex | Knex.Transaction = db): Promise<Map<string, StockSummary>> {
    const summaries = new Map<string, StockSummary>();
    for (const id of variantIds) {
      summaries.set(id, {
        variantId: id, inStock: 0, reserved: 0, sold: 0,
        returned: 0, damaged: 0, lost: 0, total: 0,
      });
    }
    if (!variantIds.length) return summaries;

    const rows = (await conn('inventory_items')
      .select('variant_id', 'status')
      .count('* as count')
      .whereIn('variant_id', variantIds)
      .groupBy('variant_id', 'status')) as Array<{ variantId: string; status: string; count: number }>;

    for (const row of rows) {
      const summary = summaries.get(row.variantId);
      if (!summary) continue;
      const count = Number(row.count);
      summary.total += count;

      switch (row.status) {
        case 'IN_STOCK':
        case 'RETURNED_TO_STOCK':  summary.inStock += count; break;
        case 'RESERVED':           summary.reserved += count; break;
        case 'SOLD':               summary.sold += count; break;
        case 'RETURNED_DAMAGED':
        case 'DAMAGED':            summary.damaged += count; break;
        case 'LOST':               summary.lost += count; break;
        case 'TRANSFERRED_OUT':    break;
      }
    }

    return summaries;
  },

  async getStockSummary(variantId: string): Promise<StockSummary> {
    const map = await this.getStockSummaries([variantId]);
    return map.get(variantId)!;
  },

  /**
   * Inventory list, joined to everything the UI displays: product name,
   * variant SKU, size, category, supplier and effective selling price.
   *
   * The size join goes through the variant-attribute table, matching on the
   * attribute definition named 'Size' for the product's retail template — so
   * this keeps working when a non-clothing template uses a different
   * variant-level attribute.
   */
  async search(filters: InventorySearchFilters): Promise<{ items: InventoryItemRow[]; total: number }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;

    const applyFilters = (qb: Knex.QueryBuilder): Knex.QueryBuilder => {
      qb.where('i.store_id', filters.storeId);
      if (filters.status) qb.andWhere('i.status', filters.status);
      if (filters.itemId) qb.andWhere('i.id', filters.itemId);
      if (filters.variantId) qb.andWhere('i.variant_id', filters.variantId);
      if (filters.barcode) qb.andWhere('i.barcode', filters.barcode);
      if (filters.categoryId) qb.andWhere('p.category_id', filters.categoryId);
      if (filters.supplierId) qb.andWhere('p.supplier_id', filters.supplierId);
      if (filters.size) qb.andWhere('sz.value', filters.size);
      if (filters.purchaseDateFrom) qb.andWhere('i.purchase_date', '>=', filters.purchaseDateFrom);
      if (filters.purchaseDateTo) qb.andWhere('i.purchase_date', '<=', filters.purchaseDateTo);
      if (filters.query) {
        const term = `%${filters.query.trim()}%`;
        qb.andWhere((sub) =>
          sub.whereILike('i.barcode', term).orWhereILike('v.sku', term).orWhereILike('p.name', term)
        );
      }
      return qb;
    };

    const withJoins = (qb: Knex.QueryBuilder): Knex.QueryBuilder =>
      qb
        .join('product_variants as v', 'v.id', 'i.variant_id')
        .join('products as p', 'p.id', 'v.product_id')
        .leftJoin('categories as c', 'c.id', 'p.category_id')
        .leftJoin('suppliers as s', 's.id', 'p.supplier_id')
        .leftJoin('attribute_definitions as ad', function joinSizeDef() {
          this.on('ad.retail_template_id', '=', 'p.retail_template_id')
            .andOnVal('ad.name', '=', 'Size')
            .andOnVal('ad.is_variant_level', '=', true);
        })
        .leftJoin('variant_attribute_values as sz', function joinSizeVal() {
          this.on('sz.variant_id', '=', 'v.id').andOn('sz.attribute_definition_id', '=', 'ad.id');
        });

    const countRow = await applyFilters(withJoins(db('inventory_items as i')))
      .count<{ count: number }[]>('i.id as count')
      .first();

    const rows = (await applyFilters(withJoins(db('inventory_items as i')))
      .select(
        'i.*',
        db.ref('p.id').as('product_id'),
        db.ref('p.name').as('product_name'),
        db.ref('v.sku').as('variant_sku'),
        db.ref('v.display_name').as('variant_display_name'),
        db.ref('sz.value').as('size'),
        db.ref('c.name').as('category_name'),
        db.ref('s.name').as('supplier_name'),
        db.raw('COALESCE(v.selling_price_override, p.base_selling_price) AS selling_price'),
        db.raw(`(CURRENT_DATE - i.purchase_date) AS age_days`)
      )
      .orderBy('i.created_at', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize)) as InventoryItemRow[];

    return {
      items: rows.map((r) => ({ ...r, ageDays: Number(r.ageDays ?? 0) })),
      total: Number(countRow?.count ?? 0),
    };
  },

  /**
   * Stock valuation over items physically present (plan §2.8: "Total cost
   * value, expected selling value and potential gross profit").
   */
  async getValuation(
    storeId: string,
    filters: Pick<InventorySearchFilters, 'categoryId' | 'supplierId'> = {}
  ): Promise<StockValuation> {
    const qb = db('inventory_items as i')
      .join('product_variants as v', 'v.id', 'i.variant_id')
      .join('products as p', 'p.id', 'v.product_id')
      .where('i.store_id', storeId)
      .whereIn('i.status', IN_STOCK_STATUSES);

    if (filters.categoryId) qb.andWhere('p.category_id', filters.categoryId);
    if (filters.supplierId) qb.andWhere('p.supplier_id', filters.supplierId);

    const row = (await qb
      .select(
        db.raw('COUNT(i.id) AS item_count'),
        db.raw('COALESCE(SUM(i.purchase_cost_price), 0) AS stock_cost_value'),
        db.raw(
          'COALESCE(SUM(COALESCE(v.selling_price_override, p.base_selling_price)), 0) AS expected_sales_value'
        )
      )
      .first()) as { itemCount: number; stockCostValue: number; expectedSalesValue: number };

    const stockCostValue = Number(row?.stockCostValue ?? 0);
    const expectedSalesValue = Number(row?.expectedSalesValue ?? 0);

    return {
      itemCount: Number(row?.itemCount ?? 0),
      stockCostValue,
      expectedSalesValue,
      potentialGrossProfit: expectedSalesValue - stockCostValue,
    };
  },

  /**
   * Low-stock, out-of-stock and stock-ageing alerts (plan §2.8).
   *
   * "Out of stock" means a variant that has held stock at some point but has
   * none now — a variant that never had stock is not an alert, it is just an
   * unstocked size.
   */
  async getAlerts(storeId: string): Promise<StockAlerts> {
    const rows = (await db('product_variants as v')
      .join('products as p', 'p.id', 'v.product_id')
      .leftJoin('inventory_items as i', function joinItems() {
        this.on('i.variant_id', '=', 'v.id').andOn('i.store_id', '=', db.raw('?', [storeId]));
      })
      .leftJoin('attribute_definitions as ad', function joinSizeDef() {
        this.on('ad.retail_template_id', '=', 'p.retail_template_id')
          .andOnVal('ad.name', '=', 'Size')
          .andOnVal('ad.is_variant_level', '=', true);
      })
      .leftJoin('variant_attribute_values as sz', function joinSizeVal() {
        this.on('sz.variant_id', '=', 'v.id').andOn('sz.attribute_definition_id', '=', 'ad.id');
      })
      .where('p.store_id', storeId)
      .groupBy('v.id', 'p.id', 'p.name', 'v.sku', 'sz.value')
      .select(
        db.ref('v.id').as('variant_id'),
        db.ref('p.id').as('product_id'),
        db.ref('p.name').as('product_name'),
        db.ref('v.sku').as('variant_sku'),
        db.ref('sz.value').as('size'),
        db.raw(
          `COUNT(i.id) FILTER (WHERE i.status IN (${IN_STOCK_STATUSES.map(() => '?').join(', ')})) AS in_stock`,
          IN_STOCK_STATUSES
        ),
        db.raw('COUNT(i.id) AS ever_stocked')
      )) as Array<LowStockVariant & { everStocked: number }>;

    const lowStock: LowStockVariant[] = [];
    const outOfStock: LowStockVariant[] = [];

    for (const row of rows) {
      const inStock = Number(row.inStock);
      const everStocked = Number(row.everStocked);
      const entry: LowStockVariant = {
        variantId: row.variantId,
        productId: row.productId,
        productName: row.productName,
        variantSku: row.variantSku,
        size: row.size,
        inStock,
      };
      if (inStock === 0) {
        if (everStocked > 0) outOfStock.push(entry);
      } else if (inStock < LOW_STOCK_THRESHOLD) {
        lowStock.push(entry);
      }
    }

    const ageingRow = (await db('inventory_items as i')
      .where('i.store_id', storeId)
      .whereIn('i.status', IN_STOCK_STATUSES)
      .select(
        ...AGEING_BUCKETS.map((bucket, index) =>
          db.raw(
            bucket.maxDays === null
              ? `COUNT(*) FILTER (WHERE (CURRENT_DATE - i.purchase_date) >= ?) AS bucket_${index}`
              : `COUNT(*) FILTER (WHERE (CURRENT_DATE - i.purchase_date) BETWEEN ? AND ?) AS bucket_${index}`,
            bucket.maxDays === null ? [bucket.minDays] : [bucket.minDays, bucket.maxDays]
          )
        )
      )
      .first()) as Record<string, number>;

    return {
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      lowStock,
      outOfStock,
      ageing: AGEING_BUCKETS.map((bucket, index) => ({
        ...bucket,
        count: Number(ageingRow?.[`bucket${index}`] ?? 0),
      })),
    };
  },

  async getMovementsForItem(storeId: string, inventoryItemId: string): Promise<InventoryMovement[]> {
    return db('inventory_movements')
      .where({ store_id: storeId, inventory_item_id: inventoryItemId })
      .orderBy('performed_at', 'asc');
  },

  /**
   * Manual restock — accepts multiple variant lines in one operation.
   *
   * Each line creates `quantity` physical inventory_items (each with a new unique
   * barcode using the store-scoped sequence) and one RESTOCK movement per item.
   * All lines run in a single transaction so the batch is atomic.
   *
   * A restock_batch row is written to provide a human-readable history of "who
   * restocked what on which date" independently of the movement log.
   */
  async restockVariants(input: RestockInput): Promise<RestockBatchResult> {
    const { storeId, performedBy, lines, notes } = input;

    if (!lines.length) throw AppError.badRequest('Restock must include at least one variant line.');

    return db.transaction(async (trx) => {
      // Verify all variants exist in this store up-front before writing anything.
      const variantIds = lines.map((l) => l.variantId);
      const variants = (await trx('product_variants as v')
        .join('products as p', 'p.id', 'v.product_id')
        .whereIn('v.id', variantIds)
        .andWhere('p.store_id', storeId)
        .select('v.id', 'v.sku')) as Array<{ id: string; sku: string }>;

      const variantSkuMap = new Map(variants.map((v) => [v.id, v.sku]));

      const missing = variantIds.filter((id) => !variantSkuMap.has(id));
      if (missing.length) {
        throw AppError.notFound(`Variants not found in this store: ${missing.join(', ')}`);
      }

      const batchId = randomUUID();
      const resultLines: RestockBatchLine[] = [];
      let totalUnits = 0;

      for (const line of lines) {
        const sku = variantSkuMap.get(line.variantId)!;
        const items = await this.addStock(
          {
            storeId,
            variantId: line.variantId,
            quantity: line.quantity,
            purchaseCostPrice: line.purchaseCostPrice,
            purchaseDate: line.purchaseDate,
            performedBy,
            notes: notes ?? null,
          },
          sku,
          trx
        );

        // Overwrite the PURCHASE movement type written by addStock with RESTOCK,
        // since this is a restocking event, not an initial product creation.
        await trx('inventory_movements')
          .whereIn('inventory_item_id', items.map((i) => i.id))
          .andWhere('reference_type', 'PURCHASE_ENTRY')
          .andWhere('store_id', storeId)
          .update({ movement_type: 'RESTOCK', reference_type: 'RESTOCK_BATCH', reference_id: batchId });

        resultLines.push({ variantId: line.variantId, itemsCreated: items });
        totalUnits += items.length;
      }

      // Write the restock_batch summary row.
      await trx('restock_batches').insert({
        id: batchId,
        store_id: storeId,
        performed_by: performedBy,
        notes: notes ?? null,
        total_units: totalUnits,
        variant_count: lines.length,
      });

      await AuditService.log(
        {
          action: 'inventory.restock',
          userId: performedBy,
          storeId,
          entityType: 'restock_batch',
          entityId: batchId,
          meta: { totalUnits, variantCount: lines.length },
        },
        trx
      );

      return { batchId, totalUnits, lines: resultLines };
    });
  },
};
