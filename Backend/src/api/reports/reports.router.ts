/**
 * Reports Router — /api/reports
 *
 * GET  /api/reports/sales              → JSON sales report
 * GET  /api/reports/inventory          → JSON inventory report
 * GET  /api/reports/suppliers          → JSON supplier report
 * GET  /api/reports/returns            → JSON returns report
 * GET  /api/reports/staff              → JSON staff performance report
 * GET  /api/reports/sales/export       → CSV or XLSX download
 * GET  /api/reports/inventory/export   → CSV or XLSX download
 * GET  /api/reports/returns/export     → CSV or XLSX download
 *
 * All routes require the reports:view permission (OWNER, MANAGER, ACCOUNTANT).
 *
 * Export format is controlled by the `format` query parameter: 'csv' or 'xlsx'.
 * The xlsx library (SheetJS) is used for Excel export. Install with:
 *   npm install xlsx
 */

import { Router } from 'express';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';
import { ReportsService, type ReportDateFilter } from '@/services/reports.service';
import { queryParam } from '@/shared/AppError';

export const reportsRouter = Router();
reportsRouter.use(authenticate);
reportsRouter.use(requirePermission('reports:view'));

// ─── Helper: build date filter from query string ──────────────────────────────

function dateFilter(query: Record<string, unknown>): ReportDateFilter {
  return {
    from: queryParam(query.from),
    to: queryParam(query.to),
  };
}

// ─── Helper: stream as CSV ────────────────────────────────────────────────────

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];
  return lines.join('\r\n');
}

// ─── Helper: stream as XLSX ───────────────────────────────────────────────────

async function toXlsx(rows: Record<string, unknown>[], sheetName: string): Promise<Buffer> {
  // Dynamic import so the server still starts if xlsx hasn't been installed yet
  // (it will throw a clear error at export time rather than at startup).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx') as typeof import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ─── Helper: export endpoint ─────────────────────────────────────────────────

function sendExport(
  res: import('express').Response,
  rows: Record<string, unknown>[],
  filename: string,
  format: string,
  sheetName: string
): Promise<void> {
  if (format === 'xlsx') {
    return toXlsx(rows, sheetName).then((buf) => {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      res.send(buf);
    });
  }
  // Default: CSV
  const csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send(csv);
  return Promise.resolve();
}

// ─── Sales ────────────────────────────────────────────────────────────────────

reportsRouter.get('/sales', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const rows = await ReportsService.getSalesReport(storeId, dateFilter(req.query));
    res.json({ rows, count: rows.length });
  } catch (err) { next(err); }
});

reportsRouter.get('/sales/export', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const rows = await ReportsService.getSalesReport(storeId, dateFilter(req.query));
    const format = queryParam(req.query.format) ?? 'csv';
    await sendExport(res, rows as unknown as Record<string, unknown>[], 'sales-report', format, 'Sales');
  } catch (err) { next(err); }
});

// ─── Inventory ────────────────────────────────────────────────────────────────

reportsRouter.get('/inventory', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const rows = await ReportsService.getInventoryReport(storeId);
    res.json({ rows, count: rows.length });
  } catch (err) { next(err); }
});

reportsRouter.get('/inventory/export', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const rows = await ReportsService.getInventoryReport(storeId);
    const format = queryParam(req.query.format) ?? 'csv';
    await sendExport(res, rows as unknown as Record<string, unknown>[], 'inventory-report', format, 'Inventory');
  } catch (err) { next(err); }
});

// ─── Suppliers ────────────────────────────────────────────────────────────────

reportsRouter.get('/suppliers', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const rows = await ReportsService.getSupplierReport(storeId);
    res.json({ rows, count: rows.length });
  } catch (err) { next(err); }
});

// ─── Returns ─────────────────────────────────────────────────────────────────

reportsRouter.get('/returns', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const rows = await ReportsService.getReturnsReport(storeId, dateFilter(req.query));
    res.json({ rows, count: rows.length });
  } catch (err) { next(err); }
});

reportsRouter.get('/returns/export', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const rows = await ReportsService.getReturnsReport(storeId, dateFilter(req.query));
    const format = queryParam(req.query.format) ?? 'csv';
    await sendExport(res, rows as unknown as Record<string, unknown>[], 'returns-report', format, 'Returns');
  } catch (err) { next(err); }
});

// ─── Staff ────────────────────────────────────────────────────────────────────

reportsRouter.get('/staff', async (req, res, next) => {
  try {
    const storeId = requireStoreId(req);
    const rows = await ReportsService.getStaffReport(storeId, dateFilter(req.query));
    res.json({ rows, count: rows.length });
  } catch (err) { next(err); }
});
