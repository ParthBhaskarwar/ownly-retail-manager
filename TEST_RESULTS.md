# Ownly AI Retail Manager — Test Results & Acceptance Evidence
**Document ID:** D15-TE-001  
**Version:** 1.0  
**Date:** 22 October 2026  
**Tester:** Development Team  
**Reference:** TEST_PLAN.md (D15-TP-001)

---

## 1. Executive Summary

| Category | Result |
|----------|--------|
| Frontend unit test suites | ✅ **6 / 6 passed** |
| Frontend test cases | ✅ **101 / 101 passed** |
| Backend unit test suites (AI + Photo) | ✅ **3 / 3 passed** |
| Backend test cases (unit) | ✅ **38 passed, 2 skipped (model download tests, intentional)** |
| Total automated tests passing | ✅ **139 passed** |
| Test failures | ✅ **0** |
| Open S1 Critical defects | ✅ **0** |
| Frontend core-logic line coverage | ✅ **High on tested modules** |

**Verdict: PASS — System meets automated acceptance criteria.**

---

## 2. Frontend Test Run Results

**Command:** `cd Frontend && npm test -- --coverage`  
**Run date:** 22 October 2026  
**Environment:** Node.js 20, Jest 29, ts-jest

### 2.1 Test Suite Summary

| Test Suite | Tests | Status | Time |
|-----------|------:|--------|-----:|
| `__tests__/permissions.test.ts` | 37 | ✅ PASS | ~2s |
| `__tests__/retail-template.test.ts` | 19 | ✅ PASS | ~1s |
| `__tests__/billing.test.ts` | 3 | ✅ PASS | ~1s |
| `__tests__/reports-export.test.ts` | 2 | ✅ PASS | ~1s |
| `__tests__/backup.test.ts` | 4 | ✅ PASS | ~1s |
| `__tests__/week8-fixes.test.ts` | 36 | ✅ PASS | ~1s |
| **TOTAL** | **101** | **✅ ALL PASS** | **26.6s** |

```
Test Suites: 6 passed, 6 total
Tests:       101 passed, 101 total
Snapshots:   0 total
Time:        26.584 s
```

### 2.2 Frontend Coverage Report

| File / Module | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| `config/permissions.ts` | **100%** | **100%** | **100%** | **100%** |
| `config/retail-templates.ts` | **100%** | **100%** | **100%** | **100%** |
| `modules/retail-template/types.ts` | **100%** | **100%** | **100%** | **100%** |
| `modules/reports/services/ExportService.ts` | **91.7%** | **73.5%** | **83.3%** | **96.4%** |
| `modules/reports/services/ReportService.ts` | 20% | 5.8% | 16.7% | 23.2% |
| `modules/backup/services/BackupService.ts` | **100%** | **100%** | **100%** | **100%** |
| `modules/attributes/applySuggestions.ts` | **100%** | **100%** | **100%** | **100%** |
| `lib/money.ts` | **100%** | **100%** | **100%** | **100%** |
| UI components (React) | 0% | 0% | 0% | 0% |

> **Note on 0% UI component coverage:** This is expected and normal. React components (`.tsx` files for
> forms, tables, modals etc.) require a browser-like rendering environment. The unit tests cover pure
> TypeScript business logic only. Component behaviour is verified via the manual test checklist (Section 4).
>
> **Note on ReportService.ts:** The core date-range calculation (`getDateRange`) has 100% test coverage.
> The low overall % is because the bulk of `ReportService.ts` contains SQL-backed aggregation methods
> that require a live database — these are covered by the Backend integration tests, not the Frontend unit tests.

---

## 3. Backend Test Run Results

### 3.1 Unit Tests — AI Scoring & Photo Intelligence

**Command:** `cd Backend && npm test -- --testPathPattern="ai-scoring|embedding"`  
**Run date:** 22 October 2026  
**Environment:** Node.js 20, Jest 29, ts-jest, no database required

| Test Suite | Tests | Skipped | Status | Time |
|-----------|------:|:-------:|--------|-----:|
| `tests/ai-scoring.test.ts` | 20 | 0 | ✅ PASS | 17.6s |
| `tests/embedding.service.test.ts` | 9 | 2* | ✅ PASS | ~1s |
| `tests/integration/product_embeddings.test.ts` | 9 | 0 | ✅ PASS | 8.6s |
| **TOTAL** | **38** | **2** | **✅ ALL PASS** | **28.6s** |

```
Test Suites: 3 passed, 3 total
Tests:       2 skipped, 38 passed, 40 total
Time:        28.638 s
```

*\*The 2 skipped tests require `RUN_MODEL_TESTS=true` to download the 90 MB CLIP model. They are intentionally skipped in normal CI runs. To run them: `RUN_MODEL_TESTS=true npm test -- --testPathPattern=embedding`*

### 3.2 Integration Tests — Barcode Engine (Gate 2)

**Command:** `cd Backend && npm test -- --testPathPattern="barcode"`  
**Requirements:** Live PostgreSQL database, seeded with clothing template  
**Test:** `tests/barcode.integration.test.ts`

| Test Case | Description | Result |
|-----------|-------------|--------|
| TC-BC-01/02/03/04 | 20-item entry → 20 distinct barcodes, IN_STOCK, 20 PURCHASE movements | ✅ PASS |
| TC-BC-05 | Sibling sizes with truncated SKUs get distinct barcodes | ✅ PASS |
| TC-BC-06 | Later stock additions continue the sequence without collision | ✅ PASS |
| TC-BC-07 | Duplicate barcode rejected with 409 Conflict | ✅ PASS |
| TC-BC-08 | barcodes[] length ≠ quantity rejected with 400 Bad Request | ✅ PASS |

### 3.3 Integration Tests — Backup & Restore (D14)

**Command:** `cd Backend && npm test -- --testPathPattern="backup"`  
**Test:** `tests/backup.test.ts`

| Test Case | Description | Result |
|-----------|-------------|--------|
| TC-BKP-05/06 | `createBackup` writes valid JSON file, records DB row | ✅ PASS |
| TC-BKP-07 | `restoreBackup` re-inserts deleted inventory_items | ✅ PASS |
| TC-BKP-08 | Second restore is idempotent — no duplicate rows | ✅ PASS |
| TC-BKP-09 | `getStorageHealth` returns positive backup count and size | ✅ PASS |

---

## 4. Manual Test Results

| # | Flow | Tested | Result | Notes |
|---|------|:------:|--------|-------|
| M-01 | Sign up → verify → create store → onboarding | ✅ | PASS | — |
| M-02 | Owner adds a CASHIER staff member | ✅ | PASS | — |
| M-03 | CASHIER login sees restricted sidebar | ✅ | PASS | Staff/Reports/Settings links hidden |
| M-04 | Add product + stock → barcodes appear in Inventory | ✅ | PASS | — |
| M-05 | POS sale via barcode scan, mixed payment | ✅ | PASS | Invoice PDF opens correctly |
| M-06 | Return processing | ✅ | PASS | Item status → RETURNED_TO_STOCK |
| M-07 | Exchange processing | ✅ | PASS | Old EXCHANGED, new SOLD |
| M-08 | AI restock advisory for existing product | ✅ | PASS | Recommendation with quantity + size mix |
| M-09 | Upload product photo → similarity panel | ✅ | PASS | Quality badge + similar products shown |
| M-10 | Export report as CSV | ✅ | PASS | `.csv` file downloads correctly |
| M-11 | Create a manual backup and download | ✅ | PASS | JSON file downloads |
| M-12 | Restore from backup | ⚠️ | PARTIAL | Restore executes but lacks confirmation dialog (DEF-007) |

---

## 5. Known Limitations & Accepted Risks

| # | Item | Severity | Decision |
|---|------|:--------:|----------|
| L-01 | Email verification sends code via `console.log` only (no real email service) | S3 | **Accepted** — noted in Backend README and at handover. Email service is a post-submission integration. |
| L-02 | CLIP photo AI model tests skipped by default (90 MB download) | S4 | **Accepted** — model tests run manually with `RUN_MODEL_TESTS=true`. |
| L-03 | No Audit Log viewer page in the frontend | S3 | **Open** — tracked as DEF-008. |
| L-04 | No Storage Health widget in the frontend | S4 | **Open** — tracked as DEF-009. |
| L-05 | Restore lacks a confirmation dialog | S3 | **Open** — tracked as DEF-007. |
| L-06 | Backend integration tests require a seeded PostgreSQL instance | — | **Accepted** — documented in `Backend/README.md`. |

---

## 6. Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer / Tester | Development Team | 22 October 2026 | *Signed* |
| Reviewer | — | — | *Pending* |

---

## 7. Appendix — How to Reproduce the Test Run

```bash
# 1. Clone the repository and install dependencies
cd Frontend && npm install
cd ../Backend && npm install

# 2. Run Frontend unit tests (no database needed)
cd Frontend
npm test -- --coverage

# 3. Run Backend unit tests (no database needed)
cd Backend
npm test -- --testPathPattern="ai-scoring|embedding"

# 4. Run Backend integration tests (database required)
# Copy Backend/.env.example → Backend/.env and fill DATABASE_URL
cd Backend
npm run db:migrate
npm run db:seed
npm test -- --testPathPattern="barcode|backup"

# 5. Run ALL Backend tests
cd Backend
npm test
```
