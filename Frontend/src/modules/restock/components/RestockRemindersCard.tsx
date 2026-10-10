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
      <div className="dash-card">
        <div className="dash-card-body" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'var(--color-paid-tint)', color: 'var(--color-paid)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined">check_circle</span>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
              All Stock Levels Healthy
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--color-ink-secondary)' }}>
              No products are currently low on stock or out of stock.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const outOfStockCount = reminders.filter((r) => r.urgency === 'OUT_OF_STOCK').length;
  const lowStockCount = reminders.filter((r) => r.urgency === 'LOW_STOCK').length;

  return (
    <div className="dash-card">
      <div className="dash-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 className="dash-card-title">Restock Reminders &amp; Critical Alerts</h2>
          <span className="dash-card-badge danger">
            {reminders.length} items need attention
          </span>
        </div>
        
        <div style={{ display: 'flex', backgroundColor: 'var(--color-paper)', padding: '2px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <button style={{ padding: '4px 10px', backgroundColor: 'var(--color-surface)', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, boxShadow: 'var(--shadow-raised)', color: 'var(--color-ink)' }}>All ({reminders.length})</button>
          <button style={{ padding: '4px 10px', backgroundColor: 'transparent', border: 'none', fontSize: '12px', fontWeight: 500, color: 'var(--color-ink-secondary)', cursor: 'pointer' }}>Out of Stock ({outOfStockCount})</button>
          <button style={{ padding: '4px 10px', backgroundColor: 'transparent', border: 'none', fontSize: '12px', fontWeight: 500, color: 'var(--color-ink-secondary)', cursor: 'pointer' }}>Low Stock ({lowStockCount})</button>
        </div>
      </div>

      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Garment &amp; SKU</th>
              <th style={{ textAlign: 'center' }}>Stock / Need</th>
              <th>Severity</th>
              <th style={{ textAlign: 'right' }}>Quick Action</th>
            </tr>
          </thead>
          <tbody>
            {reminders.slice(0, compact ? 4 : 8).map((r) => (
              <tr key={r.variantId}>
                <td>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>
                    {r.productName} <span style={{ fontWeight: 400, color: 'var(--color-ink-secondary)' }}>({r.sizeName})</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-ink-secondary)', marginTop: '2px' }}>
                    SKU: {r.variantSku}
                  </div>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ fontWeight: 700, color: r.urgency === 'OUT_OF_STOCK' ? 'var(--color-return)' : 'var(--color-caution)' }}>
                    {r.currentStock}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--color-ink-secondary)' }}> / +{r.suggestedQuantity}</span>
                </td>
                <td>
                  <span className={`dash-status-pill ${r.urgency === 'OUT_OF_STOCK' ? 'danger' : 'warning'}`}>
                    {r.urgency === 'OUT_OF_STOCK' ? 'Out of Stock' : 'Low Stock'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {onSelectRestock ? (
                    <button
                      type="button"
                      style={{ height: '32px', padding: '0 10px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '12px', fontWeight: 500, color: 'var(--color-denim)', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                      onClick={() => onSelectRestock(r.productId)}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_shopping_cart</span>
                      Restock
                    </button>
                  ) : (
                    <Link href={`/restock?productId=${r.productId}`} style={{ height: '32px', padding: '0 10px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '12px', fontWeight: 500, color: 'var(--color-denim)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_shopping_cart</span>
                      Restock
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="dash-card-footer">
        <span style={{ fontSize: '12px', color: 'var(--color-ink-secondary)' }}>
          Showing {Math.min(compact ? 4 : 8, reminders.length)} of {reminders.length} critical items
        </span>
        <Link href="/restock" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-denim)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
          View All {reminders.length} Items <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
        </Link>
      </div>
    </div>
  );
}
