'use client';

import React, { useEffect, useState } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { useStoreContext } from '@/context/StoreContext';
import { StoreService } from '@/modules/store/services/StoreService';
import type { Store, UpdateStoreInput } from '@/modules/store/types';
import { RetailType } from '@/modules/retail-template/types';
import { usePermission } from '@/shared/hooks/usePermission';

export function StoreSettingsForm() {
  const { user } = useAuthContext();
  const { store, setStore } = useStoreContext();
  const canEdit = usePermission('settings:edit');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [retailType, setRetailType] = useState<string>(RetailType.CLOTHING_FASHION);
  const [currency, setCurrency] = useState('INR');
  const [gstNumber, setGstNumber] = useState('');
  const [gstEnabled, setGstEnabled] = useState(true);
  const [gstRate, setGstRate] = useState('18');
  const [inclusiveTax, setInclusiveTax] = useState(false);

  useEffect(() => {
    async function loadStore() {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        let currentStore: Store | null = store;
        if (!currentStore && user) {
          currentStore = await StoreService.getByOwnerId(user.id);
        }
        if (currentStore) {
          setName(currentStore.name || '');
          setAddress(currentStore.address || '');
          setPhone(currentStore.phone || '');
          setRetailType(currentStore.retailType || RetailType.CLOTHING_FASHION);
          setCurrency(currentStore.currency || 'INR');
          setGstNumber(currentStore.gstNumber || '');
          if (currentStore.taxSettings) {
            setGstEnabled(currentStore.taxSettings.gstEnabled ?? true);
            setGstRate((currentStore.taxSettings.gstRate ?? 18).toString());
            setInclusiveTax(currentStore.taxSettings.inclusiveTax ?? false);
          }
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load store settings.');
      } finally {
        setIsLoading(false);
      }
    }
    loadStore();
  }, [store, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim() || !phone.trim()) {
      setErrorMsg('Store Name, Address, and Phone number are required.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const storeId = store?.id || user?.storeId || '';
      const userId = user?.id || '';

      const updates: UpdateStoreInput = {
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim(),
        retailType,
        currency,
        gstNumber: gstNumber.trim() || undefined,
        taxSettings: {
          gstEnabled,
          gstRate: parseFloat(gstRate) || 0,
          inclusiveTax,
        },
      };

      const updatedStore = await StoreService.update(storeId, userId, updates);
      setStore(updatedStore);
      setSuccessMsg('Store settings updated successfully.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save store settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="settings-loading" role="status">
        <span className="btn-spinner" /> Loading store settings…
      </div>
    );
  }

  const receiptHeader = [name.toUpperCase(), gstNumber ? `GSTIN: ${gstNumber}` : ''].filter(Boolean).join(' • ');

  return (
    <form className="settings-page" onSubmit={handleSubmit} noValidate aria-label="Store Settings Form">
      <div className="settings-head">
        <div>
          <h1 className="settings-title">Settings</h1>
          <p className="settings-subtitle">Store details and tax setup</p>
        </div>
        {!canEdit && <span className="settings-readonly-pill">Read-only · only the store owner can change these</span>}
      </div>

      {errorMsg && <div className="settings-alert settings-alert--error" role="alert"><strong>Error:</strong> {errorMsg}</div>}
      {successMsg && <div className="settings-alert settings-alert--ok" role="status">✓ {successMsg}</div>}

      <section className="settings-card">
        <header className="settings-card__head">
          <span className="settings-card__icon material-symbols-outlined" aria-hidden="true">storefront</span>
          <div>
            <h2 className="settings-card__title">Store Details</h2>
            <p className="settings-card__desc">Identity and contact information shown on customer invoices and receipts.</p>
          </div>
        </header>

        <div className="form-field">
          <label className="form-label" htmlFor="store-name">Store Name <span className="form-required">*</span></label>
          <input id="store-name" className="form-input" type="text" value={name} disabled={!canEdit}
            onChange={(e) => setName(e.target.value)} placeholder="e.g. Navkar Fashion Boutique" required />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="store-address">Store Address <span className="form-required">*</span></label>
          <textarea id="store-address" className="form-textarea" rows={3} value={address} disabled={!canEdit}
            onChange={(e) => setAddress(e.target.value)} placeholder="Full shop address including city and pincode" required />
        </div>

        <div className="settings-grid">
          <div className="form-field">
            <label className="form-label" htmlFor="store-phone">Contact Phone <span className="form-required">*</span></label>
            <input id="store-phone" className="form-input" type="text" value={phone} disabled={!canEdit}
              onChange={(e) => setPhone(e.target.value)} placeholder="+91 9876543210" required />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="store-retail-type">Retail Type</label>
            <select id="store-retail-type" className="form-select" value={retailType} disabled={!canEdit}
              onChange={(e) => setRetailType(e.target.value)}>
              {/* Values must be the RetailType enum the backend stores (e.g. CLOTHING_FASHION). */}
              <option value={RetailType.CLOTHING_FASHION}>Clothing &amp; Fashion</option>
              <option value={RetailType.FOOTWEAR} disabled>Footwear (coming soon)</option>
              <option value={RetailType.GENERAL_RETAIL} disabled>General Retail (coming soon)</option>
            </select>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <header className="settings-card__head">
          <span className="settings-card__icon material-symbols-outlined" aria-hidden="true">receipt_long</span>
          <div>
            <h2 className="settings-card__title">Currency &amp; Tax</h2>
            <p className="settings-card__desc">GST rules applied automatically at POS checkout and on invoices.</p>
          </div>
        </header>

        <div className="settings-grid">
          <div className="form-field">
            <label className="form-label" htmlFor="store-currency">Store Currency</label>
            <select id="store-currency" className="form-select" value={currency} disabled={!canEdit}
              onChange={(e) => setCurrency(e.target.value)}>
              <option value="INR">INR (₹) — Indian Rupee</option>
              <option value="USD">USD ($) — US Dollar</option>
              <option value="EUR">EUR (€) — Euro</option>
              <option value="GBP">GBP (£) — British Pound</option>
              <option value="AED">AED — UAE Dirham</option>
              <option value="SGD">SGD (S$) — Singapore Dollar</option>
            </select>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="store-gstin">GSTIN / Tax ID</label>
            <input id="store-gstin" className="form-input settings-mono" type="text" value={gstNumber} disabled={!canEdit}
              maxLength={15} onChange={(e) => setGstNumber(e.target.value.toUpperCase())} placeholder="27AAAAA0000A1Z5" />
          </div>
        </div>

        <div className="settings-toggle-row">
          <div>
            <div className="settings-toggle-row__title">Enable GST calculation</div>
            <div className="settings-toggle-row__desc">When on, GST is added at POS checkout and recorded on every invoice.</div>
          </div>
          <label className="switch">
            <input id="gst-enabled" type="checkbox" checked={gstEnabled} disabled={!canEdit}
              onChange={(e) => setGstEnabled(e.target.checked)} aria-label="Enable GST calculation" />
            <span className="switch__track" />
          </label>
        </div>

        {gstEnabled && (
          <div className="settings-grid">
            <div className="form-field">
              <label className="form-label" htmlFor="gst-rate">Default GST Rate (%)</label>
              <input id="gst-rate" className="form-input" type="number" step="0.1" min="0" max="100"
                value={gstRate} disabled={!canEdit} onChange={(e) => setGstRate(e.target.value)} />
            </div>
            <div className="form-field">
              <span className="form-label">Pricing Model</span>
              <label className="settings-check">
                <input type="checkbox" checked={inclusiveTax} disabled={!canEdit} onChange={(e) => setInclusiveTax(e.target.checked)} />
                <span>
                  <strong>Prices include GST</strong>
                  <small>Catalog prices are the final customer price; tax is extracted on the receipt.</small>
                </span>
              </label>
            </div>
          </div>
        )}
      </section>

      <section className="settings-card">
        <header className="settings-card__head">
          <span className="settings-card__icon material-symbols-outlined" aria-hidden="true">print</span>
          <div>
            <h2 className="settings-card__title">Receipt Header Preview</h2>
            <p className="settings-card__desc">How your store appears at the top of printed receipts.</p>
          </div>
        </header>
        <div className="settings-receipt">
          <div className="settings-receipt__name">{name || 'Your store name'}</div>
          {address && <div>{address}</div>}
          {phone && <div>Ph: {phone}</div>}
          {gstNumber && <div>GSTIN: {gstNumber}</div>}
          <div className="settings-receipt__line">{receiptHeader}</div>
        </div>
      </section>

      {canEdit && (
        <div className="settings-savebar">
          <span className="settings-savebar__hint">Changes apply to new invoices straight away.</span>
          <button id="save-store-settings-btn" type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}
    </form>
  );
}
