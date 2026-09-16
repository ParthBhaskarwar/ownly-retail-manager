'use client';

import React, { useEffect, useState } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { useStoreContext } from '@/context/StoreContext';
import { StoreService } from '@/modules/store/services/StoreService';
import type { Store, UpdateStoreInput } from '@/modules/store/types';

export function StoreSettingsForm() {
  const { user } = useAuthContext();
  const { store, setStore } = useStoreContext();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [retailType, setRetailType] = useState('clothing');
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
          setRetailType(currentStore.retailType || 'clothing');
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
      <div className="p-8 text-center" role="status">
        <div className="btn-spinner inline-block mr-2" />
        <p className="text-gray-400 mt-2">Loading store settings...</p>
      </div>
    );
  }

  return (
    <form className="max-w-4xl mx-auto space-y-6" onSubmit={handleSubmit} noValidate aria-label="Store Settings Form">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Store Settings</h1>
          <p className="page-subtitle">Manage your store information, tax setup, and business profile.</p>
        </div>
        <button
          id="save-store-settings-btn"
          type="submit"
          className="btn btn-primary"
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {errorMsg && (
        <div className="form-server-error" role="alert">
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 rounded-lg" role="status">
          ✓ {successMsg}
        </div>
      )}

      {/* Basic Profile Card */}
      <section className="pe-card">
        <header className="pe-card__header">
          <h2 className="pe-card__title">Business Information</h2>
        </header>
        <div className="pe-card__body space-y-4">
          <div className="form-field">
            <label className="form-label" htmlFor="store-name">Store Name <span className="form-required">*</span></label>
            <input
              id="store-name"
              className="form-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Navkar Fashion Boutique"
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="store-address">Store Address <span className="form-required">*</span></label>
            <textarea
              id="store-address"
              className="form-textarea"
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Full shop address including city and pincode"
              required
            />
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label className="form-label" htmlFor="store-phone">Contact Phone <span className="form-required">*</span></label>
              <input
                id="store-phone"
                className="form-input"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210"
                required
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="store-retail-type">Retail Type</label>
              <select
                id="store-retail-type"
                className="form-select"
                value={retailType}
                onChange={(e) => setRetailType(e.target.value)}
              >
                <option value="clothing">Clothing &amp; Fashion</option>
                <option value="footwear">Footwear</option>
                <option value="general">General Retail</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Tax & GST Settings Card */}
      <section className="pe-card">
        <header className="pe-card__header">
          <h2 className="pe-card__title">Tax &amp; GST Configuration</h2>
        </header>
        <div className="pe-card__body space-y-4">
          <div className="form-field">
            <label className="form-label" htmlFor="store-gstin">GSTIN / Tax ID Number</label>
            <input
              id="store-gstin"
              className="form-input pe-mono"
              type="text"
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
              placeholder="27AAAAA0000A1Z5"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <input
              id="gst-enabled"
              type="checkbox"
              className="w-5 h-5 rounded border-gray-700 bg-gray-900 text-violet-600 focus:ring-violet-500"
              checked={gstEnabled}
              onChange={(e) => setGstEnabled(e.target.checked)}
            />
            <label htmlFor="gst-enabled" className="text-sm font-medium text-gray-200">
              Enable GST calculation on billing &amp; invoices
            </label>
          </div>

          {gstEnabled && (
            <div className="form-grid pt-2">
              <div className="form-field">
                <label className="form-label" htmlFor="gst-rate">Default GST Rate (%)</label>
                <input
                  id="gst-rate"
                  className="form-input"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                />
              </div>

              <div className="form-field justify-end flex flex-col">
                <label className="flex items-center gap-3 text-sm text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-gray-700 bg-gray-900 text-violet-600 focus:ring-violet-500"
                    checked={inclusiveTax}
                    onChange={(e) => setInclusiveTax(e.target.checked)}
                  />
                  Prices are GST Inclusive
                </label>
              </div>
            </div>
          )}
        </div>
      </section>
    </form>
  );
}
