'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';
import { evaluatePermission } from '@/config/permissions';
import { AuthGuard, PermissionGuard } from '@/shared/components/PermissionGuard';
import {
  InventoryItemService,
  InventoryMovementService,
} from '@/modules/inventory/services/InventoryItemService';
import { MovementTimeline } from '@/modules/inventory/components/MovementTimeline';
import { StatusBadge } from '@/modules/inventory/components/StatusBadge';
import {
  ALL_INVENTORY_STATUSES,
  MOVEMENT_FOR_STATUS,
  STATUS_LABELS,
  type InventoryItemRow,
  type InventoryMovement,
  type InventoryStatus,
} from '@/modules/inventory/types';
import type { Role } from '@/modules/account/types';

function formatCurrency(value: number): string {
  return '₹' + value.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function ItemDetailContent() {
  const params = useParams();
  const itemId = String(params.id);
  const { user } = useAuthContext();
  const canEdit = user ? evaluatePermission(user.role as Role, 'inventory:edit') : false;

  const [item, setItem] = useState<InventoryItemRow | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [newStatus, setNewStatus] = useState<InventoryStatus | ''>('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const found = await InventoryItemService.getById(itemId);
      if (!found) {
        setNotFound(true);
        return;
      }
      setItem(found);
      setMovements(await InventoryMovementService.getMovementsForItem(itemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this item.');
    } finally {
      setIsLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatus || !item) return;
    setIsSaving(true);
    setError(null);
    try {
      await InventoryItemService.updateStatus({
        inventoryItemId: item.id,
        newStatus,
        // The movement type is implied by the destination status, so the user
        // picks one thing rather than two that must agree.
        movementType: MOVEMENT_FOR_STATUS[newStatus],
        referenceType: 'MANUAL_ADJUSTMENT',
        referenceId: crypto.randomUUID(),
        performedBy: user?.id ?? '',
        notes: notes.trim() || undefined,
      });
      setNewStatus('');
      setNotes('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the status.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="page-content"><p className="data-table__muted">Loading item…</p></div>;
  }

  if (notFound) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">▦</span>
          <h3 className="empty-state__title">Item not found</h3>
          <p className="empty-state__desc">
            This barcode does not exist in your store, or it may have been removed.
          </p>
          <Link href="/inventory" className="btn btn-secondary">← Back to Inventory</Link>
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className="page-content">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/inventory">Inventory</Link>
        <span aria-hidden="true">/</span>
        <span className="mono">{item.barcode}</span>
      </nav>

      <div className="page-header">
        <div className="page-header__left">
          <h1 className="page-header__title mono">{item.barcode}</h1>
          <StatusBadge status={item.status} />
        </div>
        <Link href={`/products/${item.productId}`} className="btn btn-secondary btn-sm">
          View Product
        </Link>
      </div>

      {error && (
        <div className="form-server-error" role="alert">
          <strong>Error:</strong> {error}
        </div>
      )}

      <section className="item-detail-grid" aria-label="Item details">
        <div className="item-detail-field">
          <span className="item-detail-field__label">Product</span>
          <span className="item-detail-field__value">{item.productName}</span>
        </div>
        <div className="item-detail-field">
          <span className="item-detail-field__label">Variant SKU</span>
          <span className="item-detail-field__value mono">{item.variantSku}</span>
        </div>
        <div className="item-detail-field">
          <span className="item-detail-field__label">Size</span>
          <span className="item-detail-field__value">{item.size ?? '—'}</span>
        </div>
        <div className="item-detail-field">
          <span className="item-detail-field__label">Category</span>
          <span className="item-detail-field__value">{item.categoryName ?? '—'}</span>
        </div>
        <div className="item-detail-field">
          <span className="item-detail-field__label">Supplier</span>
          <span className="item-detail-field__value">{item.supplierName ?? '—'}</span>
        </div>
        <div className="item-detail-field">
          <span className="item-detail-field__label">Purchase Date</span>
          <span className="item-detail-field__value">{formatDate(item.purchaseDate)}</span>
        </div>
        <div className="item-detail-field">
          <span className="item-detail-field__label">Age</span>
          <span className="item-detail-field__value">{item.ageDays} days</span>
        </div>
        <div className="item-detail-field">
          {/* Snapshot, not a live lookup — this is what was actually paid for
              this specific piece, even if the supplier's price changed since. */}
          <span className="item-detail-field__label">Cost (at purchase)</span>
          <span className="item-detail-field__value">{formatCurrency(item.purchaseCostPrice)}</span>
        </div>
        <div className="item-detail-field">
          <span className="item-detail-field__label">Selling Price</span>
          <span className="item-detail-field__value">{formatCurrency(item.sellingPrice)}</span>
        </div>
      </section>

      {canEdit && (
        <section className="card status-change-panel" aria-labelledby="status-change-heading">
          <h2 id="status-change-heading" className="card__title">Change Status</h2>
          <form className="status-change-form" onSubmit={handleStatusChange}>
            <div className="form-field">
              <label className="form-label" htmlFor="new-status">New status</label>
              <select
                id="new-status"
                className="form-select"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as InventoryStatus)}
                required
              >
                <option value="">Select a status…</option>
                {ALL_INVENTORY_STATUSES.filter((s) => s !== item.status).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="status-notes">Reason</label>
              <input
                id="status-notes"
                type="text"
                className="form-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Torn on the rack, customer exchange"
              />
            </div>
            <button
              type="submit"
              id="status-change-submit"
              className="btn btn-primary"
              disabled={!newStatus || isSaving}
            >
              {isSaving ? 'Saving…' : 'Update Status'}
            </button>
          </form>
        </section>
      )}

      <section className="card" aria-labelledby="history-heading">
        <h2 id="history-heading" className="card__title">Movement History</h2>
        {/* Append-only: every status change adds an entry, nothing is edited
            or removed. This is the item's full traceable lifecycle. */}
        <MovementTimeline movements={movements} />
      </section>
    </div>
  );
}

export default function InventoryItemPage() {
  return (
    <AuthGuard>
      <PermissionGuard permissionKey="inventory:view">
        <ItemDetailContent />
      </PermissionGuard>
    </AuthGuard>
  );
}
