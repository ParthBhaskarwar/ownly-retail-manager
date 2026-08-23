'use client';

import React from 'react';
import type { StockValuation } from '@/modules/inventory/types';

function formatCurrency(value: number): string {
  return '₹' + value.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/**
 * Stock valuation summary — plan §2.8: "Total cost value, expected selling
 * value and potential gross profit."
 *
 * Values cover items physically in stock only; sold and written-off items are
 * excluded, since this answers "what is on my shelves worth?".
 */
export function ValuationCards({
  valuation,
  isLoading,
}: {
  valuation: StockValuation | null;
  isLoading: boolean;
}) {
  const margin =
    valuation && valuation.expectedSalesValue > 0
      ? (valuation.potentialGrossProfit / valuation.expectedSalesValue) * 100
      : 0;

  const cards = [
    {
      id: 'val-items',
      label: 'Items In Stock',
      value: valuation ? String(valuation.itemCount) : '—',
      tone: 'denim',
    },
    {
      id: 'val-cost',
      label: 'Stock Cost Value',
      value: valuation ? formatCurrency(valuation.stockCostValue) : '—',
      tone: 'neutral',
    },
    {
      id: 'val-expected',
      label: 'Expected Sales Value',
      value: valuation ? formatCurrency(valuation.expectedSalesValue) : '—',
      tone: 'info',
    },
    {
      id: 'val-profit',
      label: 'Potential Gross Profit',
      value: valuation ? formatCurrency(valuation.potentialGrossProfit) : '—',
      hint: valuation && valuation.expectedSalesValue > 0 ? `${margin.toFixed(1)}% margin` : undefined,
      tone: valuation && valuation.potentialGrossProfit < 0 ? 'error' : 'success',
    },
  ];

  return (
    <div className={`valuation-cards ${isLoading ? 'valuation-cards--loading' : ''}`}>
      {cards.map((card) => (
        <div key={card.id} id={card.id} className={`valuation-card valuation-card--${card.tone}`}>
          <span className="valuation-card__label">{card.label}</span>
          <span className="valuation-card__value">{card.value}</span>
          {card.hint && <span className="valuation-card__hint">{card.hint}</span>}
        </div>
      ))}
    </div>
  );
}
