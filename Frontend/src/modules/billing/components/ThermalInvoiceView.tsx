'use client';

import React from 'react';
import { useStoreContext } from '@/context/StoreContext';

interface ThermalInvoiceProps {
  invoice: any;
  onPrint?: () => void;
  onClose?: () => void;
}

export function ThermalInvoiceView({ invoice, onPrint, onClose }: ThermalInvoiceProps) {
  const { store } = useStoreContext();
  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="thermal-invoice-wrapper">
      {/* Screen action bar (hidden during print) */}
      <div className="print:hidden flex justify-between items-center max-w-sm mx-auto mb-4 bg-surface p-3 rounded-xl border border-border">
        <span className="font-bold text-sm text-foreground">Thermal Receipt (80mm)</span>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-hover flex items-center gap-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-gray-200 dark:bg-gray-800 text-foreground text-xs font-semibold rounded-lg"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Printable Receipt Container */}
      <div className="thermal-receipt bg-white text-black font-mono text-xs p-4 max-w-[80mm] mx-auto border border-gray-300 shadow-md print:shadow-none print:border-none print:p-0 print:m-0">
        {/* Header */}
        <div className="text-center mb-3 pb-2 border-b border-dashed border-black">
          <h2 className="text-base font-bold uppercase tracking-wider">{store?.name ?? 'Store'}</h2>
          {store?.address && <p className="text-[10px]">{store.address}</p>}
          {store?.gstNumber && <p className="text-[10px]">GSTIN: {store.gstNumber}</p>}
          {store?.phone && <p className="text-[10px]">Ph: {store.phone}</p>}
        </div>

        {/* Invoice Metadata */}
        <div className="mb-2 text-[10px] space-y-0.5 border-b border-dashed border-black pb-2">
          <div className="flex justify-between">
            <span>Invoice No:</span>
            <span className="font-bold">{invoice.invoice_number || invoice.invoiceNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>{new Date(invoice.created_at || invoice.createdAt || Date.now()).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Cashier:</span>
            <span>{invoice.cashier_name || 'Cashier'}</span>
          </div>
          <div className="flex justify-between">
            <span>Customer:</span>
            <span>{invoice.customer_name || invoice.customerName || 'Walk-in Customer'}</span>
          </div>
        </div>

        {/* Item Table */}
        <table className="w-full text-left text-[10px] mb-2 border-b border-dashed border-black pb-2">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="pb-1">Item</th>
              <th className="pb-1 text-center">Qty</th>
              <th className="pb-1 text-right">Price</th>
              <th className="pb-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items || []).map((item: any, idx: number) => (
              <tr key={idx} className="align-top">
                <td className="py-1 pr-1">
                  <div className="font-bold">{item.product_name || item.productName}</div>
                  <div className="text-[9px] text-gray-600">{item.variant_name || item.variantName}</div>
                </td>
                <td className="py-1 text-center font-bold">{item.quantity}</td>
                <td className="py-1 text-right">₹{parseFloat(item.unit_price || item.unitPrice).toFixed(2)}</td>
                <td className="py-1 text-right font-bold">₹{parseFloat(item.final_price || item.finalPrice).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals Summary */}
        <div className="text-[10px] space-y-1 border-b border-dashed border-black pb-2 mb-2">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>₹{parseFloat(invoice.subtotal).toFixed(2)}</span>
          </div>
          {parseFloat(invoice.discount_amount || invoice.discountAmount || 0) > 0 && (
            <div className="flex justify-between">
              <span>Discount:</span>
              <span>-₹{parseFloat(invoice.discount_amount || invoice.discountAmount).toFixed(2)}</span>
            </div>
          )}
          {parseFloat(invoice.tax_amount || invoice.taxAmount || 0) > 0 && (
            <div className="flex justify-between">
              <span>Taxes:</span>
              <span>₹{parseFloat(invoice.tax_amount || invoice.taxAmount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs font-bold pt-1 border-t border-black">
            <span>GRAND TOTAL:</span>
            <span>₹{parseFloat(invoice.grand_total || invoice.grandTotal).toFixed(2)}</span>
          </div>
        </div>

        {/* Payments Breakdown */}
        <div className="text-[10px] space-y-0.5 border-b border-dashed border-black pb-2 mb-3">
          <div className="font-bold mb-0.5">Payment Method(s):</div>
          {(invoice.payments || []).map((p: any, idx: number) => (
            <div key={idx} className="flex justify-between">
              <span>{p.payment_method || p.paymentMethod}:</span>
              <span>₹{parseFloat(p.amount).toFixed(2)}</span>
            </div>
          ))}
          {parseFloat(invoice.change_given || invoice.changeGiven || 0) > 0 && (
            <div className="flex justify-between text-green-700 font-bold pt-0.5">
              <span>Change Returned:</span>
              <span>₹{parseFloat(invoice.change_given || invoice.changeGiven).toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-[9px] text-gray-700 space-y-1">
          <p className="font-bold">Thank you for shopping with us!</p>
          <p>Returns & Exchanges valid within 14 days with original bill receipt.</p>
        </div>
      </div>
    </div>
  );
}
