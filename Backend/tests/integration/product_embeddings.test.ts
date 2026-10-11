/**
 * pgvector storage + search. Skips itself until migration 008 has been applied
 * (extension `vector` + table product_embeddings), so it is safe to run before
 * the Neon change and starts verifying it as soon as the migration is in.
 *
 * Uses hand-made unit vectors instead of the CLIP model, so it is fast and
 * deterministic: it tests the SQL and the repository, not the model.
 */

import { randomUUID } from 'crypto';
import { db } from '@/db/client';
import { EmbeddingService, EMBEDDING_DIM } from '@/services/embedding.service';
import { ProductEmbeddingRepository } from '@/services/product-embedding.repository';

/** Unit vector pointing along `axis`, with an optional bend towards axis+1. */
function vec(axis: number, bend = 0): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  v[axis] = Math.cos(bend);
  v[axis + 1] = Math.sin(bend);
  return v;
}

let tableReady = false;
let storeId = '';
let productA = '';
let productB = '';
let productC = '';
const inserted: string[] = [];

async function insertEmbedding(productId: string, vector: number[], hash: string): Promise<void> {
  const id = randomUUID();
  inserted.push(id);
  await db.raw(
    `INSERT INTO product_embeddings (id, store_id, product_id, image_index, image_hash, model_version, embedding)
     VALUES (?, ?, ?, 0, ?, ?, ?::vector)`,
    [id, storeId, productId, hash, EmbeddingService.MODEL_VERSION, EmbeddingService.toVectorLiteral(vector)]
  );
}

beforeAll(async () => {
  const exists = await db.raw(`SELECT to_regclass('public.product_embeddings') AS t`);
  tableReady = !!(exists.rows?.[0]?.t);
  if (!tableReady) return;

  const rows = (await db('products').select('id', 'store_id').limit(200)) as Array<{ id: string; storeId: string }>;
  const byStore = new Map<string, string[]>();
  for (const r of rows) byStore.set(r.storeId, [...(byStore.get(r.storeId) ?? []), r.id]);
  const pick = [...byStore.entries()].find(([, ids]) => ids.length >= 3);
  if (!pick) {
    tableReady = false; // not enough data to test with
    return;
  }
  storeId = pick[0];
  [productA, productB, productC] = pick[1];

  const tag = randomUUID().slice(0, 8);
  await insertEmbedding(productA, vec(0), `test-a-${tag}`); // A: axis 0
  await insertEmbedding(productB, vec(0, 0.2), `test-b-${tag}`); // B: very close to A
  await insertEmbedding(productC, vec(10), `test-c-${tag}`); // C: unrelated
});

afterAll(async () => {
  if (tableReady && inserted.length > 0) {
    await db('product_embeddings').whereIn('id', inserted).delete();
  }
  await db.destroy();
});

const itIfReady = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!tableReady) {
      console.warn(`[skipped] ${name} — migration 008 not applied yet`);
      return;
    }
    await fn();
  });

describe('ProductEmbeddingRepository (pgvector)', () => {
  itIfReady('finds the closest product first and leaves out unrelated ones', async () => {
    const hits = await ProductEmbeddingRepository.searchByVector(storeId, vec(0), {
      excludeProductId: productA,
      minSimilarity: 0.5,
    });
    const ids = hits.map((h) => h.productId);
    expect(ids).toContain(productB);
    expect(ids).not.toContain(productA);
    expect(ids).not.toContain(productC);
    expect(hits[0].similarity).toBeGreaterThan(0.95);
  });

  itIfReady('flags near-identical vectors as possible duplicates', async () => {
    const hits = await ProductEmbeddingRepository.searchByVector(storeId, vec(0, 0.01), {
      excludeProductId: productC,
      minSimilarity: 0.5,
    });
    const a = hits.find((h) => h.productId === productA);
    expect(a?.isPossibleDuplicate).toBe(true);
  });

  itIfReady('findSimilarToProduct uses the product\'s own embeddings', async () => {
    const hits = await ProductEmbeddingRepository.findSimilarToProduct(storeId, productA, 5);
    expect(hits).not.toBeNull();
    expect(hits!.some((h) => h.productId === productB)).toBe(true);
    expect(hits!.every((h) => h.productId !== productA)).toBe(true);
  });

  itIfReady('returns at most the primary photo of each match', async () => {
    const hits = await ProductEmbeddingRepository.searchByVector(storeId, vec(0), { minSimilarity: 0.5 });
    for (const h of hits) expect(h.imageUrls.length).toBeLessThanOrEqual(1);
  });

  itIfReady('returns null for a product with no embeddings', async () => {
    const res = await ProductEmbeddingRepository.findSimilarToProduct(storeId, randomUUID(), 5);
    expect(res).toBeNull();
  });

  itIfReady('sync skips unreadable photos instead of failing', async () => {
    const junk = 'data:image/jpeg;base64,' + Buffer.from('this is not an image '.repeat(10)).toString('base64');
    // A random id, so this can never delete a real product's embeddings.
    const res = await ProductEmbeddingRepository.syncProductEmbeddings(storeId, randomUUID(), [junk]);
    expect(res.status).toBe('ok');
    expect(res.skipped).toBe(1);
    expect(res.added).toBe(0);
  });
});
