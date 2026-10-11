'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { InventoryItemRow } from '@/modules/inventory/types';
import { BarcodeLabelPrint, MultiLabelSheet } from './BarcodeLabelPrint';
import type { BarcodeLabelData } from './BarcodeLabelPrint';

interface BarcodePrintManagerProps {
  items: InventoryItemRow[];
  storeName?: string;
}

/**
 * BarcodePrintManager — multi-barcode selection table with batch print.
 *
 * The user can:
 *   - check individual items
 *   - select all / clear all
 *   - preview the first selected label
 *   - print all selected labels in a sheet
 *
 * Print is handled by injecting a .barcode-print-root div into the document
 * and calling window.print(). The @media print CSS rules hide everything
 * except that div, so the printed output is labels only.
 */
export function BarcodePrintManager({ items, storeName }: BarcodePrintManagerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewBarcode, setPreviewBarcode] = useState<string | null>(null);
  const printContainerRef = useRef<HTMLDivElement>(null);

  // Auto-show preview for first item
  useEffect(() => {
    if (items.length > 0 && !previewBarcode) {
      setPreviewBarcode(items[0].barcode);
    }
  }, [items, previewBarcode]);

  const toggleItem = useCallback((barcode: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(barcode)) next.delete(barcode);
      else next.add(barcode);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(items.map((i) => i.barcode)));
  }, [items]);

  const clearAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handlePrintSelected = useCallback(() => {
    if (selected.size === 0) return;
    window.print();
  }, [selected]);

  const selectedItems = items.filter((i) => selected.has(i.barcode));

  const toLabelData = (item: InventoryItemRow): BarcodeLabelData => ({
    barcode: item.barcode,
    productName: item.productName,
    variantDisplayName: item.variantDisplayName || item.size || undefined,
    sku: item.variantSku,
    sellingPrice: item.sellingPrice,
    storeName,
  });

  const previewItem = previewBarcode ? items.find((i) => i.barcode === previewBarcode) : null;

  return (
    <div className="barcode-manager">
      {/* Toolbar */}
      <div className="barcode-manager__toolbar">
        <div className="barcode-manager__toolbar-left">
          <button
            type="button"
            id="barcode-select-all"
            className="btn btn--ghost btn--sm"
            onClick={selectAll}
          >
            ☑ Select All ({items.length})
          </button>
          <button
            type="button"
            id="barcode-clear-all"
            className="btn btn--ghost btn--sm"
            onClick={clearAll}
          >
            Clear
          </button>
          <span className="barcode-manager__count">
            {selected.size} of {items.length} selected
          </span>
        </div>
        <button
          type="button"
          id="barcode-print-selected"
          className="btn btn--primary btn--sm"
          disabled={selected.size === 0}
          onClick={handlePrintSelected}
        >
          🖨 Print Selected Barcodes
        </button>
      </div>

      <div className="barcode-manager__body">
        {/* Selection table */}
        <div className="barcode-manager__table-wrap">
          <table className="data-table barcode-manager__table" id="barcode-items-table">
            <thead>
              <tr>
                <th scope="col" style={{ width: 40 }}>✓</th>
                <th scope="col">Barcode</th>
                <th scope="col">Product</th>
                <th scope="col">Variant</th>
                <th scope="col">Status</th>
                <th scope="col">Preview</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isChecked = selected.has(item.barcode);
                const isPreviewing = previewBarcode === item.barcode;
                return (
                  <tr
                    key={item.id}
                    className={`data-table__row ${isChecked ? 'data-table__row--selected' : ''}`}
                  >
                    <td>
                      <input
                        type="checkbox"
                        id={`barcode-check-${item.id}`}
                        className="barcode-manager__check"
                        checked={isChecked}
                        onChange={() => toggleItem(item.barcode)}
                        aria-label={`Select barcode ${item.barcode}`}
                      />
                    </td>
                    <td>
                      <code className="mono barcode-manager__code">{item.barcode}</code>
                    </td>
                    <td className="data-table__primary">{item.productName}</td>
                    <td>{item.variantDisplayName || item.size || item.variantSku}</td>
                    <td>
                      <span
                        className={`status-pill ${
                          item.status === 'IN_STOCK'
                            ? 'status-pill--green'
                            : item.status === 'SOLD'
                            ? 'status-pill--neutral'
                            : 'status-pill--yellow'
                        }`}
                      >
                        {item.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`btn btn--ghost btn--sm ${isPreviewing ? 'btn--active' : ''}`}
                        onClick={() => setPreviewBarcode(isPreviewing ? null : item.barcode)}
                        aria-label={`Preview label for ${item.barcode}`}
                      >
                        {isPreviewing ? '▼ Hide' : '▶ Preview'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Label preview panel */}
        {previewItem && (
          <div className="barcode-manager__preview">
            <div className="barcode-manager__preview-header">
              <h3 className="barcode-manager__preview-title">Label Preview</h3>
            </div>
            <BarcodeLabelPrint label={toLabelData(previewItem)} />
          </div>
        )}
      </div>

      {/* Hidden print sheet — shown only during window.print() */}
      <div ref={printContainerRef} className="barcode-print-root" aria-hidden="true">
        <div className="barcode-label-grid">
          {selectedItems.map((item, i) => (
            <BarcodeLabelPrint
              key={`${item.barcode}-${i}`}
              label={toLabelData(item)}
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}
