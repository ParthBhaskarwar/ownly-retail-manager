'use client';

import React from 'react';
import { VisualBarcode } from './VisualBarcode';

export interface BarcodeLabelData {
  barcode: string;
  productName: string;
  variantDisplayName?: string;
  sku: string;
  sellingPrice?: number;
  status?: string;
  storeName?: string;
}

interface BarcodeLabelProps {
  label: BarcodeLabelData;
  /** If true, renders in compact mode for multi-label print sheets. */
  compact?: boolean;
}

/**
 * BarcodeLabelPrint — a single printable retail barcode label.
 *
 * Designed to render cleanly in two contexts:
 *   1. On-screen preview inside an item detail page.
 *   2. Print: CSS @media print rules hide everything except .barcode-print-root,
 *      so the printed page contains only barcode labels.
 */
export function BarcodeLabelPrint({ label, compact = false }: BarcodeLabelProps) {
  const price =
    label.sellingPrice !== undefined && label.sellingPrice !== null
      ? '₹' + Number(label.sellingPrice).toLocaleString('en-IN', { maximumFractionDigits: 0 })
      : null;

  return (
    <div className={`barcode-label ${compact ? 'barcode-label--compact' : ''}`}>
      {/* Store header */}
      <div className="barcode-label__store">{label.storeName ?? 'OWNLY'}</div>

      {/* Product info */}
      <div className="barcode-label__product">{label.productName}</div>
      {label.variantDisplayName && (
        <div className="barcode-label__variant">{label.variantDisplayName}</div>
      )}

      {/* SKU */}
      <div className="barcode-label__sku">{label.sku}</div>

      {/* Barcode image */}
      <div className="barcode-label__image-wrap">
        <VisualBarcode
          value={label.barcode}
          width={compact ? 180 : 240}
          height={compact ? 48 : 64}
          showText={false}
        />
      </div>

      {/* Human-readable barcode value */}
      <div className="barcode-label__code">{label.barcode}</div>

      {/* Price */}
      {price && <div className="barcode-label__price">{price}</div>}
    </div>
  );
}

interface MultiLabelSheetProps {
  labels: BarcodeLabelData[];
}

/**
 * MultiLabelSheet — renders multiple barcode labels in a grid for printing.
 * This node is hidden on screen and only appears in print via CSS rules.
 */
export function MultiLabelSheet({ labels }: MultiLabelSheetProps) {
  if (labels.length === 0) return null;
  return (
    <div className="barcode-print-root" aria-hidden="true">
      <div className="barcode-label-grid">
        {labels.map((label, i) => (
          <BarcodeLabelPrint key={`${label.barcode}-${i}`} label={label} compact />
        ))}
      </div>
    </div>
  );
}
