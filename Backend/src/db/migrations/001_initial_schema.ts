/**
 * Migration 001 — Initial schema.
 *
 * Implements the Gate 1 approved database schema for Ownly.
 *
 * Circular dependency handled explicitly:
 *   users.store_id → stores   (users is created first without this FK)
 *   stores.owner_id → users   (stores is created second with this FK)
 *   Then users.store_id FK is added via ALTER TABLE after stores exists.
 *
 * Run: npm run db:migrate
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Step 1: users (NO store_id FK yet — stores doesn't exist) ──────────────
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary();
    t.uuid('store_id').nullable();  // FK added in Step 3 after stores exists
    t.string('name', 255).notNullable();
    t.string('email', 320).notNullable().unique();
    t.string('phone', 20).notNullable();
    t.string('password_hash', 255).notNullable();
    t.enu('role', ['OWNER', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'ACCOUNTANT', 'VIEWER'])
      .notNullable().defaultTo('VIEWER');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('verified_at').nullable();
    t.timestamp('last_login_at').nullable();
    t.timestamps(true, true);
  });

  // ── Step 2: sessions (depends on users ✓) ────────────────────────────────────
  await knex.schema.createTable('sessions', (t) => {
    t.uuid('id').primary();
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.timestamp('expires_at').notNullable();
    t.jsonb('device_info').nullable();
    t.timestamps(true, true);
  });

  // ── Step 3: stores (depends on users ✓) ──────────────────────────────────────
  await knex.schema.createTable('stores', (t) => {
    t.uuid('id').primary();
    t.uuid('owner_id').notNullable().references('id').inTable('users');
    t.string('name', 255).notNullable();
    t.text('address').nullable();
    t.string('phone', 20).nullable();
    t.string('gst_number', 20).nullable();
    t.string('currency', 3).notNullable().defaultTo('INR');
    t.jsonb('tax_settings').nullable();
    t.jsonb('invoice_settings').nullable();
    t.string('logo_url', 512).nullable();
    t.string('retail_type', 50).notNullable();
    t.boolean('setup_completed').notNullable().defaultTo(false);
    t.timestamps(true, true);
  });

  // ── Step 4: now add users.store_id FK (stores now exists) ────────────────────
  await knex.schema.alterTable('users', (t) => {
    t.foreign('store_id').references('id').inTable('stores').onDelete('SET NULL');
  });

  // ── Step 5: attribute_definitions (no deps on users/stores) ──────────────────
  await knex.schema.createTable('attribute_definitions', (t) => {
    t.uuid('id').primary();
    t.string('retail_template_id', 50).notNullable();
    t.string('name', 100).notNullable();
    t.enu('data_type', ['TEXT', 'NUMBER', 'BOOLEAN', 'ENUM']).notNullable();
    t.boolean('is_required').notNullable().defaultTo(false);
    t.boolean('is_variant_level').notNullable().defaultTo(false);
    t.jsonb('enum_values').nullable();
    t.integer('display_order').notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['retail_template_id', 'name']);
  });

  // ── Step 6: categories (depends on stores ✓) ─────────────────────────────────
  await knex.schema.createTable('categories', (t) => {
    t.uuid('id').primary();
    t.string('retail_template_id', 50).notNullable();
    t.uuid('store_id').nullable().references('id').inTable('stores').onDelete('CASCADE');
    t.string('name', 100).notNullable();
    t.boolean('is_system').notNullable().defaultTo(false);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // ── Step 7: subcategories (depends on categories ✓, stores ✓) ────────────────
  await knex.schema.createTable('subcategories', (t) => {
    t.uuid('id').primary();
    t.uuid('category_id').notNullable().references('id').inTable('categories').onDelete('CASCADE');
    t.uuid('store_id').nullable().references('id').inTable('stores').onDelete('CASCADE');
    t.string('name', 100).notNullable();
    t.boolean('is_system').notNullable().defaultTo(false);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // ── Step 8: suppliers (depends on stores ✓) ──────────────────────────────────
  await knex.schema.createTable('suppliers', (t) => {
    t.uuid('id').primary();
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.string('name', 255).notNullable();
    t.string('code', 20).notNullable();
    t.string('gstin', 20).nullable();
    t.text('address').nullable();
    t.string('payment_terms', 50).nullable();
    t.text('notes').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(['store_id', 'code']);
  });

  // ── Step 9: products (depends on stores ✓, categories ✓, subcategories ✓, suppliers ✓, users ✓) ─
  await knex.schema.createTable('products', (t) => {
    t.uuid('id').primary();
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.string('retail_template_id', 50).notNullable();
    t.uuid('category_id').notNullable().references('id').inTable('categories');
    t.uuid('subcategory_id').nullable().references('id').inTable('subcategories');
    t.uuid('supplier_id').nullable().references('id').inTable('suppliers');
    t.string('name', 255).notNullable();
    t.string('base_sku', 50).notNullable();
    t.text('description').nullable();
    t.decimal('base_selling_price', 12, 2).notNullable();
    t.decimal('base_cost_price', 12, 2).notNullable();
    t.enu('status', ['ACTIVE', 'INACTIVE', 'DISCONTINUED']).notNullable().defaultTo('ACTIVE');
    t.jsonb('image_urls').notNullable().defaultTo('[]');
    t.uuid('created_by').notNullable().references('id').inTable('users');
    t.uuid('updated_by').notNullable().references('id').inTable('users');
    t.timestamps(true, true);
    t.unique(['store_id', 'base_sku']);
    t.index(['store_id', 'category_id']);
    t.index(['store_id', 'status']);
  });

  // ── Step 10: product_attribute_values ─────────────────────────────────────────
  await knex.schema.createTable('product_attribute_values', (t) => {
    t.uuid('id').primary();
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.uuid('attribute_definition_id').notNullable().references('id').inTable('attribute_definitions');
    t.text('value').notNullable();
    t.unique(['product_id', 'attribute_definition_id']);
  });

  // ── Step 11: product_variants ─────────────────────────────────────────────────
  await knex.schema.createTable('product_variants', (t) => {
    t.uuid('id').primary();
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.string('sku', 100).notNullable();
    t.string('display_name', 255).notNullable();
    t.decimal('selling_price_override', 12, 2).nullable();
    t.decimal('cost_price_override', 12, 2).nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.unique(['product_id', 'sku']);
  });

  // ── Step 12: variant_attribute_values ─────────────────────────────────────────
  await knex.schema.createTable('variant_attribute_values', (t) => {
    t.uuid('id').primary();
    t.uuid('variant_id').notNullable().references('id').inTable('product_variants').onDelete('CASCADE');
    t.uuid('attribute_definition_id').notNullable().references('id').inTable('attribute_definitions');
    t.text('value').notNullable();
    t.unique(['variant_id', 'attribute_definition_id']);
  });

  // ── Step 13: inventory_items ──────────────────────────────────────────────────
  await knex.schema.createTable('inventory_items', (t) => {
    t.uuid('id').primary();
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.uuid('variant_id').notNullable().references('id').inTable('product_variants').onDelete('CASCADE');
    t.string('barcode', 100).notNullable();
    t.decimal('purchase_cost_price', 12, 2).notNullable();
    t.date('purchase_date').notNullable();
    t.enu('status', [
      'IN_STOCK', 'RESERVED', 'SOLD', 'RETURNED_TO_STOCK',
      'RETURNED_DAMAGED', 'DAMAGED', 'LOST', 'TRANSFERRED_OUT',
    ]).notNullable().defaultTo('IN_STOCK');
    t.uuid('created_by').notNullable().references('id').inTable('users');
    t.timestamps(true, true);
    t.unique(['store_id', 'barcode']);
    t.index(['variant_id', 'status']);
    t.index(['store_id', 'status']);
    t.index(['store_id', 'purchase_date']);
  });

  // ── Step 14: inventory_movements ──────────────────────────────────────────────
  await knex.schema.createTable('inventory_movements', (t) => {
    t.uuid('id').primary();
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.uuid('inventory_item_id').notNullable().references('id').inTable('inventory_items').onDelete('CASCADE');
    t.enu('movement_type', [
      'PURCHASE', 'SALE', 'RETURN_TO_STOCK', 'RETURN_DAMAGED',
      'DAMAGE_WRITE_OFF', 'LOSS_WRITE_OFF', 'TRANSFER_OUT', 'TRANSFER_IN', 'MANUAL_ADJUSTMENT',
    ]).notNullable();
    t.string('from_status', 30).notNullable();
    t.string('to_status', 30).notNullable();
    t.string('reference_type', 50).notNullable();
    t.uuid('reference_id').notNullable();
    t.uuid('performed_by').notNullable().references('id').inTable('users');
    t.timestamp('performed_at').notNullable().defaultTo(knex.fn.now());
    t.text('notes').nullable();
    t.index(['inventory_item_id']);
    t.index(['store_id', 'movement_type']);
    t.index(['reference_type', 'reference_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse dependency order
  await knex.schema.dropTableIfExists('inventory_movements');
  await knex.schema.dropTableIfExists('inventory_items');
  await knex.schema.dropTableIfExists('variant_attribute_values');
  await knex.schema.dropTableIfExists('product_variants');
  await knex.schema.dropTableIfExists('product_attribute_values');
  await knex.schema.dropTableIfExists('products');
  await knex.schema.dropTableIfExists('suppliers');
  await knex.schema.dropTableIfExists('subcategories');
  await knex.schema.dropTableIfExists('categories');
  await knex.schema.dropTableIfExists('attribute_definitions');
  await knex.schema.dropTableIfExists('sessions');
  // Remove the circular FK before dropping users/stores
  await knex.schema.alterTable('users', (t) => {
    t.dropForeign(['store_id']);
  });
  await knex.schema.dropTableIfExists('stores');
  await knex.schema.dropTableIfExists('users');
}
