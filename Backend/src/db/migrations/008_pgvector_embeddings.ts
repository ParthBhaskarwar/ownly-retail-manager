/**
 * Migration 008 — pgvector photo embeddings.
 *
 * Replaces the old products.photo_fingerprint FLOAT8[] (a hash of file bytes,
 * not of the picture) with real CLIP embeddings stored in pgvector.
 *
 * product_embeddings: one row per PHOTO of a product.
 *   embedding     vector(512)  L2-normalised CLIP image embedding
 *   image_hash    sha256 of the photo, so unchanged photos are never re-embedded
 *   model_version which model produced the vector; never compare across versions
 *
 * Requires the pgvector extension. On Neon, CREATE EXTENSION works for the
 * database owner role. The old photo_fingerprint / photo_quality_score columns
 * are left in place (no longer written) and can be dropped in a later migration.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS vector');

  await knex.schema.createTable('product_embeddings', (t) => {
    t.uuid('id').primary();
    t.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    /** Position of the photo in products.image_urls (0 = primary photo). */
    t.integer('image_index').notNullable();
    t.string('image_hash', 64).notNullable();
    t.string('model_version', 64).notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.unique(['product_id', 'image_hash']);
    t.index(['store_id', 'product_id']);
  });

  // knex has no vector type, so the column and index are raw SQL.
  await knex.raw('ALTER TABLE product_embeddings ADD COLUMN embedding vector(512) NOT NULL');
  await knex.raw(
    'CREATE INDEX product_embeddings_embedding_hnsw ON product_embeddings USING hnsw (embedding vector_cosine_ops)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('product_embeddings');
  // The vector extension is deliberately left installed: other tables may use it.
}
