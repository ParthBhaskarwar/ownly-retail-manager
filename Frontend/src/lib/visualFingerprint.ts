/**
 * visualFingerprint — browser-side DCT perceptual-hash fingerprinting.
 *
 * Week 6 deliverable: "Offline visual fingerprint" computed in the browser
 * before the image is sent to the backend, enabling instant duplicate checks
 * in the UI without a network round-trip.
 *
 * Mirror of Backend/src/services/fingerprint.service.ts — same algorithm,
 * same constants, so client-computed and server-computed fingerprints for the
 * same image are interchangeable.
 *
 * Uses the HTML <canvas> API (available in all modern browsers). Falls back
 * gracefully when canvas is unavailable (e.g. SSR) — callers receive null.
 *
 * No npm dependencies — zero additions to the frontend bundle.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const THUMB = 32;
const DCT_N = 8;
export const FINGERPRINT_DIM = DCT_N * DCT_N; // 64

/** Near-duplicate threshold. */
export const DUPLICATE_THRESHOLD = 0.92;
/** Minimum similarity to show in "similar products" results. */
export const SIMILAR_THRESHOLD = 0.50;

// ─── DCT ─────────────────────────────────────────────────────────────────────

function dct1d(signal: number[]): number[] {
  const N = signal.length;
  const result: number[] = [];
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += signal[n] * Math.cos((Math.PI / N) * (n + 0.5) * k);
    }
    const scale = k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
    result.push(sum * scale);
  }
  return result;
}

function dct2d(block: number[][]): number[][] {
  const N = block.length;
  const rowDct = block.map((row) => dct1d(row));
  const out: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  for (let col = 0; col < N; col++) {
    const column = rowDct.map((row) => row[col]);
    const dctCol = dct1d(column);
    for (let row = 0; row < N; row++) {
      out[row][col] = dctCol[row];
    }
  }
  return out;
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

/**
 * Draw an image File into an offscreen canvas at THUMB×THUMB and extract
 * the grayscale luminance values.
 */
async function fileToGrayscale(file: File): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = THUMB;
      canvas.height = THUMB;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 2D context not available')); return; }
      ctx.drawImage(img, 0, 0, THUMB, THUMB);
      const { data } = ctx.getImageData(0, 0, THUMB, THUMB);
      const gray: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        // Rec. 601 luminance
        gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      URL.revokeObjectURL(url);
      resolve(gray);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

/**
 * Draw a base64 data-URI image and extract grayscale luminance values.
 */
async function base64ToGrayscale(base64: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = THUMB;
      canvas.height = THUMB;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 2D context not available')); return; }
      ctx.drawImage(img, 0, 0, THUMB, THUMB);
      const { data } = ctx.getImageData(0, 0, THUMB, THUMB);
      const gray: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      resolve(gray);
    };
    img.onerror = () => reject(new Error('Failed to load base64 image'));
    img.src = base64;
  });
}

// ─── Fingerprint computation ──────────────────────────────────────────────────

function grayscaleToFingerprint(gray: number[]): number[] {
  const step = THUMB / DCT_N; // 4
  const block: number[][] = [];
  for (let r = 0; r < DCT_N; r++) {
    const row: number[] = [];
    for (let c = 0; c < DCT_N; c++) {
      let sum = 0;
      for (let dr = 0; dr < step; dr++) {
        for (let dc = 0; dc < step; dc++) {
          sum += gray[(r * step + dr) * THUMB + (c * step + dc)] ?? 0;
        }
      }
      row.push(sum / (step * step));
    }
    block.push(row);
  }

  const dct = dct2d(block);
  const flat: number[] = [];
  for (let r = 0; r < DCT_N; r++) {
    for (let c = 0; c < DCT_N; c++) {
      flat.push(dct[r][c]);
    }
  }

  const norm = Math.sqrt(flat.reduce((s, v) => s + v * v, 0)) || 1;
  return flat.map((v) => v / norm);
}

/**
 * Compute a 64-float DCT perceptual fingerprint from a File object.
 * Returns null if canvas is not available (e.g. during SSR).
 */
export async function computeFingerprintFromFile(file: File): Promise<number[] | null> {
  if (typeof document === 'undefined') return null;
  const gray = await fileToGrayscale(file);
  return grayscaleToFingerprint(gray);
}

/**
 * Compute a 64-float DCT perceptual fingerprint from a base64 data-URI string.
 * Returns null if canvas is not available.
 */
export async function computeFingerprintFromBase64(base64: string): Promise<number[] | null> {
  if (typeof document === 'undefined') return null;
  const gray = await base64ToGrayscale(base64);
  return grayscaleToFingerprint(gray);
}

// ─── Similarity ───────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two fingerprint vectors. Returns 0–1.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : Math.max(0, Math.min(1, dot / denom));
}

// ─── Quality check (browser version) ─────────────────────────────────────────

export interface PhotoQualityResult {
  score: number;
  issues: string[];
}

/**
 * Run a quality check on a File using canvas pixel data.
 * Returns null when canvas is unavailable.
 */
export async function checkPhotoQuality(file: File): Promise<PhotoQualityResult | null> {
  if (typeof document === 'undefined') return null;
  const pixels = await fileToGrayscale(file);
  const n = pixels.length;
  const mean = pixels.reduce((s, v) => s + v, 0) / n;
  const variance = pixels.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  let adjDiff = 0;
  for (let i = 1; i < n; i++) adjDiff += Math.abs(pixels[i] - pixels[i - 1]);
  const sharpness = adjDiff / n;

  const issues: string[] = [];
  if (mean < 40) issues.push('Image is too dark');
  else if (mean > 230) issues.push('Image is overexposed');
  if (stdDev < 15) issues.push('Low contrast — product may not be visible');
  if (sharpness < 3) issues.push('Image may be blurry or featureless');

  const brightnessScore = mean < 40 ? mean / 40 : mean > 230 ? (255 - mean) / 25 : 1;
  const contrastScore = Math.min(1, stdDev / 40);
  const sharpnessScore = Math.min(1, sharpness / 10);
  const score = (brightnessScore + contrastScore + sharpnessScore) / 3;

  return { score: Math.max(0, Math.min(1, score)), issues };
}

// ─── File → base64 helper ─────────────────────────────────────────────────────

/**
 * Read a File as a base64 data-URI string (for sending to the backend).
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
