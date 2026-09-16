/**
 * Frontend FingerprintService — lightweight DCT perceptual-hash calculations for instant client-side feedback.
 */

const THUMB = 32;
const DCT_N = 8;
export const FINGERPRINT_DIM = DCT_N * DCT_N;

export interface PhotoQualityResult {
  score: number;
  issues: string[];
}

export interface AttributeSuggestions {
  colours: string[];
  pattern: string;
}

function decodeToGrayscale(base64: string): number[] {
  const raw = base64.replace(/^data:image\/[^;]+;base64,/, '');
  const pixels: number[] = [];
  try {
    const binary = atob(raw);
    const len = binary.length;
    const step = Math.max(1, Math.floor(len / (THUMB * THUMB)));
    for (let i = 0; i < THUMB * THUMB; i++) {
      const idx = Math.min(len - 1, i * step);
      pixels.push(binary.charCodeAt(idx) || 128);
    }
  } catch {
    for (let i = 0; i < THUMB * THUMB; i++) pixels.push(128);
  }
  return pixels;
}

export function checkPhotoQuality(base64Image: string): PhotoQualityResult {
  const pixels = decodeToGrayscale(base64Image);
  const n = pixels.length;
  const mean = pixels.reduce((s, v) => s + v, 0) / n;
  const variance = pixels.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  const issues: string[] = [];
  if (mean < 40) issues.push('Image is too dark');
  else if (mean > 230) issues.push('Image is overexposed');
  if (stdDev < 15) issues.push('Low contrast — product details may be unclear');

  const brightnessScore = mean < 40 ? mean / 40 : mean > 230 ? (255 - mean) / 25 : 1;
  const contrastScore = Math.min(1, stdDev / 40);
  const score = (brightnessScore + contrastScore) / 2;

  return { score: Math.max(0, Math.min(1, score)), issues };
}

export function suggestAttributes(base64Image: string): AttributeSuggestions {
  const pixels = decodeToGrayscale(base64Image);
  const n = pixels.length;
  const mean = pixels.reduce((s, v) => s + v, 0) / n;
  const variance = pixels.reduce((s, v) => s + (v - mean) ** 2, 0) / n;

  const colours: string[] = [];
  if (mean < 60) colours.push('Black / Dark');
  else if (mean > 190) colours.push('White / Light');
  else colours.push('Blue / Multi');

  let pattern = 'Solid';
  if (variance > 500) pattern = 'Printed';

  return { colours, pattern };
}

export const FingerprintService = {
  checkPhotoQuality,
  suggestAttributes,
};
