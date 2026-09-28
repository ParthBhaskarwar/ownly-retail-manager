/**
 * Product exchanges.
 *
 *   POST /api/exchanges   return items from an invoice and sell replacements in one step
 *
 * Returned value = what the customer actually paid for the returned lines.
 * Replacement prices and tax come from the database. The difference is settled
 * with `paymentMethod` (customer pays more, or is refunded / given a credit note).
 */

import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db/client';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';
import { AppError } from '@/shared/AppError';
import { nextDocNumber } from '@/shared/docNumber';
import { computeTax, loadTaxSettings, refundableForLine, round2 } from '@/shared/money';

export const exchangesRouter = Router();
exchangesRouter.use(authenticate);

const exchangeSchema = z.object({
  originalInvoiceId: z.string().uuid(),
  returnedItems: z
    .array(
      z.object({
        invoiceItemId: z.string().uuid(),
        condition: z.enum(['RESELLABLE', 'DAMAGED', 'DEFECTIVE', 'OPENED_USED', 'OTHER']).default('RESELLABLE'),
        reason: z.string().trim().max(255).nullish(),
      })
    )
    .min(1, 'Select at least one item to return.'),
  replacementItems: z
    .array(z.object({ inventoryItemId: z.string().uuid() }))
    .min(1, 'Add at least one replacement item.'),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT_NOTE']).default('CASH'),
  transactionReference: z.string().trim().max(255).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

exchangesRouter.post('/', requirePermission('exchanges:create'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const processedBy = req.user!.userId;
    const input = exchangeSchema.parse(req.body);

    const returnedIds = input.returnedItems.map((i) => i.invoiceItemId);
    const replacementIds = input.replacementItems.map((i) => i.inventoryItemId);
    if (new Set(returnedIds).size !== returnedIds.length) throw AppError.badRequest('An item was selected twice.');
    if (new Set(replacementIds).size !== replacementIds.length) throw AppError.badRequest('A replacement item was added twice.');

    const result = await db.transaction(async (trx) => {
      const orig = await trx('invoices')
        .where({ id: input.originalInvoiceId, store_id: storeId })
        .forUpdate()
        .first();
      if (!orig) throw AppError.notFound('Original invoice not found.');
      if (orig.status === 'FULLY_RETURNED' || orig.status === 'CANCELLED') {
        throw AppError.badRequest('This invoice can no longer be exchanged.');
      }

      // ── Returned side ────────────────────────────────────────────────────────
      const invoiceItems = await trx('invoice_items')
        .whereIn('id', returnedIds)
        .andWhere('invoice_id', orig.id)
        .forUpdate();
      const itemById = new Map(invoiceItems.map((i: Record<string, unknown>) => [i['id'] as string, i]));

      let returnedValue = 0;
      const returned = input.returnedItems.map((reqItem) => {
        const invItem = itemById.get(reqItem.invoiceItemId);
        if (!invItem) throw AppError.badRequest('An item does not belong to this invoice.');
        if (invItem['status'] !== 'ACTIVE') {
          throw AppError.conflict(`Item ${invItem['barcode']} has already been returned or exchanged.`);
        }
        const refundAmount = refundableForLine(orig, invItem['finalPrice'] as string);
        returnedValue = round2(returnedValue + refundAmount);
        const resellable = reqItem.condition === 'RESELLABLE';
        return {
          id: uuidv4(),
          invItem,
          condition: reqItem.condition,
          reason: reqItem.reason || 'Exchange',
          refundAmount,
          inventoryAction: resellable ? 'RETURN_TO_STOCK' : 'RETURN_DAMAGED',
          newStatus: resellable ? 'RETURNED_TO_STOCK' : 'RETURNED_DAMAGED',
        };
      });

      const returnId = uuidv4();
      const returnNumber = await nextDocNumber(trx, 'returns', 'RET', storeId);

      await trx('returns').insert({
        id: returnId,
        return_number: returnNumber,
        store_id: storeId,
        original_invoice_id: orig.id,
        customer_id: orig.customerId || null,
        processed_by: processedBy,
        total_refund_amount: returnedValue,
        refund_method: 'EXCHANGE',
        notes: input.notes || 'Product exchange',
      });

      for (const r of returned) {
        await trx('return_items').insert({
          id: r.id,
          return_id: returnId,
          original_invoice_item_id: r.invItem['id'],
          inventory_item_id: r.invItem['inventoryItemId'],
          condition: r.condition,
          reason: r.reason,
          refund_amount: r.refundAmount,
          inventory_action: r.inventoryAction,
        });
        await trx('invoice_items').where({ id: r.invItem['id'] as string }).update({ status: 'EXCHANGED' });
        await trx('inventory_items')
          .where({ id: r.invItem['inventoryItemId'] as string, store_id: storeId })
          .update({ status: r.newStatus, updated_at: trx.fn.now() });
        await trx('inventory_movements').insert({
          id: uuidv4(),
          store_id: storeId,
          inventory_item_id: r.invItem['inventoryItemId'],
          movement_type: r.inventoryAction,
          from_status: 'SOLD',
          to_status: r.newStatus,
          reference_type: 'EXCHANGE',
          reference_id: returnId,
          performed_by: processedBy,
          notes: `Returned during exchange ${returnNumber}`,
        });
      }

      // ── Replacement side (prices from the database) ──────────────────────────
      const repRows = (await trx('inventory_items as ii')
        .join('product_variants as v', 'v.id', 'ii.variant_id')
        .join('products as p', 'p.id', 'v.product_id')
        .where('ii.store_id', storeId)
        .whereIn('ii.id', replacementIds)
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
      const repById = new Map(repRows.map((r) => [r['id'] as string, r]));

      let replacementSubtotal = 0;
      const replacements = replacementIds.map((id) => {
        const r = repById.get(id);
        if (!r) throw AppError.badRequest('A replacement item was not found in this store.');
        const status = r['status'] as string;
        if (status !== 'IN_STOCK' && status !== 'RETURNED_TO_STOCK') {
          throw AppError.conflict(`Replacement item ${r['barcode']} is unavailable (status: ${status}).`);
        }
        const price = round2(Number(r['unitPrice']));
        replacementSubtotal = round2(replacementSubtotal + price);
        return {
          id: uuidv4(),
          inventoryItemId: r['id'] as string,
          previousStatus: status,
          barcode: r['barcode'] as string,
          productId: r['productId'] as string,
          variantId: r['variantId'] as string,
          productName: r['productName'] as string,
          variantName: r['variantName'] as string,
          price,
        };
      });

      const { taxAmount, grandTotal: replacementValue } = computeTax(
        await loadTaxSettings(trx, storeId),
        replacementSubtotal
      );
      const differenceAmount = round2(replacementValue - returnedValue);

      const replacementInvoiceId = uuidv4();
      const replacementInvoiceNumber = await nextDocNumber(trx, 'invoices', 'INV', storeId);

      await trx('invoices').insert({
        id: replacementInvoiceId,
        store_id: storeId,
        invoice_number: replacementInvoiceNumber,
        customer_id: orig.customerId || null,
        customer_name: orig.customerName || null,
        customer_phone: orig.customerPhone || null,
        cashier_id: processedBy,
        subtotal: replacementSubtotal,
        discount_amount: 0,
        tax_amount: taxAmount,
        grand_total: replacementValue,
        amount_paid: differenceAmount > 0 ? differenceAmount : 0,
        change_given: 0,
        status: 'COMPLETED',
        notes: `Exchange for original invoice ${orig.invoiceNumber}`,
      });

      for (const rep of replacements) {
        await trx('invoice_items').insert({
          id: rep.id,
          invoice_id: replacementInvoiceId,
          product_id: rep.productId,
          variant_id: rep.variantId,
          inventory_item_id: rep.inventoryItemId,
          barcode: rep.barcode,
          product_name: rep.productName,
          variant_name: rep.variantName,
          quantity: 1,
          unit_price: rep.price,
          discount_amount: 0,
          final_price: rep.price,
          status: 'ACTIVE',
        });
        await trx('inventory_items')
          .where({ id: rep.inventoryItemId })
          .update({ status: 'SOLD', updated_at: trx.fn.now() });
        await trx('inventory_movements').insert({
          id: uuidv4(),
          store_id: storeId,
          inventory_item_id: rep.inventoryItemId,
          movement_type: 'SALE',
          from_status: rep.previousStatus,
          to_status: 'SOLD',
          reference_type: 'EXCHANGE',
          reference_id: replacementInvoiceId,
          performed_by: processedBy,
          notes: `Replacement item sold on exchange invoice ${replacementInvoiceNumber}`,
        });
      }

      // ── Settle the difference ────────────────────────────────────────────────
      let paymentStatus: 'BALANCED' | 'CUSTOMER_PAID' | 'REFUND_ISSUED' | 'CREDIT_NOTE_ISSUED' = 'BALANCED';
      let creditNoteNumber: string | null = null;

      if (differenceAmount > 0) {
        paymentStatus = 'CUSTOMER_PAID';
        if (input.paymentMethod === 'CREDIT_NOTE') {
          throw AppError.badRequest('The extra amount must be paid in cash, UPI or card.');
        }
        await trx('payments').insert({
          id: uuidv4(),
          invoice_id: replacementInvoiceId,
          payment_method: input.paymentMethod,
          amount: differenceAmount,
          transaction_reference: input.transactionReference || null,
          status: 'COMPLETED',
        });
      } else if (differenceAmount < 0) {
        const owed = round2(-differenceAmount);
        if (input.paymentMethod === 'CREDIT_NOTE') {
          paymentStatus = 'CREDIT_NOTE_ISSUED';
          const expiry = new Date();
          expiry.setDate(expiry.getDate() + 90);
          creditNoteNumber = await nextDocNumber(trx, 'credit_notes', 'CN', storeId);
          await trx('credit_notes').insert({
            id: uuidv4(),
            credit_note_number: creditNoteNumber,
            store_id: storeId,
            original_invoice_id: orig.id,
            return_id: returnId,
            customer_id: orig.customerId || null,
            original_amount: owed,
            remaining_amount: owed,
            status: 'ACTIVE',
            expiry_date: expiry.toISOString().slice(0, 10),
          });
        } else {
          paymentStatus = 'REFUND_ISSUED';
        }
      }

      const exchangeId = uuidv4();
      const exchangeNumber = await nextDocNumber(trx, 'exchanges', 'EX', storeId);

      await trx('exchanges').insert({
        id: exchangeId,
        exchange_number: exchangeNumber,
        store_id: storeId,
        original_invoice_id: orig.id,
        return_id: returnId,
        replacement_invoice_id: replacementInvoiceId,
        processed_by: processedBy,
        returned_value: returnedValue,
        replacement_value: replacementValue,
        difference_amount: differenceAmount,
        payment_status: paymentStatus,
      });

      const stillActive = await trx('invoice_items')
        .where({ invoice_id: orig.id, status: 'ACTIVE' })
        .count('* as n')
        .first();
      await trx('invoices')
        .where({ id: orig.id })
        .update({
          status: Number((stillActive as { n: string | number }).n) === 0 ? 'EXCHANGED' : 'PARTIALLY_RETURNED',
          updated_at: trx.fn.now(),
        });

      await trx('audit_logs').insert({
        id: uuidv4(),
        store_id: storeId,
        user_id: processedBy,
        action: 'exchange.processed',
        entity_type: 'exchange',
        entity_id: exchangeId,
        meta: JSON.stringify({
          exchangeNumber,
          originalInvoiceNumber: orig.invoiceNumber,
          replacementInvoiceNumber,
          returnedValue,
          replacementValue,
          differenceAmount,
          paymentStatus,
        }),
      });

      return {
        id: exchangeId,
        exchangeNumber,
        originalInvoiceId: orig.id,
        replacementInvoiceId,
        replacementInvoiceNumber,
        returnedValue,
        replacementValue,
        differenceAmount,
        paymentStatus,
        creditNoteNumber,
      };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
