'use client';

import React, { useState } from 'react';
import { getAuthHeaders } from '@/shared/utils/auth';
import { db } from '@/db/db';

export function ReturnWorkflow() {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any>(null);

  const [returnSelection, setReturnSelection] = useState<Record<string, { selected: boolean; condition: string; reason: string }>>({});
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'CREDIT_NOTE'>('CASH');

  const handleSearchInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNumber.trim()) return;

    setIsLoading(true);
    setError(null);
    setInvoiceData(null);
    setSuccessResult(null);

    const tryDexie = async () => {
      const inv = await db.invoices.where('invoiceNumber').equals(invoiceNumber.trim()).first();
      if (!inv) return null;
      const items = await db.invoiceItems.where('invoiceId').equals(inv.id).toArray();
      return {
        invoice: {
          ...inv,
          invoice_number: inv.invoiceNumber,
          grand_total: inv.grandTotal,
          customer_name: inv.customerName,
          created_at: inv.createdAt,
        },
        items: items.map((i: any) => ({
          ...i,
          product_name: i.productName,
          variant_name: i.variantName,
          final_price: i.finalPrice,
          eligibleForReturn: i.status === 'ACTIVE',
          isAlreadyReturned: i.status === 'RETURNED',
        })),
      };
    };

    try {
      const res = await fetch(`/api/returns/eligible/${encodeURIComponent(invoiceNumber.trim())}`, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        setInvoiceData(data);
        const initSel: Record<string, { selected: boolean; condition: string; reason: string }> = {};
        (data.items || []).forEach((item: any) => {
          if (item.eligibleForReturn) {
            initSel[item.id] = { selected: false, condition: 'RESELLABLE', reason: '' };
          }
        });
        setReturnSelection(initSel);
      } else {
        const offlineData = await tryDexie();
        if (offlineData) {
          setInvoiceData(offlineData);
          const initSel: Record<string, { selected: boolean; condition: string; reason: string }> = {};
          offlineData.items.forEach((item: any) => {
            if (item.eligibleForReturn) {
              initSel[item.id] = { selected: false, condition: 'RESELLABLE', reason: '' };
            }
          });
          setReturnSelection(initSel);
        } else {
          const errData = await res.json().catch(() => ({}));
          setError((errData as any).error || 'Invoice not found.');
        }
      }
    } catch {
      try {
        const offlineData = await tryDexie();
        if (offlineData) {
          setInvoiceData(offlineData);
          const initSel: Record<string, { selected: boolean; condition: string; reason: string }> = {};
          offlineData.items.forEach((item: any) => {
            if (item.eligibleForReturn) {
              initSel[item.id] = { selected: false, condition: 'RESELLABLE', reason: '' };
            }
          });
          setReturnSelection(initSel);
        } else {
          setError('Invoice not found. Please verify the invoice number.');
        }
      } catch {
        setError('Could not search invoice. Check your connection.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const selectedItemsList = Object.entries(returnSelection)
    .filter(([_, val]) => val.selected)
    .map(([id, val]) => {
      const item = invoiceData?.items?.find((i: any) => i.id === id);
      return {
        invoiceItemId: id,
        condition: val.condition,
        reason: val.reason,
        refundAmount: parseFloat(item?.final_price ?? item?.finalPrice ?? 0),
      };
    });

  const totalRefundAmount = selectedItemsList.reduce((sum, item) => sum + item.refundAmount, 0);

  const handleSubmitReturn = async () => {
    if (selectedItemsList.length === 0) {
      setError('Please select at least one item to return.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          originalInvoiceId: invoiceData.invoice.id,
          items: selectedItemsList,
          refundMethod,
          notes: 'Customer return processed via POS',
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setSuccessResult(result);
        setInvoiceData(null);
        setReturnSelection({});
      } else {
        const errData = await res.json().catch(() => ({}));
        setError((errData as any).error || 'Failed to process return.');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pos-container" style={{ maxWidth: '820px' }}>
      {/* Search Panel */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--color-denim-tint)', color: 'var(--color-denim-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 'bold' }}>
            ↩
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-ink)', margin: 0 }}>
              Process Customer Return
            </h2>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
              Enter original invoice number (e.g. INV-20260827-0001) to locate purchased items
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

      {/* Success Result Banner */}
      {successResult && (
        <div className="card" style={{ background: 'var(--color-paid-tint)', borderColor: 'var(--color-paid-border)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-8)' }}>
          <div className="pe-success-icon" style={{ width: '56px', height: '56px' }}>✓</div>
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', color: 'var(--color-paid)', margin: 0 }}>
              Return Processed Successfully
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-secondary)', marginTop: 'var(--space-2)' }}>
              Return Number: <strong style={{ fontFamily: 'var(--font-mono)' }}>{successResult.returnNumber}</strong>
            </p>
            <p style={{ fontSize: 'var(--text-lg)', color: 'var(--color-ink)', fontWeight: 'var(--font-bold)', marginTop: 'var(--space-1)' }}>
              Refund Amount: <span style={{ color: 'var(--color-paid)' }}>₹{(successResult.totalRefundAmount ?? 0).toFixed(2)}</span> via {successResult.refundMethod}
            </p>
          </div>

          {successResult.creditNote && (
            <div style={{ background: '#FFFFFF', border: '1.5px solid var(--color-paid-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', textAlign: 'left', width: '100%', maxWidth: '380px' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-ink-muted)', fontWeight: 'var(--font-bold)' }}>Store Credit Note Voucher</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-denim-dark)', margin: 'var(--space-1) 0' }}>{successResult.creditNote.credit_note_number}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>
                Value: ₹{parseFloat(successResult.creditNote.original_amount).toFixed(2)} • Expires: {successResult.creditNote.expiry_date}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => { setSuccessResult(null); setInvoiceNumber(''); }}
            className="btn btn-primary"
          >
            Process Another Return
          </button>
        </div>
      )}

      {/* Eligible Items Display */}
      {invoiceData && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Invoice Summary Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4)', background: 'var(--color-paper)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>Invoice:</span>
                <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-bold)', color: 'var(--color-ink)' }}>{invoiceData.invoice.invoice_number}</code>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', marginTop: '2px' }}>
                Customer: <strong>{invoiceData.invoice.customer_name || 'Walk-in Customer'}</strong>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>Original Total</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-ink)' }}>
                ₹{parseFloat(invoiceData.invoice.grand_total).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Items Checklist */}
          <div>
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-ink-secondary)', marginBottom: 'var(--space-3)' }}>
              Select Items to Return
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {invoiceData.items.map((item: any) => {
                const sel = returnSelection[item.id] || { selected: false, condition: 'RESELLABLE', reason: '' };
                const eligible = item.eligibleForReturn;
                const alreadyReturned = item.isAlreadyReturned || item.status === 'RETURNED';

                return (
                  <div
                    key={item.id}
                    style={{
                      padding: 'var(--space-4)',
                      background: sel.selected ? 'var(--color-denim-tint)' : 'var(--color-surface)',
                      border: sel.selected ? '1.5px solid var(--color-denim)' : '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      opacity: !eligible ? 0.6 : 1,
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        {eligible && (
                          <input
                            type="checkbox"
                            style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-denim)' }}
                            checked={sel.selected}
                            onChange={(e) =>
                              setReturnSelection((prev) => ({
                                ...prev,
                                [item.id]: { ...sel, selected: e.target.checked },
                              }))
                            }
                          />
                        )}
                        <div>
                          <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-ink)' }}>{item.product_name || item.productName}</div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', display: 'flex', gap: 'var(--space-2)', marginTop: '2px' }}>
                            <span>Size: <strong>{item.variant_name || item.variantName}</strong></span>
                            <span>• Barcode: <code>{item.barcode}</code></span>
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-bold)', color: 'var(--color-ink)' }}>
                          ₹{parseFloat(item.final_price ?? item.finalPrice ?? 0).toFixed(2)}
                        </div>
                        {alreadyReturned && (
                          <span className="badge badge--neutral badge--sm" style={{ marginTop: '4px' }}>Already Returned</span>
                        )}
                        {!eligible && !alreadyReturned && (
                          <span className="badge badge--error badge--sm" style={{ marginTop: '4px' }}>Ineligible</span>
                        )}
                      </div>
                    </div>

                    {sel.selected && (
                      <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px dashed var(--color-border-subtle)' }} className="form-grid">
                        <div className="form-field">
                          <label className="form-label">Item Condition *</label>
                          <select
                            className="form-select"
                            value={sel.condition}
                            onChange={(e) =>
                              setReturnSelection((prev) => ({
                                ...prev,
                                [item.id]: { ...sel, condition: e.target.value },
                              }))
                            }
                          >
                            <option value="RESELLABLE">✅ Resellable — Return to Stock</option>
                            <option value="DAMAGED">🔴 Damaged — Move to Damaged Stock</option>
                            <option value="DEFECTIVE">⚠️ Defective Item</option>
                            <option value="OPENED_USED">📦 Opened / Used</option>
                            <option value="OTHER">Other Reason</option>
                          </select>
                        </div>

                        <div className="form-field">
                          <label className="form-label">Reason / Notes</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="e.g. Size mismatch / Minor tear"
                            value={sel.reason}
                            onChange={(e) =>
                              setReturnSelection((prev) => ({
                                ...prev,
                                [item.id]: { ...sel, reason: e.target.value },
                              }))
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Refund Footer Card */}
          {selectedItemsList.length > 0 && (
            <div className="settlement-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-ink)' }}>
                  {selectedItemsList.length} Item(s) Selected for Return
                </span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>Total Refund Due</div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-return)' }}>
                    ₹{totalRefundAmount.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="form-field">
                <label className="form-label">Select Refund Method</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' }}>
                  {(['CASH', 'UPI', 'CARD', 'CREDIT_NOTE'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`btn btn-sm ${refundMethod === m ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setRefundMethod(m)}
                    >
                      {m === 'CREDIT_NOTE' ? 'Store Credit' : m === 'CASH' ? '💵 Cash' : m === 'UPI' ? '📱 UPI' : '💳 Card'}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleSubmitReturn}
                disabled={isLoading}
                className="btn btn-primary"
                style={{ height: '48px', fontSize: 'var(--text-base)', marginTop: 'var(--space-2)' }}
              >
                {isLoading ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" />
                    <span>Processing Return…</span>
                  </>
                ) : (
                  `✓ Confirm Return & Issue ${refundMethod === 'CREDIT_NOTE' ? 'Store Credit' : refundMethod} Refund`
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
