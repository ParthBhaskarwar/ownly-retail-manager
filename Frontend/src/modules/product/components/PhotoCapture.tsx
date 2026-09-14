'use client';

/**
 * PhotoCapture — Week 6 optional product photo widget.
 *
 * Features:
 *   • File picker + optional live camera capture (getUserMedia)
 *   • Client-side DCT fingerprint computed via <canvas> before upload
 *   • Quality score badge (Good / Fair / Poor) with issue list
 *   • Colour / pattern attribute suggestions
 *   • "Possible duplicate" warning banner when similarity ≥ 0.92
 *   • Calls POST /api/products/:id/fingerprint once a product is saved
 *
 * Design principle: the entire component is gated on `enabled` prop.
 * When enabled=false (or when the browser doesn't support File API),
 * nothing is rendered — manual product entry is completely unaffected.
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  computeFingerprintFromFile,
  checkPhotoQuality,
  fileToBase64,
  DUPLICATE_THRESHOLD,
  type PhotoQualityResult,
} from '@/lib/visualFingerprint';
import { apiClient } from '@/lib/apiClient';
import type { PhotoFingerprintResult, SimilarProduct } from '@/modules/product/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PhotoCaptureProps {
  /** The product id to attach the fingerprint to. Undefined while creating. */
  productId?: string;
  /** Whether photo AI is available. Default true. Set false to hide entirely. */
  enabled?: boolean;
  /** Called after a successful fingerprint upload. */
  onFingerprintSaved?: (result: PhotoFingerprintResult) => void;
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
  onFingerprintSaved,
}: PhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [quality, setQuality] = useState<PhotoQualityResult | null>(null);
  const [suggestions, setSuggestions] = useState<PhotoFingerprintResult['attributeSuggestions'] | null>(null);
  const [similar, setSimilar] = useState<SimilarProduct[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  // Guard: render nothing if disabled or file API unavailable
  if (!enabled || typeof File === 'undefined') return null;

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setUploadState('computing');
    setSimilar([]);
    setSuggestions(null);
    setQuality(null);

    try {
      // Show preview immediately
      const base64 = await fileToBase64(file);
      setPreview(base64);

      // Compute quality + fingerprint client-side
      const [qualityResult] = await Promise.all([
        checkPhotoQuality(file),
        computeFingerprintFromFile(file),
      ]);
      if (qualityResult) setQuality(qualityResult);

      if (!productId) {
        // No product yet (still on create form) — store the base64 for later
        setUploadState('done');
        return;
      }

      // Upload to backend
      setUploadState('uploading');
      const result = await apiClient.post<PhotoFingerprintResult>(
        `/api/products/${productId}/fingerprint`,
        { image: base64 }
      );
      setSuggestions(result.attributeSuggestions);
      setQuality({ score: result.qualityScore, issues: result.qualityIssues });

      // Fetch similar products
      const similarRes = await apiClient.get<{
        enabled: boolean;
        similar: SimilarProduct[];
      }>(`/api/products/${productId}/similar`);
      if (similarRes.enabled) setSimilar(similarRes.similar);

      setUploadState('done');
      onFingerprintSaved?.(result);
    } catch (err) {
      setUploadState('error');
      setError((err as Error).message ?? 'Photo upload failed');
    }
  }, [productId, onFingerprintSaved]);

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
          {uploadState === 'computing' ? 'Analysing image offline…' : 'Saving fingerprint…'}
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
            {uploadState === 'done' && !hasDuplicates && (
              <span style={{ fontSize: 12, color: '#16a34a' }}>✓ Fingerprint saved</span>
            )}
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
