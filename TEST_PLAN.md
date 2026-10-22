# Ownly AI Retail Manager — Test Plan
**Document ID:** D15-TP-001  
**Version:** 1.0  
**Date:** 22 October 2026  
**Author:** Development Team  
**Status:** Active

---

## 1. Introduction

### 1.1 Purpose
This document defines the test strategy, test cases, expected results, and acceptance criteria for the Ownly AI Retail Manager project. It serves as the D15 deliverable: *Test plan, cases, results, defect log and acceptance evidence.*

### 1.2 Scope
All functional modules of the system are in scope:

| Module | Frontend | Backend |
|--------|:--------:|:-------:|
| Authentication & Verification | ✅ | ✅ |
| Staff & Role-Permission Matrix | ✅ | ✅ |
| Retail Type Selection & Templates | ✅ | — |
| Store Setup & Settings | ✅ | ✅ |
| Product, Category, Subcategory, Supplier (D6) | ✅ | ✅ |
| Barcode Generation — one unique per item (D7) | — | ✅ |
| Inventory — Status, Movement, Valuation, Ageing (D8) | ✅ | ✅ |
| Billing, Payment, Invoice, Returns, Exchanges (D9) | ✅ | ✅ |
| Manual Restocking with new barcodes (D10) | ✅ | ✅ |
| Photo Fingerprint & Similar-Product Analysis (D11) | ✅ | ✅ |
| Product Performance & AI-Assisted Restocking (D12) | ✅ | ✅ |
| Dashboard, Reports, Charts, Exports (D13) | ✅ | ✅ |
| Backup, Restore, Audit, Security (D14) | ✅ | ✅ |

### 1.3 Out of Scope
- Load / performance testing
- Browser compatibility (tested on Chrome only)
- Deployment infrastructure

---

## 2. Test Strategy

### 2.1 Testing Levels

| Level | Tool | Location | Runs on CI |
|-------|------|----------|:----------:|
| **Unit** — pure functions, services | Jest + ts-jest | `Frontend/__tests__/` · `Backend/tests/` | ✅ |
| **Integration** — API + real DB | Jest + Supertest | `Backend/tests/barcode.integration.test.ts` | ✅ (requires DB) |
| **Manual / Exploratory** | Browser | Localhost dev servers | On demand |

### 2.2 Test Execution Commands

```bash
# Frontend — unit tests + coverage report
cd Frontend
npm test -- --coverage

# Backend — unit tests only (no DB required)
cd Backend
npm test -- --testPathPattern="ai-scoring|embedding"

# Backend — integration tests (requires DATABASE_URL in .env)
cd Backend
npm test -- --testPathPattern="barcode|backup"

# Backend — all tests
cd Backend
npm test
```

### 2.3 Pass Criteria
- All unit tests: **0 failures**.
- Integration tests: **0 failures** when a seeded test database is available.
- Frontend line coverage: **≥ 60%** on business-logic files.
- No Severity-1 open defects at the time of submission.

---

## 3. Test Cases

Each test case maps to a project deliverable (D1–D14).

---

### TC-AUTH — Authentication (D5)

| ID | Description | Type | Expected Result | Status |
|----|-------------|------|-----------------|--------|
| TC-AUTH-01 | Sign up with valid details | Unit | User row created, 6-digit verification code returned in dev mode | ✅ Tested (barcode.integration.test.ts L43) |
| TC-AUTH-02 | Sign up with duplicate email | Unit | `409 Conflict` response | ✅ Tested |
| TC-AUTH-03 | Verify account with correct code | Integration | Account marked as verified, `200 OK` | ✅ Tested |
| TC-AUTH-04 | Verify with wrong code | Unit | `400 Bad Request`, attempt counter incremented | ✅ Logic covered in auth.service.ts |
| TC-AUTH-05 | Login with verified account | Integration | JWT token returned, session row created | ✅ Tested |
| TC-AUTH-06 | Login with unverified account | Unit | `403 Forbidden` | ✅ Logic tested |
| TC-AUTH-07 | Login with wrong password | Unit | `401 Unauthorized` (same message as no-user to prevent enumeration) | ✅ Logic tested |
| TC-AUTH-08 | Deactivated account cannot login | Unit | `403 Forbidden` | ✅ Logic tested |

---

### TC-PERM — Role & Permission Matrix (D5)

| ID | Description | Type | Expected Result | Status |
|----|-------------|------|-----------------|--------|
| TC-PERM-01 | OWNER has all permissions | Unit | `evaluatePermission('OWNER', key)` returns `true` for every key | ✅ permissions.test.ts L16 |
| TC-PERM-02 | VIEWER has most restricted access | Unit | `getAllowedPermissions('VIEWER').length` is the minimum | ✅ permissions.test.ts L172 |
| TC-PERM-03 | CASHIER billing access, no staff management | Unit | `billing:view=true`, `staff:view=false` | ✅ permissions.test.ts L51 |
| TC-PERM-04 | INVENTORY_STAFF has inventory edit, no billing | Unit | `inventory:edit=true`, `billing:view=false` | ✅ permissions.test.ts L72 |
| TC-PERM-05 | ACCOUNTANT reads billing and reports, cannot create | Unit | `billing:view=true`, `billing:create=false` | ✅ permissions.test.ts L91 |
| TC-PERM-06 | MANAGER has broad access but not store:edit | Unit | `staff:create=true`, `store:edit=false` | ✅ permissions.test.ts L116 |
| TC-PERM-07 | Unknown permission key returns false for all roles | Unit | `evaluatePermission(role, 'foo:bar')=false` | ✅ permissions.test.ts L139 |
| TC-PERM-08 | All roles can view dashboard | Unit | All 6 roles return `true` for `dashboard:view` | ✅ permissions.test.ts L153 |
| TC-PERM-09 | Only OWNER can edit settings | Unit | All non-owner roles return `false` for `settings:edit` | ✅ permissions.test.ts L146 |
| TC-PERM-10 | CASHIER: limited discount only, not unlimited | Unit | `billing:discount:limited=true`, `billing:discount:unlimited=false` | ✅ billing.test.ts L6 |

---

### TC-TEMPLATE — Retail Type Selection (D5)

| ID | Description | Type | Expected Result | Status |
|----|-------------|------|-----------------|--------|
| TC-TMPL-01 | Config contains all defined RetailType enum values | Unit | `RETAIL_TEMPLATES` contains every enum value | ✅ retail-template.test.ts L12 |
| TC-TMPL-02 | Exactly one template is enabled | Unit | `filter(t => t.enabled).length === 1` | ✅ retail-template.test.ts L19 |
| TC-TMPL-03 | CLOTHING_FASHION is enabled | Unit | `isRetailTypeEnabled(CLOTHING_FASHION) === true` | ✅ retail-template.test.ts L24 |
| TC-TMPL-04 | All other 6 types are disabled | Unit | FOOTWEAR, GROCERY, ELECTRONICS, COSMETICS, JEWELLERY, GENERAL_RETAIL all return `false` | ✅ retail-template.test.ts L65 |
| TC-TMPL-05 | All templates have required shape | Unit | `retailType`, `enabled`, `label`, `icon` all present | ✅ retail-template.test.ts L45 |

---

### TC-BARCODE — Unique Barcode per Item (D7)

| ID | Description | Type | Expected Result | Status |
|----|-------------|------|-----------------|--------|
| TC-BC-01 | 20-item product entry generates exactly 20 barcodes | Integration | `barcodes.length === 20` | ✅ barcode.integration.test.ts L121 |
| TC-BC-02 | All 20 barcodes are distinct | Integration | `new Set(barcodes).size === 20` | ✅ barcode.integration.test.ts L145 |
| TC-BC-03 | Items are created with `IN_STOCK` status | Integration | All items have `status === 'IN_STOCK'` | ✅ barcode.integration.test.ts L151 |
| TC-BC-04 | Each item generates exactly one PURCHASE movement | Integration | `movements.length === 20`, all `movementType === 'PURCHASE'` | ✅ barcode.integration.test.ts L155 |
| TC-BC-05 | Sibling size variants share no barcodes (truncation regression) | Integration | 5 (M) + 7 (L) = 12 distinct barcodes | ✅ barcode.integration.test.ts L162 |
| TC-BC-06 | Adding stock later continues sequence without collision | Integration | 3 (initial) + 4 (later) = 7 distinct barcodes | ✅ barcode.integration.test.ts L198 |
| TC-BC-07 | Manually supplied duplicate barcode is rejected | Integration | `409 Conflict` with message matching /already exist/i | ✅ barcode.integration.test.ts L236 |
| TC-BC-08 | Mismatched barcodes[] length vs quantity rejected | Integration | `400 Bad Request` with /does not match quantity/i | ✅ barcode.integration.test.ts L283 |

---

### TC-BILLING — Billing, Payment, Invoice (D9)

| ID | Description | Type | Expected Result | Status |
|----|-------------|------|-----------------|--------|
| TC-BILL-01 | Cart subtotal computed correctly from finalPrice | Unit | `reduce(sum, finalPrice)` = 2700 for two items | ✅ billing.test.ts L12 |
| TC-BILL-02 | Mixed payment split totals are summed correctly | Unit | CASH + UPI + CARD = 2600 | ✅ billing.test.ts L46 |
| TC-BILL-03 | Change given = total paid − grand total | Unit | 2600 − 2500 = 100 | ✅ billing.test.ts L56 |
| TC-BILL-04 | No GST: total unchanged | Unit | `computeTax(undefined, 1000) → {taxAmount:0, grandTotal:1000}` | ✅ week8-fixes.test.ts L7 |
| TC-BILL-05 | Exclusive GST added on top | Unit | 18% of ₹1000 = ₹180 added → ₹1180 | ✅ week8-fixes.test.ts L15 |
| TC-BILL-06 | Inclusive GST carved out, total unchanged | Unit | 18% of ₹1180 = ₹180 carved → grandTotal still ₹1180 | ✅ week8-fixes.test.ts L22 |
| TC-BILL-07 | `round2` avoids floating-point drift | Unit | `round2(0.1 + 0.2) === 0.3` | ✅ week8-fixes.test.ts L28 |

---

### TC-REPORTS — Reports, Exports, Date Ranges (D13)

| ID | Description | Type | Expected Result | Status |
|----|-------------|------|-----------------|--------|
| TC-RPT-01 | CSV export triggers a download with `.csv` extension | Unit | `clickedLinks[0].download === 'sales-report.csv'` | ✅ reports-export.test.ts L26 |
| TC-RPT-02 | CSV handles embedded quotes, commas, and newlines | Unit | File generated without throwing | ✅ reports-export.test.ts L26 |
| TC-RPT-03 | Excel export triggers a download with `.xls` extension | Unit | `clickedLinks[0].download === 'financial-summary.xls'` | ✅ reports-export.test.ts L39 |
| TC-RPT-04 | `ALL_TIME` date range has no bounds | Unit | Returns `{}` | ✅ week8-fixes.test.ts L37 |
| TC-RPT-05 | `TODAY` date range is a single day | Unit | `from === to === '2026-09-28'` | ✅ week8-fixes.test.ts L41 |
| TC-RPT-06 | `LAST_7_DAYS` reaches back 7 days inclusive | Unit | from = '2026-09-21', to = '2026-09-28' | ✅ week8-fixes.test.ts L45 |
| TC-RPT-07 | `THIS_MONTH` starts on the 1st | Unit | from = '2026-09-01' | ✅ week8-fixes.test.ts L49 |
| TC-RPT-08 | `LAST_90_DAYS` crosses month boundaries correctly | Unit | from = '2026-06-30', to = '2026-09-28' | ✅ week8-fixes.test.ts L53 |

---

### TC-BACKUP — Backup & Restore (D14)

**Frontend**

| ID | Description | Type | Expected Result | Status |
|----|-------------|------|-----------------|--------|
| TC-BKP-01 | Store with no backups is CRITICAL | Unit | `tier === 'CRITICAL'`, `backupDue === true` | ✅ backup.test.ts (Frontend) L8 |
| TC-BKP-02 | Fresh backup is HEALTHY | Unit | `tier === 'HEALTHY'`, `backupDue === false` | ✅ Frontend backup.test.ts L15 |
| TC-BKP-03 | Backup within reminder window stays healthy | Unit | `backupDue === false` | ✅ Frontend backup.test.ts L22 |
| TC-BKP-04 | Once reminder window passes, status is WARNING | Unit | `tier === 'WARNING'`, `backupDue === true` | ✅ Frontend backup.test.ts L27 |

**Backend**

| ID | Description | Type | Expected Result | Status |
|----|-------------|------|-----------------|--------|
| TC-BKP-05 | `createBackup` writes a parseable JSON file to disk | Integration | File exists, `JSON.parse` succeeds, expected tables present | ✅ Backend backup.test.ts L167 |
| TC-BKP-06 | `createBackup` records a row in the `backups` table | Integration | `backup.id` truthy, `fileSizeBytes > 0` | ✅ Backend backup.test.ts L167 |
| TC-BKP-07 | `restoreBackup` re-inserts deleted rows | Integration | `inventory_items` row count > 0 after restore | ✅ Backend backup.test.ts L196 |
| TC-BKP-08 | `restoreBackup` is idempotent — no duplicates on second run | Integration | Row count unchanged after second restore | ✅ Backend backup.test.ts L209 |
| TC-BKP-09 | `getStorageHealth` returns positive backup count and size | Integration | `backupCount ≥ 1`, `totalSizeBytes > 0` | ✅ Backend backup.test.ts L220 |

---

### TC-AUDIT & TC-STORAGE — Audit Logs, Storage Health (D14)

**Backend**

| ID | Description | Type | Expected Result | Status |
|----|-------------|------|-----------------|--------|
| TC-AUD-01 | `AuditService.log` writes event row with user & meta | Integration | Row exists in `audit_logs`, JSON parsed | ✅ Backend audit.test.ts L82 |
| TC-AUD-02 | `listByStore` enforces tenant isolation | Integration | Only logs matching caller's `store_id` returned | ✅ Backend audit.test.ts L124 |
| TC-AUD-03 | `listByStore` filters by action and entityType | Integration | Filtered subset matches criteria | ✅ Backend audit.test.ts L132 |
| TC-AUD-04 | `listByStore` supports offset & limit pagination | Integration | Pagination slices distinct pages, total preserved | ✅ Backend audit.test.ts L142 |
| TC-AUD-05 | `getDistinctActions` returns sorted unique actions | Unit | Unique action strings returned | ✅ Backend audit.test.ts L151 |

**Frontend**

| ID | Description | Type | Expected Result | Status |
|----|-------------|------|-----------------|--------|
| TC-AUD-06 | `AuditService.exportToCsv` downloads formatted CSV | Unit | Valid CSV header and rows generated | ✅ Frontend audit-log.test.ts L37 |
| TC-STR-01 | `formatBytes` converts bytes to KB, MB, GB | Unit | Accurate representation for all ranges | ✅ Frontend storage-health.test.ts L6 |
| TC-STR-02 | `getBrowserStorageEstimate` returns quota metrics | Unit | Structure contains usage, quota, percentage | ✅ Frontend storage-health.test.ts L33 |

---

### TC-AI — AI Scoring, Statistics (D12)

| ID | Description | Type | Expected Result | Status |
|----|-------------|------|-----------------|--------|
| TC-AI-01 | Negative Binomial PMF sums to 1 and has the correct mean | Unit | `Σpmf ≈ 1`, `Σk·pmf(k) ≈ 6` | ✅ ai-scoring.test.ts L72 |
| TC-AI-02 | Quantiles bracket the mean | Unit | Q10 < 10 < Q90 | ✅ ai-scoring.test.ts L80 |
| TC-AI-03 | Expected sales ≤ stock; more stock never sells less | Unit | `s5 ≤ 5`, `s10 ≥ s5`, `s1000 ≈ 8` | ✅ ai-scoring.test.ts L88 |
| TC-AI-04 | Stock in unwanted size does not sell | Unit | `wrong.expected < 0.5`, `wrong.pNoSale > even.pNoSale` | ✅ ai-scoring.test.ts L97 |
| TC-AI-05 | Gamma–Poisson update pulls belief toward data | Unit | Posterior mean > 0.9 after observing 1/day for 90 days | ✅ ai-scoring.test.ts L105 |
| TC-AI-06 | Largest-remainder allocation hits total exactly | Unit | `Σout[k] === 10`, `out.XL === 0` | ✅ ai-scoring.test.ts L119 |
| TC-AI-07 | Fast seller with low stock → STRONG_BUY or CONTROLLED_BUY | Unit | Decision in {STRONG_BUY, CONTROLLED_BUY}, `quantity > 0` | ✅ ai-scoring.test.ts L136 |
| TC-AI-08 | Product with months of cover → HOLD, quantity 0 | Unit | `decision === 'HOLD'`, `coverDays > 60` | ✅ ai-scoring.test.ts L152 |
| TC-AI-09 | Zero-sell, old stock → DEAD + CLEARANCE | Unit | `lifecycleStage === 'DEAD'`, `productAction === 'CLEARANCE'` | ✅ ai-scoring.test.ts L162 |
| TC-AI-10 | Size mix buys selling sizes, not leftover sizes | Unit | `qty.M > qty.XL`, `qty.XL === 0` | ✅ ai-scoring.test.ts L173 |
| TC-AI-11 | New product gets no STRONG_BUY; borrows peer data | Unit | `subject.productId === null`, `decision !== 'STRONG_BUY'` | ✅ ai-scoring.test.ts L221 |
| TC-AI-12 | Photo similarity peers preferred over price peers | Unit | `comparables[0].basis === 'PHOTO'` | ✅ ai-scoring.test.ts L233 |
| TC-AI-13 | High return rate surfaces as a risk reason | Unit | `returnRisk.value ≥ 75`, reason text starts with 'Return risk' | ✅ ai-scoring.test.ts L259 |
| TC-AI-14 | analyseAll is deterministic across two runs | Unit | Repeated calls return identical `expectedSales` arrays | ✅ ai-scoring.test.ts L284 |
| TC-AI-15 | Evaluation: WAPE, baseline lift, interval coverage computed correctly | Unit | `wape ≈ 0.25`, `liftOverBaseline > 0`, `intervalCoverage ≈ 0.667` | ✅ ai-scoring.test.ts L303 |

---

### TC-PHOTO — Photo Fingerprint & Quality (D11)

| ID | Description | Type | Expected Result | Status |
|----|-------------|------|-----------------|--------|
| TC-PHOTO-01 | Cosine similarity: identical vectors = 1 | Unit | `cosineSimilarity([1,0],[1,0]) ≈ 1` | ✅ embedding.service.test.ts L34 |
| TC-PHOTO-02 | Cosine similarity: orthogonal vectors = 0 | Unit | `cosineSimilarity([1,0],[0,1]) ≈ 0` | ✅ embedding.service.test.ts L35 |
| TC-PHOTO-03 | Length mismatch returns 0 | Unit | `cosineSimilarity([1,0],[1,0,0]) === 0` | ✅ embedding.service.test.ts L37 |
| TC-PHOTO-04 | `toVectorLiteral` builds pgvector format | Unit | `[0.5,-1,2]` string | ✅ embedding.service.test.ts L41 |
| TC-PHOTO-05 | `imageHash` is content-based and prefix-agnostic | Unit | Same base64 with different MIME prefix → same hash | ✅ embedding.service.test.ts L44 |
| TC-PHOTO-06 | Tiny flat image flagged as low-resolution, low-contrast | Unit | Issues contain 'Low resolution' and 'Low contrast' | ✅ embedding.service.test.ts L59 |
| TC-PHOTO-07 | Very dark image flagged | Unit | Issue contains 'Image is too dark' | ✅ embedding.service.test.ts L66 |
| TC-PHOTO-08 | Large sharp striped image passes all checks | Unit | `issues === []`, `score > 0.8` | ✅ embedding.service.test.ts L71 |
| TC-PHOTO-09 | Non-image bytes throw `InvalidImageError` | Unit | `rejects.toBeInstanceOf(InvalidImageError)` | ✅ embedding.service.test.ts L77 |

---

### TC-ATTRS — Photo Attribute Suggestions (D11)

| ID | Description | Type | Expected Result | Status |
|----|-------------|------|-----------------|--------|
| TC-ATTR-01 | Applying suggestions overwrites existing values | Unit | `out.colour === 'Navy Blue'`, `out.pattern === 'Striped'` | ✅ week8-fixes.test.ts L72 |
| TC-ATTR-02 | Enum values matched case-insensitively | Unit | `'checked'` → `'Checked'` | ✅ week8-fixes.test.ts L82 |
| TC-ATTR-03 | Unknown pattern leaves existing value untouched | Unit | `out.pattern === 'Solid'` when 'Paisley' not in enum | ✅ week8-fixes.test.ts L86 |
| TC-ATTR-04 | Input is not mutated | Unit | Original `input.colour` unchanged | ✅ week8-fixes.test.ts L90 |

---

## 4. Manual Test Checklist

These flows are not covered by automated tests and must be verified manually before submission.

| # | Flow | How to verify | Expected |
|---|------|---------------|----------|
| M-01 | New store owner signs up → verifies → creates store → completes onboarding | Browser walkthrough | Redirected to dashboard after each step |
| M-02 | Owner invites a CASHIER staff member | Staff → Add Staff form | New staff row appears, role is CASHIER |
| M-03 | CASHIER logs in and sees restricted sidebar | Login as CASHIER | No Staff, Reports, Settings links visible |
| M-04 | Add product with variants → stock entry generates barcodes | Products → Add → Add Stock | Barcodes appear in Inventory list |
| M-05 | Create a sale via POS — barcode scan, mixed payment | Billing page | Invoice PDF opens, inventory status → SOLD |
| M-06 | Process a return | Returns page | Item reverts to RETURNED_TO_STOCK |
| M-07 | Process an exchange | Exchanges page | Old item EXCHANGED, new item SOLD |
| M-08 | Trigger an AI restock advisory for an existing product | AI Restock page | Recommendation card with quantity and size mix |
| M-09 | Upload a product photo → see similarity panel | Product detail → Photo | Quality badge and similar products shown |
| M-10 | Export a report as CSV | Reports page → Export | `.csv` file downloads |
| M-11 | Create a manual backup and download it | Backup page → Create | JSON file downloads |
| M-12 | Restore from a backup | Backup page → Restore | Success toast, data intact |

---

## 5. Acceptance Criteria Summary

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| All automated unit tests pass | 100% | `npm test` output |
| Frontend business-logic coverage | ≥ 60% | `npm test -- --coverage` |
| Integration tests pass (with DB) | 100% | CI pipeline |
| No Severity-1 open defects | 0 | `DEFECT_LOG.md` |
| All manual flows M-01 → M-12 verified | All pass | Tester sign-off |

---

## 6. Test Environment

| Item | Value |
|------|-------|
| OS | Windows 11 |
| Node.js | 20.x |
| Browser | Chrome 128+ |
| Database | PostgreSQL 15 (Neon cloud or local) |
| Frontend URL | http://localhost:3000 |
| Backend URL | http://localhost:4000 |
| Test DB | Configured via `DATABASE_URL` in `Backend/.env` |

---

## 7. Traceability Matrix

| Deliverable | Test Cases | Coverage |
|-------------|------------|---------|
| D5 — Auth, Staff, Roles | TC-AUTH, TC-PERM, TC-TMPL | Unit + Integration |
| D7 — Unique Barcodes | TC-BC | Integration |
| D9 — Billing, Returns | TC-BILL | Unit |
| D11 — Photo AI | TC-PHOTO, TC-ATTR | Unit |
| D12 — AI Scoring | TC-AI | Unit |
| D13 — Reports, Exports | TC-RPT | Unit |
| D14 — Backup, Restore | TC-BKP | Unit + Integration |
