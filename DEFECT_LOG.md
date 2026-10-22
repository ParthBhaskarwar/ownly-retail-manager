# Ownly AI Retail Manager — Defect Log
**Document ID:** D15-DL-001  
**Version:** 1.0  
**Date:** 22 October 2026  
**Status:** Active — updated as defects are found and resolved

---

## Severity Definitions

| Severity | Criteria |
|:--------:|----------|
| **S1 — Critical** | System crash, data loss, security vulnerability, core flow completely broken |
| **S2 — Major** | Feature does not work as specified; no workaround available |
| **S3 — Minor** | Feature partially works; workaround exists |
| **S4 — Cosmetic** | UI/UX issue, wording, layout misalignment |

## Status Definitions
`OPEN` · `IN_PROGRESS` · `RESOLVED` · `CLOSED` · `WONT_FIX`

---

## Open Defects

| ID | Sev | Module | Title | Steps to Reproduce | Expected | Actual | Status | Raised |
|----|:---:|--------|-------|--------------------|----------|--------|--------|--------|
| DEF-007 | S3 | Backup (Frontend) | Restore confirmation UI lacks a data-loss warning dialog | 1. Go to Backup page. 2. Click Restore on a backup. | A modal warning "This will overwrite current data. Proceed?" appears before restore executes. | Restore executes immediately without confirmation. | OPEN | 2026-10-22 |
| DEF-008 | S3 | D14 | No Audit Log viewer page in the frontend | 1. Log in as OWNER. 2. Look for an Audit Log link. | An audit log list page exists under `/audit`. | No audit log page found in the app navigation. | OPEN | 2026-10-22 |
| DEF-009 | S4 | D14 | No Storage Health dashboard in the frontend | 1. Go to Backup page. | Disk usage, IndexedDB quota, and DB row counts displayed. | Backup page shows backup list but no storage health widget. | OPEN | 2026-10-22 |
| DEF-010 | S3 | Auth (Backend) | Email verification code is logged to console in production | 1. Deploy to production. 2. Create an account. | Code is sent by email; not printed to console. | `console.info` always logs the code regardless of `NODE_ENV`. | OPEN | 2026-10-22 |
| DEF-011 | S4 | Reports | `ReportService.ts` branch coverage is 5.76% | Run `npm test -- --coverage`. | Core report service functions have ≥ 50% branch coverage. | Most branches (date range, filter, aggregation paths) not exercised by existing tests. | OPEN | 2026-10-22 |

---

## Resolved Defects

| ID | Sev | Module | Title | Resolution | Resolved |
|----|:---:|--------|-------|------------|----------|
| DEF-001 | S2 | Barcode | Sibling size variants whose SKUs truncate identically received duplicate barcodes | Barcode sequence scoped to store-level instead of variant-level (barcode.integration.test.ts TC-BC-05 now passes) | 2026-09-15 |
| DEF-002 | S3 | Billing | Floating-point drift in tax computation caused totals to differ by ₹0.01 | Introduced `round2()` utility — all tax and total calculations now go through `round2` before display and storage. | 2026-09-21 |
| DEF-003 | S3 | AI | `analyseAll` produced non-deterministic order across runs due to unsorted `Map` iteration | Map iteration order is now deterministic (insertion order); `analyseAll` sorts results by productId before returning. | 2026-09-25 |
| DEF-004 | S2 | Inventory | Status filter tabs showed stale counts after a manual status update (no refresh) | `InventoryTable` now dispatches a store-level invalidation event; filter counts refresh automatically. | 2026-09-28 |
| DEF-005 | S3 | Photo AI | `applyPhotoSuggestions` mutated the caller's input object | Function now spreads into a new object before applying changes (TC-ATTR-04 added as regression guard). | 2026-10-01 |
| DEF-006 | S3 | Inventory | Stock entries with `barcodes.length !== quantity` were silently accepted | Zod schema validation added; `400 Bad Request` returned with message matching /does not match quantity/i (TC-BC-08). | 2026-10-05 |

---

## Defect Summary

| Severity | Open | Resolved | Total |
|:--------:|:----:|:--------:|:-----:|
| S1 — Critical | 0 | 0 | 0 |
| S2 — Major | 0 | 2 | 2 |
| S3 — Minor | 3 | 3 | 6 |
| S4 — Cosmetic | 2 | 0 | 2 |
| **Total** | **5** | **5** | **10** |

> ✅ **No S1 Critical defects open.** The system is stable for demonstration.  
> ⚠️ DEF-007, DEF-008, DEF-009 are tracked under the D14 pending items.  
> ⚠️ DEF-010 is a known limitation to disclose at handover (email service not implemented).
