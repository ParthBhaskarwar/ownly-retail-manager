/**
 * Embed the photos of products that were saved before photo AI existed.
 *
 *   npm run ai:backfill                 # every store
 *   npm run ai:backfill -- --store <id> # one store
 *
 * Safe to re-run: photos that already have an embedding (same content hash)
 * are skipped. Requires migration 008 (pgvector) to be applied.
 */

import { db } from '@/db/client';
import { EmbeddingService } from '@/services/embedding.service';
import { ProductEmbeddingRepository } from '@/services/product-embedding.repository';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function toImages(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (typeof value === 'string') {
    try {
      return toImages(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

async function main(): Promise<void> {
  const storeId = argValue('--store');

  console.log('Loading photo-AI model...');
  if (!(await EmbeddingService.warmUp())) {
    console.error('Model could not be loaded (is EMBEDDINGS_ENABLED=false, or are you offline on first run?).');
    process.exit(1);
  }

  let query = db('products').select('id', 'store_id', 'name', 'image_urls');
  if (storeId) query = query.where({ store_id: storeId });
  const products = (await query) as Array<{ id: string; storeId: string; name: string; imageUrls: unknown }>;

  let withPhotos = 0;
  let added = 0;
  let skipped = 0;
  for (const p of products) {
    const images = toImages(p.imageUrls);
    if (images.length === 0) continue;
    withPhotos++;
    const res = await ProductEmbeddingRepository.syncProductEmbeddings(p.storeId, p.id, images);
    if (res.status === 'unavailable') {
      console.error('Model became unavailable, stopping.');
      break;
    }
    added += res.added;
    skipped += res.skipped;
    console.log(`  ${p.name}: +${res.added} embedded, ${res.skipped} unreadable`);
  }

  console.log(`\nDone. ${products.length} products, ${withPhotos} with photos, ${added} embeddings added, ${skipped} photos unreadable.`);
  await db.destroy();
}

main().catch(async (err) => {
  console.error(err);
  await db.destroy().catch(() => undefined);
  process.exit(1);
});
