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
