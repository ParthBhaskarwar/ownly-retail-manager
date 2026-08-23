'use client';

import React from 'react';
import Link from 'next/link';
import type { StockAlerts as StockAlertsData } from '@/modules/inventory/types';

/**
 * Low-stock, out-of-stock and ageing alerts (plan §2.8).
 *
 * Renders nothing when there is nothing to flag — an always-present panel
 * reading "0 alerts" trains people to ignore it.
 */
export function StockAlerts({ alerts }: { alerts: StockAlertsData | null }) {
  if (!alerts) return null;

  const ageingConcern = alerts.ageing.filter((b) => b.minDays >= 61 && b.count > 0);
  const hasAnything =
    alerts.lowStock.length > 0 || alerts.outOfStock.length > 0 || ageingConcern.length > 0;

  if (!hasAnything) {
    return (
      <div className="stock-alerts stock-alerts--clear" role="status">
        <span className="stock-alerts__icon" aria-hidden="true">✓</span>
        No stock alerts — nothing low, out of stock or ageing past 60 days.
      </div>
    );
  }

  return (
    <div className="stock-alerts" role="status" aria-label="Stock alerts">
      {alerts.outOfStock.length > 0 && (
        <section className="stock-alert stock-alert--error">
          <h3 className="stock-alert__title">
            Out of stock <span className="stock-alert__count">{alerts.outOfStock.length}</span>
          </h3>
          <ul className="stock-alert__list">
            {alerts.outOfStock.slice(0, 5).map((v) => (
              <li key={v.variantId}>
                <Link href={`/products/${v.productId}`}>
                  {v.productName}
                  {v.size ? ` — ${v.size}` : ''}
                </Link>
              </li>
            ))}
          </ul>
          {alerts.outOfStock.length > 5 && (
            <span className="stock-alert__more">+{alerts.outOfStock.length - 5} more</span>
          )}
        </section>
      )}

      {alerts.lowStock.length > 0 && (
        <section className="stock-alert stock-alert--warning">
          <h3 className="stock-alert__title">
            Low stock <span className="stock-alert__count">{alerts.lowStock.length}</span>
          </h3>
          <p className="stock-alert__hint">
            Fewer than {alerts.lowStockThreshold} units left
          </p>
          <ul className="stock-alert__list">
            {alerts.lowStock.slice(0, 5).map((v) => (
              <li key={v.variantId}>
                <Link href={`/products/${v.productId}`}>
                  {v.productName}
                  {v.size ? ` — ${v.size}` : ''}
                </Link>
                <span className="stock-alert__qty">{v.inStock} left</span>
              </li>
            ))}
          </ul>
          {alerts.lowStock.length > 5 && (
            <span className="stock-alert__more">+{alerts.lowStock.length - 5} more</span>
          )}
        </section>
      )}

      {ageingConcern.length > 0 && (
        <section className="stock-alert stock-alert--caution">
          <h3 className="stock-alert__title">Ageing stock</h3>
          <ul className="stock-alert__list">
            {ageingConcern.map((bucket) => (
              <li key={bucket.label}>
                {bucket.label}
                <span className="stock-alert__qty">{bucket.count} items</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
