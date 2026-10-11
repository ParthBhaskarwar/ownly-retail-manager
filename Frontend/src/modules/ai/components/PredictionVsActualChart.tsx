'use client';

/**
 * PredictionVsActualChart — units predicted vs actually sold per period, with
 * the naive carry-forward baseline as a dashed reference line.
 *
 * Palette validated with the dataviz validator (light surface): actual
 * #2E63B8, predicted #C2410C — CVD ΔE 24, normal ΔE 30, contrast ≥ 3:1.
 * The baseline is a reference mark (neutral, dashed), not a third category.
 * Hover/focus shows a crosshair with every series at that period; the same
 * numbers are available without hovering through the "Show table" toggle.
 */

import React, { useMemo, useState } from 'react';

interface Point { period: string; predicted: number; actual: number; baseline: number }

const COLORS = { actual: '#2E63B8', predicted: '#C2410C', baseline: '#8A837D' };
const W = 720;
const H = 260;
const M = { top: 16, right: 16, bottom: 32, left: 44 };

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function PredictionVsActualChart({ series }: { series: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const geo = useMemo(() => {
    const max = niceMax(Math.max(...series.flatMap((p) => [p.predicted, p.actual, p.baseline]), 1));
    const iw = W - M.left - M.right;
    const ih = H - M.top - M.bottom;
    const x = (i: number) => M.left + (series.length <= 1 ? iw / 2 : (i / (series.length - 1)) * iw);
    const y = (v: number) => M.top + ih - (v / max) * ih;
    const path = (k: keyof Omit<Point, 'period'>) =>
      series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
    return { max, x, y, path, ticks, iw, ih };
  }, [series]);

  if (series.length === 0) return <p className="ai-meta">No evaluated predictions yet.</p>;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const rel = (px - M.left) / geo.iw;
    setHover(Math.min(series.length - 1, Math.max(0, Math.round(rel * (series.length - 1)))));
  };

  const h = hover !== null ? series[hover] : null;
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));
  const last = series[series.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="ai-legend" aria-label="Legend">
          <span><i style={{ background: COLORS.actual }} />Actual units sold</span>
          <span><i style={{ background: COLORS.predicted }} />AI predicted</span>
          <span><i style={{ background: `repeating-linear-gradient(90deg, ${COLORS.baseline} 0 4px, transparent 4px 7px)` }} />Carry-forward baseline</span>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowTable(!showTable)}>
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {showTable ? (
        <div className="ai-table-wrap">
          <table className="ai-table">
            <thead><tr><th>As of</th><th className="num">Predicted</th><th className="num">Actual</th><th className="num">Baseline</th></tr></thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.period}><td>{fmtDate(p.period)}</td><td className="num">{p.predicted}</td><td className="num">{p.actual}</td><td className="num">{p.baseline}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${W} ${H}`} className="ai-chart" role="img"
            aria-label={`Units predicted versus sold over ${series.length} periods. Latest: predicted ${last.predicted}, actual ${last.actual}.`}
          >
            {geo.ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={W - M.right} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--color-border-subtle)" strokeWidth={1} />
                <text x={M.left - 8} y={geo.y(t) + 4} textAnchor="end">{Math.round(t).toLocaleString('en-IN')}</text>
              </g>
            ))}
            {series.map((p, i) => (i % labelEvery === 0 || i === series.length - 1) && (
              <text key={p.period} x={geo.x(i)} y={H - 10} textAnchor="middle">{fmtDate(p.period)}</text>
            ))}

            <path d={geo.path('baseline')} fill="none" stroke={COLORS.baseline} strokeWidth={1.5} strokeDasharray="4 3" />
            <path d={geo.path('actual')} fill="none" stroke={COLORS.actual} strokeWidth={2} strokeLinejoin="round" />
            <path d={geo.path('predicted')} fill="none" stroke={COLORS.predicted} strokeWidth={2} strokeLinejoin="round" />

            {/* Direct labels at the line ends */}
            <text x={geo.x(series.length - 1) - 4} y={geo.y(last.actual) - 8} textAnchor="end" style={{ fill: 'var(--color-ink-secondary)' }}>Actual</text>
            <text x={geo.x(series.length - 1) - 4} y={geo.y(last.predicted) + 16} textAnchor="end" style={{ fill: 'var(--color-ink-secondary)' }}>Predicted</text>

            {h && hover !== null && (
              <g pointerEvents="none">
                <line x1={geo.x(hover)} x2={geo.x(hover)} y1={M.top} y2={H - M.bottom} stroke="var(--color-ink-muted)" strokeWidth={1} />
                {(['actual', 'predicted'] as const).map((k) => (
                  <circle key={k} cx={geo.x(hover)} cy={geo.y(h[k])} r={4.5} fill={COLORS[k]} stroke="var(--color-surface)" strokeWidth={2} />
                ))}
              </g>
            )}
            <rect
              x={M.left} y={M.top} width={geo.iw} height={geo.ih} fill="transparent" tabIndex={0}
              aria-label="Chart data — use left and right arrow keys to read values"
              onPointerMove={onMove} onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(series.length - 1)} onBlur={() => setHover(null)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') setHover((v) => Math.max(0, (v ?? series.length) - 1));
                if (e.key === 'ArrowRight') setHover((v) => Math.min(series.length - 1, (v ?? -1) + 1));
              }}
            />
          </svg>

          {h && hover !== null && (
            <div
              role="status"
              style={{
                position: 'absolute', top: 4,
                left: `${(geo.x(hover) / W) * 100}%`,
                transform: hover > series.length / 2 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 6, padding: '8px 10px', boxShadow: 'var(--shadow-raised)',
                fontSize: 12, pointerEvents: 'none', minWidth: 150,
              }}
            >
              <div style={{ color: 'var(--color-ink-muted)', marginBottom: 4 }}>30 days from {fmtDate(h.period)}</div>
              {([['actual', 'Actual'], ['predicted', 'Predicted'], ['baseline', 'Baseline']] as const).map(([k, label]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-ink-secondary)' }}>
                    <i style={{ width: 12, height: 2, background: COLORS[k], display: 'inline-block' }} />{label}
                  </span>
                  <strong style={{ color: 'var(--color-ink)' }}>{h[k].toLocaleString('en-IN')}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
