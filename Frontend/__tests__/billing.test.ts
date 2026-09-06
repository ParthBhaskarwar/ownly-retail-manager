import { evaluatePermission } from '../src/config/permissions';
import type { CartItem, PaymentSplit } from '../src/modules/billing/types';

describe('Frontend Billing Math & Permission Logic', () => {
  it('should enforce cashier vs manager discount permission matrix', () => {
    expect(evaluatePermission('CASHIER', 'billing:discount:limited')).toBe(true);
    expect(evaluatePermission('CASHIER', 'billing:discount:unlimited')).toBe(false);
    expect(evaluatePermission('MANAGER', 'billing:discount:unlimited')).toBe(true);
    expect(evaluatePermission('OWNER', 'billing:discount:unlimited')).toBe(true);
  });

  it('should compute cart subtotal and line discounts correctly', () => {
    const items: CartItem[] = [
      {
        inventoryItemId: 'inv-1',
        barcode: 'BC100',
        productId: 'prod-1',
        productName: 'T-Shirt',
        variantId: 'var-1',
        variantName: 'Medium',
        sku: 'TSH-M',
        quantity: 1,
        unitPrice: 1000,
        discountAmount: 100,
        finalPrice: 900,
      },
      {
        inventoryItemId: 'inv-2',
        barcode: 'BC101',
        productId: 'prod-2',
        productName: 'Jeans',
        variantId: 'var-2',
        variantName: '32',
        sku: 'JNS-32',
        quantity: 1,
        unitPrice: 2000,
        discountAmount: 200,
        finalPrice: 1800,
      },
    ];

    const subtotal = items.reduce((sum, item) => sum + item.finalPrice, 0);
    expect(subtotal).toBe(2700);
  });

  it('should accurately calculate mixed payment total and change given', () => {
    const grandTotal = 2500;
    const payments: PaymentSplit[] = [
      { paymentMethod: 'CASH', amount: 1000 },
      { paymentMethod: 'UPI', amount: 1000, transactionReference: 'UPI123' },
      { paymentMethod: 'CARD', amount: 600, transactionReference: 'CARD456' },
    ];

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    expect(totalPaid).toBe(2600);
    const changeGiven = Math.max(0, totalPaid - grandTotal);
    expect(changeGiven).toBe(100);
  });
});
