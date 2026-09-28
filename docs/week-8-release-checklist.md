# OWNLY AI Retail Manager — Final Release Checklist

**Release Candidate Scope:** Week 8 Master Implementation & Hardening  
**Target Branch:** `release/week-8`  
**Date:** September 28, 2026  
**Final Quality Gate:** APPROVED FOR RELEASE CANDIDATE  

---

## 1. Feature & Integration Verification

- [x] **Week 1 Functionality:** Store onboarding, user authentication, JWT sessions, basic store profile verified.
- [x] **Week 2 Functionality:** Retail templates, category hierarchy, subcategories, custom attributes verified.
- [x] **Week 3 Functionality:** Product catalog, variants, size-wise stock, store-scoped barcode generation verified.
- [x] **Week 4 Functionality:** POS billing, checkout, invoice generation, returns, exchanges, refunds verified.
- [x] **Week 5 Functionality:** Operational dashboard, stock valuation, stock ageing, backup/restore verified.
- [x] **Week 6 Functionality:** Photo intelligence, Hugging Face CLIP embeddings, pgvector similarity search verified.
- [x] **Week 7 Functionality:** AI 5-factor scoring, AI-assisted restock, size recommendations, owner decision loop, backtesting verified.

---

## 2. Security & Compliance Controls

- [x] **Authentication:** Login, logout, JWT validation, expiration, invalid token handling tested.
- [x] **RBAC Matrix:** All 6 roles (`OWNER`, `MANAGER`, `CASHIER`, `INVENTORY_STAFF`, `ACCOUNTANT`, `VIEWER`) enforced on backend APIs.
- [x] **Settings Permission:** `settings:edit` restricted strictly to `OWNER` (DEF-001 resolved).
- [x] **Cross-Store Isolation:** All SQL queries scoped via `store_id` from JWT; direct API cross-tenant tampering blocked.
- [x] **Audit Logging:** Sensitive actions (logins, price edits, restocks, returns, backups) logged without sensitive credentials.
- [x] **Secret Handling:** Zero secrets or JWT keys committed in git repository.

---

## 3. Data Integrity & Resilience

- [x] **Inventory Integrity:** Stock deductions, returns, exchanges, and restocks run inside atomic Knex transactions.
- [x] **Barcode Integrity:** Store-scoped barcode sequence (`MAX(sequence)`) enforced with `(store_id, barcode)` unique constraint. Product editing preserves existing SKUs/barcodes.
- [x] **Backup System:** JSON archive generation with SHA-256 integrity hash verified.
- [x] **Restore System:** Test environment restore validation succeeds cleanly with zero corrupted records.
- [x] **Failure Recovery:** Database transaction rollbacks verified on simulated network/database errors.

---

## 4. UI, Responsive & PWA Experience

- [x] **Mobile Viewport (360-412px):** Touch targets >= 44px; mobile nav drawer functional; zero horizontal scrolling.
- [x] **Tablet Viewport (768-820px):** 2-column dashboard grid; scrollable tables; readable split POS view.
- [x] **Desktop Viewport (1280-1920px):** Spacious glassmorphic visual layout; pinned sidebar; instant catalog search.
- [x] **Dashboard Valuation Widget:** Fixed ₹0 valuation display issue when connected to PostgreSQL backend (DEF-002 resolved).
- [x] **PWA Functionality:** Web App Manifest valid; Service Worker registers cleanly; offline app shell loads.

---

## 5. Automated Build & Quality Gate

- [x] **Backend Unit & Integration Tests:** 8/8 test suites pass (`npm test --prefix Backend`).
- [x] **Frontend Unit & Component Tests:** 5/5 test suites pass (`npm test --prefix Frontend`).
- [x] **Frontend Typecheck:** `npx tsc --noEmit` passes with 0 errors.
- [x] **Backend Build:** `npm run build --prefix Backend` compiles cleanly to `/dist`.
- [x] **Frontend Production Build:** `npm run build --prefix Frontend` compiles 26/26 routes cleanly.

---

## 6. Quality Metrics & Release Evidence

- [x] **Critical Open Defects:** 0
- [x] **High Open Defects:** 0
- [x] **Medium Open Defects:** 0
- [x] **Low Open Defects:** 0
- [x] **UAT Verification:** 26 / 26 scenarios passed.
- [x] **Documentation Prepared:**
  - `docs/week-8-deferred-improvements.md`
  - `docs/week-8-defect-register.md`
  - `docs/week-8-user-acceptance-test.md`
  - `docs/week-8-release-evidence.md`
  - `docs/week-8-security-test-report.md`
  - `docs/week-8-responsive-offline-report.md`
  - `docs/week-8-architecture-review.md`
  - `docs/week-8-release-checklist.md`

---

## Release Candidate Decision

**STATUS: READY FOR RELEASE CANDIDATE DEPLOYMENT**  
*The OWNLY AI Retail Manager codebase meets all technical, security, quality, data integrity, and architectural requirements for Week 8 Release Candidate.*
