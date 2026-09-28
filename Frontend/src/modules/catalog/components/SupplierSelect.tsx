'use client';

/**
 * SupplierSelect — supplier dropdown with an inline "+ Add new supplier" form.
 *
 * Loads the store's active suppliers itself. Users who may edit inventory can
 * create a supplier without leaving the page (new products / restocks used to
 * be stuck with an empty dropdown because nothing in the UI could add one).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { SupplierService } from '@/modules/catalog/services/CategoryService';
import { usePermission } from '@/shared/hooks/usePermission';
import type { Supplier } from '@/modules/catalog/types';

interface SupplierSelectProps {
  value: string;
  onChange: (supplierId: string) => void;
  id?: string;
  label?: string;
  /** Text for the empty option. */
  placeholder?: string;
  storeId: string;
}

/** "Vogue Mills Mumbai" -> "VOGUEM" — a readable short code the user can edit. */
function suggestCode(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return letters.slice(0, 6);
}

export function SupplierSelect({
  value,
  onChange,
  id = 'supplier-select',
  label = 'Supplier',
  placeholder = '-- No supplier --',
  storeId,
}: SupplierSelectProps) {
  const canCreate = usePermission('inventory:edit');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeEdited, setCodeEdited] = useState(false);
  const [gstin, setGstin] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setSuppliers(await SupplierService.getSuppliers(storeId));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load suppliers.');
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setName('');
    setCode('');
    setCodeEdited(false);
    setGstin('');
    setPaymentTerms('');
    setFormError(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setFormError('Supplier name is required.');
      return;
    }
    if (!code.trim()) {
      setFormError('Supplier code is required.');
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      const created = await SupplierService.createSupplier({
        storeId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        gstin: gstin.trim() || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
      });
      setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(created.id);
      setIsAdding(false);
      reset();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add the supplier.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>

      <select id={id} className="form-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.code})
          </option>
        ))}
      </select>

      {loadError && (
        <span className="form-error" role="alert">
          {loadError}{' '}
          <button type="button" className="link-btn" onClick={() => void load()}>
            Retry
          </button>
        </span>
      )}

      {suppliers.length === 0 && !loadError && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
          No suppliers yet{canCreate ? ' — add your first one below.' : '.'}
        </span>
      )}

      {canCreate && !isAdding && (
        <button
          type="button"
          className="link-btn"
          style={{ alignSelf: 'flex-start', fontSize: 'var(--text-xs)', marginTop: 4 }}
          onClick={() => setIsAdding(true)}
        >
          + Add new supplier
        </button>
      )}

      {canCreate && isAdding && (
        <div
          className="card"
          style={{ marginTop: 8, padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <strong style={{ fontSize: 'var(--text-sm)' }}>New supplier</strong>

          <input
            type="text"
            className="form-input"
            placeholder="Supplier name *"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!codeEdited) setCode(suggestCode(e.target.value));
            }}
            autoFocus
          />
          <input
            type="text"
            className="form-input"
            placeholder="Short code * (e.g. VOGUE)"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setCodeEdited(true);
            }}
            maxLength={20}
          />
          <input
            type="text"
            className="form-input"
            placeholder="GSTIN (optional)"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            maxLength={15}
          />
          <input
            type="text"
            className="form-input"
            placeholder="Payment terms (optional, e.g. Net 30)"
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
          />

          {formError && (
            <span className="form-error" role="alert">
              {formError}
            </span>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setIsAdding(false);
                reset();
              }}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save supplier'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
