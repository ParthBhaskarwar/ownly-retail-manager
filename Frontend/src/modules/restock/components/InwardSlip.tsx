'use client';

import React from 'react';

export interface InwardSlipData {
  storeName?: string;
  storeAddress?: string;
  receivedAt: Date;
  receivedBy?: string;
  productName: string;
  productSku: string;
  supplierName?: string;
  notes?: string;
  lines: Array<{ size: string; sku: string; qty: number; unitCost: number; unitPrice: number }>;
}

const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Goods-inward slip: a one-page record of what was received, to file with the
 * supplier's invoice. Rendered hidden on screen and shown only while printing
 * (see body.print-slip in forms.css). Class names deliberately avoid the
 * words the global print stylesheet hides (header, sidebar, modal, toast…).
 */
export function InwardSlip({ data }: { data: InwardSlipData }) {
  const totalQty = data.lines.reduce((s, l) => s + l.qty, 0);
  const totalCost = data.lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const totalValue = data.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  return (
    <div className="inward-slip-root" data-print-section="slip" aria-hidden="true">
      <div className="inward-slip">
        <div className="inward-slip__top">
          <div>
            <div className="inward-slip__store">{data.storeName ?? 'Store'}</div>
            {data.storeAddress && <div className="inward-slip__muted">{data.storeAddress}</div>}
          </div>
          <div className="inward-slip__title">GOODS INWARD SLIP</div>
        </div>

        <dl className="inward-slip__meta">
          <div><dt>Date received</dt><dd>{data.receivedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
          <div><dt>Received by</dt><dd>{data.receivedBy ?? '—'}</dd></div>
          <div><dt>Supplier</dt><dd>{data.supplierName ?? '—'}</dd></div>
          <div><dt>Product</dt><dd>{data.productName} ({data.productSku})</dd></div>
        </dl>

        <table className="inward-slip__table">
          <thead>
            <tr><th>Size</th><th>SKU</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Cost value</th><th className="num">Selling price</th></tr>
          </thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.sku}>
                <td>{l.size}</td>
                <td>{l.sku}</td>
                <td className="num">{l.qty}</td>
                <td className="num">{inr(l.unitCost)}</td>
                <td className="num">{inr(l.qty * l.unitCost)}</td>
                <td className="num">{inr(l.unitPrice)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={2}>Total</td><td className="num">{totalQty}</td><td /><td className="num">{inr(totalCost)}</td><td className="num">{inr(totalValue)}</td></tr>
          </tfoot>
        </table>

        {data.notes && <p className="inward-slip__notes"><strong>Notes / invoice no.:</strong> {data.notes}</p>}

        <div className="inward-slip__sign">
          <div>Received by (signature)</div>
          <div>Checked by (signature)</div>
        </div>
      </div>
    </div>
  );
}
