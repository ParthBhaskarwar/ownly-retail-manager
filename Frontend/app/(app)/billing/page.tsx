'use client';

import React, { useState } from 'react';
import { BarcodeScannerInput } from '@/modules/billing/components/BarcodeScannerInput';
import { CartTable } from '@/modules/billing/components/CartTable';
import { DiscountModal } from '@/modules/billing/components/DiscountModal';
import { CustomerSelectModal } from '@/modules/billing/components/CustomerSelectModal';
import { PaymentModal } from '@/modules/billing/components/PaymentModal';
import { ThermalInvoiceView } from '@/modules/billing/components/ThermalInvoiceView';
import { A4InvoiceView } from '@/modules/billing/components/A4InvoiceView';
import { BillingService } from '@/modules/billing/services/BillingService';
import { useAuthContext } from '@/context/AuthContext';
import { useStoreContext } from '@/context/StoreContext';
import type { CartItem, CustomerInfo, DiscountPolicy, PaymentSplit } from '@/modules/billing/types';
import { computeTax, round2 } from '@/lib/money';

export default function BillingPage() {
  const { user } = useAuthContext();
  const { store } = useStoreContext();
  const storeId = store?.id ?? user?.storeId ?? '';
  const cashierId = user?.id ?? '';

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [discount, setDiscount] = useState<DiscountPolicy | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  // Modals state
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isClearCartModalOpen, setIsClearCartModalOpen] = useState(false);
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);

  // Invoice output modal state
  const [completedInvoice, setCompletedInvoice] = useState<any>(null);
  const [invoicePrintFormat, setInvoicePrintFormat] = useState<'THERMAL' | 'A4'>('THERMAL');

  const showToast = (text: string, type: 'error' | 'success' = 'error') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Barcode scan handler
  const handleBarcodeScanned = async (barcode: string) => {
    if (cartItems.some((item) => item.barcode === barcode)) {
      showToast(`Item with barcode ${barcode} is already in your cart.`, 'error');
      return;
    }

    setIsLoading(true);
    try {
      const item = await BillingService.lookupBarcode(barcode, storeId);
      const newCartItem: CartItem = {
        inventoryItemId: item.inventoryItemId,
        barcode: item.barcode,
        productId: item.productId,
        productName: item.productName,
        variantId: item.variantId,
        variantName: item.variantName,
        sku: item.sku,
        quantity: 1,
        unitPrice: item.unitPrice,
        discountAmount: 0,
        finalPrice: item.unitPrice,
      };

      setCartItems((prev) => [...prev, newCartItem]);
      showToast(`Added ${item.productName} (${item.variantName}) to cart`, 'success');
    } catch (err: any) {
      showToast(err.message || `Barcode ${barcode} could not be processed`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Cart modifications
  const handleRemoveCartItem = (index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateLineDiscount = (index: number, discountAmount: number) => {
    setCartItems((prev) => {
      const next = [...prev];
      const item = next[index];
      const validDiscount = Math.min(item.unitPrice, Math.max(0, discountAmount));
      next[index] = {
        ...item,
        discountAmount: validDiscount,
        finalPrice: item.unitPrice - validDiscount,
      };
      return next;
    });
  };

  // Math Calculations
  const rawSubtotal = round2(cartItems.reduce((sum, item) => sum + item.finalPrice, 0));
  const billDiscountAmount = discount ? round2(Math.min(discount.amount, rawSubtotal)) : 0;
  // GST comes from the store's own settings; the server recomputes the same figure at checkout.
  const { taxAmount, grandTotal } = computeTax(store?.taxSettings, round2(rawSubtotal - billDiscountAmount));

  // Complete checkout handler
  const handleConfirmCheckout = async (payments: PaymentSplit[]) => {
    setIsSubmittingCheckout(true);
    try {
      const result = await BillingService.checkout({
        customerId: customer?.id,
        customerName: customer?.name,
        customerPhone: customer?.phone,
        items: cartItems,
        discountType: discount?.type,
        discountValue: discount?.value,
        payments,
      }, storeId, cashierId);

      // Show what the server actually charged (its prices, discount and tax), not the preview.
      setCompletedInvoice({
        ...result,
        payments,
        customerName: customer?.name,
        customerPhone: customer?.phone,
        cashier_name: user?.name,
      });

      // Reset cart and checkout state
      setCartItems([]);
      setDiscount(null);
      setCustomer(null);
      setIsPaymentModalOpen(false);
      showToast(`Invoice ${result.invoiceNumber} created successfully!`, 'success');
    } catch (err: any) {
      throw err;
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  return (
    <div className="billing-layout">
      {/* Toast alert */}
      {toastMessage && (
        <div className="toast-container">
          <div className={`toast toast--${toastMessage.type === 'error' ? 'error' : 'success'}`} role="status">
            <span className="toast__icon">{toastMessage.type === 'error' ? '⚠️' : '✓'}</span>
            <span className="toast__message">{toastMessage.text}</span>
            <button type="button" className="toast__close" onClick={() => setToastMessage(null)} aria-label="Dismiss">
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Main Header */}
      <div className="billing-header">
        <div className="billing-header-info">
          <div className="billing-title-wrap">
            <h1 className="billing-title">POS Billing</h1>
            <span className="billing-status-badge">
              <span className="billing-status-dot"></span>
              Terminal Online
            </span>
          </div>
          <div className="billing-meta">
            {store?.name || 'Retail Store'} • Cashier: <span className="billing-meta-highlight">{user?.name || 'Active Cashier'}</span> • Register 01
          </div>
        </div>

        {/* Customer Selection Tag */}
        <div className="customer-pill">
          <div className="customer-pill-icon">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>person</span>
          </div>
          <div className="customer-pill-info">
            <span className="customer-pill-name">{customer ? customer.name : 'Walk-in Customer'}</span>
            <span className="customer-pill-tier">{customer ? customer.phone : 'Default Tier'}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsCustomerModalOpen(true)}
            className="customer-pill-action"
          >
            Change
          </button>
        </div>
      </div>

      {/* Barcode Scanner Section */}
      <div className="scanner-hero">
        <div className="scanner-hero-top">
          <div className="scanner-ready">
            <span style={{ position: 'relative', display: 'flex', width: '8px', height: '8px' }}>
              <span style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', backgroundColor: 'var(--color-paid)', opacity: 0.75, animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite' }}></span>
              <span style={{ position: 'relative', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-paid)' }}></span>
            </span>
            <span className="scanner-ready-title">
              Barcode Scanner Ready <span className="scanner-ready-sub">(USB / Bluetooth / Keyboard)</span>
            </span>
          </div>
          <span className="scanner-badge">Auto-Detect Active</span>
        </div>
        <BarcodeScannerInput onBarcodeScanned={handleBarcodeScanned} isLoading={isLoading} />
      </div>

      {/* Main POS Grid (Cart + Bill Summary) */}
      <div className="billing-grid">
        {/* Left Col: Cart Items Table */}
        <div className="billing-col-left">
          <div className="cart-header">
            <div className="cart-header-title">
              <h2 className="cart-title">Current Cart</h2>
              <span className="cart-count-badge">{cartItems.length} items</span>
            </div>
            {cartItems.length > 0 && (
              <button
                type="button"
                onClick={() => setIsClearCartModalOpen(true)}
                className="cart-clear-btn"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete_sweep</span>
                Clear Cart
              </button>
            )}
          </div>
          
          <div className="cart-container">
            {cartItems.length > 0 ? (
              <CartTable
                items={cartItems}
                onRemoveItem={handleRemoveCartItem}
                onUpdateLineDiscount={handleUpdateLineDiscount}
              />
            ) : (
              <div className="cart-empty">
                <div className="cart-empty-icon">
                  <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>shopping_cart_checkout</span>
                </div>
                <h3 className="cart-empty-title">Cart is currently empty</h3>
                <p className="cart-empty-desc">Scan an item barcode with your handheld reader, camera scanner, or search by SKU above to start creating the bill.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Bill Summary Card */}
        <div className="billing-col-right">
          <div className="bill-summary">
            <div className="bill-summary-header">
              <h2 className="bill-summary-title">Bill Summary</h2>
              <span className="bill-summary-badge">{cartItems.length} ITEMS ({cartItems.reduce((acc, it) => acc + it.quantity, 0)} UNITS)</span>
            </div>

            <div className="bill-summary-list">
              <div className="bill-summary-row">
                <span className="bill-summary-label">Items Subtotal</span>
                <span className="bill-summary-val">₹{rawSubtotal.toFixed(2)}</span>
              </div>

              {/* Discount Row */}
              <div className="bill-summary-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="bill-summary-label">Bill Discount</span>
                  <button
                    type="button"
                    onClick={() => setIsDiscountModalOpen(true)}
                    style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    {discount ? '(Edit)' : '+ Add'}
                  </button>
                </div>
                <span className="bill-summary-val" style={{ color: discount ? 'var(--color-paid)' : 'inherit' }}>
                  {discount ? `-₹${billDiscountAmount.toFixed(2)}` : '₹0.00'}
                </span>
              </div>

              <div style={{ padding: '8px 0', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div className="bill-summary-row">
                  <span className="bill-summary-label">Tax Breakdown (GST)</span>
                  <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Included</span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--color-ink-secondary)', margin: 0 }}>
                  GST included in prices (5% apparel): <span style={{ fontWeight: 600, color: 'var(--color-ink)' }}>₹{taxAmount.toFixed(2)}</span>
                </p>
              </div>
            </div>

            {/* Grand Total Row */}
            <div className="bill-summary-total-box">
              <div>
                <span className="bill-summary-total-label">Grand Total</span>
                <span style={{ fontSize: '10px', color: 'var(--color-ink-secondary)' }}>Round off: ₹0.00</span>
              </div>
              <span className="bill-summary-total-val">₹{grandTotal.toFixed(2)}</span>
            </div>

            {/* Pay Button */}
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(true)}
              disabled={cartItems.length === 0}
              className="pay-btn"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>credit_card</span>
              <span>Proceed to Payment (F4)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <CustomerSelectModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        selectedCustomer={customer}
        onSelectCustomer={setCustomer}
      />

      <DiscountModal
        isOpen={isDiscountModalOpen}
        onClose={() => setIsDiscountModalOpen(false)}
        subtotal={rawSubtotal}
        currentDiscount={discount}
        onApplyDiscount={setDiscount}
        onRemoveDiscount={() => setDiscount(null)}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        grandTotal={grandTotal}
        onConfirmCheckout={handleConfirmCheckout}
        isSubmitting={isSubmittingCheckout}
      />

      {completedInvoice && (
        <div className="pos-modal-overlay">
          <div className="pos-modal pos-modal--wide">
            <div className="pos-modal__header" style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-paper)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h3 className="pos-modal__title" style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-ink)', margin: 0 }}>Sale Completed</h3>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', margin: '4px 0 0 0', fontWeight: 'var(--font-medium)' }}>Transaction recorded successfully</p>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${invoicePrintFormat === 'THERMAL' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setInvoicePrintFormat('THERMAL')}
                  style={invoicePrintFormat === 'THERMAL' ? { backgroundColor: 'var(--color-surface)', color: 'var(--color-accent)', border: '1px solid var(--color-accent-border)', boxShadow: 'var(--shadow-raised)' } : { color: 'var(--color-ink-secondary)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>receipt_long</span> 80mm Thermal
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${invoicePrintFormat === 'A4' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setInvoicePrintFormat('A4')}
                  style={invoicePrintFormat === 'A4' ? { backgroundColor: 'var(--color-surface)', color: 'var(--color-accent)', border: '1px solid var(--color-accent-border)', boxShadow: 'var(--shadow-raised)' } : { color: 'var(--color-ink-secondary)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>description</span> A4 Invoice
                </button>
                
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: 'var(--color-accent)', color: 'white', borderRadius: 'var(--radius-md)', border: 'none', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', cursor: 'pointer', marginLeft: '8px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>print</span> Print
                </button>

                <button
                  type="button"
                  onClick={() => setCompletedInvoice(null)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: 'var(--radius-md)', border: 'none', background: 'transparent', color: 'var(--color-ink-secondary)', cursor: 'pointer', marginLeft: '4px' }}
                  aria-label="Close invoice preview"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            <div className="pos-modal__body" style={{ padding: '24px', backgroundColor: 'var(--color-paper)', display: 'flex', justifyContent: 'center', maxHeight: '480px', overflowY: 'auto' }}>
              {invoicePrintFormat === 'THERMAL' ? (
                <ThermalInvoiceView invoice={completedInvoice} onClose={() => {}} />
              ) : (
                <A4InvoiceView invoice={completedInvoice} onClose={() => {}} />
              )}
            </div>

            <div className="pos-modal__footer" style={{ padding: '16px 24px', backgroundColor: 'var(--color-paper)', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>keyboard</span>
                <span>Shortcut: Press <kbd style={{ padding: '2px 6px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>Space</kbd> to Print or <kbd style={{ padding: '2px 6px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>N</kbd> for New Bill</span>
              </div>
              <button
                type="button"
                onClick={() => setCompletedInvoice(null)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', backgroundColor: 'var(--color-accent)', color: 'white', borderRadius: 'var(--radius-md)', border: 'none', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', cursor: 'pointer' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span> Start New Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Cart Modal */}
      {isClearCartModalOpen && (
        <div 
          className="billing-modal-overlay"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsClearCartModalOpen(false);
            if (e.key === 'Enter') {
              setCartItems([]);
              setDiscount(null);
              setIsClearCartModalOpen(false);
            }
          }}
        >
          <div className="billing-modal-card" style={{ maxWidth: '380px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--color-return-tint)', color: 'var(--color-return)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>warning</span>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'var(--color-ink)' }}>Clear Active Cart?</h3>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>All {cartItems.length} added line items will be removed.</p>
              </div>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)', marginBottom: '20px' }}>
              Are you sure you want to discard this bill transaction? This action cannot be reversed.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                autoFocus
                type="button"
                onClick={() => setIsClearCartModalOpen(false)}
                style={{ padding: '6px 12px', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-ink)', cursor: 'pointer' }}
              >
                Cancel (Esc)
              </button>
              <button
                type="button"
                onClick={() => {
                  setCartItems([]);
                  setDiscount(null);
                  setIsClearCartModalOpen(false);
                }}
                style={{ padding: '6px 12px', backgroundColor: 'var(--color-return)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'white', cursor: 'pointer' }}
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
