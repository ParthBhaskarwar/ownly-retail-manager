'use client';

import React, { useState } from 'react';
import type { PaymentMethod, PaymentSplit } from '../types';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  grandTotal: number;
  onConfirmCheckout: (payments: PaymentSplit[]) => Promise<void>;
  isSubmitting?: boolean;
}

export function PaymentModal({
  isOpen,
  onClose,
  grandTotal,
  onConfirmCheckout,
  isSubmitting = false,
}: PaymentModalProps) {
  const [mode, setMode] = useState<'SINGLE' | 'MIXED'>('SINGLE');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CASH');
  const [singleAmount, setSingleAmount] = useState<number>(grandTotal);
  const [singleRef, setSingleRef] = useState<string>('');

  // Mixed payment state
  const [cashAmount, setCashAmount] = useState<string>('');
  const [upiAmount, setUpiAmount] = useState<string>('');
  const [upiRef, setUpiRef] = useState<string>('');
  const [cardAmount, setCardAmount] = useState<string>('');
  const [cardRef, setCardRef] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalPaid = mode === 'SINGLE'
    ? singleAmount
    : (parseFloat(cashAmount || '0') + parseFloat(upiAmount || '0') + parseFloat(cardAmount || '0'));

  const changeDue = Math.max(0, totalPaid - grandTotal);
  const remainingDue = Math.max(0, grandTotal - totalPaid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payments: PaymentSplit[] = [];

    if (mode === 'SINGLE') {
      if (singleAmount < grandTotal - 0.01) {
        setError(`Insufficient payment. Grand total due is ₹${grandTotal.toFixed(2)}.`);
        return;
      }
      payments.push({
        paymentMethod: selectedMethod,
        amount: singleAmount,
        transactionReference: singleRef.trim() || undefined,
      });
    } else {
      const cash = parseFloat(cashAmount || '0');
      const upi = parseFloat(upiAmount || '0');
      const card = parseFloat(cardAmount || '0');

      if (cash + upi + card < grandTotal - 0.01) {
        setError(`Total split payments (₹${(cash + upi + card).toFixed(2)}) is less than grand total due (₹${grandTotal.toFixed(2)}).`);
        return;
      }

      if (cash > 0) payments.push({ paymentMethod: 'CASH', amount: cash });
      if (upi > 0) payments.push({ paymentMethod: 'UPI', amount: upi, transactionReference: upiRef.trim() || undefined });
      if (card > 0) payments.push({ paymentMethod: 'CARD', amount: card, transactionReference: cardRef.trim() || undefined });
    }

    try {
      await onConfirmCheckout(payments);
    } catch (err: any) {
      setError(err.message || 'Checkout could not be completed.');
    }
  };

  return (
    <div className="pos-modal-overlay">
      <div className="pos-modal">
        <div className="pos-modal__header">
          <div>
            <h3 className="pos-modal__title">Collect Payment</h3>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
              Amount Due: <strong style={{ color: 'var(--color-denim-dark)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>₹{grandTotal.toFixed(2)}</strong>
            </span>
          </div>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="modal-close" aria-label="Close modal">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="pos-modal__body">
            {error && (
              <div className="form-server-error" role="alert">
                {error}
              </div>
            )}

            {/* Mode Switcher */}
            <div className="segmented-control">
              <button
                type="button"
                className={`segmented-control__btn ${mode === 'SINGLE' ? 'segmented-control__btn--active' : ''}`}
                onClick={() => setMode('SINGLE')}
              >
                Single Payment
              </button>
              <button
                type="button"
                className={`segmented-control__btn ${mode === 'MIXED' ? 'segmented-control__btn--active' : ''}`}
                onClick={() => setMode('MIXED')}
              >
                Split / Mixed Payment
              </button>
            </div>

            {mode === 'SINGLE' ? (
              <>
                {/* Method selector buttons */}
                <div className="form-field">
                  <label className="form-label">Select Payment Method</label>
                  <div className="payment-method-grid">
                    <button
                      type="button"
                      className={`payment-method-btn ${selectedMethod === 'CASH' ? 'payment-method-btn--selected' : ''}`}
                      onClick={() => setSelectedMethod('CASH')}
                    >
                      <span className="payment-method-btn__icon">💵</span>
                      <span className="payment-method-btn__label">Cash</span>
                    </button>
                    <button
                      type="button"
                      className={`payment-method-btn ${selectedMethod === 'UPI' ? 'payment-method-btn--selected' : ''}`}
                      onClick={() => setSelectedMethod('UPI')}
                    >
                      <span className="payment-method-btn__icon">📱</span>
                      <span className="payment-method-btn__label">UPI / QR</span>
                    </button>
                    <button
                      type="button"
                      className={`payment-method-btn ${selectedMethod === 'CARD' ? 'payment-method-btn--selected' : ''}`}
                      onClick={() => setSelectedMethod('CARD')}
                    >
                      <span className="payment-method-btn__icon">💳</span>
                      <span className="payment-method-btn__label">Card</span>
                    </button>
                  </div>
                </div>

                {/* Amount input */}
                <div className="form-field">
                  <label className="form-label" htmlFor="pay-amt-input">
                    Amount Received (₹) <span className="form-required">*</span>
                  </label>
                  <div className="pe-input-prefix-wrap">
                    <span className="pe-input-prefix">₹</span>
                    <input
                      id="pay-amt-input"
                      type="number"
                      step="any"
                      min={grandTotal}
                      className="form-input pe-input-with-prefix"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)' }}
                      value={singleAmount}
                      onChange={(e) => setSingleAmount(parseFloat(e.target.value) || 0)}
                      autoFocus
                    />
                  </div>
                </div>

                {/* Optional Reference */}
                {selectedMethod !== 'CASH' && (
                  <div className="form-field">
                    <label className="form-label">
                      {selectedMethod} Transaction ID / Reference (Optional)
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
                      placeholder="e.g. UPI-TXN-984210"
                      value={singleRef}
                      onChange={(e) => setSingleRef(e.target.value)}
                    />
                  </div>
                )}
              </>
            ) : (
              /* Mixed / Split Payments */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="form-field">
                  <label className="form-label">💵 Cash Portion (₹)</label>
                  <div className="pe-input-prefix-wrap">
                    <span className="pe-input-prefix">₹</span>
                    <input
                      type="number"
                      step="any"
                      className="form-input pe-input-with-prefix"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      placeholder="0.00"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-field">
                    <label className="form-label">📱 UPI Portion (₹)</label>
                    <div className="pe-input-prefix-wrap">
                      <span className="pe-input-prefix">₹</span>
                      <input
                        type="number"
                        step="any"
                        className="form-input pe-input-with-prefix"
                        style={{ fontFamily: 'var(--font-mono)' }}
                        placeholder="0.00"
                        value={upiAmount}
                        onChange={(e) => setUpiAmount(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-field">
                    <label className="form-label">UPI Reference</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="UPI Ref ID"
                      value={upiRef}
                      onChange={(e) => setUpiRef(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-field">
                    <label className="form-label">💳 Card Portion (₹)</label>
                    <div className="pe-input-prefix-wrap">
                      <span className="pe-input-prefix">₹</span>
                      <input
                        type="number"
                        step="any"
                        className="form-input pe-input-with-prefix"
                        style={{ fontFamily: 'var(--font-mono)' }}
                        placeholder="0.00"
                        value={cardAmount}
                        onChange={(e) => setCardAmount(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-field">
                    <label className="form-label">Card Auth Ref</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Approval code"
                      value={cardRef}
                      onChange={(e) => setCardRef(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Payment Math Summary Box */}
            <div className="payment-math-box">
              <div className="payment-math-box__row">
                <span>Total Collected:</span>
                <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-ink)' }}>₹{totalPaid.toFixed(2)}</strong>
              </div>
              {remainingDue > 0.01 ? (
                <div className="payment-math-box__row payment-math-box__due">
                  <span>Balance Due:</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>₹{remainingDue.toFixed(2)}</span>
                </div>
              ) : (
                <div className="payment-math-box__row payment-math-box__change">
                  <span>Change to Return:</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>₹{changeDue.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="pos-modal__footer">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || remainingDue > 0.01}
              className="btn btn-primary"
              style={{ minWidth: '180px' }}
            >
              {isSubmitting ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>Processing…</span>
                </>
              ) : (
                '✓ Complete Sale & Print'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
