'use client';

import React from 'react';
import { useStoreContext } from '@/context/StoreContext';

interface A4InvoiceProps {
  invoice: any;
  onPrint?: () => void;
  onClose?: () => void;
}

export function A4InvoiceView({ invoice, onPrint, onClose }: A4InvoiceProps) {
  const { store } = useStoreContext();
  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="a4-invoice-wrapper">
      {/* Screen action bar */}
      <div className="print:hidden flex justify-between items-center max-w-4xl mx-auto mb-4 bg-surface p-4 rounded-xl border border-border">
        <span className="font-bold text-base text-foreground">Tax Invoice (A4 Standard Format)</span>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-hover flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print A4 Invoice</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-foreground text-sm font-semibold rounded-lg"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Printable A4 Container */}
      <div className="a4-container bg-white text-black p-8 max-w-4xl mx-auto border border-gray-300 shadow-xl print:shadow-none print:border-none print:p-0">
        {/* Invoice Header */}
        <div className="flex justify-between items-start border-b-2 border-primary pb-6 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold uppercase text-primary tracking-wide">TAX INVOICE</h1>
            <p className="text-sm font-bold text-gray-800 mt-1 uppercase">{store?.name ?? 'Store'}</p>
            {store?.address && <p className="text-xs text-gray-600">{store.address}</p>}
            {store?.phone && <p className="text-xs text-gray-600">Phone: {store.phone}</p>}
            {store?.gstNumber && <p className="text-xs text-gray-600 font-mono mt-1">GSTIN: {store.gstNumber}</p>}
          </div>

          <div className="text-right text-xs space-y-1">
            <div className="text-base font-bold text-gray-900">{invoice.invoice_number || invoice.invoiceNumber}</div>
            <div className="text-gray-600">Date: <span className="font-semibold text-gray-900">{new Date(invoice.created_at || invoice.createdAt || Date.now()).toLocaleString()}</span></div>
            <div className="text-gray-600">Status: <span className="font-bold text-green-700">{invoice.status || 'COMPLETED'}</span></div>
          </div>
        </div>

        {/* Bill To & Cashier Info */}
        <div className="grid grid-cols-2 gap-6 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200 text-xs">
          <div>
            <h3 className="font-bold uppercase text-gray-500 text-[10px] tracking-wider mb-1">Customer Information</h3>
            <p className="text-sm font-bold text-gray-900">{invoice.customer_name || invoice.customerName || 'Walk-in Customer'}</p>
            {invoice.customer_phone || invoice.customerPhone ? (
              <p className="text-gray-600 mt-0.5">Phone: {invoice.customer_phone || invoice.customerPhone}</p>
            ) : null}
          </div>

          <div className="text-right">
            <h3 className="font-bold uppercase text-gray-500 text-[10px] tracking-wider mb-1">Store Details</h3>
            <p className="text-sm font-semibold text-gray-900">Billed by: {invoice.cashier_name || 'Authorized Cashier'}</p>
            <p className="text-gray-600 mt-0.5">Currency: INR (₹)</p>
          </div>
        </div>

        {/* Item Table */}
        <table className="w-full text-left text-xs mb-6 border-collapse">
          <thead>
            <tr className="bg-gray-100 border-y border-gray-300 text-gray-700 font-bold">
              <th className="py-3 px-3">#</th>
              <th className="py-3 px-3">Product Name & Variant</th>
              <th className="py-3 px-3">Barcode</th>
              <th className="py-3 px-3 text-center">Qty</th>
              <th className="py-3 px-3 text-right">Unit Price</th>
              <th className="py-3 px-3 text-right">Discount</th>
              <th className="py-3 px-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {(invoice.items || []).map((item: any, idx: number) => (
              <tr key={idx}>
                <td className="py-3 px-3 text-gray-500">{idx + 1}</td>
                <td className="py-3 px-3">
                  <div className="font-bold text-gray-900">{item.product_name || item.productName}</div>
                  <div className="text-[11px] text-gray-500">{item.variant_name || item.variantName}</div>
                </td>
                <td className="py-3 px-3 font-mono text-gray-600">{item.barcode}</td>
                <td className="py-3 px-3 text-center font-bold">{item.quantity}</td>
                <td className="py-3 px-3 text-right">₹{parseFloat(item.unit_price || item.unitPrice).toFixed(2)}</td>
                <td className="py-3 px-3 text-right text-gray-600">₹{parseFloat(item.discount_amount || item.discountAmount || 0).toFixed(2)}</td>
                <td className="py-3 px-3 text-right font-bold text-gray-900">₹{parseFloat(item.final_price || item.finalPrice).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals & Payments Section */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          {/* Payment Method Breakdown */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 text-xs">
            <h4 className="font-bold text-gray-700 uppercase tracking-wider mb-2">Payment Details</h4>
            <div className="space-y-1.5">
              {(invoice.payments || []).map((p: any, idx: number) => (
                <div key={idx} className="flex justify-between border-b border-gray-200 pb-1">
                  <span className="font-semibold">{p.payment_method || p.paymentMethod}:</span>
                  <span>₹{parseFloat(p.amount).toFixed(2)} {p.transaction_reference ? `(${p.transaction_reference})` : ''}</span>
                </div>
              ))}
              {parseFloat(invoice.change_given || invoice.changeGiven || 0) > 0 && (
                <div className="flex justify-between text-green-700 font-bold pt-1">
                  <span>Change Given:</span>
                  <span>₹{parseFloat(invoice.change_given || invoice.changeGiven).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="text-xs space-y-2">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal:</span>
              <span className="font-semibold text-gray-900">₹{parseFloat(invoice.subtotal).toFixed(2)}</span>
            </div>
            {parseFloat(invoice.discount_amount || invoice.discountAmount || 0) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Bill Discount:</span>
                <span className="font-semibold text-red-600">-₹{parseFloat(invoice.discount_amount || invoice.discountAmount).toFixed(2)}</span>
              </div>
            )}
            {parseFloat(invoice.tax_amount || invoice.taxAmount || 0) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Tax Amount:</span>
                <span className="font-semibold text-gray-900">₹{parseFloat(invoice.tax_amount || invoice.taxAmount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-extrabold text-gray-900 border-t-2 border-gray-900 pt-2">
              <span>GRAND TOTAL:</span>
              <span>₹{parseFloat(invoice.grand_total || invoice.grandTotal).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Terms & Footer */}
        <div className="border-t border-gray-300 pt-4 text-[11px] text-gray-500 flex justify-between items-end">
          <div>
            <p className="font-bold text-gray-700">Terms & Conditions:</p>
            <p>1. Returns & Exchanges accepted within 14 days with original receipt.</p>
            <p>2. Damaged or altered items are not eligible for standard return to stock.</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-gray-700">Authorized Signatory</p>
            <div className="h-8"></div>
            <p className="text-[10px]">Thank you for your business!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
