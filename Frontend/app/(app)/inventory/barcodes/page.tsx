import { redirect } from 'next/navigation';

/** Barcodes and the inventory ledger are one screen now: tick items there and print labels. */
export default function BarcodesRedirect() {
  redirect('/inventory');
}
