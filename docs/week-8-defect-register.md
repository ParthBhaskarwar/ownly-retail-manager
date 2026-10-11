# OWNLY AI Retail Manager — Week 8 Defect Register

**Release Candidate Scope:** Week 8 Quality Assurance & Defect Management  
**Date:** September 28, 2026  
**Final Quality Gate:** Critical Open = 0 | High Open = 0  

---

## Defect Summary

| Total Discovered | Critical Fixed | High Fixed | Medium Fixed | Low Fixed | Open Defects |
|------------------|----------------|------------|--------------|-----------|--------------|
| 4                | 1              | 1          | 2            | 0         | 0            |

---

## Defect Log & Resolutions

| ID | Module | Defect | Severity | Reproduction | Root Cause | Fix | Test Verification | Status |
|----|--------|---------|----------|--------------|------------|-----|-------------------|--------|
| **DEF-001** | RBAC / Authorization | MANAGER role evaluated `true` for `settings:edit` permission | **CRITICAL** | Run `npm test` in `Frontend`. `evaluatePermission('MANAGER', 'settings:edit')` returned `true`. | In `Frontend/src/config/permissions.ts` and `Backend/src/config/permissions.ts`, `settings:edit` was erroneously set to `true` for `MANAGER`. | Set `'settings:edit': false` for `MANAGER` in both permission matrices. | `Frontend/__tests__/permissions.test.ts` passed (89/89 tests pass). | **RESOLVED** |
| **DEF-002** | Dashboard / Reports | Stock Valuation displayed ₹0 on Dashboard after PostgreSQL data load | **HIGH** | Log in with store having items in PostgreSQL; view Dashboard stock valuation cards. Value shows ₹0. | `ReportService.getInventoryValuationReport` in Frontend only queried browser IndexedDB (`db`), which is empty when backend PostgreSQL API is used. | Updated `ReportService.getInventoryValuationReport` to query live PostgreSQL `/api/inventory/valuation` & `/api/reports/inventory` when authenticated, falling back to Dexie. | Tested report fetching and dashboard valuation state. `npm test` passed. | **RESOLVED** |
| **DEF-003** | Testing Infrastructure | `ts-jest` configuration warning during backend test execution | **MEDIUM** | Run `npm test` in `Backend`. Console outputs deprecation warning for `ts-jest` under `globals`. | `jest.config.js` used deprecated `globals: { 'ts-jest': ... }` syntax. | Refactored `jest.config.js` to use modern `transform` array tuple format. | Backend test execution runs cleanly without deprecation warnings. | **RESOLVED** |
| **DEF-004** | Security / Database | Postgres SSL driver mode alias warning on Neon PG connection | **MEDIUM** | Start backend or run tests against Neon Postgres URL. PG driver emits SSL mode warning. | `sslmode=require` in Neon Postgres URL triggers `pg-connection-string` v3 warning regarding libpq compatibility. | Configured `sslConfig` in `Backend/src/db/pg-mapping.ts` to explicitly define SSL verification settings. | Database connection operates cleanly with zero driver warnings. | **RESOLVED** |

---

## Final Verification Statement

As of September 28, 2026:
- **Critical Open Defects:** 0
- **High Open Defects:** 0
- **Medium Open Defects:** 0
- **Low Open Defects:** 0

The application meets all release candidate hardening criteria.

---

## Addendum — Post-release audit (28 Sep 2026)

The register above stated 0 open defects. A full-codebase audit afterwards found the
defects below, all now fixed and covered by tests
(`Backend/tests/integration/billing_returns.test.ts`, `Frontend/__tests__/week8-fixes.test.ts`).

| ID | Severity | Defect | Fix |
|----|----------|--------|-----|
| DEF-005 | CRITICAL | Returns and exchanges failed on every call — they inserted into a non-existent `audit_logs.details` column, rolling back the transaction | Write to `meta`; rewritten routers |
| DEF-006 | CRITICAL | Billing, returns, exchanges, customers and credit-note routes only filtered by store `if (storeId)` — an account with no store could read every store's data; returns/exchanges could target another store's invoice | `requireStoreId` on every route; all lookups store-scoped |
| DEF-007 | CRITICAL | Dev-mode auth fallback turned any missing/invalid/expired token into an OWNER | Removed; bad token → 401 |
| DEF-008 | HIGH | Checkout trusted client prices, discounts and tax; refunds trusted the client amount; cashier discount limit was UI-only | Server computes price, discount limit, GST and refundable amount |
| DEF-009 | HIGH | Billing/returns/exchanges/customers/credit notes had no permission checks | `billing:*`, `returns:create`, `exchanges:create` enforced |
| DEF-010 | HIGH | Deactivated staff, role changes and store changes did not take effect until the JWT expired | `authenticate` re-reads the user row on every request |
| DEF-011 | HIGH | Any user could create a store; managers could create/edit managers; stock summary endpoint was not store-scoped | Owner-only store creation; owner-only manager management; tenant check |
| DEF-012 | MEDIUM | Verification code used `Math.random`, never expired, unlimited guesses; no login rate limit | `crypto.randomInt`, 30-min expiry, 5-attempt lockout, resend endpoint, rate limits |
| DEF-013 | MEDIUM | Invoice/return numbers from `COUNT(*)+1` raced under concurrent checkouts | Advisory-lock numbering (`shared/docNumber.ts`) |
| DEF-014 | MEDIUM | GST from store settings was never applied to invoices | Applied server-side; POS preview mirrors it |
| DEF-015 | HIGH | Reports read an empty browser database; payment split (55/30/15) and refund (cost × 1.4) were fabricated | New `/api/reports/sales/summary`, `/returns/summary`, `/staff/activity`; all reports use real data |
| DEF-016 | HIGH | Inventory list read the empty browser database | Uses `GET /api/inventory` with search + pagination |
| DEF-017 | HIGH | Backup "restore" silently did nothing and reported success; export was an empty file | UI rebuilt on the real server backup API |
| DEF-018 | HIGH | New accounts skipped store onboarding; staff and reports pages spun forever with no store | Onboarding gate in the app layout; pages handle the no-store state |
| DEF-019 | MEDIUM | Sidebar taller than the viewport, so its nav could not scroll | Fixed `100dvh` height |
| DEF-020 | MEDIUM | Supplier dropdown was empty/hidden and nothing in the UI could add a supplier | `SupplierSelect` with inline "Add supplier" (new product, edit product, restock) |
| DEF-021 | MEDIUM | Photo-AI failures were swallowed silently; "Apply" would not overwrite existing values | Errors + retry shown; pick/apply suggestions; model warmed at startup |
| DEF-022 | MEDIUM | Returns/exchanges/invoices screens read snake_case fields the API does not return and fell back to the empty browser DB; receipts showed hard-coded fake store details | Use camelCase API + real store details |
| DEF-023 | LOW | Frontend kept a fake `localStorage` audit trail; unused browser-DB layer | Removed |

Not changed: the `dexie` package is still listed in `Frontend/package.json` (now unused);
removing it also rewrites `package-lock.json`.
