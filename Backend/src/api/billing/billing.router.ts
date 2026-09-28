/**
 * POS Billing API.
 *
 *   POST /api/billing/checkout      create an invoice, mark items SOLD, record payments
 *   GET  /api/billing/invoices      recent invoices (search / status filter)
 *   GET  /api/billing/invoices/:id  one invoice with its items and payments
 *
 * Trust model: the client only says WHICH physical items are being sold and
 * how the customer pays. Prices, tax and the discount amount are all computed
 * here from the database, so a tampered request cannot sell an item for ₹1 or
 * apply a discount the caller's role is not allowed to give.
 */

import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db/client';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';
import { AppError, param, queryParam } from '@/shared/AppError';
import { nextDocNumber } from '@/shared/docNumber';
import { computeTax, loadTaxSettings, round2 } from '@/shared/money';

export const billingRouter = Router();
billingRouter.use(authenticate);

/** Non-managers may only give small discounts (mirrors the POS discount dialog). */
const LIMITED_MAX_PERCENT = 10;
const LIMITED_MAX_FIXED = 500;
const UNLIMITED_DISCOUNT_ROLES = new Set(['OWNER', 'MANAGER']);

const checkoutSchema = z.object({
  customerId: z.string().uuid().nullish(),
  customerName: z.string().trim().max(255).nullish(),
  customerPhone: z.string().trim().max(20).nullish(),
  items: z
    .array(
      z.object({
        inventoryItemId: z.string().uuid(),
        discountAmount: z.number().min(0).optional(),
      })
    )
    .min(1, 'Cart must contain at least one item.')
    .max(200, 'A bill can hold at most 200 items.'),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).nullish(),
  discountValue: z.number().min(0).nullish(),
  payments: z
    .array(
      z.object({
        paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT_NOTE']),
        amount: z.number().positive('Payment amounts must be greater than zero.'),
        transactionReference: z.string().trim().max(255).nullish(),
      })
    )
    .min(1, 'At least one payment method is required.'),
  notes: z.string().trim().max(1000).nullish(),
});

billingRouter.post('/checkout', requirePermission('billing:create'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const cashierId = req.user!.userId;
    const role = req.user!.role;
    const input = checkoutSchema.parse(req.body);

    const ids = input.items.map((i) => i.inventoryItemId);
    if (new Set(ids).size !== ids.length) throw AppError.badRequest('The same item is in the cart twice.');

    const result = await db.transaction(async (trx) => {
      // ── Items: lock rows, read authoritative prices ──────────────────────────
      const rows = (await trx('inventory_items as ii')
        .join('product_variants as v', 'v.id', 'ii.variant_id')
        .join('products as p', 'p.id', 'v.product_id')
        .where('ii.store_id', storeId)
        .whereIn('ii.id', ids)
        .forUpdate('ii')
        .select(
          'ii.id',
          'ii.barcode',
          'ii.status',
          db.ref('p.id').as('product_id'),
          db.ref('p.name').as('product_name'),
          db.ref('v.id').as('variant_id'),
          db.ref('v.display_name').as('variant_name'),
          db.raw('COALESCE(v.selling_price_override, p.base_selling_price) AS unit_price')
        )) as Array<Record<string, unknown>>;

      const byId = new Map(rows.map((r) => [r['id'] as string, r]));
      const unlimited = UNLIMITED_DISCOUNT_ROLES.has(role);

      let subtotal = 0;
      const lines = input.items.map((reqItem) => {
        const r = byId.get(reqItem.inventoryItemId);
        if (!r) throw AppError.badRequest('One of the items was not found in this store.');
        const status = r['status'] as string;
        const barcode = r['barcode'] as string;
        if (status === 'SOLD') throw AppError.conflict(`Item ${barcode} has already been sold.`);
        if (status !== 'IN_STOCK' && status !== 'RETURNED_TO_STOCK') {
          throw AppError.conflict(`Item ${barcode} is not in sellable stock (status: ${status}).`);
        }

        const unitPrice = round2(Number(r['unitPrice']));
        const lineDiscount = round2(Math.min(unitPrice, reqItem.discountAmount ?? 0));
        if (!unlimited && lineDiscount > (unitPrice * LIMITED_MAX_PERCENT) / 100 + 0.005) {
          throw AppError.forbidden(
            `Line discounts above ${LIMITED_MAX_PERCENT}% need manager permission (item ${barcode}).`
          );
        }
        const finalPrice = round2(unitPrice - lineDiscount);
        subtotal = round2(subtotal + finalPrice);
        return {
          id: uuidv4(),
          inventoryItemId: r['id'] as string,
          previousStatus: status,
          barcode,
          productId: r['productId'] as string,
          productName: r['productName'] as string,
          variantId: r['variantId'] as string,
          variantName: r['variantName'] as string,
          unitPrice,
          lineDiscount,
          finalPrice,
        };
      });

      // ── Bill-level discount ──────────────────────────────────────────────────
      let discountAmount = 0;
      const discountType = input.discountType ?? null;
      const discountValue = input.discountValue ?? 0;
      if (discountType && discountValue > 0) {
        if (discountType === 'PERCENTAGE') {
          if (discountValue > 100) throw AppError.badRequest('Discount percentage cannot exceed 100%.');
          if (!unlimited && discountValue > LIMITED_MAX_PERCENT) {
            throw AppError.forbidden(`Discounts above ${LIMITED_MAX_PERCENT}% need manager permission.`);
          }
          discountAmount = round2((subtotal * discountValue) / 100);
        } else {
          if (!unlimited && discountValue > LIMITED_MAX_FIXED) {
            throw AppError.forbidden(`Fixed discounts above ₹${LIMITED_MAX_FIXED} need manager permission.`);
          }
          discountAmount = round2(Math.min(discountValue, subtotal));
        }
      }

      // ── Tax from the store's own settings ────────────────────────────────────
      const { taxAmount, grandTotal } = computeTax(
        await loadTaxSettings(trx, storeId),
        round2(subtotal - discountAmount)
      );

      // ── Payments ─────────────────────────────────────────────────────────────
      const totalPaid = round2(input.payments.reduce((s, p) => s + p.amount, 0));
      if (totalPaid < grandTotal - 0.01) {
        throw AppError.badRequest(
          `Insufficient payment. Total due: ₹${grandTotal.toFixed(2)}, received: ₹${totalPaid.toFixed(2)}.`
        );
      }
      const changeGiven = round2(Math.max(0, totalPaid - grandTotal));
      const cashPaid = input.payments.filter((p) => p.paymentMethod === 'CASH').reduce((s, p) => s + p.amount, 0);
      if (changeGiven > cashPaid + 0.01) {
        throw AppError.badRequest('Only cash payments can be overpaid (change is returned in cash).');
      }

      // Credit notes are redeemed atomically with the sale.
      for (const p of input.payments.filter((x) => x.paymentMethod === 'CREDIT_NOTE')) {
        const number = p.transactionReference;
        if (!number) throw AppError.badRequest('Enter the credit note number for credit-note payments.');
        const cn = await trx('credit_notes')
          .where({ store_id: storeId, credit_note_number: number })
          .forUpdate()
          .first();
        if (!cn) throw AppError.badRequest(`Credit note ${number} was not found.`);
        if (cn.status !== 'ACTIVE') throw AppError.badRequest(`Credit note ${number} is ${cn.status}.`);
        if (cn.expiryDate && new Date(cn.expiryDate) < new Date()) {
          throw AppError.badRequest(`Credit note ${number} has expired.`);
        }
        const remaining = Number(cn.remainingAmount);
        if (p.amount > remaining + 0.001) {
          throw AppError.badRequest(`Credit note ${number} only has ₹${remaining.toFixed(2)} left.`);
        }
        const left = round2(remaining - p.amount);
        await trx('credit_notes')
          .where({ id: cn.id })
          .update({ remaining_amount: left, status: left <= 0 ? 'REDEEMED' : 'ACTIVE' });
      }

      // ── Customer must belong to this store ───────────────────────────────────
      if (input.customerId) {
        const customer = await trx('customers').where({ id: input.customerId, store_id: storeId }).first('id');
        if (!customer) throw AppError.badRequest('Selected customer was not found in this store.');
      }

      // ── Write everything ─────────────────────────────────────────────────────
      const invoiceId = uuidv4();
      const invoiceNumber = await nextDocNumber(trx, 'invoices', 'INV', storeId);

      await trx('invoices').insert({
        id: invoiceId,
        store_id: storeId,
        invoice_number: invoiceNumber,
        customer_id: input.customerId ?? null,
        customer_name: input.customerName || null,
        customer_phone: input.customerPhone || null,
        cashier_id: cashierId,
        subtotal,
        discount_type: discountAmount > 0 ? discountType : null,
        discount_value: discountAmount > 0 ? discountValue : 0,
        discount_amount: discountAmount,
        discount_applied_by: cashierId,
        tax_amount: taxAmount,
        grand_total: grandTotal,
        amount_paid: totalPaid,
        change_given: changeGiven,
        status: 'COMPLETED',
        notes: input.notes || null,
      });

      for (const line of lines) {
        await trx('invoice_items').insert({
          id: line.id,
          invoice_id: invoiceId,
          product_id: line.productId,
          variant_id: line.variantId,
          inventory_item_id: line.inventoryItemId,
          barcode: line.barcode,
          product_name: line.productName,
          variant_name: line.variantName,
          quantity: 1,
          unit_price: line.unitPrice,
          discount_amount: line.lineDiscount,
          final_price: line.finalPrice,
          status: 'ACTIVE',
        });

        await trx('inventory_items')
          .where({ id: line.inventoryItemId })
          .update({ status: 'SOLD', updated_at: trx.fn.now() });

        await trx('inventory_movements').insert({
          id: uuidv4(),
          store_id: storeId,
          inventory_item_id: line.inventoryItemId,
          movement_type: 'SALE',
          from_status: line.previousStatus,
          to_status: 'SOLD',
          reference_type: 'INVOICE',
          reference_id: invoiceId,
          performed_by: cashierId,
          notes: `Sold on invoice ${invoiceNumber}`,
        });
      }

      for (const p of input.payments) {
        await trx('payments').insert({
          id: uuidv4(),
          invoice_id: invoiceId,
          payment_method: p.paymentMethod,
          amount: p.amount,
          transaction_reference: p.transactionReference || null,
          status: 'COMPLETED',
        });
      }

      if (input.customerId) {
        await trx('customers').where({ id: input.customerId }).increment('total_purchases', 1);
      }

      await trx('audit_logs').insert({
        id: uuidv4(),
        store_id: storeId,
        user_id: cashierId,
        action: 'sale.completed',
        entity_type: 'invoice',
        entity_id: invoiceId,
        meta: JSON.stringify({
          invoiceNumber,
          grandTotal,
          itemCount: lines.length,
          discountAmount,
          taxAmount,
        }),
      });

      return {
        id: invoiceId,
        invoiceNumber,
        subtotal,
        discountAmount,
        taxAmount,
        grandTotal,
        amountPaid: totalPaid,
        changeGiven,
        createdAt: new Date().toISOString(),
        items: lines.map((l) => ({
          inventoryItemId: l.inventoryItemId,
          barcode: l.barcode,
          productName: l.productName,
          variantName: l.variantName,
          quantity: 1,
          unitPrice: l.unitPrice,
          discountAmount: l.lineDiscount,
          finalPrice: l.finalPrice,
        })),
      };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

const INVOICE_STATUSES = ['COMPLETED', 'PARTIALLY_RETURNED', 'FULLY_RETURNED', 'EXCHANGED', 'CANCELLED'] as const;

/** Escapes LIKE wildcards so user text is matched literally. */
const likeTerm = (s: string): string => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

billingRouter.get('/invoices', requirePermission('billing:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const status = queryParam(req.query.status);
    const term = queryParam(req.query.query);
    if (status && !(INVOICE_STATUSES as readonly string[]).includes(status)) {
      throw AppError.badRequest('Unknown invoice status filter.');
    }

    const qb = db('invoices').where('store_id', storeId);
    if (status) qb.andWhere('status', status);
    if (term) {
      qb.andWhere((b) => {
        b.whereILike('invoice_number', likeTerm(term))
          .orWhereILike('customer_name', likeTerm(term))
          .orWhereLike('customer_phone', likeTerm(term));
      });
    }

    res.json(await qb.orderBy('created_at', 'desc').limit(50));
  } catch (err) {
    next(err);
  }
});

billingRouter.get('/invoices/:id', requirePermission('billing:view'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const id = param(req.params, 'id');

    const invoice = await db('invoices').where({ id, store_id: storeId }).first();
    if (!invoice) throw AppError.notFound('Invoice not found.');

    const items = await db('invoice_items').where('invoice_id', id);
    const payments = await db('payments').where('invoice_id', id);
    res.json({ ...invoice, items, payments });
  } catch (err) {
    next(err);
  }
});
