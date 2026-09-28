/**
 * Money helpers for previews on the POS screens.
 *
 * These mirror Backend/src/shared/money.ts so the total the cashier sees is
 * the total the server will compute. The server is always the authority — it
 * recalculates prices, discounts and GST itself; this only drives the preview.
 */

export interface TaxSettings {
  gstEnabled?: boolean;
  gstRate?: number;
  inclusiveTax?: boolean;
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Inclusive: the tax is already inside the price, so the total does not change.
 * Exclusive: tax is added on top.
 */
export function computeTax(
  tax: TaxSettings | undefined | null,
  taxable: number
): { taxAmount: number; grandTotal: number } {
  const rate = tax?.gstRate ?? 0;
  if (!tax?.gstEnabled || rate <= 0) return { taxAmount: 0, grandTotal: round2(taxable) };
  if (tax.inclusiveTax) {
    return { taxAmount: round2(taxable - taxable / (1 + rate / 100)), grandTotal: round2(taxable) };
  }
  const taxAmount = round2((taxable * rate) / 100);
  return { taxAmount, grandTotal: round2(taxable + taxAmount) };
}
