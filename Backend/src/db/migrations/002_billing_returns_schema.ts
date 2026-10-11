/**
 * Migration 002 — Billing, Invoices, Customers, Returns, Exchanges, Credit Notes.
 *
 * Note: audit_logs is managed by 002_audit_logs.ts and must not be created here.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Step 1: customers ────────────────────────────────────────────────────────
  await knex.schema.createTable('customers', (t) => {
    t.uuid('id').primary();
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.string('name', 255).notNullable();
    t.string('phone', 20).notNullable();
    t.string('email', 320).nullable();
    t.integer('total_purchases').notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index(['store_id', 'phone']);
  });

  // ── Step 2: invoices ─────────────────────────────────────────────────────────
  await knex.schema.createTable('invoices', (t) => {
    t.uuid('id').primary();
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.string('invoice_number', 100).notNullable();
    t.uuid('customer_id').nullable().references('id').inTable('customers').onDelete('SET NULL');
    t.string('customer_name', 255).nullable();
    t.string('customer_phone', 20).nullable();
    t.uuid('cashier_id').notNullable().references('id').inTable('users');
    t.decimal('subtotal', 12, 2).notNullable();
    t.enu('discount_type', ['PERCENTAGE', 'FIXED']).nullable();
    t.decimal('discount_value', 12, 2).notNullable().defaultTo(0);
    t.decimal('discount_amount', 12, 2).notNullable().defaultTo(0);
    t.uuid('discount_applied_by').nullable().references('id').inTable('users');
    t.decimal('tax_amount', 12, 2).notNullable().defaultTo(0);
    t.decimal('grand_total', 12, 2).notNullable();
    t.decimal('amount_paid', 12, 2).notNullable();
    t.decimal('change_given', 12, 2).notNullable().defaultTo(0);
    t.enu('status', ['COMPLETED', 'PARTIALLY_RETURNED', 'FULLY_RETURNED', 'EXCHANGED', 'CANCELLED'])
      .notNullable().defaultTo('COMPLETED');
    t.text('notes').nullable();
    t.timestamps(true, true);
    t.unique(['store_id', 'invoice_number']);
    t.index(['store_id', 'created_at']);
  });

  // ── Step 3: invoice_items ──────────────────────────────────────────────────
  await knex.schema.createTable('invoice_items', (t) => {
    t.uuid('id').primary();
    t.uuid('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products');
    t.uuid('variant_id').notNullable().references('id').inTable('product_variants');
    t.uuid('inventory_item_id').notNullable().references('id').inTable('inventory_items');
    t.string('barcode', 100).notNullable();
    t.string('product_name', 255).notNullable();
    t.string('variant_name', 255).notNullable();
    t.integer('quantity').notNullable().defaultTo(1);
    t.decimal('unit_price', 12, 2).notNullable();
    t.decimal('discount_amount', 12, 2).notNullable().defaultTo(0);
    t.decimal('final_price', 12, 2).notNullable();
    t.enu('status', ['ACTIVE', 'RETURNED', 'EXCHANGED']).notNullable().defaultTo('ACTIVE');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['invoice_id']);
    t.index(['inventory_item_id']);
  });

  // ── Step 4: payments ────────────────────────────────────────────────────────
  await knex.schema.createTable('payments', (t) => {
    t.uuid('id').primary();
    t.uuid('invoice_id').notNullable().references('id').inTable('invoices').onDelete('CASCADE');
    t.enu('payment_method', ['CASH', 'UPI', 'CARD', 'CREDIT_NOTE']).notNullable();
    t.decimal('amount', 12, 2).notNullable();
    t.string('transaction_reference', 255).nullable();
    t.enu('status', ['COMPLETED', 'REFUNDED']).notNullable().defaultTo('COMPLETED');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // ── Step 5: returns ─────────────────────────────────────────────────────────
  await knex.schema.createTable('returns', (t) => {
    t.uuid('id').primary();
    t.string('return_number', 100).notNullable();
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.uuid('original_invoice_id').notNullable().references('id').inTable('invoices');
    t.uuid('customer_id').nullable().references('id').inTable('customers');
    t.uuid('processed_by').notNullable().references('id').inTable('users');
    t.decimal('total_refund_amount', 12, 2).notNullable();
    t.enu('refund_method', ['CASH', 'UPI', 'CARD', 'CREDIT_NOTE', 'EXCHANGE']).notNullable();
    t.text('notes').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['store_id', 'return_number']);
  });

  // ── Step 6: return_items ────────────────────────────────────────────────────
  await knex.schema.createTable('return_items', (t) => {
    t.uuid('id').primary();
    t.uuid('return_id').notNullable().references('id').inTable('returns').onDelete('CASCADE');
    t.uuid('original_invoice_item_id').notNullable().references('id').inTable('invoice_items');
    t.uuid('inventory_item_id').notNullable().references('id').inTable('inventory_items');
    t.enu('condition', ['RESELLABLE', 'DAMAGED', 'DEFECTIVE', 'OPENED_USED', 'OTHER']).notNullable();
    t.string('reason', 255).nullable();
    t.decimal('refund_amount', 12, 2).notNullable();
    t.enu('inventory_action', ['RETURN_TO_STOCK', 'RETURN_DAMAGED']).notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // ── Step 7: exchanges ───────────────────────────────────────────────────────
  await knex.schema.createTable('exchanges', (t) => {
    t.uuid('id').primary();
    t.string('exchange_number', 100).notNullable();
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.uuid('original_invoice_id').notNullable().references('id').inTable('invoices');
    t.uuid('return_id').notNullable().references('id').inTable('returns');
    t.uuid('replacement_invoice_id').notNullable().references('id').inTable('invoices');
    t.uuid('processed_by').notNullable().references('id').inTable('users');
    t.decimal('returned_value', 12, 2).notNullable();
    t.decimal('replacement_value', 12, 2).notNullable();
    t.decimal('difference_amount', 12, 2).notNullable();
    t.enu('payment_status', ['BALANCED', 'CUSTOMER_PAID', 'REFUND_ISSUED', 'CREDIT_NOTE_ISSUED']).notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['store_id', 'exchange_number']);
  });

  // ── Step 8: credit_notes ────────────────────────────────────────────────────
  await knex.schema.createTable('credit_notes', (t) => {
    t.uuid('id').primary();
    t.string('credit_note_number', 100).notNullable();
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.uuid('original_invoice_id').notNullable().references('id').inTable('invoices');
    t.uuid('return_id').nullable().references('id').inTable('returns');
    t.uuid('customer_id').nullable().references('id').inTable('customers');
    t.decimal('original_amount', 12, 2).notNullable();
    t.decimal('remaining_amount', 12, 2).notNullable();
    t.enu('status', ['ACTIVE', 'REDEEMED', 'EXPIRED']).notNullable().defaultTo('ACTIVE');
    t.date('expiry_date').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['store_id', 'credit_note_number']);
  });

}

export async function down(knex: Knex): Promise<void> {
  // audit_logs is owned by 002_audit_logs.ts — do not drop it here.
  await knex.schema.dropTableIfExists('credit_notes');
  await knex.schema.dropTableIfExists('exchanges');
  await knex.schema.dropTableIfExists('return_items');
  await knex.schema.dropTableIfExists('returns');
  await knex.schema.dropTableIfExists('payments');
  await knex.schema.dropTableIfExists('invoice_items');
  await knex.schema.dropTableIfExists('invoices');
  await knex.schema.dropTableIfExists('customers');
}
