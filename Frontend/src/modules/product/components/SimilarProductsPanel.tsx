'use client';

/**
 * SimilarProductsPanel — Week 6 similar-product search results panel.
 *
 * Fetches GET /api/products/:id/similar and renders up to 5 product cards
 * ordered by cosine similarity. Products flagged as possible duplicates
 * (above the duplicate threshold) are highlighted with a red border.
 *
 * When the product has no photo embeddings (photo AI skipped or off), the panel
 * renders nothing — no empty state noise.
 */

import React, { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import type { SimilarProduct } from '@/modules/product/types';

interface Props {
  productId: string;
}

interface SimilarResponse {
  enabled: boolean;
  similar: SimilarProduct[];
  duplicateThreshold: number;
}

export default function SimilarProductsPanel({ productId }: Props) {
  const [data, setData] = useState<SimilarResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<SimilarResponse>(`/api/products/${productId}/similar`)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  if (loading) return (
    <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading similar products…</div>
  );
  if (!data || !data.enabled || data.similar.length === 0) return null;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#374151' }}>
        Visually Similar Products
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.similar.map((s) => (
          <div
            key={s.productId}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderRadius: 8,
              border: s.isPossibleDuplicate
                ? '1.5px solid #fca5a5'
                : '1px solid #e5e7eb',
              background: s.isPossibleDuplicate ? '#fef9f9' : '#fafafa',
            }}
          >
            {/* Thumbnail placeholder */}
            {s.imageUrls[0] ? (
              <img
                src={s.imageUrls[0]}
                alt={s.name}
                style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }}
              />
            ) : (
              <div style={{
                width: 44, height: 44, borderRadius: 6, background: '#e5e7eb',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>🖼</div>
            )}

            {/* Info */}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{s.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{s.baseSku}</div>
              {s.isPossibleDuplicate && (
                <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 500 }}>
                  ⚠ Possible duplicate
                </div>
              )}
            </div>

            {/* Similarity pill */}
            <div style={{
              padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
              background: s.isPossibleDuplicate ? '#fee2e2' : '#f0fdf4',
              color: s.isPossibleDuplicate ? '#b91c1c' : '#15803d',
            }}>
              {Math.round(s.similarity * 100)}% match
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>
        Similarity computed offline from CLIP image embeddings (cosine similarity).
        Threshold for duplicate warning: {Math.round(data.duplicateThreshold * 100)}%.
      </p>
    </section>
  );
}
