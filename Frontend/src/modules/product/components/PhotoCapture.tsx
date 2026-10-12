'use client';

/**
 * PhotoCapture — Week 6 optional product photo widget.
 *
 * Features:
 *   • File picker + optional live camera capture (getUserMedia)
 *   • Sends the photo to POST /api/products/analyze-photo (offline CLIP model)
 *   • Quality score badge (Good / Fair / Poor) with issue list
 *   • Colour / pattern attribute suggestions
 *   • "Possible duplicate" warning banner for near-identical existing products
 *   • Optional "Add to product photos" so the photo is saved (and embedded) with the product
 *
 * Design principle: the entire component is gated on `enabled` prop.
 * When enabled=false (or when the browser doesn't support File API),
 * nothing is rendered — manual product entry is completely unaffected.
 */

import React, { useRef, useState, useCallback } from 'react';
import { ProductService } from '@/modules/product/services/ProductService';
import type { AttributeSuggestions, PhotoQualityResult, SimilarProduct } from '@/modules/product/types';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PhotoCaptureProps {
  /** The saved product being looked at (so it never matches itself). Undefined while creating. */
  productId?: string;
  /** Whether photo AI is available. Default true. Set false to hide entirely. */
  enabled?: boolean;
  /** When given, shows "Add to product photos"; should save the photo on the product. */
  onAddPhoto?: (base64: string) => Promise<void>;
}

type UploadState = 'idle' | 'computing' | 'uploading' | 'done' | 'error';

// ─── Quality badge ────────────────────────────────────────────────────────────

function QualityBadge({ score }: { score: number }) {
  const label = score >= 0.7 ? 'Good' : score >= 0.4 ? 'Fair' : 'Poor';
  const colour =
    score >= 0.7 ? '#16a34a' :  // green-600
    score >= 0.4 ? '#d97706' :  // amber-600
    '#dc2626';                   // red-600
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 12,
      fontSize: 12, fontWeight: 600,
      background: colour + '22', color: colour, border: `1px solid ${colour}44`,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: colour, display: 'inline-block',
      }} />
      Photo quality: {label} ({Math.round(score * 100)}%)
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PhotoCapture({
  productId,
  enabled = true,
  onAddPhoto,
}: PhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [quality, setQuality] = useState<PhotoQualityResult | null>(null);
  const [suggestions, setSuggestions] = useState<AttributeSuggestions | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [similar, setSimilar] = useState<SimilarProduct[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setUploadState('computing');
    setSimilar([]);
    setSuggestions(null);
    setQuality(null);
    setAiNote(null);
    setAdded(false);

    try {
      const base64 = await fileToBase64(file);
      setPreview(base64);

      const result = await ProductService.analyzePhoto(base64, productId);
      setQuality({ score: result.qualityScore, issues: result.qualityIssues });
      setSuggestions(result.attributeSuggestions);
      setSimilar(result.similar);
      setAiNote(result.aiAvailable ? null : result.message ?? null);
      setUploadState('done');
    } catch (err) {
      setUploadState('error');
      setError((err as Error).message ?? 'Photo analysis failed');
    }
  }, [productId]);

  const addToProduct = async () => {
    if (!preview || !onAddPhoto) return;
    setUploadState('uploading');
    try {
      await onAddPhoto(preview);
      setAdded(true);
      setUploadState('done');
    } catch (err) {
      setUploadState('error');
      setError((err as Error).message ?? 'Could not add the photo');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch {
      setError('Camera not available — use the file picker instead.');
    }
  };

  const captureFromCamera = () => {
    if (!videoRef.current || !cameraActive) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
      stopCamera();
      void processFile(file);
    }, 'image/jpeg', 0.92);
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const hasDuplicates = similar.some((s) => s.isPossibleDuplicate);

  // Guard (after all hooks, so hook order never changes between renders)
  if (!enabled || typeof File === 'undefined') return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}>
          📸 Product Photo <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 12 }}>(optional)</span>
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadState === 'computing' || uploadState === 'uploading'}
            style={btnStyle('#2563eb')}
          >
            Upload photo
          </button>
          {typeof navigator !== 'undefined' && 'mediaDevices' in navigator && (
            <button
              type="button"
              onClick={cameraActive ? captureFromCamera : startCamera}
              disabled={uploadState === 'computing' || uploadState === 'uploading'}
              style={btnStyle(cameraActive ? '#16a34a' : '#4b5563')}
            >
              {cameraActive ? '📷 Capture' : '📷 Camera'}
            </button>
          )}
          {cameraActive && (
            <button type="button" onClick={stopCamera} style={btnStyle('#6b7280')}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* ── Camera viewfinder ── */}
      {cameraActive && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{ width: '100%', maxHeight: 260, borderRadius: 8, background: '#000', objectFit: 'cover' }}
        />
      )}

      {/* ── Processing indicator ── */}
      {(uploadState === 'computing' || uploadState === 'uploading') && (
        <div style={{ color: '#6b7280', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
          {uploadState === 'computing' ? 'Analysing photo offline…' : 'Saving photo…'}
        </div>
      )}

      {/* ── Duplicate warning ── */}
      {hasDuplicates && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <span style={{ fontWeight: 600, color: '#dc2626', fontSize: 13 }}>
            ⚠️ Possible duplicate detected
          </span>
          <span style={{ fontSize: 12, color: '#7f1d1d' }}>
            This image is very similar to {similar.filter((s) => s.isPossibleDuplicate).length}{' '}
            existing product(s). Check before saving to avoid duplicate records.
          </span>
          {similar.filter((s) => s.isPossibleDuplicate).map((s) => (
            <div key={s.productId} style={{ fontSize: 12, color: '#991b1b' }}>
              • <strong>{s.name}</strong> ({s.baseSku}) — {Math.round(s.similarity * 100)}% similarity
            </div>
          ))}
        </div>
      )}

      {/* ── Preview + quality ── */}
      {preview && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <img
            src={preview}
            alt="Product preview"
            style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            {quality && (
              <>
                <QualityBadge score={quality.score} />
                {quality.issues.map((issue) => (
                  <div key={issue} style={{ fontSize: 12, color: '#6b7280' }}>⚠ {issue}</div>
                ))}
              </>
            )}
            {suggestions && (
              <div style={{ fontSize: 12, color: '#374151' }}>
                <strong>Suggestions:</strong>{' '}
                {suggestions.colours.join(', ')} · {suggestions.pattern}
              </div>
            )}
            {aiNote && <div style={{ fontSize: 12, color: '#6b7280' }}>{aiNote}</div>}
            {onAddPhoto && !added && uploadState === 'done' && (
              <button type="button" onClick={addToProduct} style={btnStyle('#2563eb')}>
                Add to product photos
              </button>
            )}
            {added && <span style={{ fontSize: 12, color: '#16a34a' }}>✓ Photo added to this product</span>}
          </div>
        </div>
      )}

      {/* ── Similar products (non-duplicates) ── */}
      {similar.filter((s) => !s.isPossibleDuplicate).length > 0 && (
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          <strong>Visually similar products:</strong>{' '}
          {similar.filter((s) => !s.isPossibleDuplicate).map((s) =>
            `${s.name} (${Math.round(s.similarity * 100)}%)`
          ).join(', ')}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{ fontSize: 12, color: '#dc2626' }}>✗ {error}</div>
      )}
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: '5px 12px', borderRadius: 6, border: 'none',
    background: bg, color: '#fff', fontSize: 12, fontWeight: 500,
    cursor: 'pointer',
  };
}
