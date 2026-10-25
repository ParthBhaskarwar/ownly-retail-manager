/**
 * Reads the retraining workbook. Forgiving about the things people get wrong
 * when typing into Excel — header capitalisation, spaces vs underscores, sheet
 * order, blank rows, formulas — and strict about the things that would silently
 * corrupt training (a missing sheet or a missing required column).
 */

import ExcelJS from 'exceljs';
import type { Cell, RawWorkbook } from './types';

interface SheetSpec<T> {
  name: string;
  required: boolean;
  /** field → accepted header spellings (already normalised) */
  columns: Record<keyof Omit<T, 'row'>, { aliases: string[]; required: boolean }>;
}

const norm = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const PRODUCTS: SheetSpec<RawWorkbook['products'][number]> = {
  name: 'Products', required: true,
  columns: {
    code: { aliases: ['productcode', 'code', 'sku', 'basesku', 'itemcode'], required: true },
    name: { aliases: ['productname', 'name', 'itemname', 'description'], required: false },
    category: { aliases: ['category', 'categoryname'], required: true },
    subcategory: { aliases: ['subcategory', 'subcategoryname', 'type'], required: false },
    sellingPrice: { aliases: ['sellingprice', 'price', 'mrp', 'saleprice'], required: true },
    costPrice: { aliases: ['costprice', 'cost', 'purchaseprice'], required: false },
    supplier: { aliases: ['supplier', 'suppliername', 'vendor'], required: false },
  },
};

const PURCHASES: SheetSpec<RawWorkbook['purchases'][number]> = {
  name: 'Purchases', required: true,
  columns: {
    date: { aliases: ['date', 'purchasedate', 'receiveddate', 'stockdate'], required: true },
    code: { aliases: ['productcode', 'code', 'sku', 'itemcode'], required: true },
    size: { aliases: ['size'], required: false },
    quantity: { aliases: ['quantity', 'qty', 'units'], required: true },
    unitCost: { aliases: ['unitcost', 'costprice', 'cost', 'purchaseprice'], required: false },
  },
};

const SALES: SheetSpec<RawWorkbook['sales'][number]> = {
  name: 'Sales', required: true,
  columns: {
    date: { aliases: ['date', 'saledate', 'invoicedate', 'billdate'], required: true },
    invoiceNo: { aliases: ['invoiceno', 'invoicenumber', 'billno', 'billnumber', 'invoice'], required: false },
    code: { aliases: ['productcode', 'code', 'sku', 'itemcode'], required: true },
    size: { aliases: ['size'], required: false },
    quantity: { aliases: ['quantity', 'qty', 'units'], required: true },
    unitPrice: { aliases: ['unitprice', 'sellingprice', 'price', 'rate'], required: false },
    discount: { aliases: ['discount', 'discountamount', 'linediscount'], required: false },
  },
};

const RETURNS: SheetSpec<RawWorkbook['returns'][number]> = {
  name: 'Returns', required: false,
  columns: {
    date: { aliases: ['date', 'returndate'], required: true },
    invoiceNo: { aliases: ['invoiceno', 'invoicenumber', 'billno', 'billnumber', 'invoice', 'originalinvoice'], required: false },
    code: { aliases: ['productcode', 'code', 'sku', 'itemcode'], required: true },
    size: { aliases: ['size'], required: false },
    quantity: { aliases: ['quantity', 'qty', 'units'], required: true },
    reason: { aliases: ['reason', 'returnreason', 'notes'], required: false },
  },
};

/** Collapses ExcelJS' many cell shapes (formula results, rich text, hyperlinks) to a plain value. */
function plain(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string') return v.trim() === '' ? null : v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if ('result' in o) return plain(o.result as ExcelJS.CellValue);
    if (Array.isArray(o.richText)) return plain((o.richText as Array<{ text: string }>).map((t) => t.text).join(''));
    if ('text' in o) return plain(o.text as ExcelJS.CellValue);
    if ('error' in o) return null;
  }
  return null;
}

function readSheet<T extends { row: number }>(
  wb: ExcelJS.Workbook, spec: SheetSpec<T>, problems: string[]
): T[] {
  const ws = wb.worksheets.find((w) => norm(w.name) === norm(spec.name));
  if (!ws) {
    if (spec.required) problems.push(`The "${spec.name}" sheet is missing.`);
    return [];
  }

  // Header row = first non-empty row (people sometimes leave a title row above).
  let headerRowNo = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    const vals = ws.getRow(r).values as ExcelJS.CellValue[];
    if (vals.filter((v) => plain(v) !== null).length >= 2) { headerRowNo = r; break; }
  }
  if (!headerRowNo) {
    if (spec.required) problems.push(`The "${spec.name}" sheet is empty.`);
    return [];
  }

  const headers = new Map<string, number>(); // normalised header → column index
  ws.getRow(headerRowNo).eachCell((cell, col) => headers.set(norm(plain(cell.value)), col));

  const colOf: Partial<Record<string, number>> = {};
  for (const [field, def] of Object.entries(spec.columns) as Array<[string, { aliases: string[]; required: boolean }]>) {
    const hit = def.aliases.map((a) => headers.get(a)).find((c) => c !== undefined);
    if (hit !== undefined) colOf[field] = hit;
    else if (def.required) problems.push(`"${spec.name}" has no "${def.aliases[0]}" column.`);
  }

  const out: T[] = [];
  for (let r = headerRowNo + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const item: Record<string, unknown> = { row: r };
    let any = false;
    for (const field of Object.keys(spec.columns)) {
      const col = colOf[field];
      const v = col === undefined ? null : plain(row.getCell(col).value);
      item[field] = v;
      if (v !== null) any = true;
    }
    if (any) out.push(item as unknown as T); // skip fully blank rows
  }
  return out;
}

export async function readWorkbook(file: string): Promise<{ data: RawWorkbook; problems: string[] }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(file);
  } catch (err) {
    throw new Error(`Could not open "${file}" as an .xlsx file: ${(err as Error).message}`);
  }
  const problems: string[] = [];
  const data: RawWorkbook = {
    products: readSheet(wb, PRODUCTS, problems),
    purchases: readSheet(wb, PURCHASES, problems),
    sales: readSheet(wb, SALES, problems),
    returns: readSheet(wb, RETURNS, problems),
  };
  return { data, problems };
}

/** Exposed so the template/sample generator writes exactly the headers the reader expects. */
export const SHEET_HEADERS = {
  Products: ['product_code', 'product_name', 'category', 'subcategory', 'selling_price', 'cost_price', 'supplier'],
  Purchases: ['date', 'product_code', 'size', 'quantity', 'unit_cost'],
  Sales: ['date', 'invoice_no', 'product_code', 'size', 'quantity', 'unit_price', 'discount'],
  Returns: ['date', 'invoice_no', 'product_code', 'size', 'quantity', 'reason'],
} as const;
