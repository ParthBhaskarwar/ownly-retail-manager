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
    <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
      <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 className="card__title" style={{ margin: 0 }}>✦ AI Restock &amp; Dead-Stock Signals</h2>
        <div className="ai-actions">
          <Link href="/ai-restock" className="btn btn--primary btn--sm">AI Restock</Link>
          <Link href="/ai-insights" className="btn btn--ghost btn--sm">Accuracy →</Link>
        </div>
      </div>

      {!data ? (
        <div className="skeleton" style={{ height: 160, borderRadius: 8, marginTop: 12 }} />
      ) : !data.hasHistory ? (
        <p className="ai-meta">The AI learns from your own sales. Recommendations appear once products have started selling.</p>
      ) : (
        <div className="ai-section" style={{ marginTop: 'var(--space-3)' }}>
          <div className="ai-tiles">
            <div className="ai-tile"><div className="ai-tile__label">Expected sales · 30 days</div><div className="ai-tile__value">{data.expectedUnits30.toLocaleString('en-IN')} units</div><div className="ai-tile__sub">{inr(data.expectedRevenue30)} at list price</div></div>
            <div className="ai-tile"><div className="ai-tile__label">Buy now</div><div className="ai-tile__value">{data.decisions.STRONG_BUY + data.decisions.CONTROLLED_BUY}</div><div className="ai-tile__sub">{data.decisions.STRONG_BUY} strong · {data.decisions.CONTROLLED_BUY} controlled</div></div>
            <div className="ai-tile"><div className="ai-tile__label">Discount / clear</div><div className="ai-tile__value">{(data.actions.DISCOUNT ?? 0) + (data.actions.CLEARANCE ?? 0)}</div><div className="ai-tile__sub">products</div></div>
            <div className="ai-tile"><div className="ai-tile__label">Stock at risk</div><div className="ai-tile__value">{inr(data.stockValueAtRisk)}</div><div className="ai-tile__sub">cost likely unsold in 90 days</div></div>
          </div>

          <div className="ai-columns">
            <div>
              <h3 className="ai-subhead">Restock first</h3>
              <table className="ai-table">
                <thead><tr><th>Product</th><th>Decision</th><th className="num">Stock</th><th className="num">Buy</th></tr></thead>
                <tbody>
                  {data.restockCandidates.slice(0, 6).map((r) => (
                    <tr key={r.productId}>
                      <td><Link href={`/ai-restock?productId=${r.productId}`}>{r.name}</Link><div className="ai-meta">{r.unitsPerWeek}/week</div></td>
                      <td><DecisionBadge decision={r.decision} /></td>
                      <td className="num">{r.stockOnHand}</td>
                      <td className="num"><strong>{r.quantity}</strong></td>
                    </tr>
                  ))}
                  {data.restockCandidates.length === 0 && <tr><td colSpan={4} className="ai-meta">Nothing needs restocking right now.</td></tr>}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="ai-subhead">Turning into dead stock</h3>
              <table className="ai-table">
                <thead><tr><th>Product</th><th>Action</th><th className="num">Units</th><th className="num">Cost value</th></tr></thead>
                <tbody>
                  {data.deadStock.slice(0, 6).map((d) => (
                    <tr key={d.productId}>
                      <td><Link href={`/products/${d.productId}`}>{d.name}</Link><div className="ai-meta">{d.avgStockAgeDays !== null ? `${d.avgStockAgeDays} days old` : ''}</div></td>
                      <td><span className={`ai-badge ai-badge--${ACTION_META[d.action as keyof typeof ACTION_META]?.tone ?? 'neutral'}`}>{ACTION_META[d.action as keyof typeof ACTION_META]?.label ?? d.action}</span></td>
                      <td className="num">{d.stockOnHand}</td>
                      <td className="num">{inr(d.stockValue)}</td>
                    </tr>
                  ))}
                  {data.deadStock.length === 0 && <tr><td colSpan={4} className="ai-meta">No dead-stock risk detected.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="ai-meta">{data.productsScored} products scored by {data.modelVersion} · offline, from your own sales history</div>
        </div>
      )}
    </div>
  );
}
