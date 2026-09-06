/**
 * Returns, Condition Tracking & Refund Router.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { db } from '../../db/client';
import { v4 as uuidv4 } from 'uuid';

export const returnsRouter = Router();

returnsRouter.use(authenticate);

async function generateReturnNumber(storeId: string | null | undefined, trx: any): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const countRes = await trx('returns')
    .modify((qb: any) => {
      if (storeId) qb.where('store_id', storeId);
    })
    .count('id as count')
    .first();
  const count = parseInt((countRes?.count as string) || '0', 10) + 1;
  return `RET-${dateStr}-${count.toString().padStart(4, '0')}`;
}

async function generateCreditNoteNumber(storeId: string | null | undefined, trx: any): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const countRes = await trx('credit_notes')
    .modify((qb: any) => {
      if (storeId) qb.where('store_id', storeId);
    })
    .count('id as count')
    .first();
  const count = parseInt((countRes?.count as string) || '0', 10) + 1;
  return `CN-${dateStr}-${count.toString().padStart(4, '0')}`;
}

// GET /api/returns/eligible/:invoiceNumber
returnsRouter.get('/eligible/:invoiceNumber', async (req, res): Promise<void> => {
  try {
    const { invoiceNumber } = req.params;
    const storeId = req.user?.storeId;

    let query = db('invoices').where('invoice_number', invoiceNumber);
    if (storeId) query = query.andWhere('store_id', storeId);

    const invoice = await query.first();
    if (!invoice) {
      res.status(404).json({ error: 'Original invoice not found' });
      return;
    }

    if (invoice.status === 'FULLY_RETURNED' || invoice.status === 'CANCELLED') {
      res.status(400).json({ error: `Invoice is already ${invoice.status}` });
      return;
    }

    const items = await db('invoice_items').where('invoice_id', invoice.id);
    const existingReturns = await db('return_items')
      .join('returns', 'return_items.return_id', 'returns.id')
      .where('returns.original_invoice_id', invoice.id)
      .select('return_items.original_invoice_item_id');

    const returnedItemIds = new Set(existingReturns.map((r: any) => r.original_invoice_item_id));

    const eligibleItems = items.map((item: any) => ({
      ...item,
      isAlreadyReturned: returnedItemIds.has(item.id),
      eligibleForReturn: item.status === 'ACTIVE' && !returnedItemIds.has(item.id),
    }));

    res.json({
      invoice,
      items: eligibleItems,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch invoice for return' });
  }
});

// POST /api/returns
returnsRouter.post('/', async (req, res): Promise<void> => {
  const storeId = req.user?.storeId;
  const processedBy = req.user?.userId;

  if (!processedBy) {
    res.status(401).json({ error: 'Unauthenticated user' });
    return;
  }

  const {
    originalInvoiceId,
    items,
    refundMethod,
    notes,
  } = req.body;

  if (!originalInvoiceId || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Invalid return request parameters' });
    return;
  }

  try {
    const returnResult = await db.transaction(async (trx) => {
      const invoice = await trx('invoices').where('id', originalInvoiceId).first();
      if (!invoice) {
        throw new Error('Original invoice not found');
      }

      let totalRefundAmount = 0;
      const returnNumber = await generateReturnNumber(storeId, trx);
      const returnId = uuidv4();

      const processedReturnItems = [];
      for (const reqItem of items) {
        const invItem = await trx('invoice_items')
          .where('id', reqItem.invoiceItemId)
          .andWhere('invoice_id', originalInvoiceId)
          .first();

        if (!invItem) {
          throw new Error(`Invoice item ${reqItem.invoiceItemId} not found on this invoice`);
        }

        const alreadyReturned = await trx('return_items')
          .where('original_invoice_item_id', invItem.id)
          .first();

        if (alreadyReturned) {
          throw new Error(`Item ${invItem.barcode} has already been returned`);
        }

        const refundVal = parseFloat(reqItem.refundAmount ?? invItem.final_price);
        totalRefundAmount += refundVal;

        const condition = reqItem.condition || 'RESELLABLE';
        const inventoryAction = condition === 'RESELLABLE' ? 'RETURN_TO_STOCK' : 'RETURN_DAMAGED';
        const newInventoryStatus = condition === 'RESELLABLE' ? 'RETURNED_TO_STOCK' : 'RETURNED_DAMAGED';

        processedReturnItems.push({
          id: uuidv4(),
          returnId,
          originalInvoiceItemId: invItem.id,
          inventoryItemId: invItem.inventory_item_id,
          barcode: invItem.barcode,
          condition,
          reason: reqItem.reason || null,
          refundAmount: refundVal,
          inventoryAction,
          newInventoryStatus,
        });
      }

      await trx('returns').insert({
        id: returnId,
        return_number: returnNumber,
        store_id: storeId || null,
        original_invoice_id: originalInvoiceId,
        customer_id: invoice.customer_id || null,
        processed_by: processedBy,
        total_refund_amount: totalRefundAmount,
        refund_method: refundMethod,
        notes: notes || null,
      });

      for (const pItem of processedReturnItems) {
        await trx('return_items').insert({
          id: pItem.id,
          return_id: returnId,
          original_invoice_item_id: pItem.originalInvoiceItemId,
          inventory_item_id: pItem.inventoryItemId,
          condition: pItem.condition,
          reason: pItem.reason,
          refund_amount: pItem.refundAmount,
          inventory_action: pItem.inventoryAction,
        });

        await trx('invoice_items')
          .where('id', pItem.originalInvoiceItemId)
          .update({ status: 'RETURNED' });

        await trx('inventory_items')
          .where('id', pItem.inventoryItemId)
          .update({
            status: pItem.newInventoryStatus,
            updated_at: trx.fn.now(),
          });

        await trx('inventory_movements').insert({
          id: uuidv4(),
          store_id: storeId || null,
          inventory_item_id: pItem.inventoryItemId,
          movement_type: pItem.inventoryAction,
          from_status: 'SOLD',
          to_status: pItem.newInventoryStatus,
          reference_type: 'RETURN',
          reference_id: returnId,
          performed_by: processedBy,
          notes: `Returned on return ${returnNumber} (Condition: ${pItem.condition})`,
        });
      }

      let creditNote = null;
      if (refundMethod === 'CREDIT_NOTE') {
        const creditNoteNumber = await generateCreditNoteNumber(storeId, trx);
        const creditNoteId = uuidv4();

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 90);

        creditNote = {
          id: creditNoteId,
          credit_note_number: creditNoteNumber,
          store_id: storeId || null,
          original_invoice_id: originalInvoiceId,
          return_id: returnId,
          customer_id: invoice.customer_id || null,
          original_amount: totalRefundAmount,
          remaining_amount: totalRefundAmount,
          status: 'ACTIVE',
          expiry_date: expiryDate.toISOString().slice(0, 10),
        };

        await trx('credit_notes').insert(creditNote);
      }

      const totalInvoiceItems = await trx('invoice_items').where('invoice_id', originalInvoiceId);
      const returnedInvoiceItems = await trx('invoice_items').where('invoice_id', originalInvoiceId).andWhere('status', 'RETURNED');

      let newInvoiceStatus = 'PARTIALLY_RETURNED';
      if (returnedInvoiceItems.length === totalInvoiceItems.length) {
        newInvoiceStatus = 'FULLY_RETURNED';
      }

      await trx('invoices')
        .where('id', originalInvoiceId)
        .update({
          status: newInvoiceStatus,
          updated_at: trx.fn.now(),
        });

      await trx('audit_logs').insert({
        id: uuidv4(),
        store_id: storeId || null,
        user_id: processedBy,
        action: 'RETURN_PROCESSED',
        entity_type: 'RETURN',
        entity_id: returnId,
        details: JSON.stringify({
          returnNumber,
          originalInvoiceNumber: invoice.invoice_number,
          refundAmount: totalRefundAmount,
          refundMethod,
          itemCount: processedReturnItems.length,
        }),
      });

      return {
        id: returnId,
        returnNumber,
        totalRefundAmount,
        refundMethod,
        creditNote,
        invoiceStatus: newInvoiceStatus,
      };
    });

    res.status(201).json(returnResult);
  } catch (err: any) {
    console.error('[RETURN_ERROR]', err.message);
    res.status(400).json({ error: err.message || 'Failed to process return' });
  }
});
