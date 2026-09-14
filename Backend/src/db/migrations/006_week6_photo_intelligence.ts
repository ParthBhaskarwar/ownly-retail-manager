/**
 * Migration 006 — Week 6: product photo intelligence + performance cache.
 *
 * products table changes:
 *   photo_fingerprint  FLOAT8[]  nullable — 64-element DCT perceptual-hash vector.
 *                                           NULL means the product has no photo / photo AI
 *                                           was skipped. Manual entry is never affected.
 *   photo_quality_score FLOAT4  nullable — 0–1 brightness/contrast/sharpness score for
 *                                           the captured image.
 *
 * product_performance_cache table:
 *   Pre-computed per-product performance KPIs updated on-demand by the
 *   ProductPerformanceService. Using a cache table avoids heavy joins on every
 *   product-detail page load.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Step 1: Add photo intelligence columns to products ─────────────────────
  await knex.schema.alterTable('products', (t) => {
    // PostgreSQL FLOAT8[] = double precision array — suits a 64-dim DCT vector.
    // Stored as JSONB in the ORM layer (knex does not natively emit FLOAT8[]),
    // so we use a raw column definition.
    t.specificType('photo_fingerprint', 'FLOAT8[]').nullable();
    t.specificType('photo_quality_score', 'REAL').nullable();
  });

  // ── Step 2: product_performance_cache ──────────────────────────────────────
  await knex.schema.createTable('product_performance_cache', (t) => {
    t.uuid('product_id').primary().references('id').inTable('products').onDelete('CASCADE');
    /** Days from first inventory_item created_at to first sale. NULL = never sold. */
    t.float('time_to_first_sale_days').nullable();
    /** Units sold in the most-recent rolling 30-day window. */
    t.float('sales_velocity_30d').nullable();
    /**
     * Sell-through rate across ALL variants:
     *   sold / (sold + in_stock), range 0–1. NULL = no stock ever.
     */
    t.float('sell_through_rate').nullable();
    /** Average (NOW() - purchase_date) in days for currently in-stock items. */
    t.float('avg_stock_age_days').nullable();
    /**
     * JSON object mapping size attribute value → sell-through rate.
     * e.g. { "S": 0.8, "M": 0.5, "L": 0.2 }
     */
    t.jsonb('size_demand').nullable();
    t.timestamp('computed_at').notNullable().defaultTo(knex.fn.now());
    t.index(['computed_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('product_performance_cache');

  await knex.schema.alterTable('products', (t) => {
    t.dropColumn('photo_fingerprint');
    t.dropColumn('photo_quality_score');
  });
}
