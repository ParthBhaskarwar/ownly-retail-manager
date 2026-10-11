/**
 * ProductEmbeddingRepository — stores per-photo CLIP embeddings in pgvector
 * (table product_embeddings, migration 008) and searches them.
 *
 * Everything here is best-effort and optional: callers treat
 * EmbeddingUnavailableError as "photo AI is off" and carry on.
 *
 * Vectors cross the pg driver as text ('[0.1,0.2,...]') and are cast with
 * ::vector in SQL. Raw queries use positional `?` bindings only — pg-mapping's
 * identifier rewriting must never see a vector literal.
 */

import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { db } from '@/db/client';
import {
  EmbeddingService,
  EmbeddingUnavailableError,
  InvalidImageError,
} from './embedding.service';
import type { SimilarProduct } from '@/types/domain';

type Executor = Knex | Knex.Transaction;

interface RawRow {
  product_id?: string;
  productId?: string;
  similarity: number | string;
  embedding?: string;
  name?: string;
  base_sku?: string;
  baseSku?: string;
  image_urls?: unknown;
  imageUrls?: unknown;
}

export interface SyncResult {
  status: 'ok' | 'unavailable';
  added: number;
  removed: number;
  /** Photos that could not be read as images. */
  skipped: number;
}

/** Candidates fetched from the vector index before grouping per product. */
const CANDIDATE_POOL = 50;

function rowsOf(result: unknown): RawRow[] {
  return ((result as { rows?: RawRow[] }).rows ?? []) as RawRow[];
}

function parseImageUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Makes product_embeddings match the product's current photos: new photos are
 * embedded, removed photos are deleted, unchanged photos (same hash) are kept.
 */
async function syncProductEmbeddings(
  storeId: string,
  productId: string,
  images: string[],
  executor: Executor = db
): Promise<SyncResult> {
  const wanted = images
    .map((image, index) => ({ image, index, hash: EmbeddingService.imageHash(image) }))
    .filter((w) => w.image);

  const existing = (await executor('product_embeddings')
    .where({ product_id: productId })
    .select('id', 'image_hash', 'image_index')) as Array<{ id: string; imageHash: string; imageIndex: number }>;

  const wantedHashes = new Set(wanted.map((w) => w.hash));
  const stale = existing.filter((e) => !wantedHashes.has(e.imageHash));
  if (stale.length > 0) {
    await executor('product_embeddings').whereIn('id', stale.map((s) => s.id)).delete();
  }

  const haveByHash = new Map(existing.map((e) => [e.imageHash, e]));
  let added = 0;
  let skipped = 0;

  for (const w of wanted) {
    const have = haveByHash.get(w.hash);
    if (have) {
      if (have.imageIndex !== w.index) {
        await executor('product_embeddings').where({ id: have.id }).update({ image_index: w.index });
      }
      continue;
    }
    try {
      const vec = await EmbeddingService.embedImage(w.image);
      await executor.raw(
        `INSERT INTO product_embeddings (id, store_id, product_id, image_index, image_hash, model_version, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?::vector)
         ON CONFLICT (product_id, image_hash) DO NOTHING`,
        [randomUUID(), storeId, productId, w.index, w.hash, EmbeddingService.MODEL_VERSION, EmbeddingService.toVectorLiteral(vec)]
      );
      added++;
    } catch (err) {
      if (err instanceof EmbeddingUnavailableError) {
        return { status: 'unavailable', added, removed: stale.length, skipped };
      }
      if (err instanceof InvalidImageError) {
        skipped++;
        continue;
      }
      throw err;
    }
  }

  return { status: 'ok', added, removed: stale.length, skipped };
}

/**
 * Nearest products to a query vector, one row per product (its best photo).
 * The inner ORDER BY ... LIMIT is what lets Postgres use the HNSW index.
 */
async function searchByVector(
  storeId: string,
  vector: number[],
  opts: { excludeProductId?: string; limit?: number; minSimilarity?: number } = {}
): Promise<SimilarProduct[]> {
  const limit = opts.limit ?? 5;
  const min = opts.minSimilarity ?? EmbeddingService.SIMILAR_THRESHOLD;
  const literal = EmbeddingService.toVectorLiteral(vector);

  const result = await db.raw(
    `SELECT g.product_id, g.similarity, p.name, p.base_sku,
            CASE WHEN jsonb_array_length(p.image_urls) > 0
                 THEN jsonb_build_array(p.image_urls -> 0)
                 ELSE '[]'::jsonb END AS image_urls
       FROM (
         SELECT s.product_id, MAX(s.similarity) AS similarity
           FROM (
             SELECT product_id, 1 - (embedding <=> ?::vector) AS similarity
               FROM product_embeddings
              WHERE store_id = ?
                AND (?::uuid IS NULL OR product_id <> ?::uuid)
              ORDER BY embedding <=> ?::vector
              LIMIT ?
           ) s
          GROUP BY s.product_id
         HAVING MAX(s.similarity) >= ?
       ) g
       JOIN products p ON p.id = g.product_id
      ORDER BY g.similarity DESC
      LIMIT ?`,
    [literal, storeId, opts.excludeProductId ?? null, opts.excludeProductId ?? null, literal, CANDIDATE_POOL, min, limit]
  );

  return rowsOf(result).map((r) => {
    const similarity = Math.round(Number(r.similarity) * 1000) / 1000;
    return {
      productId: (r.product_id ?? r.productId) as string,
      name: r.name as string,
      baseSku: (r.base_sku ?? r.baseSku) as string,
      similarity,
      isPossibleDuplicate: similarity >= EmbeddingService.DUPLICATE_THRESHOLD,
      imageUrls: parseImageUrls(r.image_urls ?? r.imageUrls),
    };
  });
}

/** Products that look like this (already saved) product; null when it has no embeddings yet. */
async function findSimilarToProduct(
  storeId: string,
  productId: string,
  limit = 5
): Promise<SimilarProduct[] | null> {
  const result = await db.raw(
    `SELECT embedding::text AS embedding FROM product_embeddings WHERE store_id = ? AND product_id = ? ORDER BY image_index`,
    [storeId, productId]
  );
  const vectors = rowsOf(result).map((r) => JSON.parse(r.embedding as string) as number[]);
  if (vectors.length === 0) return null;

  const best = new Map<string, SimilarProduct>();
  for (const vec of vectors) {
    const hits = await searchByVector(storeId, vec, { excludeProductId: productId, limit });
    for (const h of hits) {
      const prev = best.get(h.productId);
      if (!prev || h.similarity > prev.similarity) best.set(h.productId, h);
    }
  }
  return [...best.values()].sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

/** Does this product have at least one embedding? */
async function hasEmbeddings(storeId: string, productId: string): Promise<boolean> {
  const row = await db('product_embeddings').where({ store_id: storeId, product_id: productId }).first('id');
  return !!row;
}

export const ProductEmbeddingRepository = {
  syncProductEmbeddings,
  searchByVector,
  findSimilarToProduct,
  hasEmbeddings,
};
