/**
 * Staging — loads a CleanDataset into the database as a temporary, isolated
 * store, so feature engineering runs through the SAME code the live app uses
 * (ai-features.repository). That is the point: a hand-copied feature pipeline
 * for training would drift from serving, and the model would be tuned on
 * features it never sees in production.
 *
 * The staging store is invisible to real stores (everything is scoped by
 * store_id) and is deleted when training ends, even if training fails.
 */

import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { db } from '@/db/client';
import type { CleanDataset, CleanUnit } from './types';

const TEMPLATE_ID = 'tpl_clothing';
const MAX_BIND_PARAMS = 60_000;

type Row = Record<string, unknown>;

async function insertRows(trx: Knex.Transaction, table: string, rows: Row[]): Promise<void> {
  if (!rows.length) return;
  const chunk = Math.max(1, Math.floor(MAX_BIND_PARAMS / Object.keys(rows[0]).length));
  for (let i = 0; i < rows.length; i += chunk) await trx(table).insert(rows.slice(i, i + chunk));
}

const dayStart = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
/** Fixed times of day so same-day purchase → sale → return always sort correctly. */
const atHour = (d: Date, h: number): Date => new Date(dayStart(d) + h * 3_600_000);

export interface StagedStore {
  storeId: string;
  cleanup: () => Promise<void>;
}

export async function stageDataset(dataset: CleanDataset, label: string): Promise<StagedStore> {
  const runId = randomUUID().slice(0, 8);
  const storeId = randomUUID();
  const ownerId = randomUUID();
  const now = new Date();

  const supplierId = new Map<string, string>();
  for (const p of dataset.products) {
    if (p.supplier && !supplierId.has(p.supplier)) supplierId.set(p.supplier, randomUUID());
  }

  const productId = new Map(dataset.products.map((p) => [p.code, randomUUID()]));
  const byCode = new Map(dataset.products.map((p) => [p.code, p]));
  const variantId = new Map<string, string>(); // `${code}|${size}`
  for (const p of dataset.products) for (const s of p.sizes) variantId.set(`${p.code}|${s}`, randomUUID());

  const earliest = new Map<string, number>();
  for (const u of dataset.units) {
    const t = u.receivedAt.getTime();
    if (!earliest.has(u.productCode) || t < earliest.get(u.productCode)!) earliest.set(u.productCode, t);
  }

  await db.transaction(async (trx) => {
    await insertRows(trx, 'users', [{
      id: ownerId, store_id: null, name: 'Retraining staging', email: `retrain-${runId}@staging.ownly.local`,
      phone: '0000000000', password_hash: '!', role: 'OWNER', is_active: true, verified_at: now,
    }]);
    await insertRows(trx, 'stores', [{
      id: storeId, owner_id: ownerId, name: `[retraining ${runId}] ${label}`.slice(0, 120),
      currency: 'INR', retail_type: 'CLOTHING_FASHION', setup_completed: true,
    }]);
    await trx('users').where({ id: ownerId }).update({ store_id: storeId });

    let n = 0;
    await insertRows(trx, 'suppliers', [...supplierId].map(([name, id]) => ({
      id, store_id: storeId, name: name.slice(0, 120), code: `SUP${String(++n).padStart(3, '0')}`, is_active: true,
    })));

    await insertRows(trx, 'products', dataset.products.map((p) => {
      const created = new Date((earliest.get(p.code) ?? now.getTime()) - 2 * 86_400_000);
      return {
        id: productId.get(p.code), store_id: storeId, retail_template_id: TEMPLATE_ID,
        category_id: p.categoryId, subcategory_id: p.subcategoryId,
        supplier_id: p.supplier ? supplierId.get(p.supplier) : null,
        name: p.name.slice(0, 200), base_sku: p.code.slice(0, 60),
        base_selling_price: p.sellingPrice, base_cost_price: p.costPrice, status: 'ACTIVE',
        image_urls: '[]', created_by: ownerId, updated_by: ownerId, created_at: created, updated_at: created,
      };
    }));

    await insertRows(trx, 'product_variants', dataset.products.flatMap((p) =>
      p.sizes.map((s, i) => ({
        id: variantId.get(`${p.code}|${s}`), product_id: productId.get(p.code),
        sku: `${p.code}-${s.replace(/\s+/g, '')}`.slice(0, 80),
        // The features fall back to the text after " / " for size, so the product name must not contain it.
        display_name: `${p.name.replace(/ \/ /g, ' - ')} / ${s}`.slice(0, 250),
        is_active: true, sort_order: i,
      }))));

    // Units, movements, invoices, returns
    const purchaseBatch = randomUUID();
    const itemId = new Map<CleanUnit, string>();
    const barcodeOf = new Map<CleanUnit, string>();
    const items: Row[] = [];
    const movements: Row[] = [];
    const invoices = new Map<string, { id: string; at: Date; subtotal: number }>();
    const invoiceItems: Row[] = [];
    const returnGroups = new Map<string, { id: string; invoiceId: string; at: Date; total: number }>();
    const returnItems: Row[] = [];

    let barcodeSeq = 0, invoiceSeq = 0, returnSeq = 0;
    const mv = (inv: string, type: string, from: string, to: string, refType: string, refId: string, at: Date): Row => ({
      id: randomUUID(), store_id: storeId, inventory_item_id: inv, movement_type: type,
      from_status: from, to_status: to, reference_type: refType, reference_id: refId, performed_by: ownerId, performed_at: at,
    });

    for (const u of dataset.units) {
      const id = randomUUID();
      itemId.set(u, id);
      const barcode = `STG-${runId}-${String(++barcodeSeq).padStart(6, '0')}`;
      barcodeOf.set(u, barcode);
      const last = u.sales[u.sales.length - 1];
      items.push({
        id, store_id: storeId, variant_id: variantId.get(`${u.productCode}|${u.size}`), barcode,
        purchase_cost_price: u.cost, purchase_date: new Date(dayStart(u.receivedAt)).toISOString().slice(0, 10),
        status: last && !last.returnedAt ? 'SOLD' : 'IN_STOCK', created_by: ownerId,
      });
      movements.push(mv(id, 'PURCHASE', 'IN_STOCK', 'IN_STOCK', 'PURCHASE_ENTRY', purchaseBatch, atHour(u.receivedAt, 8)));
    }

    // Invoices first (movements and return rows reference them).
    for (const u of dataset.units) {
      for (const s of u.sales) {
        if (!invoices.has(s.invoiceKey)) {
          invoices.set(s.invoiceKey, { id: randomUUID(), at: atHour(s.at, 14), subtotal: 0 });
        }
        invoices.get(s.invoiceKey)!.subtotal += s.unitPrice - s.discount;
      }
    }

    for (const u of dataset.units) {
      const p = byCode.get(u.productCode)!;
      const inv = itemId.get(u)!;
      let status: 'IN_STOCK' | 'RETURNED_TO_STOCK' = 'IN_STOCK';
      for (const s of u.sales) {
        const invoice = invoices.get(s.invoiceKey)!;
        const lineId = randomUUID();
        movements.push(mv(inv, 'SALE', status, 'SOLD', 'INVOICE', invoice.id, atHour(s.at, 14)));
        invoiceItems.push({
          id: lineId, invoice_id: invoice.id, product_id: productId.get(u.productCode), variant_id: variantId.get(`${u.productCode}|${u.size}`),
          inventory_item_id: inv, barcode: barcodeOf.get(u), product_name: p.name.slice(0, 200),
          variant_name: `${p.name} / ${u.size}`.slice(0, 250), quantity: 1, unit_price: s.unitPrice,
          discount_amount: s.discount, final_price: s.unitPrice - s.discount, status: s.returnedAt ? 'RETURNED' : 'ACTIVE',
          created_at: atHour(s.at, 14),
        });
        if (s.returnedAt) {
          const rk = `${s.invoiceKey}|${dayStart(s.returnedAt)}`;
          if (!returnGroups.has(rk)) {
            returnGroups.set(rk, { id: randomUUID(), invoiceId: invoice.id, at: atHour(s.returnedAt, 16), total: 0 });
          }
          const rg = returnGroups.get(rk)!;
          rg.total += s.unitPrice - s.discount;
          returnItems.push({
            id: randomUUID(), return_id: rg.id, original_invoice_item_id: lineId, inventory_item_id: inv,
            condition: 'RESELLABLE', reason: s.returnReason, refund_amount: s.unitPrice - s.discount,
            inventory_action: 'RETURN_TO_STOCK', created_at: rg.at,
          });
          movements.push(mv(inv, 'RETURN_TO_STOCK', 'SOLD', 'RETURNED_TO_STOCK', 'RETURN_TRANSACTION', rg.id, atHour(s.returnedAt, 16)));
          status = 'RETURNED_TO_STOCK';
        }
      }
    }

    await insertRows(trx, 'inventory_items', items);
    await insertRows(trx, 'inventory_movements', movements);
    await insertRows(trx, 'invoices', [...invoices.values()].map((v) => ({
      id: v.id, store_id: storeId, invoice_number: `STG-${runId}-${String(++invoiceSeq).padStart(6, '0')}`,
      cashier_id: ownerId, subtotal: v.subtotal, discount_amount: 0, tax_amount: 0,
      grand_total: v.subtotal, amount_paid: v.subtotal, status: 'COMPLETED', created_at: v.at, updated_at: v.at,
    })));
    await insertRows(trx, 'invoice_items', invoiceItems);
    await insertRows(trx, 'returns', [...returnGroups.values()].map((g) => ({
      id: g.id, return_number: `RET-STG-${runId}-${String(++returnSeq).padStart(5, '0')}`, store_id: storeId,
      original_invoice_id: g.invoiceId, processed_by: ownerId, total_refund_amount: g.total,
      refund_method: 'CASH', created_at: g.at,
    })));
    await insertRows(trx, 'return_items', returnItems);
  });

  const cleanup = async () => {
    await db.transaction(async (trx) => {
      for (const table of ['exchanges', 'credit_notes', 'returns', 'invoices', 'customers', 'products',
        'restock_batches', 'backups', 'suppliers']) {
        await trx.raw(`DELETE FROM ?? WHERE store_id = ?`, [table, storeId]);
      }
      await trx.raw(`DELETE FROM stores WHERE id = ?`, [storeId]);
      await trx('users').where({ id: ownerId }).delete();
    });
  };

  return { storeId, cleanup };
}
