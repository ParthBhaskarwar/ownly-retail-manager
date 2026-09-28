'use client';

import React, { useState } from 'react';
import { BarcodeScannerInput } from '@/modules/billing/components/BarcodeScannerInput';
import { BillingService } from '@/modules/billing/services/BillingService';
import { apiClient } from '@/lib/apiClient';

interface ExchangeableItem {
  id: string;
  productName: string;
  variantName: string;
  barcode: string;
  finalPrice: number | string;
  refundableAmount: number;
  eligibleForReturn: boolean;
}

interface ExchangeInvoice {
  invoice: { id: string; invoiceNumber: string };
  items: ExchangeableItem[];
}

interface ReplacementItem {
  inventoryItemId: string;
  barcode: string;
  productName: string;
  variantName: string;
  unitPrice: number | string;
}

interface ExchangeResult {
  exchangeNumber: string;
  replacementInvoiceNumber: string;
  returnedValue: number;
  replacementValue: number;
  differenceAmount: number;
  paymentStatus: string;
  creditNoteNumber: string | null;
}

export function ExchangeWorkflow() {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [invoiceData, setInvoiceData] = useState<ExchangeInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<ExchangeResult | null>(null);

  const [selectedReturnItemId, setSelectedReturnItemId] = useState<string | null>(null);
  const [returnCondition, setReturnCondition] = useState<string>('RESELLABLE');
  const [replacementItems, setReplacementItems] = useState<ReplacementItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'CREDIT_NOTE'>('CASH');

  const handleSearchInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNumber.trim()) return;

    setIsLoading(true);
    setError(null);
    setInvoiceData(null);
    setSuccessResult(null);
    setSelectedReturnItemId(null);
    setReplacementItems([]);

    try {
      setInvoiceData(
        await apiClient.get<ExchangeInvoice>(`/api/returns/eligible/${encodeURIComponent(invoiceNumber.trim())}`)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not search the invoice.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleScanReplacementBarcode = async (barcode: string) => {
    setError(null);
    try {
      const item = await BillingService.lookupBarcode(barcode);
      if (replacementItems.some((r) => r.barcode === item.barcode)) {
        setError(`Barcode ${barcode} is already in the replacement list.`);
        return;
      }
      setReplacementItems((prev) => [...prev, item]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Barcode lookup failed');
    }
  };

  const returnedItem = invoiceData?.items.find((i) => i.id === selectedReturnItemId);
  // Preview only — the server recomputes both sides (replacement prices and GST come from the database).
  const returnedValue = returnedItem ? Number(returnedItem.refundableAmount ?? returnedItem.finalPrice ?? 0) : 0;
  const replacementValue = replacementItems.reduce((sum, item) => sum + Number(item.unitPrice), 0);
  const priceDifference = replacementValue - returnedValue;

  const handleSubmitExchange = async () => {
    if (!invoiceData || !selectedReturnItemId) {
      setError('Select a returned item from the original invoice.');
      return;
    }
    if (replacementItems.length === 0) {
      setError('Scan at least one replacement product barcode.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await apiClient.post<ExchangeResult>('/api/exchanges', {
        originalInvoiceId: invoiceData.invoice.id,
        returnedItems: [{ invoiceItemId: selectedReturnItemId, condition: returnCondition }],
        replacementItems: replacementItems.map((r) => ({ inventoryItemId: r.inventoryItemId })),
        // A store-credit note can only be issued for a balance owed TO the customer.
        paymentMethod: priceDifference > 0 && paymentMethod === 'CREDIT_NOTE' ? 'CASH' : paymentMethod,
      });
      setSuccessResult(result);
      setInvoiceData(null);
      setReplacementItems([]);
      setSelectedReturnItemId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process exchange');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pos-container">
      {/* Search Panel */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--color-denim-tint)', color: 'var(--color-denim-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 'bold' }}>
            ⇄
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-ink)', margin: 0 }}>
              Product Exchange Workflow
            </h2>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
              1. Select original item to return → 2. Scan replacement product → 3. Settle price difference
            </span>
          </div>
        </div>

        <form onSubmit={handleSearchInvoice} style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <input
            type="text"
            className="form-input"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', height: '48px' }}
            placeholder="e.g. INV-20260827-0001"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || !invoiceNumber.trim()}
            className="btn btn-primary"
            style={{ height: '48px', paddingInline: 'var(--space-6)' }}
          >
            {isLoading ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                <span>Searching…</span>
              </>
            ) : (
              'Find Invoice'
            )}
          </button>
        </form>

        {error && (
          <div className="form-server-error" style={{ marginTop: 'var(--space-4)' }} role="alert">
            {error}
          </div>
        )}
      </div>

      {/* Success Result */}
      {successResult && (
        <div className="card" style={{ background: 'var(--color-paid-tint)', borderColor: 'var(--color-paid-border)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-8)' }}>
          <div className="pe-success-icon" style={{ width: '56px', height: '56px' }}>✓</div>
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', color: 'var(--color-paid)', margin: 0 }}>
              Exchange Completed Successfully
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)', marginTop: 'var(--space-2)' }}>
              Exchange Record: <strong style={{ fontFamily: 'var(--font-mono)' }}>{successResult.exchangeNumber}</strong>
            </p>
            {successResult.creditNoteNumber && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)', marginTop: '2px' }}>
                Store Credit Note: <strong style={{ fontFamily: 'var(--font-mono)' }}>{successResult.creditNoteNumber}</strong>
              </p>
            )}
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)', marginTop: '2px' }}>
              Replacement Invoice: <strong style={{ fontFamily: 'var(--font-mono)' }}>{successResult.replacementInvoiceNumber}</strong>
            </p>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid var(--color-paid-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
              <span>Returned Credit:</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{Number(successResult.returnedValue).toFixed(2)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
              <span>Replacement Total:</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{Number(successResult.replacementValue).toFixed(2)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-denim-dark)', borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              <span>Settlement:</span>
              <span>₹{Math.abs(Number(successResult.differenceAmount)).toFixed(2)} ({successResult.paymentStatus})</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { setSuccessResult(null); setInvoiceNumber(''); }}
            className="btn btn-primary"
          >
            Process Another Exchange
          </button>
        </div>
      )}

      {/* Main 2-Step Exchange Workspace */}
      {invoiceData && (
        <div className="exchange-grid">
          {/* Left: Step 1 - Return Item */}
          <div className="step-card">
            <div className="step-card__header">
              <span className="step-number">1</span>
              <h3 className="step-title">Select Item to Return</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: '320px', overflowY: 'auto' }}>
              {invoiceData.items.map((item) => {
                const isSelected = selectedReturnItemId === item.id;
                const canReturn = item.eligibleForReturn;

                return (
                  <div
                    key={item.id}
                    onClick={() => canReturn && setSelectedReturnItemId(item.id)}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      background: isSelected ? 'var(--color-denim-tint)' : 'var(--color-surface)',
                      border: isSelected ? '1.5px solid var(--color-denim)' : '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      cursor: canReturn ? 'pointer' : 'not-allowed',
                      opacity: !canReturn ? 0.5 : 1,
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-ink)', fontSize: 'var(--text-sm)' }}>
                          {item.productName}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', marginTop: '2px' }}>
                          Size: {item.variantName} • <code style={{ fontFamily: 'var(--font-mono)' }}>{item.barcode}</code>
                        </div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-bold)', color: 'var(--color-ink)' }}>
                        ₹{Number(item.refundableAmount ?? item.finalPrice ?? 0).toFixed(2)}
                      </div>
                    </div>
                    {isSelected && (
                      <span className="badge badge--denim badge--sm" style={{ marginTop: 'var(--space-2)' }}>✓ Selected for Return</span>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedReturnItemId && (
              <div className="form-field">
                <label className="form-label">Returned Item Condition</label>
                <select
                  className="form-select"
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value)}
                >
                  <option value="RESELLABLE">✅ Resellable — Return to Stock</option>
                  <option value="DAMAGED">🔴 Damaged — Move to Damaged Stock</option>
                  <option value="DEFECTIVE">⚠️ Defective</option>
                  <option value="OPENED_USED">📦 Opened / Used</option>
                </select>
              </div>
            )}
          </div>

          {/* Right: Step 2 - Scan Replacement */}
          <div className="step-card">
            <div className="step-card__header">
              <span className="step-number">2</span>
              <h3 className="step-title">Scan Replacement Product</h3>
            </div>

            <BarcodeScannerInput onBarcodeScanned={handleScanReplacementBarcode} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span className="form-section__title">Replacement Item(s)</span>
              {replacementItems.length === 0 ? (
                <div style={{ padding: 'var(--space-6)', border: '1.5px dashed var(--color-border)', borderRadius: 'var(--radius-md)', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                  Scan replacement barcode above to pair with return
                </div>
              ) : (
                replacementItems.map((r, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) var(--space-4)', background: 'var(--color-paper)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    <div>
                      <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-ink)', fontSize: 'var(--text-sm)' }}>{r.productName}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', fontFamily: 'var(--font-mono)' }}>{r.barcode} ({r.variantName})</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{Number(r.unitPrice).toFixed(2)}</strong>
                      <button
                        type="button"
                        onClick={() => setReplacementItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="cart-remove-btn"
                        title="Remove replacement"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Price Difference Settlement Box */}
            {selectedReturnItemId && replacementItems.length > 0 && (
              <div className="settlement-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                  <span>Returned Credit:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{returnedValue.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                  <span>Replacement Total:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{replacementValue.toFixed(2)}</strong>
                </div>

                <div className={`settlement-box__diff ${priceDifference > 0 ? 'settlement-box__diff--collect' : priceDifference < 0 ? 'settlement-box__diff--refund' : 'settlement-box__diff--even'}`}>
                  <span>
                    {priceDifference > 0 ? 'Extra Amount to Collect:' : priceDifference < 0 ? 'Refund Amount Due:' : 'Even Exchange (No Difference):'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>₹{Math.abs(priceDifference).toFixed(2)}</span>
                </div>

                {priceDifference !== 0 && (
                  <div className="form-field">
                    <label className="form-label">
                      {priceDifference > 0 ? 'Collect Difference Via:' : 'Refund Difference Via:'}
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' }}>
                      {(['CASH', 'UPI', 'CARD', 'CREDIT_NOTE'] as const)
                        .filter((m) => priceDifference < 0 || m !== 'CREDIT_NOTE')
                        .map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={`btn btn-sm ${paymentMethod === m ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setPaymentMethod(m)}
                        >
                          {m === 'CREDIT_NOTE' ? 'Store Credit' : m}
                        </button>
                        ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSubmitExchange}
                  disabled={isLoading}
                  className="btn btn-primary"
                  style={{ height: '48px', fontSize: 'var(--text-base)', marginTop: 'var(--space-2)' }}
                >
                  {isLoading ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      <span>Processing Exchange…</span>
                    </>
                  ) : (
                    '✓ Confirm & Complete Exchange'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
