/**
 * Migration 009 — Week 7: AI predictions, owner decisions and actual outcomes.
 *
 * ai_predictions: one row per AI analysis that was shown to someone. It holds
 * the whole lifecycle of a prediction so the evaluation dashboard can compare
 * what was predicted, what the owner decided and what actually happened:
 *
 *   prediction     scores, 30-day forecast (+ q10/q90), recommendation,
 *                  decision, confidence, reasons, comparables used
 *   owner decision ACCEPTED / MODIFIED / IGNORED / REJECTED, with the owner's
 *                  own quantity and size mix, and the restock batch it created
 *   actual result  units actually sold in the horizon, filled in by the
 *                  evaluation job once as_of + horizon has passed
 *
 * source separates LIVE predictions (made in the app) from BACKTEST ones
 * (replayed as-of historical dates by `npm run ai:backtest`), so the dashboard
 * never mixes a simulated track record with a real one.
 *
 * product_id is nullable: the AI-assisted restock screen can analyse a garment
 * that is not in the catalogue yet (photo + price + subcategory only).
 */

import type { Knex } from 'knex';

const DECISIONS = ['STRONG_BUY', 'CONTROLLED_BUY', 'TRIAL', 'HOLD', 'AVOID'];
const OWNER_ACTIONS = ['ACCEPTED', 'MODIFIED', 'IGNORED', 'REJECTED'];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ai_predictions', (t) => {
    t.uuid('id').primary();
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.uuid('product_id').nullable().references('id').inTable('products').onDelete('CASCADE');
    t.uuid('subcategory_id').nullable().references('id').inTable('subcategories').onDelete('SET NULL');

    t.string('analysis_type', 32).notNullable()
      .checkIn(['PRODUCT_ANALYSIS', 'RESTOCK'], 'ai_predictions_analysis_type_check');
    t.string('source', 16).notNullable().defaultTo('LIVE')
      .checkIn(['LIVE', 'BACKTEST'], 'ai_predictions_source_check');
    t.string('model_version', 64).notNullable();
    /** The moment the prediction is "as of": features use only data before it. */
    t.timestamp('as_of').notNullable();
    t.integer('horizon_days').notNullable().defaultTo(30);

    // ── Prediction ──────────────────────────────────────────────────────────
    /** What the owner entered: price, cost, sizes, planned quantity. */
    t.jsonb('inputs').notNullable().defaultTo('{}');
    /** { selling, demand, profitability, deadStockRisk, returnRisk } each 0–100 with factors. */
    t.jsonb('scores').notNullable();
    t.float('predicted_units').notNullable();
    t.float('predicted_units_q10').notNullable();
    t.float('predicted_units_q90').notNullable();
    t.float('first_sale_probability').nullable();
    t.float('expected_sell_through').nullable();
    /** Stock on hand at as_of (before any recommended purchase). */
    t.integer('stock_at_as_of').notNullable().defaultTo(0);
    t.integer('recommended_quantity').notNullable().defaultTo(0);
    /** [{ size, quantity, share, reason }] */
    t.jsonb('recommended_size_mix').notNullable().defaultTo('[]');
    t.string('decision', 16).notNullable().checkIn(DECISIONS, 'ai_predictions_decision_check');
    t.float('confidence').notNullable();
    t.string('confidence_tier', 8).notNullable()
      .checkIn(['HIGH', 'MEDIUM', 'LOW'], 'ai_predictions_confidence_tier_check');
    t.string('data_sufficiency', 16).notNullable()
      .checkIn(['SUFFICIENT', 'LIMITED', 'INSUFFICIENT'], 'ai_predictions_data_sufficiency_check');
    t.jsonb('reasons').notNullable().defaultTo('[]');
    /** Comparable products the estimate borrowed strength from. */
    t.jsonb('comparables').notNullable().defaultTo('[]');
    /** Naive carry-forward forecast (last-30-day units) kept to measure model lift. */
    t.float('baseline_units').nullable();

    // ── Owner decision ──────────────────────────────────────────────────────
    t.string('owner_action', 16).nullable().checkIn(OWNER_ACTIONS, 'ai_predictions_owner_action_check');
    t.integer('owner_quantity').nullable();
    t.jsonb('owner_size_mix').nullable();
    t.text('owner_note').nullable();
    t.uuid('decided_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('decided_at').nullable();
    t.uuid('restock_batch_id').nullable().references('id').inTable('restock_batches').onDelete('SET NULL');

    // ── Actual result ───────────────────────────────────────────────────────
    t.integer('actual_units').nullable();
    t.float('actual_sell_through').nullable();
    t.timestamp('actual_first_sale_at').nullable();
    t.timestamp('evaluated_at').nullable();

    t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.index(['store_id', 'source', 'created_at']);
    t.index(['store_id', 'product_id', 'as_of']);
    t.index(['store_id', 'evaluated_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ai_predictions');
}
