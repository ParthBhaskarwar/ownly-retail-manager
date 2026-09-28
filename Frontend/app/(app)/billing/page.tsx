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
    <div className="pos-container">
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
      <div className="pos-header">
        <div className="pos-header__titles">
          <h1 className="pos-header__title">POS Billing Checkout</h1>
          <span className="pos-header__subtitle">
            {store?.name || 'Retail Store'} • Cashier: <strong>{user?.name || 'Active Cashier'}</strong>
          </span>
        </div>

        <div className="pos-header__actions">
          {/* Customer Selection Tag */}
          <button
            type="button"
            onClick={() => setIsCustomerModalOpen(true)}
            className="pos-customer-chip"
          >
            <span className="pos-customer-chip__icon">👤</span>
            <span>{customer ? `${customer.name} (${customer.phone})` : 'Walk-in Customer'}</span>
            <span className="pos-customer-chip__change">Change</span>
          </button>

          {/* Reset Cart */}
          {cartItems.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Clear all items from the cart?')) {
                  setCartItems([]);
                  setDiscount(null);
                }
              }}
              className="btn btn-secondary btn-sm"
              style={{ color: 'var(--color-return)' }}
            >
              Clear Cart
            </button>
          )}
        </div>
      </div>

      {/* Barcode Scanner Section */}
      <BarcodeScannerInput onBarcodeScanned={handleBarcodeScanned} isLoading={isLoading} />

      {/* Main POS Grid (Cart + Bill Summary) */}
      <div className="pos-grid">
        {/* Left Col: Cart Items Table */}
        <div>
          <CartTable
            items={cartItems}
            onRemoveItem={handleRemoveCartItem}
            onUpdateLineDiscount={handleUpdateLineDiscount}
          />
        </div>

        {/* Right Col: Bill Summary Card */}
        <div>
          <div className="bill-card">
            <div className="bill-card__header">
              <h2 className="bill-card__title">Bill Summary</h2>
              <span className="badge badge--denim badge--sm">{cartItems.length} Items</span>
            </div>

            <div className="bill-card__rows">
              <div className="bill-card__row">
                <span>Items Subtotal:</span>
                <span className="bill-card__row-val">₹{rawSubtotal.toFixed(2)}</span>
              </div>

              {/* Discount Row */}
              <div className="bill-card__row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span>Bill Discount:</span>
                  <button
                    type="button"
                    onClick={() => setIsDiscountModalOpen(true)}
                    className="link-btn"
                    style={{ fontSize: 'var(--text-xs)' }}
                  >
                    {discount ? '(Edit)' : '+ Add'}
                  </button>
                </div>
                <span className={`bill-card__row-val ${discount ? 'bill-card__row-val--discount' : ''}`}>
                  {discount ? `-₹${billDiscountAmount.toFixed(2)}` : '₹0.00'}
                </span>
              </div>

              {discount && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', textAlign: 'right' }}>
                  {discount.type === 'PERCENTAGE' ? `${discount.value}% Bill Discount` : `₹${discount.value} Flat Discount`}
                </div>
              )}

              {taxAmount > 0 && (
                <div className="bill-card__row">
                  <span>GST{store?.taxSettings?.inclusiveTax ? ' (included)' : ''}:</span>
                  <span className="bill-card__row-val">₹{taxAmount.toFixed(2)}</span>
                </div>
              )}

              {/* Grand Total Row */}
              <div className="bill-card__total-row">
                <span className="bill-card__total-label">Grand Total:</span>
                <span className="bill-card__total-amount">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Pay Button */}
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(true)}
              disabled={cartItems.length === 0}
              className="btn btn-primary bill-card__checkout-btn"
            >
              <span>💳 Proceed to Payment</span>
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

      {/* Completed Invoice Output Modal */}
      {completedInvoice && (
        <div className="pos-modal-overlay">
          <div className="pos-modal pos-modal--wide">
            <div className="pos-modal__header">
              <h3 className="pos-modal__title">Sale Completed Successfully</h3>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${invoicePrintFormat === 'THERMAL' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setInvoicePrintFormat('THERMAL')}
                >
                  🧾 80mm Thermal
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${invoicePrintFormat === 'A4' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setInvoicePrintFormat('A4')}
                >
                  📄 A4 Invoice
                </button>
                <button
                  type="button"
                  onClick={() => setCompletedInvoice(null)}
                  className="modal-close"
                  aria-label="Close invoice preview"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="pos-modal__body">
              {invoicePrintFormat === 'THERMAL' ? (
                <ThermalInvoiceView invoice={completedInvoice} onClose={() => setCompletedInvoice(null)} />
              ) : (
                <A4InvoiceView invoice={completedInvoice} onClose={() => setCompletedInvoice(null)} />
              )}
            </div>

            <div className="pos-modal__footer">
              <button
                type="button"
                onClick={() => setCompletedInvoice(null)}
                className="btn btn-primary"
              >
                + Start New Bill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
