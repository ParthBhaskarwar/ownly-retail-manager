'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ThermalInvoiceView } from '@/modules/billing/components/ThermalInvoiceView';
import { A4InvoiceView } from '@/modules/billing/components/A4InvoiceView';
import { db } from '@/db/db';
import { getAuthHeaders } from '@/shared/utils/auth';

const STATUS_BADGES: Record<string, string> = {
  COMPLETED: 'badge--success',
  PARTIALLY_RETURNED: 'badge--warning',
  FULLY_RETURNED: 'badge--neutral',
  EXCHANGED: 'badge--denim',
  CANCELLED: 'badge--error',
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [printFormat, setPrintFormat] = useState<'THERMAL' | 'A4'>('THERMAL');
  const [statusFilter, setStatusFilter] = useState('');
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('query', searchQuery);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/billing/invoices?${params.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        setInvoices(data);
        setIsOfflineMode(false);
      } else {
        throw new Error('API error');
      }
    } catch {
      // Fallback to Dexie IndexedDB
      try {
        let results = await db.invoices.toArray();
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          results = results.filter(
            (inv) =>
              inv.invoiceNumber?.toLowerCase().includes(q) ||
              inv.customerName?.toLowerCase().includes(q) ||
              inv.customerPhone?.includes(q)
          );
        }
        if (statusFilter) {
          results = results.filter((inv) => inv.status === statusFilter);
        }
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setInvoices(results.map((inv) => ({
          ...inv,
          invoice_number: inv.invoiceNumber,
          created_at: inv.createdAt,
          customer_name: inv.customerName,
          customer_phone: inv.customerPhone,
          grand_total: inv.grandTotal,
        })));
        setIsOfflineMode(true);
      } catch (dbErr) {
        console.error('[INVOICES_DEXIE_FALLBACK_ERROR]', dbErr);
      }
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleSelectInvoice = async (invoiceId: string) => {
    try {
      const res = await fetch(`/api/billing/invoices/${invoiceId}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedInvoice(data);
        return;
      }
    } catch {}

    // Offline fallback
    const inv = await db.invoices.get(invoiceId);
    if (inv) {
      const items = await db.invoiceItems.where('invoiceId').equals(invoiceId).toArray();
      const payments = await db.payments.where('invoiceId').equals(invoiceId).toArray();
      setSelectedInvoice({
        ...inv,
        invoice_number: inv.invoiceNumber,
        grand_total: inv.grandTotal,
        created_at: inv.createdAt,
        customer_name: inv.customerName,
        items,
        payments,
      });
    }
  };

  return (
    <div className="pos-container">
      {/* Header */}
      <div className="pos-header">
        <div className="pos-header__titles">
          <h1 className="pos-header__title">Invoices &amp; Receipts</h1>
          <span className="pos-header__subtitle">
            Search, view line-items, and reprint past sales invoices
            {isOfflineMode && ' • (Offline Dexie Mode Active)'}
          </span>
        </div>

        {/* Filter Toolbar */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="form-select"
            style={{ width: 'auto', minWidth: '160px', height: '40px' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="PARTIALLY_RETURNED">Partially Returned</option>
            <option value="FULLY_RETURNED">Fully Returned</option>
            <option value="EXCHANGED">Exchanged</option>
          </select>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchInvoices();
            }}
            style={{ display: 'flex', gap: 'var(--space-2)' }}
          >
            <input
              type="text"
              className="form-input"
              style={{ width: '220px', height: '40px' }}
              placeholder="Search invoice # or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm" style={{ height: '40px' }}>
              Search
            </button>
          </form>
        </div>
      </div>

      {/* Invoice List Panel */}
      <div className="cart-panel">
        <div className="cart-panel__header">
          <span className="cart-panel__title">Sales Invoices History</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span className="badge badge--denim badge--sm">{invoices.length} Invoices</span>
            <button type="button" onClick={fetchInvoices} className="link-btn" style={{ fontSize: 'var(--text-xs)' }}>
              ↺ Refresh
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: 'var(--space-12) var(--space-6)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span className="btn-spinner" style={{ width: '28px', height: '28px', color: 'var(--color-denim)' }} />
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)' }}>Loading invoices history…</span>
          </div>
        ) : invoices.length === 0 ? (
          <div className="cart-empty">
            <div className="cart-empty__icon">📄</div>
            <h3 className="cart-empty__text">No Invoices Found</h3>
            <p className="cart-empty__hint">
              {searchQuery || statusFilter
                ? 'Try adjusting your search criteria or filter options.'
                : 'Completed sales from POS Billing will appear here.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cart-table">
              <thead>
                <tr>
                  <th>Invoice Number</th>
                  <th>Date &amp; Time</th>
                  <th>Customer</th>
                  <th style={{ textAlign: 'right' }}>Grand Total</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-bold)', color: 'var(--color-ink)', background: 'var(--color-paper)', padding: '3px 8px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--color-border)' }}>
                        {inv.invoice_number || inv.invoiceNumber}
                      </code>
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                      {new Date(inv.created_at || inv.createdAt).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-ink)' }}>
                        {inv.customer_name || inv.customerName || 'Walk-in Customer'}
                      </div>
                      {(inv.customer_phone || inv.customerPhone) && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', fontFamily: 'var(--font-mono)' }}>
                          {inv.customer_phone || inv.customerPhone}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-bold)', color: 'var(--color-ink)', fontSize: 'var(--text-base)' }}>
                      ₹{parseFloat(inv.grand_total ?? inv.grandTotal ?? 0).toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${STATUS_BADGES[inv.status] || 'badge--neutral'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleSelectInvoice(inv.id)}
                        className="btn btn-secondary btn-sm"
                      >
                        📄 View / Reprint
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice View / Print Modal */}
      {selectedInvoice && (
        <div className="pos-modal-overlay">
          <div className="pos-modal pos-modal--wide">
            <div className="pos-modal__header">
              <h3 className="pos-modal__title">
                Invoice #{selectedInvoice.invoice_number || selectedInvoice.invoiceNumber}
              </h3>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${printFormat === 'THERMAL' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setPrintFormat('THERMAL')}
                >
                  🧾 80mm Thermal
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${printFormat === 'A4' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setPrintFormat('A4')}
                >
                  📄 A4 Invoice
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  className="modal-close"
                  aria-label="Close modal"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="pos-modal__body">
              {printFormat === 'THERMAL' ? (
                <ThermalInvoiceView invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
              ) : (
                <A4InvoiceView invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
              )}
            </div>

            <div className="pos-modal__footer">
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
