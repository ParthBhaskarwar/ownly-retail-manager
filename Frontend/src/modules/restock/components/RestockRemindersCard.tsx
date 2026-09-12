'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { RestockService } from '../services/RestockService';
import type { RestockReminder } from '../types';

interface RestockRemindersCardProps {
  storeId: string;
  onSelectRestock?: (productId: string) => void;
  compact?: boolean;
}

export function RestockRemindersCard({ storeId, onSelectRestock, compact = false }: RestockRemindersCardProps) {
  const [reminders, setReminders] = useState<RestockReminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    let isMounted = true;
    setIsLoading(true);

    RestockService.getRestockReminders(storeId)
      .then((data) => {
        if (isMounted) setReminders(data);
      })
      .catch((err) => console.error('Failed to load restock reminders', err))
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [storeId]);

  if (isLoading) {
    return (
      <div className="card animate-fade-in" style={{ padding: 'var(--space-4)' }}>
        <div className="skeleton" style={{ height: 24, width: '40%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 60, borderRadius: 6 }} />
      </div>
    );
  }

  if (reminders.length === 0) {
    return (
      <div className="card restock-reminder-card--empty">
        <div className="restock-reminder-empty__icon">✓</div>
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>
            All Stock Levels Healthy
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)' }}>
            No products are currently low on stock or out of stock.
          </p>
        </div>
      </div>
    );
  }

  const outOfStockCount = reminders.filter((r) => r.urgency === 'OUT_OF_STOCK').length;
  const lowStockCount = reminders.filter((r) => r.urgency === 'LOW_STOCK').length;

  return (
    <div className="card restock-reminders-card">
      <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="card__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span> Restock Reminders
            <span className="badge badge--caution badge--sm">
              {reminders.length} item{reminders.length === 1 ? '' : 's'} need attention
            </span>
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>
            {outOfStockCount > 0 && <span style={{ color: 'var(--color-return)', fontWeight: 600 }}>{outOfStockCount} Out of Stock</span>}
            {outOfStockCount > 0 && lowStockCount > 0 && ' · '}
            {lowStockCount > 0 && <span>{lowStockCount} Low Stock</span>}
          </p>
        </div>

        <Link href="/restock" className="btn btn--secondary btn--sm">
          Open Restock Console →
        </Link>
      </div>

      <div className="restock-reminders-list" style={{ marginTop: 'var(--space-3)' }}>
        {reminders.slice(0, compact ? 4 : 8).map((r) => (
          <div key={r.variantId} className="restock-reminder-item">
            <div className="restock-reminder-item__main">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`status-pill ${r.urgency === 'OUT_OF_STOCK' ? 'status-pill--error' : 'status-pill--warning'}`}>
                  {r.urgency === 'OUT_OF_STOCK' ? 'Out of Stock' : 'Low Stock'}
                </span>
                <strong>{r.productName}</strong>
                <code className="sku-badge">{r.sizeName}</code>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', marginTop: '2px' }}>
                SKU: <span className="font-mono">{r.variantSku}</span>
                {r.supplierName && ` · Supplier: ${r.supplierName}`}
              </div>
            </div>

            <div className="restock-reminder-item__meta">
              <div className="restock-qty-pill">
                <span className="restock-qty-pill__current">{r.currentStock} in stock</span>
                <span className="restock-qty-pill__suggested">+ Suggest {r.suggestedQuantity}</span>
              </div>

              {onSelectRestock ? (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => onSelectRestock(r.productId)}
                >
                  Restock
                </button>
              ) : (
                <Link href={`/restock?productId=${r.productId}`} className="btn btn--primary btn--sm">
                  Restock
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
