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
    <div className="billing-modal-overlay">
      <div className="billing-modal-card payment">
        <div className="payment-modal-header">
          <div>
            <h3 className="payment-modal-title">Collect Payment</h3>
            <div className="payment-modal-due">
              <span className="payment-modal-due-label">Amount Due:</span>
              <span className="payment-modal-due-val">₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isSubmitting} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-ink-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: 'var(--radius-md)' }} aria-label="Close modal">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="payment-modal-body">
            {error && (
              <div style={{ padding: '12px', backgroundColor: 'var(--color-return-tint)', border: '1px solid var(--color-return-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-return)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }} role="alert">
                {error}
              </div>
            )}

            {/* Mode Switcher */}
            <div className="payment-toggle">
              <button
                type="button"
                className={`payment-toggle-btn ${mode === 'SINGLE' ? 'active' : ''}`}
                onClick={() => setMode('SINGLE')}
              >
                Single Payment
              </button>
              <button
                type="button"
                className={`payment-toggle-btn ${mode === 'MIXED' ? 'active' : ''}`}
                onClick={() => setMode('MIXED')}
              >
                Split / Mixed
              </button>
            </div>

            {mode === 'SINGLE' ? (
              <>
                {/* Method selector buttons */}
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'var(--color-ink)', marginBottom: '12px' }}>Select Payment Method</label>
                  <div className="payment-method-grid">
                    <button
                      type="button"
                      className={`payment-method-card ${selectedMethod === 'CASH' ? 'active' : ''}`}
                      onClick={() => setSelectedMethod('CASH')}
                    >
                      <div className="payment-method-icon">
                        <span className="material-symbols-outlined">payments</span>
                      </div>
                      <span className="payment-method-label">Cash</span>
                    </button>
                    <button
                      type="button"
                      className={`payment-method-card ${selectedMethod === 'UPI' ? 'active' : ''}`}
                      onClick={() => setSelectedMethod('UPI')}
                    >
                      <div className="payment-method-icon">
                        <span className="material-symbols-outlined">qr_code_scanner</span>
                      </div>
                      <span className="payment-method-label">UPI / QR</span>
                    </button>
                    <button
                      type="button"
                      className={`payment-method-card ${selectedMethod === 'CARD' ? 'active' : ''}`}
                      onClick={() => setSelectedMethod('CARD')}
                    >
                      <div className="payment-method-icon">
                        <span className="material-symbols-outlined">credit_card</span>
                      </div>
                      <span className="payment-method-label">Card</span>
                    </button>
                  </div>
                </div>

                {/* Amount input */}
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'var(--color-ink)', marginBottom: '8px' }} htmlFor="pay-amt-input">
                    Amount Received (₹) <span style={{ color: 'var(--color-return)' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ink-muted)', fontSize: 'var(--text-xl)', fontFamily: 'var(--font-mono)' }}>₹</span>
                    <input
                      id="pay-amt-input"
                      type="number"
                      step="any"
                      min={grandTotal}
                      style={{ width: '100%', padding: '16px 16px 16px 40px', fontSize: 'var(--text-2xl)', fontWeight: '900', fontFamily: 'var(--font-mono)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-paper)', color: 'var(--color-ink)', outline: 'none' }}
                      value={singleAmount}
                      onChange={(e) => setSingleAmount(parseFloat(e.target.value) || 0)}
                      autoFocus
                    />
                  </div>
                </div>

                {/* Optional Reference */}
                {selectedMethod !== 'CASH' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-ink-secondary)', marginBottom: '8px' }}>
                      {selectedMethod} Transaction ID / Reference (Optional)
                    </label>
                    <input
                      type="text"
                      style={{ width: '100%', padding: '10px 12px', fontSize: 'var(--text-sm)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-paper)', outline: 'none' }}
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
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-ink)', marginBottom: '8px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-ink-secondary)' }}>payments</span> Cash Portion
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ink-muted)', fontFamily: 'var(--font-mono)' }}>₹</span>
                    <input
                      type="number"
                      step="any"
                      style={{ width: '100%', padding: '10px 12px 10px 32px', fontSize: 'var(--text-base)', fontFamily: 'var(--font-mono)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-paper)', outline: 'none' }}
                      placeholder="0.00"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-ink)', marginBottom: '8px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-ink-secondary)' }}>qr_code_scanner</span> UPI Portion
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ink-muted)', fontFamily: 'var(--font-mono)' }}>₹</span>
                      <input
                        type="number"
                        step="any"
                        style={{ width: '100%', padding: '10px 12px 10px 32px', fontSize: 'var(--text-base)', fontFamily: 'var(--font-mono)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-paper)', outline: 'none' }}
                        placeholder="0.00"
                        value={upiAmount}
                        onChange={(e) => setUpiAmount(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-ink-secondary)', marginBottom: '8px' }}>UPI Reference</label>
                    <input
                      type="text"
                      style={{ width: '100%', padding: '10px 12px', fontSize: 'var(--text-sm)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-paper)', outline: 'none' }}
                      placeholder="UPI Ref ID"
                      value={upiRef}
                      onChange={(e) => setUpiRef(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-ink)', marginBottom: '8px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-ink-secondary)' }}>credit_card</span> Card Portion
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-ink-muted)', fontFamily: 'var(--font-mono)' }}>₹</span>
                      <input
                        type="number"
                        step="any"
                        style={{ width: '100%', padding: '10px 12px 10px 32px', fontSize: 'var(--text-base)', fontFamily: 'var(--font-mono)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-paper)', outline: 'none' }}
                        placeholder="0.00"
                        value={cardAmount}
                        onChange={(e) => setCardAmount(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-ink-secondary)', marginBottom: '8px' }}>Card Auth Ref</label>
                    <input
                      type="text"
                      style={{ width: '100%', padding: '10px 12px', fontSize: 'var(--text-sm)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-paper)', outline: 'none' }}
                      placeholder="Approval code"
                      value={cardRef}
                      onChange={(e) => setCardRef(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Payment Math Summary Box */}
            <div style={{ marginTop: '8px', padding: '16px', backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--color-ink-secondary)' }}>Total Collected:</span>
                <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-ink)' }}>₹{totalPaid.toFixed(2)}</strong>
              </div>
              {remainingDue > 0.01 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-caution)' }}>
                  <span>Balance Due:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{remainingDue.toFixed(2)}</strong>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-paid)' }}>
                  <span>Change to Return:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{changeDue.toFixed(2)}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="payment-modal-footer">
            <button type="button" onClick={onClose} disabled={isSubmitting} style={{ padding: '10px 16px', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-ink-secondary)', backgroundColor: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || remainingDue > 0.01}
              style={{ minWidth: '180px', padding: '10px 24px', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'white', backgroundColor: (isSubmitting || remainingDue > 0.01) ? 'var(--color-ink-muted)' : 'var(--color-accent)', border: 'none', borderRadius: 'var(--radius-md)', cursor: (isSubmitting || remainingDue > 0.01) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: (isSubmitting || remainingDue > 0.01) ? 'none' : 'var(--shadow-raised)' }}
            >
              {isSubmitting ? (
                <>
                  <span className="material-symbols-outlined" style={{ animation: 'spin 1s linear infinite' }}>autorenew</span>
                  <span>Processing…</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check_circle</span>
                  <span>Complete Sale</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
