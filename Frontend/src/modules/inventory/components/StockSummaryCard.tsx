'use client';

import React from 'react';
import type { StockSummary } from '@/modules/inventory/types';

interface StockSummaryCardProps {
  summary: StockSummary;
  compact?: boolean;
}

export function StockSummaryCard({ summary, compact = false }: StockSummaryCardProps) {
  const stats = [
    { label: 'In Stock', value: summary.inStock, color: 'success', id: 'stat-in-stock' },
    { label: 'Sold',     value: summary.sold,    color: 'muted',   id: 'stat-sold' },
    { label: 'Reserved', value: summary.reserved, color: 'warning', id: 'stat-reserved' },
    { label: 'Damaged',  value: summary.damaged,  color: 'error',   id: 'stat-damaged' },
    { label: 'Lost',     value: summary.lost,     color: 'error',   id: 'stat-lost' },
  ].filter((s) => !compact || s.value > 0 || s.label === 'In Stock');

  return (
    <div className={`stock-summary-card ${compact ? 'stock-summary-card--compact' : ''}`}>
      {stats.map((s) => (
        <div key={s.id} id={s.id} className={`stock-summary-card__stat stock-summary-card__stat--${s.color}`}>
          <span className="stock-summary-card__stat-value">{s.value}</span>
          <span className="stock-summary-card__stat-label">{s.label}</span>
        </div>
      ))}
      {!compact && (
        <div className="stock-summary-card__stat stock-summary-card__stat--muted">
          <span className="stock-summary-card__stat-value">{summary.total}</span>
          <span className="stock-summary-card__stat-label">Total</span>
        </div>
      )}
    </div>
  );
}
