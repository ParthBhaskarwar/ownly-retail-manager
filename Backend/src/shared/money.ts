/**
 * Money helpers shared by billing, returns and exchanges.
 */

import type { Knex } from 'knex';

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface TaxSettings { gstEnabled?: boolean; gstRate?: number; inclusiveTax?: boolean }

/** Reads the store's GST settings (jsonb comes back parsed, but tolerate a string). */
export async function loadTaxSettings(trx: Knex | Knex.Transaction, storeId: string): Promise<TaxSettings> {
  const store = (await trx('stores').where({ id: storeId }).first('tax_settings')) as
    | { taxSettings: TaxSettings | string | null }
    | undefined;
  const raw = store?.taxSettings;
  if (!raw) return {};
  return typeof raw === 'string' ? (JSON.parse(raw) as TaxSettings) : raw;
}

/**
 * Splits a taxable amount into tax and grand total.
 * Inclusive: the tax is already inside the price, so the total does not change.
 * Exclusive: tax is added on top.
 */
export function computeTax(tax: TaxSettings, taxable: number): { taxAmount: number; grandTotal: number } {
  const rate = tax.gstRate ?? 0;
  if (!tax.gstEnabled || rate <= 0) return { taxAmount: 0, grandTotal: round2(taxable) };
  if (tax.inclusiveTax) {
    return { taxAmount: round2(taxable - taxable / (1 + rate / 100)), grandTotal: round2(taxable) };
  }
  const taxAmount = round2((taxable * rate) / 100);
  return { taxAmount, grandTotal: round2(taxable + taxAmount) };
}

/**
 * The most a customer can be refunded for one invoice line: the line's price
 * scaled by how the whole bill was discounted and taxed
 * (grand_total / subtotal). This is what they actually paid for that item.
 */
export function refundableForLine(
  invoice: { subtotal: string | number; grandTotal: string | number },
  finalPrice: string | number
): number {
  const subtotal = Number(invoice.subtotal);
  const line = Number(finalPrice);
  if (subtotal <= 0) return round2(line);
  return round2((line * Number(invoice.grandTotal)) / subtotal);
}
