'use client';

import React from 'react';
import { useStoreContext } from '@/context/StoreContext';

interface A4InvoiceProps {
  invoice: any;
  onPrint?: () => void;
  onClose?: () => void;
}

export function A4InvoiceView({ invoice }: A4InvoiceProps) {
  const { store } = useStoreContext();
  if (!invoice) return null;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          .a4-receipt-container {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            page-break-after: auto;
          }
        }
      `}</style>
      <div className="a4-receipt-container" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', padding: '32px', backgroundColor: 'white', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-modal)', color: '#000', fontFamily: 'var(--font-sans)', fontSize: '14px', lineHeight: '1.5' }}>
        
        {/* Invoice Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '24px', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px' }}>TAX INVOICE</h1>
            <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>{store?.name ?? 'Store'}</div>
            {store?.address && <div style={{ fontSize: '12px' }}>{store.address}</div>}
            {store?.phone && <div style={{ fontSize: '12px' }}>Phone: {store.phone}</div>}
            {store?.gstNumber && <div style={{ fontSize: '12px', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>GSTIN: {store.gstNumber}</div>}
          </div>

          <div style={{ textAlign: 'right', fontSize: '12px' }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{invoice.invoice_number || invoice.invoiceNumber}</div>
            <div style={{ marginTop: '4px' }}>Date: <span style={{ fontWeight: 'bold' }}>{new Date(invoice.created_at || invoice.createdAt || Date.now()).toLocaleString()}</span></div>
            <div>Status: <span style={{ fontWeight: 'bold' }}>{invoice.status || 'COMPLETED'}</span></div>
          </div>
        </div>

        {/* Bill To & Cashier Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px', padding: '16px', border: '1px solid #000', borderRadius: '4px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Customer Information</h3>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{invoice.customer_name || invoice.customerName || 'Walk-in Customer'}</div>
            {(invoice.customer_phone || invoice.customerPhone) && (
              <div style={{ marginTop: '2px' }}>Phone: {invoice.customer_phone || invoice.customerPhone}</div>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            <h3 style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Store Details</h3>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Billed by: {invoice.cashier_name || 'Authorized Cashier'}</div>
            <div style={{ marginTop: '2px' }}>Currency: INR (₹)</div>
          </div>
        </div>

        {/* Item Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderTop: '1px solid #000', borderBottom: '1px solid #000' }}>
              <th style={{ padding: '12px 8px', textAlign: 'left' }}>#</th>
              <th style={{ padding: '12px 8px', textAlign: 'left' }}>Product Name & Variant</th>
              <th style={{ padding: '12px 8px', textAlign: 'left' }}>Barcode</th>
              <th style={{ padding: '12px 8px', textAlign: 'center' }}>Qty</th>
              <th style={{ padding: '12px 8px', textAlign: 'right' }}>Unit Price</th>
              <th style={{ padding: '12px 8px', textAlign: 'right' }}>Discount</th>
              <th style={{ padding: '12px 8px', textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items || []).map((item: any, idx: number) => (
              <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '12px 8px' }}>{idx + 1}</td>
                <td style={{ padding: '12px 8px' }}>
                  <div style={{ fontWeight: 'bold' }}>{item.product_name || item.productName}</div>
                  <div style={{ fontSize: '11px', marginTop: '2px' }}>{item.variant_name || item.variantName}</div>
                </td>
                <td style={{ padding: '12px 8px', fontFamily: 'var(--font-mono)' }}>{item.barcode}</td>
                <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 'bold' }}>{item.quantity}</td>
                <td style={{ padding: '12px 8px', textAlign: 'right' }}>{parseFloat(item.unit_price || item.unitPrice).toFixed(2)}</td>
                <td style={{ padding: '12px 8px', textAlign: 'right' }}>{parseFloat(item.discount_amount || item.discountAmount || 0).toFixed(2)}</td>
                <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 'bold' }}>{parseFloat(item.final_price || item.finalPrice).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals & Payments Section */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '32px' }}>
          {/* Payment Method Breakdown */}
          <div style={{ border: '1px solid #000', borderRadius: '4px', padding: '16px', fontSize: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Payment Details</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(invoice.payments || []).map((p: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                  <span style={{ fontWeight: 'bold' }}>{p.payment_method || p.paymentMethod}:</span>
                  <span>{parseFloat(p.amount).toFixed(2)} {p.transaction_reference ? `(${p.transaction_reference})` : ''}</span>
                </div>
              ))}
              {parseFloat(invoice.change_given || invoice.changeGiven || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', paddingTop: '4px' }}>
                  <span>Change Given:</span>
                  <span>{parseFloat(invoice.change_given || invoice.changeGiven).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Totals */}
          <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal:</span>
              <span style={{ fontWeight: 'bold' }}>{parseFloat(invoice.subtotal).toFixed(2)}</span>
            </div>
            {parseFloat(invoice.discount_amount || invoice.discountAmount || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Bill Discount:</span>
                <span style={{ fontWeight: 'bold' }}>-{parseFloat(invoice.discount_amount || invoice.discountAmount).toFixed(2)}</span>
              </div>
            )}
            {parseFloat(invoice.tax_amount || invoice.taxAmount || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Tax Amount:</span>
                <span style={{ fontWeight: 'bold' }}>{parseFloat(invoice.tax_amount || invoice.taxAmount).toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '900', borderTop: '2px solid #000', paddingTop: '8px', marginTop: '4px' }}>
              <span>GRAND TOTAL:</span>
              <span>{parseFloat(invoice.grand_total || invoice.grandTotal).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Terms & Footer */}
        <div style={{ borderTop: '1px solid #000', paddingTop: '16px', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Terms & Conditions:</div>
            <div>1. Returns & Exchanges accepted within 14 days with original receipt.</div>
            <div>2. Damaged or altered items are not eligible for standard return to stock.</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '32px' }}>Authorized Signatory</div>
            <div style={{ fontSize: '10px' }}>Thank you for your business!</div>
          </div>
        </div>
      </div>
    </>
  );
}
