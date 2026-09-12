'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/context/AuthContext';
import { AuthGuard } from '@/shared/components/PermissionGuard';
import { db } from '@/db/db';
import { RestockRemindersCard } from '@/modules/restock/components/RestockRemindersCard';
import type { InventoryItem, InventoryMovement } from '@/modules/inventory/types';

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0 });
}

export default function InventoryPage() {
  const { user } = useAuthContext();
  const storeId = user?.storeId || '';

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Map<string, { name: string; sku: string }>>(new Map());
  const [variants, setVariants] = useState<Map<string, { displayName: string; sku: string; productId: string; price: number }>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<string>('IN_STOCK');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemHistory, setSelectedItemHistory] = useState<{ item: InventoryItem; movements: InventoryMovement[] } | null>(null);

  const loadData = async () => {
    if (!storeId || !db) return;
    setIsLoading(true);
    try {
      const [rawItems, rawProds, rawVars] = await Promise.all([
        db.inventoryItems.where('storeId').equals(storeId).toArray(),
        db.products.where('storeId').equals(storeId).toArray(),
        db.productVariants.toArray(),
      ]);

      const prodMap = new Map(rawProds.map((p) => [p.id, { name: p.name, sku: p.baseSku }]));
      const varMap = new Map(rawVars.map((v) => [v.id, {
        displayName: v.displayName,
        sku: v.sku,
        productId: v.productId,
        price: v.sellingPriceOverride ?? 0,
      }]));

      setProducts(prodMap);
      setVariants(varMap);
      setItems(rawItems);
    } catch (err) {
      console.error('Failed to load inventory', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [storeId]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!searchQuery) return true;

      const q = searchQuery.toLowerCase();
      const variant = variants.get(item.variantId);
      const prod = variant ? products.get(variant.productId) : null;

      return (
        item.barcode.toLowerCase().includes(q) ||
        (prod?.name.toLowerCase().includes(q) ?? false) ||
        (variant?.sku.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, statusFilter, searchQuery, variants, products]);

  const viewHistory = async (item: InventoryItem) => {
    if (!db) return;
    const movs = await db.inventoryMovements.where('inventoryItemId').equals(item.id).toArray();
    setSelectedItemHistory({ item, movements: movs });
  };

  const inStockCount = items.filter((i) => i.status === 'IN_STOCK').length;
  const soldCount = items.filter((i) => i.status === 'SOLD').length;
  const totalCost = items.filter((i) => i.status === 'IN_STOCK').reduce((sum, i) => sum + (i.purchaseCostPrice || 0), 0);

  return (
    <AuthGuard>
      <div className="page-content animate-fade-in">
        {/* Page Header */}
        <div className="page-header">
          <div className="page-header__left">
            <h1 className="page-header__title">Physical Inventory Ledger</h1>
            <p className="page-subtitle">
              Track individual garment items, unique barcodes, status lifecycles, and movements.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/restock" className="btn btn--primary">
              ⚡ Manual Restock
            </Link>
          </div>
        </div>

        {/* Restock Reminders Alert Card */}
        {storeId && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <RestockRemindersCard storeId={storeId} compact />
          </div>
        )}

        {/* Stats Row */}
        <div className="dashboard-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 'var(--space-4)' }}>
          <div className="stat-card card">
            <div className="stat-card__icon">📦</div>
            <div className="stat-card__value">{inStockCount}</div>
            <div className="stat-card__label">In Stock (Available)</div>
          </div>
          <div className="stat-card card">
            <div className="stat-card__icon">💰</div>
            <div className="stat-card__value">{fmt(totalCost)}</div>
            <div className="stat-card__label">In-Stock Cost Value</div>
          </div>
          <div className="stat-card card">
            <div className="stat-card__icon">🏷️</div>
            <div className="stat-card__value">{soldCount}</div>
            <div className="stat-card__label">Units Sold to Date</div>
          </div>
          <div className="stat-card card">
            <div className="stat-card__icon">📊</div>
            <div className="stat-card__value">{items.length}</div>
            <div className="stat-card__label">Total Barcodes Tracked</div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="product-toolbar" style={{ marginBottom: 'var(--space-4)' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Scan or type barcode, SKU, product name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ maxWidth: 380 }}
          />

          <div className="filter-tabs" role="tablist">
            {[
              { label: 'In Stock', value: 'IN_STOCK' },
              { label: 'All', value: 'ALL' },
              { label: 'Sold', value: 'SOLD' },
              { label: 'Returned', value: 'RETURNED_TO_STOCK' },
              { label: 'Damaged', value: 'DAMAGED' },
            ].map((tab) => (
              <button
                key={tab.value}
                className={`filter-tab ${statusFilter === tab.value ? 'filter-tab--active' : ''}`}
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Inventory Item Ledger Table */}
        <div className="card">
          <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card__title">Item-Level Tracking ({filteredItems.length} items)</h2>
          </div>

          {isLoading ? (
            <div style={{ padding: 'var(--space-6)' }}>
              <div className="skeleton" style={{ height: 180 }} />
            </div>
          ) : filteredItems.length === 0 ? (
            <p style={{ padding: 'var(--space-6)', color: 'var(--color-ink-muted)', textAlign: 'center' }}>
              No inventory items found matching your criteria.
            </p>
          ) : (
            <table className="table" style={{ width: '100%', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Unique Barcode</th>
                  <th style={{ textAlign: 'left' }}>Garment Design</th>
                  <th style={{ textAlign: 'left' }}>Size / Variant</th>
                  <th style={{ textAlign: 'right' }}>Cost</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'left' }}>Received Date</th>
                  <th style={{ textAlign: 'center' }}>History</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.slice(0, 100).map((item) => {
                  const variant = variants.get(item.variantId);
                  const prod = variant ? products.get(variant.productId) : null;

                  return (
                    <tr key={item.id}>
                      <td>
                        <code className="sku-badge" style={{ fontWeight: 600 }}>
                          {item.barcode}
                        </code>
                      </td>
                      <td><strong>{prod?.name || '—'}</strong></td>
                      <td>{variant?.displayName || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(item.purchaseCostPrice || 0)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${item.status === 'IN_STOCK' ? 'badge--paid' : item.status === 'SOLD' ? 'badge--neutral' : 'badge--return'}`}>
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>{new Date(item.purchaseDate || item.createdAt).toLocaleDateString()}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => viewHistory(item)}
                        >
                          📜 Audit Trail
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Item Movement History Modal */}
        {selectedItemHistory && (
          <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal card animate-fade-in-up" style={{ maxWidth: 600, width: '90%', padding: 'var(--space-6)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>
                  Movement History: <code className="sku-badge">{selectedItemHistory.item.barcode}</code>
                </h2>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setSelectedItemHistory(null)}
                >
                  ✕
                </button>
              </div>

              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {selectedItemHistory.movements.length === 0 ? (
                  <p style={{ color: 'var(--color-ink-muted)' }}>No movements recorded for this item.</p>
                ) : (
                  <div className="movement-timeline">
                    {selectedItemHistory.movements.map((m) => (
                      <div key={m.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                          <strong>{m.movementType}</strong>
                          <span style={{ color: 'var(--color-ink-muted)', fontSize: 'var(--text-xs)' }}>
                            {new Date(m.performedAt).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', marginTop: '2px' }}>
                          Status: {m.fromStatus} → {m.toStatus}
                          {m.notes && ` · Notes: ${m.notes}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'right', marginTop: 'var(--space-4)' }}>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setSelectedItemHistory(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
