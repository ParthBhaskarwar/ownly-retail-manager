/**
 * Shapes passed between the retraining stages:
 *   Excel file → RawWorkbook → (preprocess) → CleanDataset → (stage) → database
 *   → (features) → (tune) → report + model file.
 */

export type Cell = string | number | boolean | Date | null;

export interface RawProduct {
  row: number;
  code: Cell;
  name: Cell;
  category: Cell;
  subcategory: Cell;
  sellingPrice: Cell;
  costPrice: Cell;
  supplier: Cell;
}

export interface RawPurchase {
  row: number;
  date: Cell;
  code: Cell;
  size: Cell;
  quantity: Cell;
  unitCost: Cell;
}

export interface RawSale {
  row: number;
  date: Cell;
  invoiceNo: Cell;
  code: Cell;
  size: Cell;
  quantity: Cell;
  unitPrice: Cell;
  discount: Cell;
}

export interface RawReturn {
  row: number;
  date: Cell;
  invoiceNo: Cell;
  code: Cell;
  size: Cell;
  quantity: Cell;
  reason: Cell;
}

export interface RawWorkbook {
  products: RawProduct[];
  purchases: RawPurchase[];
  sales: RawSale[];
  returns: RawReturn[];
}

// ─── After preprocessing ──────────────────────────────────────────────────────

export interface CleanProduct {
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  supplier: string | null;
  sellingPrice: number;
  costPrice: number;
  sizes: string[];
}

/** One time a physical unit was sold, and whether it later came back. */
export interface CleanSale {
  at: Date;
  invoiceKey: string;
  unitPrice: number;
  discount: number;
  returnedAt: Date | null;
  returnReason: string | null;
}

/** One physical garment: bought once, sold (and possibly returned and re-sold) any number of times. */
export interface CleanUnit {
  productCode: string;
  size: string;
  receivedAt: Date;
  cost: number;
  /** True when the Purchases sheet had no stock for a sale and the cleaner assumed it. */
  inferred: boolean;
  sales: CleanSale[];
}

export interface CleanDataset {
  products: CleanProduct[];
  units: CleanUnit[];
}

export type IssueLevel = 'error' | 'warning' | 'info';

export interface Issue {
  level: IssueLevel;
  sheet: 'Products' | 'Purchases' | 'Sales' | 'Returns' | 'Workbook';
  /** Excel row number, when the issue is about one row. */
  row?: number;
  message: string;
}

export interface QualityReport {
  rowsRead: { products: number; purchases: number; sales: number; returns: number };
  rowsUsed: { products: number; purchases: number; sales: number; returns: number };
  unitsPurchased: number;
  unitsSold: number;
  unitsInferred: number;
  inferredShare: number;
  firstDate: string | null;
  lastDate: string | null;
  historyDays: number;
  issues: Issue[];
  /** Problems that make the data unusable for training. Empty means "go". */
  blockers: string[];
}

/** Valid categories, from the database, that product rows are matched against. */
export interface CategoryCatalog {
  categories: Array<{ id: string; name: string }>;
  subcategories: Array<{ id: string; name: string; categoryId: string }>;
}
