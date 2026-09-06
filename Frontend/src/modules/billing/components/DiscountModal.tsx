'use client';

import React, { useState } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { evaluatePermission } from '@/config/permissions';
import type { Role } from '@/modules/account/types';
import type { DiscountPolicy } from '../types';

interface DiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  currentDiscount: DiscountPolicy | null;
  onApplyDiscount: (discount: DiscountPolicy) => void;
  onRemoveDiscount: () => void;
}

export function DiscountModal({
  isOpen,
  onClose,
  subtotal,
  currentDiscount,
  onApplyDiscount,
  onRemoveDiscount,
}: DiscountModalProps) {
  const { user } = useAuthContext();
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>(currentDiscount?.type || 'PERCENTAGE');
  const [discountValue, setDiscountValue] = useState<string>(currentDiscount?.value.toString() || '');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const role = (user?.role as Role) || 'CASHIER';
  const hasUnlimitedPermission = evaluatePermission(role, 'billing:discount:unlimited');

  // Cashier limits: 10% or ₹500
  const CASHIER_MAX_PERCENTAGE = 10;
  const CASHIER_MAX_FIXED = 500;

  const handlePresetClick = (type: 'PERCENTAGE' | 'FIXED', val: number) => {
    setDiscountType(type);
    setDiscountValue(val.toString());
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) {
      setError('Enter a valid discount value greater than 0.');
      return;
    }

    let calculatedAmount = 0;
    if (discountType === 'PERCENTAGE') {
      if (val > 100) {
        setError('Discount percentage cannot exceed 100%.');
        return;
      }
      if (!hasUnlimitedPermission && val > CASHIER_MAX_PERCENTAGE) {
        setError(`Cashier policy limit: Maximum allowed discount is ${CASHIER_MAX_PERCENTAGE}%. Manager permission required for higher discount.`);
        return;
      }
      calculatedAmount = (subtotal * val) / 100;
    } else {
      if (val > subtotal) {
        setError(`Fixed discount cannot exceed the cart subtotal (₹${subtotal.toFixed(2)}).`);
        return;
      }
      if (!hasUnlimitedPermission && val > CASHIER_MAX_FIXED) {
        setError(`Cashier policy limit: Maximum allowed fixed discount is ₹${CASHIER_MAX_FIXED}. Manager permission required for higher discount.`);
        return;
      }
      calculatedAmount = val;
    }

    onApplyDiscount({
      type: discountType,
      value: val,
      amount: calculatedAmount,
      appliedBy: user?.name || 'Cashier',
    });
    onClose();
  };

  const currentValNum = parseFloat(discountValue) || 0;
  const previewDiscount = discountType === 'PERCENTAGE'
    ? (subtotal * currentValNum) / 100
    : currentValNum;
  const previewGrandTotal = Math.max(0, subtotal - previewDiscount);

  return (
    <div className="pos-modal-overlay">
      <div className="pos-modal">
        <div className="pos-modal__header">
          <h3 className="pos-modal__title">Apply Bill Discount</h3>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Close modal">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="pos-modal__body">
            {error && (
              <div className="form-server-error" role="alert">
                <strong>Policy Alert:</strong> {error}
              </div>
            )}

            {/* Subtotal info banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', background: 'var(--color-paper)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)' }}>Cart Subtotal:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-bold)', color: 'var(--color-ink)' }}>₹{subtotal.toFixed(2)}</span>
            </div>

            {/* Type selector */}
            <div className="form-field">
              <label className="form-label">Discount Method</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-control__btn ${discountType === 'PERCENTAGE' ? 'segmented-control__btn--active' : ''}`}
                  onClick={() => setDiscountType('PERCENTAGE')}
                >
                  Percentage (%)
                </button>
                <button
                  type="button"
                  className={`segmented-control__btn ${discountType === 'FIXED' ? 'segmented-control__btn--active' : ''}`}
                  onClick={() => setDiscountType('FIXED')}
                >
                  Fixed Rupee Amount (₹)
                </button>
              </div>
            </div>

            {/* Quick preset chips */}
            <div className="form-field">
              <label className="form-label">Quick Presets</label>
              <div className="discount-chips">
                {discountType === 'PERCENTAGE' ? (
                  <>
                    <button type="button" className={`discount-chip ${discountValue === '5' ? 'discount-chip--active' : ''}`} onClick={() => handlePresetClick('PERCENTAGE', 5)}>5% OFF</button>
                    <button type="button" className={`discount-chip ${discountValue === '10' ? 'discount-chip--active' : ''}`} onClick={() => handlePresetClick('PERCENTAGE', 10)}>10% OFF</button>
                    {hasUnlimitedPermission && (
                      <>
                        <button type="button" className={`discount-chip ${discountValue === '15' ? 'discount-chip--active' : ''}`} onClick={() => handlePresetClick('PERCENTAGE', 15)}>15% OFF</button>
                        <button type="button" className={`discount-chip ${discountValue === '20' ? 'discount-chip--active' : ''}`} onClick={() => handlePresetClick('PERCENTAGE', 20)}>20% OFF</button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <button type="button" className={`discount-chip ${discountValue === '50' ? 'discount-chip--active' : ''}`} onClick={() => handlePresetClick('FIXED', 50)}>₹50 OFF</button>
                    <button type="button" className={`discount-chip ${discountValue === '100' ? 'discount-chip--active' : ''}`} onClick={() => handlePresetClick('FIXED', 100)}>₹100 OFF</button>
                    <button type="button" className={`discount-chip ${discountValue === '200' ? 'discount-chip--active' : ''}`} onClick={() => handlePresetClick('FIXED', 200)}>₹200 OFF</button>
                    {hasUnlimitedPermission && (
                      <button type="button" className={`discount-chip ${discountValue === '500' ? 'discount-chip--active' : ''}`} onClick={() => handlePresetClick('FIXED', 500)}>₹500 OFF</button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Value Input */}
            <div className="form-field">
              <label className="form-label" htmlFor="discount-input-val">
                Discount Value {discountType === 'PERCENTAGE' ? '(%)' : '(₹)'}
              </label>
              <div className="pe-input-prefix-wrap">
                <span className="pe-input-prefix">{discountType === 'PERCENTAGE' ? '%' : '₹'}</span>
                <input
                  id="discount-input-val"
                  type="number"
                  step="any"
                  min="0"
                  className="form-input pe-input-with-prefix"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}
                  placeholder={discountType === 'PERCENTAGE' ? '10' : '100'}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  autoFocus
                />
              </div>
              {!hasUnlimitedPermission && (
                <span className="form-hint">
                  Policy rule: Cashiers can apply up to {CASHIER_MAX_PERCENTAGE}% or ₹{CASHIER_MAX_FIXED}.
                </span>
              )}
            </div>

            {/* Live Calculation Preview */}
            {currentValNum > 0 && (
              <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-paid-tint)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-paid-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-paid)' }}>
                  You Save: <strong>-₹{previewDiscount.toFixed(2)}</strong>
                </span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink)' }}>
                  New Total: <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{previewGrandTotal.toFixed(2)}</strong>
                </span>
              </div>
            )}
          </div>

          <div className="pos-modal__footer">
            {currentDiscount && (
              <button
                type="button"
                onClick={() => {
                  onRemoveDiscount();
                  onClose();
                }}
                className="btn btn-danger"
              >
                Remove Discount
              </button>
            )}
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              ✓ Apply to Bill
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
