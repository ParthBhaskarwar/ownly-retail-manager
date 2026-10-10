'use client';

/**
 * AiOverviewCard — dashboard summary of the AI (§2.16): what to restock,
 * what is turning into dead stock, and expected sales for the next 30 days.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AiService } from '../services/AiService';
import { DecisionBadge } from './AiAnalysisView';
import { ACTION_META, inr } from '../labels';
import type { AiOverview } from '../types';

export function AiOverviewCard() {
  const [data, setData] = useState<AiOverview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    AiService.getOverview().then(setData).catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  return (
    <div className="dash-card" style={{ position: 'relative' }}>
      <div className="dash-card-header" style={{ paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--color-border)' }}>
        <h2 className="dash-card-title">
          <span className="material-symbols-outlined" style={{ color: 'var(--color-denim)' }}>psychology</span> 
          AI Demand Signals
        </h2>
        <span className="dash-card-badge ai">
          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>auto_awesome</span>
          Gemini Retail AI
        </span>
      </div>

      {!data ? (
        <div className="dash-card-body">
          <div className="skeleton" style={{ height: 60, borderRadius: 8, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 60, borderRadius: 8 }} />
        </div>
      ) : !data.hasHistory ? (
        <div className="dash-card-body">
          <p style={{ fontSize: '12px', color: 'var(--color-ink-secondary)' }}>The AI learns from your own sales. Recommendations appear once products have started selling.</p>
        </div>
      ) : (
        <div className="dash-card-body" style={{ paddingTop: 0 }}>
          {data.restockCandidates.slice(0, 2).map((r) => (
            <div key={r.productId} className="dash-ai-alert">
              <span className="material-symbols-outlined" style={{ color: 'var(--color-denim)' }}>trending_up</span>
              <div className="dash-ai-alert-content">
                <span className="dash-ai-alert-title">{r.decision === 'STRONG_BUY' ? 'Strong Buy Signal' : 'Steady Demand'}</span>
                {r.name} demand is projected at {r.unitsPerWeek} units/week. Restock {r.quantity} units to maintain coverage.
              </div>
            </div>
          ))}
          {data.deadStock.slice(0, 1).map((d) => (
            <div key={d.productId} className="dash-ai-alert">
              <span className="material-symbols-outlined" style={{ color: 'var(--color-caution)' }}>swap_horiz</span>
              <div className="dash-ai-alert-content">
                <span className="dash-ai-alert-title">Dead Stock Risk</span>
                {d.name} has been in inventory for {d.avgStockAgeDays} days. Consider {ACTION_META[d.action as keyof typeof ACTION_META]?.label?.toLowerCase() ?? 'clearing'}.
              </div>
            </div>
          ))}
          {data.restockCandidates.length === 0 && data.deadStock.length === 0 && (
            <div className="dash-ai-alert">
              <span className="material-symbols-outlined" style={{ color: 'var(--color-ink-secondary)' }}>check_circle</span>
              <div className="dash-ai-alert-content">
                <span className="dash-ai-alert-title">Optimal Inventory</span>
                No critical demand shifts or dead stock risks detected today.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
