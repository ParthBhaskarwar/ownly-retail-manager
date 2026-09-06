export interface CartItem {
  inventoryItemId: string;
  barcode: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  finalPrice: number;
}

export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'CREDIT_NOTE';

export interface PaymentSplit {
  paymentMethod: PaymentMethod;
  amount: number;
  transactionReference?: string;
}

export interface CustomerInfo {
  id?: string;
  name: string;
  phone: string;
  email?: string;
}

export interface DiscountPolicy {
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  amount: number;
  appliedBy: string;
}
