'use client';

/**
 * AiInsightsDashboard — AI evaluation and prediction history (Week 7).
 *
 * "Was the AI right?" — prediction vs actual, compared with a naive
 * carry-forward baseline, interval coverage, first-sale calibration, error
 * by confidence tier, outcome by decision, and what owners did with the
 * recommendations.
 *
 * Backtest = the model replayed at past dates using only data available then;
 * Live = predictions made in the app, evaluated once their 30 days have passed.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AiService } from '../services/AiService';
import { PredictionVsActualChart } from './PredictionVsActualChart';
import { DecisionBadge } from './AiAnalysisView';
import { DECISION_META, OWNER_ACTION_LABEL, pct } from '../labels';
import type { EvaluationSummary, Prediction, PredictionSource } from '../types';

const PAGE = 20;

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="card ai-kpi">
      <div className="ai-kpi__label">{label}</div>
      <div className={`ai-kpi__value ${tone ? `ai-kpi__value--${tone}` : ''}`}>{value}</div>
      {sub && <div className="ai-kpi__sub">{sub}</div>}
    </div>
  );
}

export function AiInsightsDashboard() {
  const [source, setSource] = useState<PredictionSource>('BACKTEST');
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [history, setHistory] = useState<{ items: Prediction[]; total: number }>({ items: [], total: 0 });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    AiService.getEvaluation(source)
      .then(setSummary)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [source]);

  useEffect(() => {
    AiService.listPredictions({
      source,
      analysisType: source === 'LIVE' ? undefined : 'PRODUCT_ANALYSIS',
      limit: PAGE,
      offset: page * PAGE,
    }).then(setHistory).catch(() => setHistory({ items: [], total: 0 }));
  }, [source, page]);

  const f = summary?.forecast;
  const lift = f?.liftOverBaseline ?? null;

  return (
    <div className="ai-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="ai-tabs" role="tablist" aria-label="Prediction source">
          {(['BACKTEST', 'LIVE'] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={source === s} onClick={() => { setSource(s); setPage(0); }}>
              {s === 'BACKTEST' ? 'Backtest (history replay)' : 'Live predictions'}
            </button>
          ))}
        </div>
        {summary?.modelVersions.length ? <span className="ai-meta">Model {summary.modelVersions.join(', ')}</span> : null}
      </div>

      <div className="ai-callout">
        {source === 'BACKTEST'
          ? 'The model was replayed at past dates using only the data available on each date, then compared with what really sold in the next 30 days. It is the track record you can check before trusting a recommendation.'
          : 'Every analysis shown in the app is stored. 30 days later it is compared with actual sales, and owner decisions are kept alongside so overrides can be judged too.'}
      </div>

      {error && <div className="ai-alert ai-alert--error">{error}</div>}

      {loading && !summary ? (
        <div className="skeleton" style={{ height: 300, borderRadius: 8 }} />
      ) : summary && summary.count === 0 ? (
        <div className="ai-empty">
          {source === 'LIVE'
            ? <>No live prediction has reached its 30-day horizon yet. {summary.ownerDecisions.PENDING + summary.ownerDecisions.ACCEPTED + summary.ownerDecisions.MODIFIED + summary.ownerDecisions.IGNORED + summary.ownerDecisions.REJECTED} restock recommendations are waiting for their outcome.</>
            : <>No backtest yet. Run <code>npm run ai:backtest</code> in the Backend folder.</>}
        </div>
      ) : summary && f ? (
        <div className="ai-section" style={{ opacity: loading ? 0.5 : 1 }}>
          <div className="ai-kpis">
            <Kpi label="Predictions evaluated" value={summary.count.toLocaleString('en-IN')} sub={`${f.totalActual.toLocaleString('en-IN')} units actually sold · ${f.totalPredicted.toLocaleString('en-IN')} predicted`} />
            <Kpi label="Forecast error (WAPE)" value={pct(f.wape, 1)} sub={`Carry-forward baseline: ${pct(f.baselineWape, 1)}`} />
            <Kpi
              label="Better than baseline by" value={lift === null ? '—' : pct(lift, 1)} tone={lift === null ? undefined : lift > 0 ? 'good' : 'bad'}
              sub={lift !== null && lift <= 0 ? 'The AI is not beating a simple rule yet' : 'Less error than “next month = last month”'}
            />
            <Kpi label="Range hit rate" value={pct(f.intervalCoverage, 1)} sub="Actual fell inside the predicted range (target ≈ 80%)" />
            <Kpi label="Bias" value={f.bias === null ? '—' : `${f.bias > 0 ? '+' : ''}${pct(f.bias, 1)}`} sub={f.bias !== null && f.bias < 0 ? 'Predicts slightly fewer sales than happen' : 'Predicts slightly more sales than happen'} />
            <Kpi label="First-sale accuracy (Brier)" value={summary.firstSale.brier === null ? '—' : summary.firstSale.brier.toFixed(3)} sub="0 is perfect, 0.25 is a coin flip" />
          </div>

          <div className="card">
            <h2 className="card__title" style={{ marginTop: 0 }}>Predicted vs actual units (next 30 days)</h2>
            <PredictionVsActualChart series={summary.series} />
          </div>

          <div className="ai-columns">
            <div className="card">
              <h2 className="card__title" style={{ marginTop: 0 }}>Error by confidence</h2>
              <p className="ai-meta" style={{ marginTop: 0 }}>High-confidence predictions should be the most accurate.</p>
              <table className="ai-table">
                <thead><tr><th>Confidence</th><th className="num">Predictions</th><th className="num">WAPE</th><th className="num">Range hit</th></tr></thead>
                <tbody>
                  {summary.byTier.map((t) => (
                    <tr key={t.tier}><td>{t.tier.charAt(0) + t.tier.slice(1).toLowerCase()}</td><td className="num">{t.count.toLocaleString('en-IN')}</td><td className="num">{pct(t.wape, 1)}</td><td className="num">{pct(t.coverage, 1)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h2 className="card__title" style={{ marginTop: 0 }}>First-sale probability — calibration</h2>
              <p className="ai-meta" style={{ marginTop: 0 }}>Of products given a 70% chance to sell, about 70% should sell.</p>
              <table className="ai-table">
                <thead><tr><th>Predicted</th><th className="num">Products</th><th className="num">Avg predicted</th><th className="num">Actually sold</th></tr></thead>
                <tbody>
                  {summary.firstSale.buckets.map((b) => (
                    <tr key={b.range}><td>{b.range}</td><td className="num">{b.count.toLocaleString('en-IN')}</td><td className="num">{pct(b.predicted)}</td><td className="num">{pct(b.actual)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ai-columns">
            <div className="card">
              <h2 className="card__title" style={{ marginTop: 0 }}>Outcome by decision</h2>
              <p className="ai-meta" style={{ marginTop: 0 }}>Did Strong Buy products really sell through faster than Hold or Avoid?</p>
              <table className="ai-table">
                <thead><tr><th>Decision</th><th className="num">Count</th><th className="num">Predicted sell-through</th><th className="num">Actual</th><th className="num">Avg units</th></tr></thead>
                <tbody>
                  {summary.byDecision.filter((d) => d.count > 0).map((d) => (
                    <tr key={d.decision}>
                      <td><DecisionBadge decision={d.decision} /></td>
                      <td className="num">{d.count.toLocaleString('en-IN')}</td>
                      <td className="num">{pct(d.predictedSellThrough, 1)}</td>
                      <td className="num">{pct(d.actualSellThrough, 1)}</td>
                      <td className="num">{d.avgActualUnits.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h2 className="card__title" style={{ marginTop: 0 }}>Owner decisions on restock recommendations</h2>
              <table className="ai-table">
                <tbody>
                  {(['ACCEPTED', 'MODIFIED', 'IGNORED', 'REJECTED'] as const).map((k) => (
                    <tr key={k}><td>{OWNER_ACTION_LABEL[k]}</td><td className="num">{summary.ownerDecisions[k]}</td></tr>
                  ))}
                  <tr><td>Awaiting a decision</td><td className="num">{summary.ownerDecisions.PENDING}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="card__title" style={{ margin: 0 }}>Prediction history</h2>
          <span className="ai-meta">{history.total.toLocaleString('en-IN')} predictions</span>
        </div>
        <div className="ai-table-wrap">
          <table className="ai-table">
            <thead>
              <tr>
                <th>As of</th><th>Product</th><th>Type</th><th>Decision</th><th className="num">Rec. qty</th>
                <th className="num">Predicted</th><th className="num">Actual</th><th>Confidence</th><th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {history.items.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.asOf).toLocaleDateString('en-IN')}</td>
                  <td>{p.productId ? <Link href={`/products/${p.productId}`}>{p.productName ?? 'Product'}</Link> : <em>{String(p.inputs.name ?? 'New garment')}</em>}</td>
                  <td>{p.analysisType === 'RESTOCK' ? 'Restock' : 'Analysis'}</td>
                  <td><span className={`ai-badge ai-badge--${DECISION_META[p.decision].tone}`}>{DECISION_META[p.decision].label}</span></td>
                  <td className="num">{p.recommendedQuantity}</td>
                  <td className="num">{p.predictedUnits.toFixed(1)} <span className="ai-meta">({p.predictedUnitsQ10}–{p.predictedUnitsQ90})</span></td>
                  <td className="num">{p.actualUnits ?? <span className="ai-meta">pending</span>}</td>
                  <td>{p.confidenceTier.charAt(0) + p.confidenceTier.slice(1).toLowerCase()}</td>
                  <td>{p.ownerAction ? `${OWNER_ACTION_LABEL[p.ownerAction]}${p.ownerQuantity !== null ? ` (${p.ownerQuantity})` : ''}` : '—'}</td>
                </tr>
              ))}
              {history.items.length === 0 && (
                <tr><td colSpan={9} className="ai-meta" style={{ textAlign: 'center', padding: 24 }}>No predictions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {history.total > PAGE && (
          <div className="ai-actions" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
            <button type="button" className="btn btn--ghost btn--sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Newer</button>
            <span className="ai-meta">Page {page + 1} of {Math.ceil(history.total / PAGE)}</span>
            <button type="button" className="btn btn--ghost btn--sm" disabled={(page + 1) * PAGE >= history.total} onClick={() => setPage(page + 1)}>Older →</button>
          </div>
        )}
      </div>
    </div>
  );
}
