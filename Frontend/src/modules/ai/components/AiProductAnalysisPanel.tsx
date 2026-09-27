'use client';

/**
 * AiProductAnalysisPanel — AI product analysis on the product detail page
 * (§2.14): scores, forecast, lifecycle, recommended action and reasons.
 * Fails quietly so the product page never breaks because of the AI.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AiService } from '../services/AiService';
import { AiAnalysisView } from './AiAnalysisView';
import type { AiAnalysis } from '../types';

export function AiProductAnalysisPanel({ productId, canRestock }: { productId: string; canRestock: boolean }) {
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AiService.analyseProduct(productId);
      setAnalysis(res.analysis);
    } catch (err) {
      setError((err as Error).message || 'AI analysis is unavailable.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="skeleton" style={{ height: 220, borderRadius: 8 }} />;
  if (error || !analysis) {
    return <p className="ai-meta">AI analysis is unavailable right now{error ? `: ${error}` : '.'}</p>;
  }

  return (
    <div className="ai-section">
      <AiAnalysisView analysis={analysis} showMetrics />
      {canRestock && (
        <div className="ai-actions">
          <Link href={`/ai-restock?productId=${productId}`} className="btn btn--primary btn--sm">
            Plan a restock with AI →
          </Link>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load()}>↻ Re-analyse</button>
        </div>
      )}
    </div>
  );
}
