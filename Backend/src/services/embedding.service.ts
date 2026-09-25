/**
 * EmbeddingService — offline visual embeddings for product photos.
 *
 * Week 6 deliverable: "Integrate a lightweight offline image encoder."
 *
 * Model source:  OpenAI CLIP ViT-B/32 (Xenova/clip-vit-base-patch32 ONNX export),
 *                8-bit quantised, run locally through @huggingface/transformers.
 * Model version: MODEL_VERSION below — stored with every embedding so vectors
 *                from different models are never compared.
 * Output:        512 numbers per photo, L2-normalised (cosine = dot product).
 * Offline:       weights are downloaded once into config.embeddings.modelCacheDir;
 *                after that no network is used. Set EMBEDDING_OFFLINE=true to forbid
 *                downloads entirely.
 * Runtime:       ~0.2-1 s per photo on CPU after a 2-5 s first load.
 *
 * Limitations:
 *   - CLIP centre-crops to a square, so a garment at the very edge can be clipped.
 *   - It sees the whole photo (model, background, hanger), not only the garment;
 *     plain product-on-white photos match best.
 *   - Zero-shot colour/pattern suggestions are hints for the user to approve,
 *     not ground truth.
 *
 * Photo AI is strictly optional: when the model cannot load, callers get
 * EmbeddingUnavailableError and must carry on without it.
 */

import { createHash } from 'crypto';
import fs from 'fs';
import sharp, { type Metadata, type OutputInfo } from 'sharp';
import { config } from '@/config/env';

type Transformers = typeof import('@huggingface/transformers');

export const MODEL_ID = 'Xenova/clip-vit-base-patch32';
export const MODEL_VERSION = 'clip-vit-base-patch32-q8@v1';
export const EMBEDDING_DIM = 512;

export const DUPLICATE_THRESHOLD = config.embeddings.duplicateThreshold;
export const SIMILAR_THRESHOLD = config.embeddings.similarThreshold;

export class EmbeddingUnavailableError extends Error {
  constructor(message = 'Photo AI is not available.') {
    super(message);
    this.name = 'EmbeddingUnavailableError';
  }
}

export class InvalidImageError extends Error {
  constructor(message = 'The image could not be read.') {
    super(message);
    this.name = 'InvalidImageError';
  }
}

// ─── Model loading (lazy, once, with retry cool-down) ────────────────────────

interface LoadedModel {
  tf: Transformers;
  processor: Awaited<ReturnType<Transformers['AutoProcessor']['from_pretrained']>>;
  vision: Awaited<ReturnType<Transformers['CLIPVisionModelWithProjection']['from_pretrained']>>;
  tokenizer: Awaited<ReturnType<Transformers['AutoTokenizer']['from_pretrained']>>;
  text: Awaited<ReturnType<Transformers['CLIPTextModelWithProjection']['from_pretrained']>>;
}

const RETRY_AFTER_MS = 60_000;
let loading: Promise<LoadedModel> | null = null;
let failedAt = 0;
let lastError = '';

async function loadModel(): Promise<LoadedModel> {
  const tf: Transformers = await import('@huggingface/transformers');
  fs.mkdirSync(config.embeddings.modelCacheDir, { recursive: true });
  tf.env.cacheDir = config.embeddings.modelCacheDir;
  tf.env.allowRemoteModels = !config.embeddings.offline;

  const opts = { dtype: 'q8' as const };
  const [processor, vision, tokenizer, text] = await Promise.all([
    tf.AutoProcessor.from_pretrained(MODEL_ID),
    tf.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, opts),
    tf.AutoTokenizer.from_pretrained(MODEL_ID),
    tf.CLIPTextModelWithProjection.from_pretrained(MODEL_ID, opts),
  ]);
  return { tf, processor, vision, tokenizer, text };
}

function getModel(): Promise<LoadedModel> {
  if (!config.embeddings.enabled) {
    return Promise.reject(new EmbeddingUnavailableError('Photo AI is disabled (EMBEDDINGS_ENABLED=false).'));
  }
  if (loading) return loading;
  if (failedAt && Date.now() - failedAt < RETRY_AFTER_MS) {
    return Promise.reject(new EmbeddingUnavailableError(`Photo AI model could not be loaded: ${lastError}`));
  }
  loading = loadModel().catch((err: unknown) => {
    loading = null;
    failedAt = Date.now();
    lastError = err instanceof Error ? err.message : String(err);
    console.error('[embedding] model load failed:', lastError);
    throw new EmbeddingUnavailableError(`Photo AI model could not be loaded: ${lastError}`);
  });
  return loading;
}

/** Loads the model ahead of the first request (optional, e.g. at server start or in scripts). */
async function warmUp(): Promise<boolean> {
  try {
    await getModel();
    return true;
  } catch {
    return false;
  }
}

function isEnabled(): boolean {
  return config.embeddings.enabled;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toBuffer(base64Image: string): Buffer {
  const raw = base64Image.replace(/^data:image\/[^;]+;base64,/, '');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length === 0) throw new InvalidImageError('The image is empty.');
  return buf;
}

/** Stable id of a photo's content — lets us skip re-embedding photos that did not change. */
function imageHash(base64Image: string): string {
  return createHash('sha256').update(base64Image.replace(/^data:image\/[^;]+;base64,/, '')).digest('hex');
}

function l2Normalize(v: ArrayLike<number>): number[] {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

/** Cosine similarity in [-1, 1]. Vectors from embedImage are already unit length. */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** pgvector text form: '[0.1,0.2,...]'. */
function toVectorLiteral(v: number[]): string {
  return '[' + v.join(',') + ']';
}

// ─── Embedding ───────────────────────────────────────────────────────────────

async function embedImage(base64Image: string): Promise<number[]> {
  const buf = toBuffer(base64Image);

  let decoded: { data: Buffer; info: OutputInfo };
  try {
    decoded = await sharp(buf)
      .rotate()
      .removeAlpha()
      .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new InvalidImageError();
  }

  const { tf, processor, vision } = await getModel();
  const image = new tf.RawImage(new Uint8ClampedArray(decoded.data), decoded.info.width, decoded.info.height, 3);
  const inputs = await processor(image);
  const { image_embeds } = await vision(inputs);
  const vec = l2Normalize(image_embeds.data as Float32Array);
  if (vec.length !== EMBEDDING_DIM) {
    throw new EmbeddingUnavailableError(`Unexpected embedding size ${vec.length}.`);
  }
  return vec;
}

// ─── Photo quality (real pixel checks) ───────────────────────────────────────

export interface PhotoQualityResult {
  /** Overall quality score 0-1. */
  score: number;
  /** Human-readable issues found. */
  issues: string[];
}

/** Variance of the Laplacian of a greyscale image — low means blurry. */
function laplacianVariance(grey: Buffer, w: number, h: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = grey[i - w] + grey[i + w] + grey[i - 1] + grey[i + 1] - 4 * grey[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

async function checkPhotoQuality(base64Image: string): Promise<PhotoQualityResult> {
  const buf = toBuffer(base64Image);
  let meta: Metadata;
  let grey: { data: Buffer; info: OutputInfo };
  try {
    meta = await sharp(buf).metadata();
    grey = await sharp(buf)
      .rotate()
      .greyscale()
      .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new InvalidImageError();
  }

  const { data, info } = grey;
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const mean = sum / data.length;
  let varSum = 0;
  for (let i = 0; i < data.length; i++) varSum += (data[i] - mean) ** 2;
  const stdDev = Math.sqrt(varSum / data.length);
  const sharpness = laplacianVariance(data, info.width, info.height);

  const issues: string[] = [];
  const minSide = Math.min(meta.width ?? 0, meta.height ?? 0);
  if (minSide < 400) issues.push('Low resolution — use a photo at least 400 px on the short side');
  if (mean < 40) issues.push('Image is too dark');
  else if (mean > 225) issues.push('Image is overexposed');
  if (stdDev < 15) issues.push('Low contrast — the product may not be clearly visible');
  if (sharpness < 30) issues.push('Image looks blurry — hold the camera steady and refocus');

  const resolutionScore = Math.min(1, minSide / 800);
  const brightnessScore = mean < 40 ? mean / 40 : mean > 225 ? Math.max(0, (255 - mean) / 30) : 1;
  const contrastScore = Math.min(1, stdDev / 40);
  const sharpnessScore = Math.min(1, sharpness / 150);
  const score = (resolutionScore + brightnessScore + contrastScore + sharpnessScore) / 4;

  return { score: Math.max(0, Math.min(1, score)), issues };
}

// ─── Zero-shot attribute suggestions ─────────────────────────────────────────

export interface AttributeSuggestions {
  /** Most likely colour names (1-2). */
  colours: string[];
  /** One of the product-form pattern options: Solid, Striped, Checked, Printed, Embroidered, Floral, Abstract. */
  pattern: string;
  /** Model confidence for the pattern, 0-1. */
  patternConfidence: number;
}

const COLOURS = [
  'black', 'white', 'grey', 'red', 'maroon', 'pink', 'orange', 'yellow', 'green', 'olive',
  'blue', 'navy blue', 'sky blue', 'purple', 'brown', 'beige', 'cream', 'gold', 'silver',
];

const PATTERNS: Array<{ value: string; prompt: string }> = [
  { value: 'Solid', prompt: 'a plain solid coloured garment with no pattern' },
  { value: 'Striped', prompt: 'a striped garment' },
  { value: 'Checked', prompt: 'a checked plaid garment' },
  { value: 'Printed', prompt: 'a garment with a printed design' },
  { value: 'Embroidered', prompt: 'an embroidered garment' },
  { value: 'Floral', prompt: 'a garment with a floral print' },
  { value: 'Abstract', prompt: 'a garment with an abstract pattern' },
];

const LOGIT_SCALE = 100; // CLIP's learned temperature

let textEmbeddingCache: { colours: number[][]; patterns: number[][] } | null = null;

async function embedTexts(prompts: string[]): Promise<number[][]> {
  const { tokenizer, text } = await getModel();
  const inputs = tokenizer(prompts, { padding: true, truncation: true });
  const { text_embeds } = await text(inputs);
  const data = text_embeds.data as Float32Array;
  const dim = data.length / prompts.length;
  const rows: number[][] = [];
  for (let i = 0; i < prompts.length; i++) rows.push(l2Normalize(data.subarray(i * dim, (i + 1) * dim)));
  return rows;
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Suggest colour and pattern from an image embedding (needs the model loaded for the text side). */
async function suggestAttributes(imageEmbedding: number[]): Promise<AttributeSuggestions> {
  if (!textEmbeddingCache) {
    const [colours, patterns] = await Promise.all([
      embedTexts(COLOURS.map((c) => `a photo of a ${c} coloured garment`)),
      embedTexts(PATTERNS.map((p) => p.prompt)),
    ]);
    textEmbeddingCache = { colours, patterns };
  }

  const colourProbs = softmax(textEmbeddingCache.colours.map((t) => LOGIT_SCALE * cosineSimilarity(imageEmbedding, t)));
  const ranked = colourProbs
    .map((p, i) => ({ name: COLOURS[i], p }))
    .sort((a, b) => b.p - a.p);
  const colours = [ranked[0].name];
  if (ranked[1] && ranked[1].p >= 0.25) colours.push(ranked[1].name);

  const patternProbs = softmax(textEmbeddingCache.patterns.map((t) => LOGIT_SCALE * cosineSimilarity(imageEmbedding, t)));
  let best = 0;
  for (let i = 1; i < patternProbs.length; i++) if (patternProbs[i] > patternProbs[best]) best = i;

  return {
    colours,
    pattern: PATTERNS[best].value,
    patternConfidence: Math.round(patternProbs[best] * 1000) / 1000,
  };
}

export const EmbeddingService = {
  MODEL_ID,
  MODEL_VERSION,
  EMBEDDING_DIM,
  DUPLICATE_THRESHOLD,
  SIMILAR_THRESHOLD,
  isEnabled,
  warmUp,
  embedImage,
  checkPhotoQuality,
  suggestAttributes,
  imageHash,
  cosineSimilarity,
  toVectorLiteral,
};
