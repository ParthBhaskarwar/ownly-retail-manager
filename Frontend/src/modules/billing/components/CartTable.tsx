'use client';

import React from 'react';
import type { CartItem } from '../types';

interface CartTableProps {
  items: CartItem[];
  onRemoveItem: (index: number) => void;
  onUpdateLineDiscount: (index: number, discountAmount: number) => void;
}

export function CartTable({ items, onRemoveItem, onUpdateLineDiscount }: CartTableProps) {
  if (items.length === 0) {
    return (
      <div className="cart-panel">
        <div className="cart-empty">
          <div className="cart-empty__icon" aria-hidden="true">🛒</div>
          <h3 className="cart-empty__text">Cart is Empty</h3>
          <p className="cart-empty__hint">
            Scan a barcode or use manual entry above to add items to this transaction.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-panel">
      <div className="cart-panel__header">
        <span className="cart-panel__title">Scanned Cart Items</span>
        <span className="badge badge--denim">{items.length} {items.length === 1 ? 'Item' : 'Items'}</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="cart-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th>Product &amp; Variant</th>
              <th>Barcode</th>
              <th style={{ textAlign: 'right' }}>Unit Price</th>
              <th style={{ textAlign: 'right', width: '110px' }}>Line Discount</th>
              <th style={{ textAlign: 'right' }}>Final Price</th>
              <th style={{ width: '50px', textAlign: 'center' }}>Remove</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={`${item.barcode}-${idx}`}>
                <td style={{ color: 'var(--color-ink-muted)', fontFamily: 'var(--font-mono)' }}>{idx + 1}</td>
                <td>
                  <div className="cart-item-title">{item.productName}</div>
                  <div className="cart-item-meta">
                    <span className="badge badge--neutral badge--sm">{item.variantName}</span>
                    <span>SKU: <code>{item.sku}</code></span>
                  </div>
                </td>
                <td>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', background: 'var(--color-paper)', padding: '2px 6px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--color-border)' }}>
                    {item.barcode}
                  </code>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-semibold)' }}>
                  ₹{item.unitPrice.toFixed(2)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '8px', fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>₹</span>
                    <input
                      type="number"
                      min="0"
                      max={item.unitPrice}
                      step="1"
                      className="form-input"
                      style={{ width: '90px', height: '34px', paddingLeft: '20px', paddingRight: '6px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
                      value={item.discountAmount || ''}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                        onUpdateLineDiscount(idx, val);
                      }}
                      placeholder="0.00"
                    />
                  </div>
                </td>
                <td style={{ textAlign: 'right' }} className="cart-price">
                  ₹{item.finalPrice.toFixed(2)}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(idx)}
                    className="cart-remove-btn"
                    title="Remove item from cart"
                    aria-label="Remove item"
                  >
                    &times;
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
