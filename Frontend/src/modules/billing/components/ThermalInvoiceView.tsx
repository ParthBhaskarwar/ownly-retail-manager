'use client';

import React from 'react';
import { useStoreContext } from '@/context/StoreContext';

interface ThermalInvoiceProps {
  invoice: any;
  onPrint?: () => void;
  onClose?: () => void;
}

export function ThermalInvoiceView({ invoice }: ThermalInvoiceProps) {
  const { store } = useStoreContext();
  if (!invoice) return null;

  return (
    <>
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 0; }
          .thermal-receipt-container {
            width: 80mm !important;
            margin: 0 !important;
            padding: 4mm !important;
            border: none !important;
            box-shadow: none !important;
            page-break-after: auto;
          }
        }
      `}</style>
      <div className="thermal-receipt-container" style={{ width: '80mm', margin: '0 auto', padding: '16px', backgroundColor: 'white', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-raised)', color: '#000', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.4' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px dashed #000' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase' }}>{store?.name ?? 'Store'}</h2>
          {store?.address && <div style={{ fontSize: '10px', marginTop: '4px' }}>{store.address}</div>}
          {store?.gstNumber && <div style={{ fontSize: '10px' }}>GSTIN: {store.gstNumber}</div>}
          {store?.phone && <div style={{ fontSize: '10px' }}>Ph: {store.phone}</div>}
        </div>

        {/* Metadata */}
        <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px dashed #000', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Invoice No:</span>
            <span style={{ fontWeight: 'bold' }}>{invoice.invoice_number || invoice.invoiceNumber}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Date:</span>
            <span>{new Date(invoice.created_at || invoice.createdAt || Date.now()).toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Cashier:</span>
            <span>{invoice.cashier_name || 'Cashier'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Customer:</span>
            <span>{invoice.customer_name || invoice.customerName || 'Walk-in'}</span>
          </div>
        </div>

        {/* Items */}
        <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px dashed #000' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #000' }}>
                <th style={{ textAlign: 'left', paddingBottom: '4px', fontWeight: 'bold' }}>Item</th>
                <th style={{ textAlign: 'center', paddingBottom: '4px', fontWeight: 'bold' }}>Qty</th>
                <th style={{ textAlign: 'right', paddingBottom: '4px', fontWeight: 'bold' }}>Price</th>
                <th style={{ textAlign: 'right', paddingBottom: '4px', fontWeight: 'bold' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((item: any, idx: number) => (
                <tr key={idx} style={{ verticalAlign: 'top' }}>
                  <td style={{ paddingTop: '6px', paddingRight: '4px' }}>
                    <div style={{ fontWeight: 'bold' }}>{item.product_name || item.productName}</div>
                    <div style={{ fontSize: '9px', marginTop: '2px' }}>{item.variant_name || item.variantName}</div>
                  </td>
                  <td style={{ paddingTop: '6px', textAlign: 'center', fontWeight: 'bold' }}>{item.quantity}</td>
                  <td style={{ paddingTop: '6px', textAlign: 'right' }}>{parseFloat(item.unit_price || item.unitPrice).toFixed(2)}</td>
                  <td style={{ paddingTop: '6px', textAlign: 'right', fontWeight: 'bold' }}>{parseFloat(item.final_price || item.finalPrice).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px dashed #000', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Subtotal:</span>
            <span>{parseFloat(invoice.subtotal).toFixed(2)}</span>
          </div>
          {parseFloat(invoice.discount_amount || invoice.discountAmount || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Discount:</span>
              <span>-{parseFloat(invoice.discount_amount || invoice.discountAmount).toFixed(2)}</span>
            </div>
          )}
          {parseFloat(invoice.tax_amount || invoice.taxAmount || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Taxes:</span>
              <span>{parseFloat(invoice.tax_amount || invoice.taxAmount).toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #000', fontSize: '14px', fontWeight: 'bold' }}>
            <span>GRAND TOTAL:</span>
            <span>{parseFloat(invoice.grand_total || invoice.grandTotal).toFixed(2)}</span>
          </div>
        </div>

        {/* Payments */}
        <div style={{ marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px dashed #000', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Payment Method(s):</div>
          {(invoice.payments || []).map((p: any, idx: number) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{p.payment_method || p.paymentMethod}:</span>
              <span>{parseFloat(p.amount).toFixed(2)}</span>
            </div>
          ))}
          {parseFloat(invoice.change_given || invoice.changeGiven || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '2px' }}>
              <span>Change Returned:</span>
              <span>{parseFloat(invoice.change_given || invoice.changeGiven).toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontWeight: 'bold' }}>Thank you for shopping with us!</div>
          <div>Returns & Exchanges valid within 14 days with original bill receipt.</div>
        </div>
      </div>
    </>
  );
}
