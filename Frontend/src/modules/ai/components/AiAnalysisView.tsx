'use client';

/**
 * AiAnalysisView — renders one AI analysis: decision, the five explainable
 * scores, the 30-day forecast, written reasons, size mix, confidence and the
 * comparable products the estimate was based on.
 *
 * Used by the product page (read-only) and the AI restock screen, which passes
 * `sizeMixSlot` to replace the read-only size table with an editable one.
 */

import React from 'react';
import Link from 'next/link';
import type { AiAnalysis, AiScore, AiReason, SizeRecommendation } from '../types';
import { ACTION_META, DECISION_META, LIFECYCLE_LABEL, inr, pct } from '../labels';

// ─── Small parts ──────────────────────────────────────────────────────────────

export function DecisionBadge({ decision }: { decision: keyof typeof DECISION_META }) {
  const m = DECISION_META[decision];
  return <span className={`ai-badge ai-badge--${m.tone}`}>{m.label}</span>;
}

function ScoreCard({ name, score, risk }: { name: string; score: AiScore; risk?: boolean }) {
  // For risk scores a high value is bad, so the colour scale flips.
  const goodness = risk ? 100 - score.value : score.value;
  const tone = goodness >= 60 ? 'good' : goodness >= 35 ? 'mid' : 'bad';
  return (
    <div className="ai-score">
      <div className="ai-score__top">
        <span className="ai-score__name">{name}</span>
        <span className="ai-score__value">{score.value}</span>
      </div>
      <div className="ai-score__bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score.value} aria-label={name}>
        <div className={`ai-score__fill ai-score__fill--${tone}`} style={{ width: `${Math.max(2, score.value)}%` }} />
      </div>
      <div className="ai-score__detail">{score.detail}</div>
    </div>
  );
}

export function ScoreGrid({ analysis }: { analysis: AiAnalysis }) {
  const s = analysis.scores;
  return (
    <div className="ai-scores">
      <ScoreCard name="Selling" score={s.selling} />
      <ScoreCard name="Demand" score={s.demand} />
      <ScoreCard name="Profitability" score={s.profitability} />
      <ScoreCard name="Dead-stock risk" score={s.deadStockRisk} risk />
      <ScoreCard name="Return risk" score={s.returnRisk} risk />
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="ai-tile">
      <div className="ai-tile__label">{label}</div>
      <div className="ai-tile__value">{value}</div>
      {sub && <div className="ai-tile__sub">{sub}</div>}
    </div>
  );
}

export function ForecastTiles({ analysis }: { analysis: AiAnalysis }) {
  const f = analysis.forecast;
  return (
    <div className="ai-tiles">
      <Tile
        label="Expected sales · 30 days"
        value={`${f.expectedSales.toFixed(1)} units`}
        sub={`Likely ${f.expectedSalesQ10}–${f.expectedSalesQ90} with ${f.stockAssumed} in stock`}
      />
      <Tile label="Sales speed" value={`${f.unitsPerWeek}/week`} sub={f.seasonalFactor !== 1 ? `Season ×${f.seasonalFactor}` : 'While in stock'} />
      <Tile label="First sale in 30 days" value={pct(f.firstSaleProbability)} sub="Probability" />
      <Tile label="Expected sell-through" value={pct(f.expectedSellThrough)} sub={`Of ${f.stockAssumed} units in 30 days`} />
      <Tile
        label="Clearance period"
        value={f.clearanceDays === null ? '—' : f.clearanceDays >= 365 ? '1 year+' : `${f.clearanceDays} days`}
        sub="To sell the stock held"
      />
    </div>
  );
}

export function ReasonList({ reasons }: { reasons: AiReason[] }) {
  const mark = { positive: '+', negative: '−', neutral: '·' } as const;
  return (
    <ul className="ai-reasons">
      {reasons.map((r, i) => (
        <li key={i} className={`ai-reason ai-reason--${r.impact}`}>
          <span className="ai-reason__mark" aria-label={r.impact}>{mark[r.impact]}</span>
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function SizeMixTable({ sizeMix }: { sizeMix: SizeRecommendation[] }) {
  const maxShare = Math.max(...sizeMix.map((s) => s.demandShare), 0.01);
  return (
    <table className="ai-size-table">
      <thead>
        <tr>
          <th>Size</th>
          <th>Share of demand</th>
          <th className="num">On hand</th>
          <th className="num">Buy</th>
        </tr>
      </thead>
      <tbody>
        {sizeMix.map((s) => (
          <tr key={s.size}>
            <td><strong>{s.size}</strong></td>
            <td>
              <span className="ai-share-bar" style={{ width: `${(s.demandShare / maxShare) * 60}px` }} />
              {pct(s.demandShare)}
            </td>
            <td className="num">{s.onHand}</td>
            <td className="num"><strong>{s.quantity}</strong></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Confidence({ analysis }: { analysis: AiAnalysis }) {
  const c = analysis.confidence;
  const on = c.tier === 'HIGH' ? 3 : c.tier === 'MEDIUM' ? 2 : 1;
  const sufficiency = { SUFFICIENT: 'Sufficient data', LIMITED: 'Limited data', INSUFFICIENT: 'Insufficient data' }[c.dataSufficiency];
  return (
    <div className="ai-confidence">
      <span className="ai-confidence__dots" aria-hidden="true">
        {[1, 2, 3].map((i) => <span key={i} className={`ai-confidence__dot ${i <= on ? 'ai-confidence__dot--on' : ''}`} />)}
      </span>
      <strong>{c.tier.charAt(0) + c.tier.slice(1).toLowerCase()} confidence</strong>
      <span className="ai-badge ai-badge--neutral">{sufficiency}</span>
      <span className="ai-meta">{c.explanation}</span>
    </div>
  );
}

function Comparables({ analysis }: { analysis: AiAnalysis }) {
  if (!analysis.comparables.length) return null;
  const basis = { PHOTO: 'Photo', SUBCATEGORY_PRICE: 'Subcategory + price', CATEGORY_PRICE: 'Category + price', STORE: 'Store-wide' };
  return (
    <table className="ai-size-table">
      <thead>
        <tr><th>Similar product</th><th>Matched by</th><th className="num">Price</th><th className="num">Units/week</th></tr>
      </thead>
      <tbody>
        {analysis.comparables.map((c) => (
          <tr key={c.productId}>
            <td><Link href={`/products/${c.productId}`}>{c.name}</Link></td>
            <td>{basis[c.basis]}{c.basis === 'PHOTO' ? ` · ${pct(c.weight)}` : ''}</td>
            <td className="num">{inr(c.sellingPrice)}</td>
            <td className="num">{c.unitsPerWeek}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Metrics({ analysis }: { analysis: AiAnalysis }) {
  const m = analysis.metrics;
  if (!m) return null;
  return (
    <div className="ai-tiles">
      <Tile label="Sold 7 / 15 / 30 days" value={`${m.units7} / ${m.units15} / ${m.units30}`} />
      <Tile label="Time to first sale" value={m.timeToFirstSaleDays === null ? 'Not sold yet' : `${m.timeToFirstSaleDays} days`} />
      <Tile label="Lifetime sell-through" value={pct(m.sellThroughLifetime)} />
      <Tile label="Realised margin" value={pct(m.realisedMarginPct)} sub={m.discountDependency !== null ? `${pct(m.discountDependency)} sold on discount` : undefined} />
      <Tile label="Return rate" value={pct(m.returnRate, 1)} />
      <Tile
        label="Price band"
        value={m.priceBand?.band ?? '—'}
        sub={m.priceBand ? `${m.priceBand.relativeToSubcategory}× subcategory median` : undefined}
      />
      <Tile label="Lifecycle" value={LIFECYCLE_LABEL[m.lifecycleStage]} sub={m.avgStockAgeDays !== null ? `Stock age ${m.avgStockAgeDays} days` : undefined} />
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

interface Props {
  analysis: AiAnalysis;
  /** Replaces the read-only size table (the restock screen makes it editable). */
  sizeMixSlot?: React.ReactNode;
  /** Show the §2.14 product metrics block (product page). */
  showMetrics?: boolean;
}

export function AiAnalysisView({ analysis, sizeMixSlot, showMetrics }: Props) {
  const d = DECISION_META[analysis.recommendation.decision];
  const action = ACTION_META[analysis.recommendation.productAction];
  const r = analysis.recommendation;

  return (
    <div className="ai-section">
      <div className={`ai-decision ai-decision--${d.tone}`}>
        <div>
          <div className="ai-meta">AI decision</div>
          <div className="ai-decision__label">{d.label}</div>
          <div className="ai-decision__sub">
            {d.hint}
            {action.label !== d.label && <> · Product action: <strong>{action.label}</strong></>}
          </div>
        </div>
        <div className="ai-decision__qty">
          <strong>{r.quantity}</strong>
          <span className="ai-meta">units to buy{r.coverDays !== null ? ` · ${r.coverDays} days of cover now` : ''}</span>
        </div>
      </div>

      <Confidence analysis={analysis} />
      <ScoreGrid analysis={analysis} />
      <ForecastTiles analysis={analysis} />
      {showMetrics && <Metrics analysis={analysis} />}

      <div className="ai-columns">
        <div>
          <h3 className="ai-subhead">Why</h3>
          <ReasonList reasons={analysis.reasons} />
        </div>
        <div>
          <h3 className="ai-subhead">Size mix</h3>
          {sizeMixSlot ?? <SizeMixTable sizeMix={r.sizeMix} />}
        </div>
      </div>

      {analysis.comparables.length > 0 && (
        <div>
          <h3 className="ai-subhead">Based on similar products</h3>
          <Comparables analysis={analysis} />
        </div>
      )}

      <div className="ai-meta">
        Model {analysis.modelVersion} · as of {new Date(analysis.asOf).toLocaleString()} · runs offline on your own sales data
      </div>
    </div>
  );
}
