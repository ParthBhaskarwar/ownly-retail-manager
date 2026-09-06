'use client';

import React from 'react';
import { STATUS_LABELS, type InventoryStatus } from '@/modules/inventory/types';

/**
 * Maps each status to a colour family. Grouped by what the status means for
 * the business rather than one colour per value:
 *   available/returned-to-stock → good, sold/exchanged → neutral-positive,
 *   damaged/defective/lost → problem, transfers/reserved → in-between.
 */
const STATUS_TONE: Record<InventoryStatus, string> = {
  IN_STOCK: 'success',
  RETURNED_TO_STOCK: 'success',
  SOLD: 'info',
  EXCHANGED: 'info',
  RESERVED: 'warning',
  TRANSFERRED_OUT: 'neutral',
  SUPPLIER_RETURN: 'warning',
  DAMAGED: 'error',
  DEFECTIVE: 'error',
  RETURNED_DAMAGED: 'error',
  LOST: 'error',
};

export function StatusBadge({ status }: { status: InventoryStatus }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  return (
    <span className={`status-badge status-badge--${tone}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
