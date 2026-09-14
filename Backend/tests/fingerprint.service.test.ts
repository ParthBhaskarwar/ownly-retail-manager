// Fingerprint service unit tests
import { FingerprintService } from '@/services/fingerprint.service';

describe('FingerprintService', () => {
  test('computeFingerprint returns 64-length array', () => {
    const base64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6e6W1QAAAAASUVORK5CYII=';
    const fp = FingerprintService.computeFingerprint(base64);
    expect(fp.length).toBe(64);
  });

  test('cosineSimilarity of identical vectors is 1', () => {
    const v = Array(64).fill(0.5);
    const sim = FingerprintService.cosineSimilarity(v, v);
    expect(sim).toBeCloseTo(1);
  });

  test('quality check returns score between 0 and 1', () => {
    const base64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6e6W1QAAAAASUVORK5CYII=';
    const { score } = FingerprintService.checkPhotoQuality(base64);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
