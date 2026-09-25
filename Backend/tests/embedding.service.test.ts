/**
 * @jest-environment ./tests/jest-env-typedarrays.js
 */
import sharp from 'sharp';
import {
  EmbeddingService,
  InvalidImageError,
  EMBEDDING_DIM,
} from '@/services/embedding.service';

async function solidJpeg(width: number, height: number, rgb: [number, number, number]): Promise<string> {
  const buf = await sharp({ create: { width, height, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
    .jpeg()
    .toBuffer();
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}

async function stripesJpeg(size: number): Promise<string> {
  const px = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      const on = Math.floor(x / 20) % 2 === 0;
      px[i] = on ? 200 : 235;
      px[i + 1] = on ? 30 : 235;
      px[i + 2] = on ? 40 : 235;
    }
  }
  const buf = await sharp(px, { raw: { width: size, height: size, channels: 3 } }).jpeg().toBuffer();
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}

describe('EmbeddingService helpers (no model needed)', () => {
  test('cosineSimilarity: identical = 1, orthogonal = 0, length mismatch = 0', () => {
    expect(EmbeddingService.cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(EmbeddingService.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(EmbeddingService.cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });

  test('toVectorLiteral builds the pgvector text form', () => {
    expect(EmbeddingService.toVectorLiteral([0.5, -1, 2])).toBe('[0.5,-1,2]');
  });

  test('imageHash ignores the data-URI prefix and is content-based', () => {
    const a = EmbeddingService.imageHash('data:image/png;base64,AAAA');
    const b = EmbeddingService.imageHash('data:image/jpeg;base64,AAAA');
    const c = EmbeddingService.imageHash('data:image/png;base64,BBBB');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });

  test('photo AI is disabled in the default test run', () => {
    expect(EmbeddingService.isEnabled()).toBe(process.env.RUN_MODEL_TESTS === 'true');
  });
});

describe('EmbeddingService.checkPhotoQuality (real pixels)', () => {
  test('flags a tiny, flat image', async () => {
    const q = await EmbeddingService.checkPhotoQuality(await solidJpeg(100, 100, [128, 128, 128]));
    expect(q.issues.some((i) => i.includes('Low resolution'))).toBe(true);
    expect(q.issues.some((i) => i.includes('Low contrast'))).toBe(true);
    expect(q.score).toBeLessThan(0.6);
  });

  test('flags a very dark image', async () => {
    const q = await EmbeddingService.checkPhotoQuality(await solidJpeg(800, 800, [5, 5, 5]));
    expect(q.issues).toContain('Image is too dark');
  });

  test('accepts a large, sharp, high-contrast image', async () => {
    const q = await EmbeddingService.checkPhotoQuality(await stripesJpeg(900));
    expect(q.issues).toEqual([]);
    expect(q.score).toBeGreaterThan(0.8);
  });

  test('rejects bytes that are not an image', async () => {
    const junk = 'data:image/jpeg;base64,' + Buffer.from('not an image at all, just text').toString('base64');
    await expect(EmbeddingService.checkPhotoQuality(junk)).rejects.toBeInstanceOf(InvalidImageError);
  });
});

// Needs the CLIP model (~90 MB download on first run): RUN_MODEL_TESTS=true npm test -- embedding
const describeModel = process.env.RUN_MODEL_TESTS === 'true' ? describe : describe.skip;

describeModel('EmbeddingService with the CLIP model', () => {
  jest.setTimeout(300_000);

  test('embeds to 512 unit-length numbers and ranks the same design above a different one', async () => {
    const stripes = await stripesJpeg(600);
    const stripesAgain = await stripesJpeg(640);
    const blue = await solidJpeg(600, 600, [30, 60, 200]);

    const [a, b, c] = await Promise.all([
      EmbeddingService.embedImage(stripes),
      EmbeddingService.embedImage(stripesAgain),
      EmbeddingService.embedImage(blue),
    ]);

    expect(a).toHaveLength(EMBEDDING_DIM);
    expect(Math.hypot(...a)).toBeCloseTo(1, 3);
    expect(EmbeddingService.cosineSimilarity(a, b)).toBeGreaterThan(EmbeddingService.cosineSimilarity(a, c));
  });

  test('suggests a colour and one of the form pattern options', async () => {
    const vec = await EmbeddingService.embedImage(await stripesJpeg(600));
    const s = await EmbeddingService.suggestAttributes(vec);
    expect(s.colours.length).toBeGreaterThan(0);
    expect(['Solid', 'Striped', 'Checked', 'Printed', 'Embroidered', 'Floral', 'Abstract']).toContain(s.pattern);
  });
});
