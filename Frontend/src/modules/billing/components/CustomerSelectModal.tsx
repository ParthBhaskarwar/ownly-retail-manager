'use client';

import React, { useState } from 'react';
import { getAuthHeaders } from '@/shared/utils/auth';

interface CustomerSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomer: { id?: string; name: string; phone: string; email?: string } | null;
  onSelectCustomer: (customer: { id?: string; name: string; phone: string; email?: string } | null) => void;
}

export function CustomerSelectModal({
  isOpen,
  onClose,
  selectedCustomer,
  onSelectCustomer,
}: CustomerSelectModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [mode, setMode] = useState<'SEARCH' | 'CREATE'>('SEARCH');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers?query=${encodeURIComponent(searchQuery.trim())}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError((errData as any).error || 'Customer search failed.');
      }
    } catch {
      setError('Search failed. Check your connection.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) {
      setError('Customer name and phone number are required.');
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim(), email: newEmail.trim() || undefined }),
      });
      if (res.ok) {
        const customer = await res.json();
        onSelectCustomer({ id: customer.id, name: customer.name, phone: customer.phone, email: customer.email });
        onClose();
      } else {
        const errData = await res.json().catch(() => ({}));
        setError((errData as any).error || 'Failed to create customer record.');
      }
    } catch {
      setError('Failed to create customer record. Check your connection.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="pos-modal-overlay">
      <div className="pos-modal">
        <div className="pos-modal__header">
          <h3 className="pos-modal__title">Customer Details</h3>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="pos-modal__body">
          {error && (
            <div className="form-server-error" role="alert">
              {error}
            </div>
          )}

          {/* Walk-in shortcut */}
          <button
            type="button"
            onClick={() => {
              onSelectCustomer(null);
              onClose();
            }}
            className="btn btn-secondary btn-full"
            style={{ justifyContent: 'center', borderStyle: 'dashed' }}
          >
            👤 Continue as Anonymous Walk-in Customer
          </button>

          {/* Mode Switcher */}
          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-control__btn ${mode === 'SEARCH' ? 'segmented-control__btn--active' : ''}`}
              onClick={() => setMode('SEARCH')}
            >
              Search Existing Customer
            </button>
            <button
              type="button"
              className={`segmented-control__btn ${mode === 'CREATE' ? 'segmented-control__btn--active' : ''}`}
              onClick={() => setMode('CREATE')}
            >
              + Add New Customer
            </button>
          </div>

          {mode === 'SEARCH' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search by customer name or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="btn btn-primary"
                >
                  {isSearching ? '...' : 'Search'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: '240px', overflowY: 'auto' }}>
                {searchResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onSelectCustomer({ id: c.id, name: c.name, phone: c.phone, email: c.email });
                      onClose();
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: 'var(--space-3) var(--space-4)',
                      background: 'var(--color-surface)',
                      border: '1.5px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-denim)';
                      e.currentTarget.style.background = 'var(--color-denim-tint)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.background = 'var(--color-surface)';
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-ink)' }}>{c.name}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', fontFamily: 'var(--font-mono)' }}>{c.phone}</div>
                    </div>
                    <span className="badge badge--denim badge--sm">Select</span>
                  </button>
                ))}
                {searchResults.length === 0 && searchQuery && !isSearching && (
                  <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', padding: 'var(--space-4) 0' }}>
                    No existing customers match "{searchQuery}". Click "+ Add New Customer" above.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-field">
                <label className="form-label">Customer Name <span className="form-required">*</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Rahul Sharma"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-field">
                <label className="form-label">Phone Number <span className="form-required">*</span></label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="+91 98765 43210"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="form-label">Email (Optional)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="rahul@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={isCreating || !newName.trim() || !newPhone.trim()}
                className="btn btn-primary btn-full"
              >
                {isCreating ? 'Saving Customer…' : '✓ Save & Select Customer'}
              </button>
            </form>
          )}
        </div>

        <div className="pos-modal__footer">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
