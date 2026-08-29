/**
 * POS Billing API Router and Service.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { db } from '../../db/client';
import { v4 as uuidv4 } from 'uuid';

export const billingRouter = Router();

billingRouter.use(authenticate);

async function generateInvoiceNumber(storeId: string | null | undefined, trx: any): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const countRes = await trx('invoices')
    .modify((qb: any) => {
      if (storeId) qb.where('store_id', storeId);
    })
    .count('id as count')
    .first();
  const count = parseInt((countRes?.count as string) || '0', 10) + 1;
  const seq = count.toString().padStart(4, '0');
  return `INV-${dateStr}-${seq}`;
}

// POST /api/billing/checkout
billingRouter.post('/checkout', async (req, res): Promise<void> => {
  const storeId = req.user?.storeId;
  const cashierId = req.user?.userId;

  if (!cashierId) {
    res.status(401).json({ error: 'Unauthenticated cashier' });
    return;
  }

  const {
    customerId,
    customerName,
    customerPhone,
    items,
    discountType,
    discountValue,
    discountAmount,
    discountAppliedBy,
    taxAmount,
    payments,
    notes,
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Cart must contain at least one item' });
    return;
  }

  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    res.status(400).json({ error: 'At least one payment method is required' });
    return;
  }

  try {
    const invoiceResult = await db.transaction(async (trx) => {
      let subtotal = 0;
      const validatedItems = [];

      for (const item of items) {
        const { barcode, inventoryItemId, unitPrice, discountAmount: lineDiscount = 0 } = item;

        let itemQuery = trx('inventory_items')
          .select('inventory_items.*', 'product_variants.product_id', 'product_variants.display_name as variantName', 'products.name as productName')
          .join('product_variants', 'inventory_items.variant_id', 'product_variants.id')
          .join('products', 'product_variants.product_id', 'products.id')
          .where('inventory_items.id', inventoryItemId)
          .forUpdate();

        if (storeId) {
          itemQuery = itemQuery.andWhere('inventory_items.store_id', storeId);
        }

        const invRecord = await itemQuery.first();

        if (!invRecord) {
          throw new Error(`Inventory item with barcode ${barcode} not found`);
        }

        if (invRecord.status === 'SOLD') {
          throw new Error(`Item with barcode ${barcode} has already been sold`);
        }

        if (invRecord.status !== 'IN_STOCK' && invRecord.status !== 'RETURNED_TO_STOCK') {
          throw new Error(`Item with barcode ${barcode} is not in sellable stock (Status: ${invRecord.status})`);
        }

        const price = parseFloat(unitPrice);
        const finalPrice = Math.max(0, price - parseFloat(lineDiscount));
        subtotal += finalPrice;

        validatedItems.push({
          id: uuidv4(),
          productId: invRecord.product_id,
          variantId: invRecord.variant_id,
          inventoryItemId: invRecord.id,
          barcode: invRecord.barcode,
          productName: invRecord.productName,
          variantName: invRecord.variantName,
          quantity: 1,
          unitPrice: price,
          discountAmount: parseFloat(lineDiscount),
          finalPrice,
        });
      }

      const calcDiscountAmount = parseFloat(discountAmount || 0);
      const calcTaxAmount = parseFloat(taxAmount || 0);
      const grandTotal = Math.max(0, subtotal - calcDiscountAmount + calcTaxAmount);

      let totalPaid = 0;
      for (const p of payments) {
        totalPaid += parseFloat(p.amount || 0);
      }

      if (totalPaid < grandTotal - 0.01) {
        throw new Error(`Insufficient payment total. Total due: ₹${grandTotal.toFixed(2)}, Paid: ₹${totalPaid.toFixed(2)}`);
      }

      const changeGiven = Math.max(0, totalPaid - grandTotal);
      const invoiceId = uuidv4();
      const invoiceNumber = await generateInvoiceNumber(storeId, trx);

      const invoiceRecord = {
        id: invoiceId,
        store_id: storeId || null,
        invoice_number: invoiceNumber,
        customer_id: customerId || null,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        cashier_id: cashierId,
        subtotal,
        discount_type: discountType || null,
        discount_value: parseFloat(discountValue || 0),
        discount_amount: calcDiscountAmount,
        discount_applied_by: discountAppliedBy || cashierId,
        tax_amount: calcTaxAmount,
        grand_total: grandTotal,
        amount_paid: totalPaid,
        change_given: changeGiven,
        status: 'COMPLETED',
        notes: notes || null,
      };

      await trx('invoices').insert(invoiceRecord);

      for (const vItem of validatedItems) {
        await trx('invoice_items').insert({
          id: vItem.id,
          invoice_id: invoiceId,
          product_id: vItem.productId,
          variant_id: vItem.variantId,
          inventory_item_id: vItem.inventoryItemId,
          barcode: vItem.barcode,
          product_name: vItem.productName,
          variant_name: vItem.variantName,
          quantity: 1,
          unit_price: vItem.unitPrice,
          discount_amount: vItem.discountAmount,
          final_price: vItem.finalPrice,
          status: 'ACTIVE',
        });

        await trx('inventory_items')
          .where('id', vItem.inventoryItemId)
          .update({
            status: 'SOLD',
            updated_at: trx.fn.now(),
          });

        await trx('inventory_movements').insert({
          id: uuidv4(),
          store_id: storeId || null,
          inventory_item_id: vItem.inventoryItemId,
          movement_type: 'SALE',
          from_status: 'IN_STOCK',
          to_status: 'SOLD',
          reference_type: 'INVOICE',
          reference_id: invoiceId,
          performed_by: cashierId,
          notes: `Sold on invoice ${invoiceNumber}`,
        });
      }

      for (const p of payments) {
        await trx('payments').insert({
          id: uuidv4(),
          invoice_id: invoiceId,
          payment_method: p.paymentMethod,
          amount: parseFloat(p.amount),
          transaction_reference: p.transactionReference || null,
          status: 'COMPLETED',
        });
      }

      if (customerId) {
        await trx('customers')
          .where('id', customerId)
          .increment('total_purchases', 1);
      }

      await trx('audit_logs').insert({
        id: uuidv4(),
        store_id: storeId || null,
        user_id: cashierId,
        action: 'SALE_COMPLETED',
        entity_type: 'INVOICE',
        entity_id: invoiceId,
        details: JSON.stringify({
          invoiceNumber,
          grandTotal,
          itemCount: validatedItems.length,
          discountAmount: calcDiscountAmount,
        }),
      });

      return {
        id: invoiceId,
        invoiceNumber,
        grandTotal,
        amountPaid: totalPaid,
        changeGiven,
        createdAt: new Date().toISOString(),
      };
    });

    res.status(201).json(invoiceResult);
  } catch (err: any) {
    console.error('[CHECKOUT_ERROR]', err.message);
    res.status(400).json({ error: err.message || 'Checkout failed' });
  }
});

// GET /api/billing/invoices — List invoices
billingRouter.get('/invoices', async (req, res): Promise<void> => {
  try {
    const storeId = req.user?.storeId;
    const { query: queryStr, status } = req.query;

    let query = db('invoices');
    if (storeId) query = query.where('store_id', storeId);

    if (status) {
      query = query.andWhere('status', status as string);
    }

    if (queryStr) {
      query = query.andWhere((builder) => {
        builder.where('invoice_number', 'ilike', `%${queryStr}%`)
          .orWhere('customer_name', 'ilike', `%${queryStr}%`)
          .orWhere('customer_phone', 'like', `%${queryStr}%`);
      });
    }

    const invoices = await query.orderBy('created_at', 'desc').limit(50);
    res.json(invoices);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// GET /api/billing/invoices/:id — Fetch invoice details with items and payments
billingRouter.get('/invoices/:id', async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const storeId = req.user?.storeId;

    let query = db('invoices').where('id', id);
    if (storeId) query = query.andWhere('store_id', storeId);

    const invoice = await query.first();
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const items = await db('invoice_items').where('invoice_id', id);
    const payments = await db('payments').where('invoice_id', id);

    res.json({
      ...invoice,
      items,
      payments,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch invoice details' });
  }
});
