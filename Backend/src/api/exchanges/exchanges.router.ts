/**
 * Product Exchanges Router.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { db } from '../../db/client';
import { v4 as uuidv4 } from 'uuid';

export const exchangesRouter = Router();

exchangesRouter.use(authenticate);

async function generateExchangeNumber(storeId: string | null | undefined, trx: any): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const countRes = await trx('exchanges')
    .modify((qb: any) => {
      if (storeId) qb.where('store_id', storeId);
    })
    .count('id as count')
    .first();
  const count = parseInt((countRes?.count as string) || '0', 10) + 1;
  return `EXC-${dateStr}-${count.toString().padStart(4, '0')}`;
}

async function generateInvoiceNumber(storeId: string | null | undefined, trx: any): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const countRes = await trx('invoices')
    .modify((qb: any) => {
      if (storeId) qb.where('store_id', storeId);
    })
    .count('id as count')
    .first();
  const count = parseInt((countRes?.count as string) || '0', 10) + 1;
  return `INV-${dateStr}-${count.toString().padStart(4, '0')}`;
}

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

// POST /api/exchanges
exchangesRouter.post('/', async (req, res): Promise<void> => {
  const storeId = req.user?.storeId;
  const processedBy = req.user?.userId;

  if (!processedBy) {
    res.status(401).json({ error: 'Unauthenticated user' });
    return;
  }

  const {
    originalInvoiceId,
    returnedItems,
    replacementItems,
    paymentMethod,
    transactionReference,
    notes,
  } = req.body;

  if (!originalInvoiceId || !returnedItems?.length || !replacementItems?.length) {
    res.status(400).json({ error: 'Exchange requires original invoice, returned items, and replacement items' });
    return;
  }

  try {
    const exchangeResult = await db.transaction(async (trx) => {
      const origInvoice = await trx('invoices').where('id', originalInvoiceId).first();
      if (!origInvoice) {
        throw new Error('Original invoice not found');
      }

      let returnedValue = 0;
      const returnId = uuidv4();
      const returnNumber = await generateReturnNumber(storeId, trx);
      const returnItemsData = [];

      for (const reqItem of returnedItems) {
        const invItem = await trx('invoice_items')
          .where('id', reqItem.invoiceItemId)
          .andWhere('invoice_id', originalInvoiceId)
          .first();

        if (!invItem) {
          throw new Error(`Invoice item ${reqItem.invoiceItemId} not found`);
        }

        const itemVal = parseFloat(invItem.final_price);
        returnedValue += itemVal;

        const condition = reqItem.condition || 'RESELLABLE';
        const inventoryAction = condition === 'RESELLABLE' ? 'RETURN_TO_STOCK' : 'RETURN_DAMAGED';
        const newStatus = condition === 'RESELLABLE' ? 'RETURNED_TO_STOCK' : 'RETURNED_DAMAGED';

        returnItemsData.push({
          id: uuidv4(),
          returnId,
          originalInvoiceItemId: invItem.id,
          inventoryItemId: invItem.inventory_item_id,
          condition,
          reason: reqItem.reason || 'Exchange',
          refundAmount: itemVal,
          inventoryAction,
          newStatus,
        });
      }

      await trx('returns').insert({
        id: returnId,
        return_number: returnNumber,
        store_id: storeId || null,
        original_invoice_id: originalInvoiceId,
        customer_id: origInvoice.customer_id || null,
        processed_by: processedBy,
        total_refund_amount: returnedValue,
        refund_method: 'EXCHANGE',
        notes: notes || 'Product exchange',
      });

      for (const rItem of returnItemsData) {
        await trx('return_items').insert({
          id: rItem.id,
          return_id: returnId,
          original_invoice_item_id: rItem.originalInvoiceItemId,
          inventory_item_id: rItem.inventoryItemId,
          condition: rItem.condition,
          reason: rItem.reason,
          refund_amount: rItem.refundAmount,
          inventory_action: rItem.inventoryAction,
        });

        await trx('invoice_items').where('id', rItem.originalInvoiceItemId).update({ status: 'EXCHANGED' });
        await trx('inventory_items').where('id', rItem.inventoryItemId).update({ status: rItem.newStatus, updated_at: trx.fn.now() });

        await trx('inventory_movements').insert({
          id: uuidv4(),
          store_id: storeId || null,
          inventory_item_id: rItem.inventoryItemId,
          movement_type: rItem.inventoryAction,
          from_status: 'SOLD',
          to_status: rItem.newStatus,
          reference_type: 'EXCHANGE',
          reference_id: returnId,
          performed_by: processedBy,
          notes: `Returned during exchange ${returnNumber}`,
        });
      }

      let replacementValue = 0;
      const validatedReplacements = [];

      for (const item of replacementItems) {
        const invRecord = await trx('inventory_items')
          .select('inventory_items.*', 'product_variants.product_id', 'product_variants.display_name as variantName', 'products.name as productName')
          .join('product_variants', 'inventory_items.variant_id', 'product_variants.id')
          .join('products', 'product_variants.product_id', 'products.id')
          .where('inventory_items.id', item.inventoryItemId)
          .forUpdate()
          .first();

        if (!invRecord) {
          throw new Error(`Replacement item with barcode ${item.barcode} not found`);
        }

        if (invRecord.status === 'SOLD' || (invRecord.status !== 'IN_STOCK' && invRecord.status !== 'RETURNED_TO_STOCK')) {
          throw new Error(`Replacement item ${item.barcode} is unavailable (Status: ${invRecord.status})`);
        }

        const price = parseFloat(item.unitPrice);
        replacementValue += price;

        validatedReplacements.push({
          id: uuidv4(),
          productId: invRecord.product_id,
          variantId: invRecord.variant_id,
          inventoryItemId: invRecord.id,
          barcode: invRecord.barcode,
          productName: invRecord.productName,
          variantName: invRecord.variantName,
          quantity: 1,
          unitPrice: price,
          finalPrice: price,
        });
      }

      const differenceAmount = replacementValue - returnedValue;
      const replacementInvoiceId = uuidv4();
      const replacementInvoiceNumber = await generateInvoiceNumber(storeId, trx);

      await trx('invoices').insert({
        id: replacementInvoiceId,
        store_id: storeId || null,
        invoice_number: replacementInvoiceNumber,
        customer_id: origInvoice.customer_id || null,
        customer_name: origInvoice.customer_name || null,
        customer_phone: origInvoice.customer_phone || null,
        cashier_id: processedBy,
        subtotal: replacementValue,
        discount_amount: 0,
        tax_amount: 0,
        grand_total: replacementValue,
        amount_paid: differenceAmount > 0 ? differenceAmount : 0,
        change_given: 0,
        status: 'COMPLETED',
        notes: `Exchange for original invoice ${origInvoice.invoice_number}`,
      });

      for (const rep of validatedReplacements) {
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
          unit_price: rep.unitPrice,
          discount_amount: 0,
          final_price: rep.finalPrice,
          status: 'ACTIVE',
        });

        await trx('inventory_items').where('id', rep.inventoryItemId).update({ status: 'SOLD', updated_at: trx.fn.now() });

        await trx('inventory_movements').insert({
          id: uuidv4(),
          store_id: storeId || null,
          inventory_item_id: rep.inventoryItemId,
          movement_type: 'SALE',
          from_status: 'IN_STOCK',
          to_status: 'SOLD',
          reference_type: 'EXCHANGE',
          reference_id: replacementInvoiceId,
          performed_by: processedBy,
          notes: `Replacement item sold on exchange invoice ${replacementInvoiceNumber}`,
        });
      }

      let paymentStatus: 'BALANCED' | 'CUSTOMER_PAID' | 'REFUND_ISSUED' | 'CREDIT_NOTE_ISSUED' = 'BALANCED';
      if (differenceAmount > 0) {
        paymentStatus = 'CUSTOMER_PAID';
        await trx('payments').insert({
          id: uuidv4(),
          invoice_id: replacementInvoiceId,
          payment_method: paymentMethod || 'CASH',
          amount: differenceAmount,
          transaction_reference: transactionReference || null,
          status: 'COMPLETED',
        });
      } else if (differenceAmount < 0) {
        paymentStatus = paymentMethod === 'CREDIT_NOTE' ? 'CREDIT_NOTE_ISSUED' : 'REFUND_ISSUED';
      }

      const exchangeId = uuidv4();
      const exchangeNumber = await generateExchangeNumber(storeId, trx);

      await trx('exchanges').insert({
        id: exchangeId,
        exchange_number: exchangeNumber,
        store_id: storeId || null,
        original_invoice_id: originalInvoiceId,
        return_id: returnId,
        replacement_invoice_id: replacementInvoiceId,
        processed_by: processedBy,
        returned_value: returnedValue,
        replacement_value: replacementValue,
        difference_amount: differenceAmount,
        payment_status: paymentStatus,
      });

      await trx('invoices').where('id', originalInvoiceId).update({ status: 'EXCHANGED', updated_at: trx.fn.now() });

      await trx('audit_logs').insert({
        id: uuidv4(),
        store_id: storeId || null,
        user_id: processedBy,
        action: 'EXCHANGE_PROCESSED',
        entity_type: 'EXCHANGE',
        entity_id: exchangeId,
        details: JSON.stringify({
          exchangeNumber,
          originalInvoiceNumber: origInvoice.invoice_number,
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
        originalInvoiceId,
        replacementInvoiceId,
        replacementInvoiceNumber,
        returnedValue,
        replacementValue,
        differenceAmount,
        paymentStatus,
      };
    });

    res.status(201).json(exchangeResult);
  } catch (err: any) {
    console.error('[EXCHANGE_ERROR]', err.message);
    res.status(400).json({ error: err.message || 'Failed to process exchange' });
  }
});
