'use client';

import React from 'react';
import Link from 'next/link';
import { StatusBadge } from './StatusBadge';
import type { InventoryItemRow } from '@/modules/inventory/types';

function formatCurrency(value: number): string {
  return '₹' + value.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * One row per physical item — the level at which this app tracks stock.
 * The barcode is the identity, so it leads and is monospaced for scanning
 * against a printed label.
 */
export function InventoryTable({
  items,
  isLoading,
}: {
  items: InventoryItemRow[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="data-table-wrapper">
        <div className="table-skeleton" aria-busy="true" aria-label="Loading inventory">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="table-skeleton__row" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state__icon" aria-hidden="true">▦</span>
        <h3 className="empty-state__title">No items match these filters</h3>
        <p className="empty-state__desc">
          Try clearing the search or switching status, or add stock from a product page.
        </p>
      </div>
    );
  }

  return (
    <div className="data-table-wrapper">
      <table className="data-table" id="inventory-table">
        <thead>
          <tr>
            <th scope="col">Barcode</th>
            <th scope="col">Product</th>
            <th scope="col">Size</th>
            <th scope="col">Category</th>
            <th scope="col">Status</th>
            <th scope="col">Purchased</th>
            <th scope="col" className="data-table__num">Age</th>
            <th scope="col" className="data-table__num">Cost</th>
            <th scope="col" className="data-table__num">Price</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="data-table__row">
              <td>
                <Link href={`/inventory/${item.id}`} className="data-table__link mono">
                  {item.barcode}
                </Link>
              </td>
              <td>
                <span className="data-table__primary">{item.productName}</span>
                <span className="data-table__secondary mono">{item.variantSku}</span>
              </td>
              <td>{item.size ?? <span className="data-table__muted">—</span>}</td>
              <td>{item.categoryName ?? <span className="data-table__muted">—</span>}</td>
              <td><StatusBadge status={item.status} /></td>
              <td>{formatDate(item.purchaseDate)}</td>
              <td className="data-table__num">
                <span className={item.ageDays > 90 ? 'age-pill age-pill--old' : 'age-pill'}>
                  {item.ageDays}d
                </span>
              </td>
              <td className="data-table__num">{formatCurrency(item.purchaseCostPrice)}</td>
              <td className="data-table__num">{formatCurrency(item.sellingPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
