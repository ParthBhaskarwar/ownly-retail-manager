/**
 * Probe the photo-AI model on real images and print a similarity matrix.
 *
 *   npm run ai:probe -- photoA.jpg photoB.jpg photoC.jpg
 *
 * Use it to calibrate EMBEDDING_DUPLICATE_THRESHOLD / EMBEDDING_SIMILAR_THRESHOLD:
 * feed it (1) two photos of the SAME dress, (2) two DIFFERENT dresses, and pick
 * thresholds between those scores. With no arguments it runs on generated
 * test images, which only proves the pipeline works.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { EmbeddingService } from '@/services/embedding.service';

async function syntheticImage(kind: 'red-stripes' | 'red-stripes-noisy' | 'blue-solid'): Promise<string> {
  const size = 600;
  const px = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      let rgb: [number, number, number];
      if (kind === 'blue-solid') rgb = [30, 60, 200];
      else rgb = Math.floor(x / 30) % 2 === 0 ? [200, 30, 40] : [240, 240, 240];
      const noise = kind === 'red-stripes-noisy' ? Math.floor(Math.random() * 20) - 10 : 0;
      px[i] = Math.max(0, Math.min(255, rgb[0] + noise));
      px[i + 1] = Math.max(0, Math.min(255, rgb[1] + noise));
      px[i + 2] = Math.max(0, Math.min(255, rgb[2] + noise));
    }
  }
  const jpeg = await sharp(px, { raw: { width: size, height: size, channels: 3 } }).jpeg().toBuffer();
  return 'data:image/jpeg;base64,' + jpeg.toString('base64');
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  const items: Array<{ name: string; image: string }> = [];

  if (files.length === 0) {
    console.log('No images given — using generated test images.\n');
    for (const kind of ['red-stripes', 'red-stripes-noisy', 'blue-solid'] as const) {
      items.push({ name: kind, image: await syntheticImage(kind) });
    }
  } else {
    for (const f of files) {
      const buf = fs.readFileSync(f);
      items.push({ name: path.basename(f), image: 'data:image/jpeg;base64,' + buf.toString('base64') });
    }
  }

  console.log('Loading model (first run downloads ~90 MB)...');
  const t0 = Date.now();
  if (!(await EmbeddingService.warmUp())) {
    console.error('Model could not be loaded — see error above.');
    process.exit(1);
  }
  console.log(`Model ready in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

  const vectors: number[][] = [];
  for (const it of items) {
    const t = Date.now();
    const vec = await EmbeddingService.embedImage(it.image);
    vectors.push(vec);
    const quality = await EmbeddingService.checkPhotoQuality(it.image);
    const attrs = await EmbeddingService.suggestAttributes(vec);
    console.log(`${it.name}  (${Date.now() - t} ms, dim ${vec.length})`);
    console.log(`  quality ${quality.score.toFixed(2)}  ${quality.issues.join('; ') || 'no issues'}`);
    console.log(`  colours ${attrs.colours.join(', ')}  pattern ${attrs.pattern} (${attrs.patternConfidence})`);
  }

  console.log('\nCosine similarity matrix:');
  console.log(''.padEnd(24) + items.map((_, i) => String(i).padStart(7)).join(''));
  items.forEach((a, i) => {
    const row = items.map((_, j) => EmbeddingService.cosineSimilarity(vectors[i], vectors[j]).toFixed(3).padStart(7));
    console.log(`${i}: ${a.name.slice(0, 20).padEnd(20)}${row.join('')}`);
  });
  console.log(
    `\nCurrent thresholds: duplicate >= ${EmbeddingService.DUPLICATE_THRESHOLD}, similar >= ${EmbeddingService.SIMILAR_THRESHOLD}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
