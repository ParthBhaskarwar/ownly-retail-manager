'use client';

/**
 * ProductPerformancePanel — Week 6 product-performance calculation display.
 *
 * Fetches GET /api/products/:id/performance and renders five KPI cards:
 *   1. Time to first sale (days)
 *   2. Sales velocity (units / day, 30-day rolling)
 *   3. Sell-through rate (%)
 *   4. Average stock age (days)
 *   5. Size demand table
 *
 * A "Refresh" button triggers POST recalculation via ?refresh=true.
 * Shows a loading skeleton while fetching; shows nothing on error (graceful
 * degradation so the product detail page still works without this panel).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';
import type { ProductPerformanceMetrics } from '@/modules/product/types';

interface Props {
  productId: string;
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  unit,
  sub,
  colour,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  colour: string;
}) {
  return (
    <div style={{
      flex: '1 1 140px', minWidth: 120,
      padding: '12px 14px', borderRadius: 10,
      background: colour + '12', border: `1px solid ${colour}30`,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
        {value}
        {unit && <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280', marginLeft: 4 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>}
    </div>
  );
}

// ─── Sell-through bar ─────────────────────────────────────────────────────────

function SellThroughBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const colour = pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#6b7280';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
      <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: colour, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: colour, minWidth: 36 }}>{pct}%</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProductPerformancePanel({ productId }: Props) {
  const [metrics, setMetrics] = useState<ProductPerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMetrics = useCallback(async (refresh = false) => {
    try {
      const url = `/api/products/${productId}/performance${refresh ? '?refresh=true' : ''}`;
      const res = await apiClient.get<{ metrics: ProductPerformanceMetrics }>(url);
      setMetrics(res.metrics);
    } catch {
      setMetrics(null);
    }
  }, [productId]);

  useEffect(() => {
    setLoading(true);
    fetchMetrics().finally(() => setLoading(false));
  }, [fetchMetrics]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMetrics(true);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{
            flex: '1 1 140px', minWidth: 120, height: 72,
            borderRadius: 10, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  const fmt = (v: number | null, decimals = 0) =>
    v === null ? '—' : v.toFixed(decimals);

  const computedDate = new Date(metrics.computedAt).toLocaleString();

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#374151' }}>
          Product Performance
        </h3>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          style={{
            padding: '4px 12px', borderRadius: 6, border: '1px solid #d1d5db',
            background: '#fff', fontSize: 12, cursor: refreshing ? 'wait' : 'pointer',
            color: '#374151',
          }}
        >
          {refreshing ? '⟳ Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {/* ── KPI cards ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <KpiCard
          label="Time to First Sale"
          value={fmt(metrics.timeToFirstSaleDays)}
          unit={metrics.timeToFirstSaleDays !== null ? 'days' : undefined}
          sub={metrics.timeToFirstSaleDays === null ? 'Never sold' : undefined}
          colour="#6366f1"
        />
        <KpiCard
          label="Sales Velocity"
          value={fmt(metrics.salesVelocity30d, 1)}
          unit={metrics.salesVelocity30d !== null ? 'units/day' : undefined}
          sub="30-day average"
          colour="#0ea5e9"
        />
        <KpiCard
          label="Sell-Through Rate"
          value={metrics.sellThroughRate !== null
            ? `${Math.round(metrics.sellThroughRate * 100)}%`
            : '—'}
          sub={metrics.sellThroughRate === null ? 'No stock data' : 'sold vs. in-stock'}
          colour="#16a34a"
        />
        <KpiCard
          label="Avg. Stock Age"
          value={fmt(metrics.avgStockAgeDays, 0)}
          unit={metrics.avgStockAgeDays !== null ? 'days' : undefined}
          sub="in-stock items"
          colour="#f59e0b"
        />
      </div>

      {/* ── Size demand table ── */}
      {metrics.sizeDemand.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Size Demand
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {metrics.sizeDemand.map((entry) => (
              <div key={entry.size} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  minWidth: 36, fontSize: 12, fontWeight: 600,
                  color: '#374151', textAlign: 'center',
                  padding: '2px 8px', background: '#f3f4f6', borderRadius: 4,
                }}>
                  {entry.size}
                </span>
                <SellThroughBar rate={entry.sellThroughRate} />
                <span style={{ fontSize: 11, color: '#6b7280', minWidth: 80, textAlign: 'right' }}>
                  {entry.sold} sold · {entry.inStock} in stock
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ fontSize: 11, color: '#9ca3af' }}>
        Last computed: {computedDate}
      </div>
    </section>
  );
}
