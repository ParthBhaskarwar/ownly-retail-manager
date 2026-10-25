/**
 * make-retrain-sample — writes the two Excel files the retraining guide refers to:
 *
 *   model/sample/retraining_template.xlsx     blank-ish template: instructions, headers, a few example rows
 *   model/sample/retraining_sample_data.xlsx  15 months of realistic made-up history, to try the pipeline end to end
 *
 *   npm run ai:retrain-sample
 *
 * Category names are read from the database so the sample always matches the
 * app's own category list.
 */

import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { db } from '@/db/client';
import { ModelRegistry } from '@/services/ai/model-registry';
import { SHEET_HEADERS } from '@/retraining/excel-reader';

// ─── Seeded randomness (same sample every run on the same day) ────────────────

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(rand: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L && k < 50);
  return k - 1;
}

const DAY = 86_400_000;
const utc = (t: number): number => Math.floor(t / DAY) * DAY;

// ─── Workbook styling ─────────────────────────────────────────────────────────

function styleSheet(ws: ExcelJS.Worksheet, widths: number[], dateCols: number[] = []): void {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  ws.getRow(1).alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (const c of dateCols) ws.getColumn(c).numFmt = 'yyyy-mm-dd';
}

const COLUMN_HELP: Array<[string, string, string, string, string]> = [
  // sheet, column, required?, what to type, example
  ['Products', 'product_code', 'Required', 'Your own unique code for the design. Letters/numbers, no spaces. The same code is used in the other sheets.', 'KUR-001'],
  ['Products', 'product_name', 'Optional', 'Name as you call it.', 'Cotton Straight Kurta - Blue'],
  ['Products', 'category', 'Required', 'One of the categories in the app (see the list in the last section below).', "Women's Ethnic"],
  ['Products', 'subcategory', 'Optional', 'A subcategory of that category. Helps find similar products. Leave blank if unsure.', 'Kurtas'],
  ['Products', 'selling_price', 'Required', 'Usual price on the tag, in rupees. Numbers only.', '1299'],
  ['Products', 'cost_price', 'Optional', 'What you paid per piece. If blank, 60% of the selling price is assumed (affects profit scores only).', '780'],
  ['Products', 'supplier', 'Optional', 'Supplier name.', 'Shreeji Textiles'],
  ['Purchases', 'date', 'Required', 'Day the stock arrived. Real Excel date, or text like 2026-03-31 or 31/03/2026 (day first).', '2026-03-31'],
  ['Purchases', 'product_code', 'Required', 'Must exist in the Products sheet.', 'KUR-001'],
  ['Purchases', 'size', 'Optional', 'S, M, L, XL, 28, 30 … Leave blank or write "Free Size" for one-size items.', 'M'],
  ['Purchases', 'quantity', 'Required', 'Pieces received. Whole number above 0. Include your opening stock as a purchase on its first day.', '20'],
  ['Purchases', 'unit_cost', 'Optional', 'Cost per piece for this lot. If blank, the product cost_price is used.', '780'],
  ['Sales', 'date', 'Required', 'Day of the sale.', '2026-04-05'],
  ['Sales', 'invoice_no', 'Optional', 'Bill number. Lines with the same number and date become one bill. If blank, each row is its own bill.', 'INV-1042'],
  ['Sales', 'product_code', 'Required', 'Must exist in the Products sheet.', 'KUR-001'],
  ['Sales', 'size', 'Optional', 'Size sold. Same spelling rules as Purchases.', 'M'],
  ['Sales', 'quantity', 'Required', 'Pieces sold on this line. Whole number above 0.', '1'],
  ['Sales', 'unit_price', 'Optional', 'Price actually charged per piece, before the discount column. If blank, the product selling_price is used.', '1299'],
  ['Sales', 'discount', 'Optional', 'Total discount in rupees on this line (not per piece, not a percentage). Blank or 0 if none.', '100'],
  ['Returns', 'date', 'Required', 'Day the customer returned the piece.', '2026-04-12'],
  ['Returns', 'invoice_no', 'Optional', 'The bill it was sold on. Helps match the return to the right sale.', 'INV-1042'],
  ['Returns', 'product_code', 'Required', 'Must exist in the Products sheet.', 'KUR-001'],
  ['Returns', 'size', 'Optional', 'Size returned.', 'M'],
  ['Returns', 'quantity', 'Required', 'Pieces returned.', '1'],
  ['Returns', 'reason', 'Optional', 'Why, in a few words.', 'Size issue'],
];

async function instructionsSheet(wb: ExcelJS.Workbook, categories: string[]): Promise<void> {
  const ws = wb.addWorksheet('Instructions');
  ws.getColumn(1).width = 14; ws.getColumn(2).width = 18; ws.getColumn(3).width = 11; ws.getColumn(4).width = 78; ws.getColumn(5).width = 28;

  const put = (text: string, bold = false, size = 11) => {
    const r = ws.addRow([text]);
    r.getCell(1).font = { bold, size };
    ws.mergeCells(r.number, 1, r.number, 5);
    r.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    if (text.length > 110) r.height = Math.ceil(text.length / 110) * 15;
    return r;
  };

  put('Ownly — retraining workbook', true, 16);
  put('Fill the four sheets after this one (Products, Purchases, Sales, Returns), save the file, and give it to the retraining script. The script cleans the data, builds all the features and retrains the model — you do not need to calculate anything.', false);
  ws.addRow([]);
  put('How to fill it in', true, 13);
  put('1. Delete the example rows in each sheet (keep the header row). Do not rename the sheets or the header cells.');
  put('2. Products: one row per design you sell. Every product_code used in Purchases, Sales and Returns must be listed here.');
  put('3. Purchases: every time stock arrived — including what you had on the shelf on your first day (enter it as a purchase on that day).');
  put('4. Sales: one row per product-size per bill. Quantity above 1 is fine.');
  put('5. Returns is optional. Leave it with only the header row if you do not track returns.');
  put('6. Dates: use real Excel dates, or type 2026-03-31 or 31/03/2026 (day first). Future dates are ignored.');
  put('7. About 9 months of sales history is the minimum; 12 months or more is better. More than one festive season is ideal.');
  put('8. Mistakes are OK: rows that cannot be used are skipped and listed (with the Excel row number) in the report. If too many rows are bad, the script stops and tells you what to fix.');
  ws.addRow([]);
  put('What each column means', true, 13);
  const head = ws.addRow(['Sheet', 'Column', 'Needed?', 'What to type', 'Example']);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; });
  for (const row of COLUMN_HELP) {
    const r = ws.addRow(row);
    r.alignment = { wrapText: true, vertical: 'top' };
    if (row[2] === 'Required') r.getCell(3).font = { bold: true, color: { argb: 'FFB91C1C' } };
  }
  ws.addRow([]);
  put('Categories you can use in the Products sheet', true, 13);
  put(categories.join('  •  '));
}

function addTable(wb: ExcelJS.Workbook, name: keyof typeof SHEET_HEADERS, rows: Array<Array<string | number | Date | null>>, widths: number[], dateCols: number[] = []): void {
  const ws = wb.addWorksheet(name);
  ws.addRow([...SHEET_HEADERS[name]]);
  for (const r of rows) ws.addRow(r);
  styleSheet(ws, widths, dateCols);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cats = (await db.raw(
    `SELECT c.id, c.name FROM categories c WHERE c.store_id IS NULL AND c.retail_template_id = 'tpl_clothing' ORDER BY c.name`
  )).rows as Array<{ id: string; name: string }>;
  const subs = (await db.raw(
    `SELECT s.name, s.category_id AS "categoryId" FROM subcategories s JOIN categories c ON c.id = s.category_id
      WHERE s.store_id IS NULL AND c.retail_template_id = 'tpl_clothing' ORDER BY s.name`
  )).rows as Array<{ name: string; categoryId: string }>;
  if (!cats.length) throw new Error('No clothing categories in the database. Run: npm run db:seed');

  const outDir = path.join(ModelRegistry.modelDir(), 'sample');
  fs.mkdirSync(outDir, { recursive: true });
  const catNames = cats.map((c) => c.name);

  // 1. Template: instructions + three consistent example products
  {
    const wb = new ExcelJS.Workbook();
    await instructionsSheet(wb, catNames);
    const c1 = cats[0], sub1 = subs.find((s) => s.categoryId === c1.id)?.name ?? null;
    addTable(wb, 'Products', [
      ['EX-001', 'Example Kurta - Blue', c1.name, sub1, 1299, 780, 'Example Supplier'],
      ['EX-002', 'Example Kurta - Maroon', c1.name, sub1, 1499, 900, 'Example Supplier'],
    ], [16, 32, 22, 20, 14, 12, 22]);
    addTable(wb, 'Purchases', [
      [new Date(Date.UTC(2026, 0, 5)), 'EX-001', 'M', 20, 780],
      [new Date(Date.UTC(2026, 0, 5)), 'EX-001', 'L', 20, 780],
      [new Date(Date.UTC(2026, 0, 5)), 'EX-002', 'M', 15, null],
    ], [14, 16, 10, 12, 12], [1]);
    addTable(wb, 'Sales', [
      [new Date(Date.UTC(2026, 0, 9)), 'INV-1001', 'EX-001', 'M', 1, 1299, 0],
      [new Date(Date.UTC(2026, 0, 9)), 'INV-1001', 'EX-002', 'M', 1, 1499, 100],
      [new Date(Date.UTC(2026, 0, 14)), 'INV-1002', 'EX-001', 'L', 2, null, null],
    ], [14, 14, 16, 10, 12, 12, 12], [1]);
    addTable(wb, 'Returns', [
      [new Date(Date.UTC(2026, 0, 16)), 'INV-1001', 'EX-001', 'M', 1, 'Size issue'],
    ], [14, 14, 16, 10, 12, 24], [1]);
    await wb.xlsx.writeFile(path.join(outDir, 'retraining_template.xlsx'));
    console.log(`Wrote ${path.join(outDir, 'retraining_template.xlsx')}`);
  }

  // 2. Sample data: ~15 months, 60 products
  {
    const rand = rng(20260101);
    const end = utc(Date.now() - 3 * DAY);
    const start = end - 455 * DAY;
    const sizes = ['S', 'M', 'L', 'XL'];
    const sizeShare = [0.18, 0.34, 0.31, 0.17];
    const usable = cats.filter((c) => subs.some((s) => s.categoryId === c.id)).slice(0, 4);
    const pool = usable.length ? usable : cats.slice(0, 1);

    const products: Array<Array<string | number | null>> = [];
    const purchases: Array<Array<string | number | Date | null>> = [];
    const sales: Array<Array<string | number | Date | null>> = [];
    const returns: Array<Array<string | number | Date | null>> = [];
    const suppliers = ['Shreeji Textiles', 'Anand Garments', 'Gulmohar Apparel', 'Rangoli Creations'];

    let invoiceSeq = 1000;
    const N = 60;
    for (let i = 0; i < N; i++) {
      const cat = pool[i % pool.length];
      const subList = subs.filter((s) => s.categoryId === cat.id);
      const sub = subList.length ? subList[Math.floor(rand() * subList.length)].name : null;
      const price = Math.round((499 + rand() * 1800) / 10) * 10 - 1;
      const cost = Math.round(price * (0.5 + rand() * 0.12));
      const code = `P${String(i + 1).padStart(3, '0')}`;
      products.push([code, `${sub ?? cat.name} Design ${i + 1}`, cat.name, sub, price, cost, suppliers[i % suppliers.length]]);

      const appeal = Math.exp((rand() - 0.5) * 2.2);          // some designs sell far better than others
      const baseRate = 0.14 * appeal;                          // units per day across all sizes when in stock
      const launch = start + Math.floor(rand() * 210) * DAY;
      const stock: Record<string, number> = { S: 0, M: 0, L: 0, XL: 0 };
      const lot = (day: number, qty: number) => {
        sizes.forEach((s, k) => {
          const q = Math.max(1, Math.round(qty * sizeShare[k]));
          stock[s] += q;
          purchases.push([new Date(day), code, s, q, cost]);
        });
      };
      lot(launch, 28 + Math.floor(rand() * 18));

      let nextReorder = launch + (35 + Math.floor(rand() * 30)) * DAY;
      for (let day = launch; day < end; day += DAY) {
        const month = new Date(day).getUTCMonth();
        const season = 1 + 0.35 * Math.sin(((month - 8) / 12) * 2 * Math.PI) + (month === 9 || month === 10 ? 0.25 : 0);
        const age = (day - launch) / DAY;
        const decay = age < 60 ? 1.25 : Math.max(0.55, 1.25 - (age - 60) / 420);
        const lambda = baseRate * season * decay;

        for (let k = 0; k < sizes.length; k++) {
          const s = sizes[k];
          if (stock[s] <= 0) continue;
          const n = Math.min(stock[s], poisson(rand, lambda * sizeShare[k]));
          if (n === 0) continue;
          stock[s] -= n;
          const discounted = age > 120 && rand() < 0.35;
          const unit = discounted ? Math.round(price * 0.85) : price;
          invoiceSeq += 1 + (rand() < 0.4 ? 0 : 1);
          sales.push([new Date(day), `INV-${invoiceSeq}`, code, s, n, unit, discounted ? (price - unit) * n : 0]);
          for (let r = 0; r < n; r++) {
            if (rand() < 0.045) {
              const when = day + (2 + Math.floor(rand() * 14)) * DAY;
              if (when < end) {
                returns.push([new Date(when), `INV-${invoiceSeq}`, code, s, 1, ['Size issue', 'Colour not as expected', 'Defect', 'Changed mind'][Math.floor(rand() * 4)]]);
                stock[s] += 1;
              }
            }
          }
        }
        if (day >= nextReorder && sizes.reduce((t, s) => t + stock[s], 0) < 12 && rand() < 0.7) {
          lot(day, 20 + Math.floor(rand() * 20));
          nextReorder = day + (25 + Math.floor(rand() * 40)) * DAY;
        }
      }
    }

    const byDate = (a: Array<unknown>, b: Array<unknown>) => (a[0] as Date).getTime() - (b[0] as Date).getTime();
    purchases.sort(byDate); sales.sort(byDate); returns.sort(byDate);

    const wb = new ExcelJS.Workbook();
    await instructionsSheet(wb, catNames);
    addTable(wb, 'Products', products, [16, 32, 22, 20, 14, 12, 22]);
    addTable(wb, 'Purchases', purchases, [14, 16, 10, 12, 12], [1]);
    addTable(wb, 'Sales', sales, [14, 14, 16, 10, 12, 12, 12], [1]);
    addTable(wb, 'Returns', returns, [14, 14, 16, 10, 12, 24], [1]);
    await wb.xlsx.writeFile(path.join(outDir, 'retraining_sample_data.xlsx'));
    console.log(`Wrote ${path.join(outDir, 'retraining_sample_data.xlsx')}  (${products.length} products, ${purchases.length} purchase rows, ${sales.length} sale rows, ${returns.length} return rows)`);
  }
}

main()
  .catch((err) => { console.error('Failed:', (err as Error).message); process.exitCode = 1; })
  .finally(() => db.destroy());
