'use client';

import React, { useState } from 'react';
import { todayLocalISO } from '@/lib/dates';
import { useAuthContext } from '@/context/AuthContext';
import { InventoryItemService, deriveStoreCode } from '@/modules/inventory/services/InventoryItemService';
import type { AddStockInput } from '@/modules/inventory/types';

interface StockEntryFormProps {
  variantId: string;
  variantSku: string;
  variantDisplayName: string;
  storeId: string;
  onSuccess: (count: number) => void;
  onCancel: () => void;
}

export function StockEntryForm({
  variantId,
  variantSku,
  variantDisplayName,
  storeId,
  onSuccess,
  onCancel,
}: StockEntryFormProps) {
  const { user } = useAuthContext();
  const [quantity, setQuantity] = useState(1);
  const [purchaseCostPrice, setPurchaseCostPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(
    todayLocalISO()
  );
  const [barcodesText, setBarcodesText] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedBarcodes = barcodesText
    .split(/[\n,]+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const barcodesProvided = parsedBarcodes.length > 0;
  const barcodeMismatch = barcodesProvided && parsedBarcodes.length !== quantity;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);

    if (barcodeMismatch) {
      setError(`You provided ${parsedBarcodes.length} barcodes but quantity is ${quantity}. They must match.`);
      return;
    }

    setIsLoading(true);
    try {
      const input: AddStockInput = {
        storeId,
        variantId,
        quantity,
        purchaseCostPrice: parseFloat(purchaseCostPrice),
        purchaseDate,
        barcodes: barcodesProvided ? parsedBarcodes : undefined,
        performedBy: user.id,
        notes: notes || undefined,
      };

      const items = await InventoryItemService.addStock(input, variantSku);
      onSuccess(items.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add stock. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="stock-entry-panel animate-slide-in">
      <div className="stock-entry-panel__header">
        <h3 className="stock-entry-panel__title">Add Stock</h3>
        <p className="stock-entry-panel__subtitle">{variantDisplayName}</p>
      </div>

      <form id="stock-entry-form" className="stock-entry-form" onSubmit={handleSubmit}>
        {error && (
          <div className="alert alert--error" role="alert">{error}</div>
        )}

        <div className="form-row">
          <div className="form-field">
            <label className="form-field__label" htmlFor="stock-quantity">
              Quantity <span className="form-field__required">*</span>
            </label>
            <input
              id="stock-quantity"
              type="number"
              className="form-field__input"
              min={1}
              max={10000}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              required
            />
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor="stock-cost">
              Purchase Cost (₹) <span className="form-field__required">*</span>
            </label>
            <input
              id="stock-cost"
              type="number"
              className="form-field__input"
              min={0}
              step="0.01"
              value={purchaseCostPrice}
              onChange={(e) => setPurchaseCostPrice(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor="stock-purchase-date">
            Purchase Date <span className="form-field__required">*</span>
          </label>
          <input
            id="stock-purchase-date"
            type="date"
            className="form-field__input"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            required
          />
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor="stock-barcodes">
            Barcodes{' '}
            <span className="form-field__hint">(optional — leave blank to auto-generate)</span>
          </label>
          <textarea
            id="stock-barcodes"
            className={`form-field__input form-field__textarea ${barcodeMismatch ? 'form-field__input--error' : ''}`}
            value={barcodesText}
            onChange={(e) => setBarcodesText(e.target.value)}
            placeholder={`Paste ${quantity} barcodes, one per line or comma-separated`}
            rows={Math.min(quantity, 5)}
          />
          {barcodesProvided && (
            <span className={`form-field__hint ${barcodeMismatch ? 'form-field__hint--error' : 'form-field__hint--success'}`}>
              {parsedBarcodes.length} barcode{parsedBarcodes.length !== 1 ? 's' : ''} detected
              {barcodeMismatch ? ` — need exactly ${quantity}` : ' ✓'}
            </span>
          )}
          {!barcodesProvided && (
            <span className="form-field__hint">
              {/* The trailing number is a store-wide running sequence assigned at
                  save time, so it can't be previewed accurately here — show the
                  format rather than a specific number that would be wrong. */}
              Auto-generate: {quantity} barcode{quantity !== 1 ? 's' : ''} in the format{' '}
              {`${deriveStoreCode(storeId)}-${variantSku.replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase()}-#####`}
            </span>
          )}
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor="stock-notes">Notes</label>
          <input
            id="stock-notes"
            type="text"
            className="form-field__input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes (supplier batch, PO number, etc.)"
          />
        </div>

        <div className="stock-entry-form__actions">
          <button
            type="button"
            id="stock-entry-cancel"
            className="btn btn--ghost"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            id="stock-entry-submit"
            className="btn btn--primary"
            disabled={isLoading || barcodeMismatch}
          >
            {isLoading ? 'Adding…' : `Add ${quantity} Item${quantity !== 1 ? 's' : ''}`}
          </button>
        </div>
      </form>
    </div>
  );
}
