/**
 * Returns, condition tracking and refunds.
 *
 *   GET  /api/returns/eligible/:invoiceNumber   what can still be returned on an invoice
 *   POST /api/returns                           process a return (refund / credit note)
 *
 * Refund amounts are computed here from what the customer actually paid for
 * the line (price scaled by the bill's discount and tax) — the client cannot
 * ask for more.
 */

import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db/client';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';
import { AppError, param } from '@/shared/AppError';
import { nextDocNumber } from '@/shared/docNumber';
import { refundableForLine, round2 } from '@/shared/money';

export const returnsRouter = Router();
returnsRouter.use(authenticate);

returnsRouter.get('/eligible/:invoiceNumber', requirePermission('returns:create'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const invoiceNumber = param(req.params, 'invoiceNumber');

    const invoice = await db('invoices').where({ store_id: storeId, invoice_number: invoiceNumber }).first();
    if (!invoice) throw AppError.notFound('Invoice not found.');
    if (invoice.status === 'FULLY_RETURNED' || invoice.status === 'CANCELLED') {
      throw AppError.badRequest(`This invoice is already ${String(invoice.status).replace('_', ' ').toLowerCase()}.`);
    }

    const items = await db('invoice_items').where('invoice_id', invoice.id);
    res.json({
      invoice,
      items: items.map((item: Record<string, unknown>) => ({
        ...item,
        refundableAmount: refundableForLine(invoice, item['finalPrice'] as string),
        isAlreadyReturned: item['status'] === 'RETURNED',
        eligibleForReturn: item['status'] === 'ACTIVE',
      })),
    });
  } catch (err) {
    next(err);
  }
});

const returnSchema = z.object({
  originalInvoiceId: z.string().uuid(),
  items: z
    .array(
      z.object({
        invoiceItemId: z.string().uuid(),
        condition: z.enum(['RESELLABLE', 'DAMAGED', 'DEFECTIVE', 'OPENED_USED', 'OTHER']).default('RESELLABLE'),
        reason: z.string().trim().max(255).nullish(),
        refundAmount: z.number().min(0).optional(),
      })
    )
    .min(1, 'Select at least one item to return.'),
  refundMethod: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT_NOTE']),
  notes: z.string().trim().max(1000).nullish(),
});

returnsRouter.post('/', requirePermission('returns:create'), async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const processedBy = req.user!.userId;
    const input = returnSchema.parse(req.body);

    const ids = input.items.map((i) => i.invoiceItemId);
    if (new Set(ids).size !== ids.length) throw AppError.badRequest('The same item was selected twice.');

    const result = await db.transaction(async (trx) => {
      const invoice = await trx('invoices')
        .where({ id: input.originalInvoiceId, store_id: storeId })
        .forUpdate()
        .first();
      if (!invoice) throw AppError.notFound('Original invoice not found.');
      if (invoice.status === 'FULLY_RETURNED' || invoice.status === 'CANCELLED') {
        throw AppError.badRequest('Nothing left to return on this invoice.');
      }

      const invoiceItems = await trx('invoice_items')
        .whereIn('id', ids)
        .andWhere('invoice_id', invoice.id)
        .forUpdate();
      const itemById = new Map(invoiceItems.map((i: Record<string, unknown>) => [i['id'] as string, i]));

      let totalRefundAmount = 0;
      const processed = input.items.map((reqItem) => {
        const invItem = itemById.get(reqItem.invoiceItemId);
        if (!invItem) throw AppError.badRequest('An item does not belong to this invoice.');
        if (invItem['status'] !== 'ACTIVE') {
          throw AppError.conflict(`Item ${invItem['barcode']} has already been returned or exchanged.`);
        }

        const maxRefund = refundableForLine(invoice, invItem['finalPrice'] as string);
        const refundAmount = round2(reqItem.refundAmount ?? maxRefund);
        if (refundAmount > maxRefund + 0.005) {
          throw AppError.badRequest(
            `Refund for ${invItem['barcode']} cannot exceed ₹${maxRefund.toFixed(2)} (what was paid for it).`
          );
        }
        totalRefundAmount = round2(totalRefundAmount + refundAmount);

        const resellable = reqItem.condition === 'RESELLABLE';
        return {
          id: uuidv4(),
          invItem,
          condition: reqItem.condition,
          reason: reqItem.reason || null,
          refundAmount,
          inventoryAction: resellable ? 'RETURN_TO_STOCK' : 'RETURN_DAMAGED',
          newInventoryStatus: resellable ? 'RETURNED_TO_STOCK' : 'RETURNED_DAMAGED',
        };
      });

      const returnId = uuidv4();
      const returnNumber = await nextDocNumber(trx, 'returns', 'RET', storeId);

      await trx('returns').insert({
        id: returnId,
        return_number: returnNumber,
        store_id: storeId,
        original_invoice_id: invoice.id,
        customer_id: invoice.customerId || null,
        processed_by: processedBy,
        total_refund_amount: totalRefundAmount,
        refund_method: input.refundMethod,
        notes: input.notes || null,
      });

      for (const p of processed) {
        await trx('return_items').insert({
          id: p.id,
          return_id: returnId,
          original_invoice_item_id: p.invItem['id'],
          inventory_item_id: p.invItem['inventoryItemId'],
          condition: p.condition,
          reason: p.reason,
          refund_amount: p.refundAmount,
          inventory_action: p.inventoryAction,
        });

        await trx('invoice_items').where({ id: p.invItem['id'] as string }).update({ status: 'RETURNED' });

        await trx('inventory_items')
          .where({ id: p.invItem['inventoryItemId'] as string, store_id: storeId })
          .update({ status: p.newInventoryStatus, updated_at: trx.fn.now() });

        await trx('inventory_movements').insert({
          id: uuidv4(),
          store_id: storeId,
          inventory_item_id: p.invItem['inventoryItemId'],
          movement_type: p.inventoryAction,
          from_status: 'SOLD',
          to_status: p.newInventoryStatus,
          reference_type: 'RETURN',
          reference_id: returnId,
          performed_by: processedBy,
          notes: `Returned on return ${returnNumber} (condition: ${p.condition})`,
        });
      }

      let creditNote: Record<string, unknown> | null = null;
      if (input.refundMethod === 'CREDIT_NOTE') {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 90);
        creditNote = {
          id: uuidv4(),
          credit_note_number: await nextDocNumber(trx, 'credit_notes', 'CN', storeId),
          store_id: storeId,
          original_invoice_id: invoice.id,
          return_id: returnId,
          customer_id: invoice.customerId || null,
          original_amount: totalRefundAmount,
          remaining_amount: totalRefundAmount,
          status: 'ACTIVE',
          expiry_date: expiry.toISOString().slice(0, 10),
        };
        await trx('credit_notes').insert(creditNote);
      }

      const remainingActive = await trx('invoice_items')
        .where({ invoice_id: invoice.id, status: 'ACTIVE' })
        .count('* as n')
        .first();
      const newInvoiceStatus = Number((remainingActive as { n: string | number }).n) === 0
        ? 'FULLY_RETURNED'
        : 'PARTIALLY_RETURNED';

      await trx('invoices').where({ id: invoice.id }).update({ status: newInvoiceStatus, updated_at: trx.fn.now() });

      await trx('audit_logs').insert({
        id: uuidv4(),
        store_id: storeId,
        user_id: processedBy,
        action: 'return.processed',
        entity_type: 'return',
        entity_id: returnId,
        meta: JSON.stringify({
          returnNumber,
          originalInvoiceNumber: invoice.invoiceNumber,
          refundAmount: totalRefundAmount,
          refundMethod: input.refundMethod,
          itemCount: processed.length,
        }),
      });

      return {
        id: returnId,
        returnNumber,
        totalRefundAmount,
        refundMethod: input.refundMethod,
        creditNote: creditNote
          ? {
              creditNoteNumber: creditNote['credit_note_number'],
              originalAmount: creditNote['original_amount'],
              expiryDate: creditNote['expiry_date'],
            }
          : null,
        invoiceStatus: newInvoiceStatus,
      };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
