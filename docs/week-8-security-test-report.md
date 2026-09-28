# OWNLY AI Retail Manager — Security Audit & Test Report

**Release Candidate Scope:** Week 8 Security Hardening & Penetration Testing  
**Date:** September 28, 2026  
**Security Rating:** SECURE / RELEASE APPROVED  

---

## 1. Authentication Audit

- **Implementation:** Password hashing via `bcryptjs` (salt rounds = 10). Session authentication managed via JSON Web Tokens (JWT) using `jsonwebtoken`.
- **Token Handling:** JWT payloads carry `userId`, `storeId`, and `role`. Issued with 7-day expiration (`JWT_EXPIRES_IN=7d`).
- **Tests Executed:**
  - Valid credentials → HTTP 200 + token issued.
  - Invalid password → HTTP 401 (`"Invalid email or password."`).
  - Nonexistent user → HTTP 401 (`"Invalid email or password."`).
  - Missing token on protected endpoint → HTTP 401 (`"Authentication required."`).
  - Tampered JWT signature → HTTP 401 (`"Invalid or expired token."`).
  - Expired token → HTTP 401. Client removes stored token automatically.

---

## 2. Authorization & RBAC Audit

- **Role Definitions:** 6 Roles defined (`OWNER`, `MANAGER`, `CASHIER`, `INVENTORY_STAFF`, `ACCOUNTANT`, `VIEWER`).
- **Backend Middleware Enforcement:** Server-side `requirePermission(key)` middleware enforced independently of frontend component state.
- **Verification Matrix:**

| Permission Key | OWNER | MANAGER | CASHIER | INVENTORY_STAFF | ACCOUNTANT | VIEWER |
|----------------|-------|---------|---------|-----------------|------------|--------|
| `dashboard:view` | Yes | Yes | Yes | Yes | Yes | Yes |
| `store:edit` | Yes | No | No | No | No | No |
| `settings:edit` | Yes | No | No | No | No | No |
| `staff:create` | Yes | Yes | No | No | No | No |
| `inventory:edit` | Yes | Yes | No | Yes | No | No |
| `billing:create` | Yes | Yes | Yes | No | No | No |
| `reports:view` | Yes | Yes | No | No | Yes | No |
| `audit:view` | Yes | Yes | No | No | Yes | No |

- **Defect Resolution:** In DEF-001, `settings:edit` was corrected from `true` to `false` for `MANAGER`, restricting settings modification strictly to `OWNER`.

---

## 3. Cross-Store Data Isolation Audit

- **Threat Model:** Tenant A (`store_id_A`) attempting unauthorized access to Tenant B (`store_id_B`) resources via parameter tampering (IDOR).
- **Enforcement Mechanism:** Server calls `requireStoreId(req)` which extracts `storeId` directly from the authenticated JWT token.
- **Query Verification:** All Knex SQL queries contain explicit `where('store_id', storeId)` scoping:
  - Products, variants, categories, suppliers
  - Inventory items & movement logs
  - Customers, invoices, payments, returns, exchanges
  - Backups, audit logs, and AI predictions
- **Direct API Penetration Tests:** Tested cross-tenant requests (User A attempting to query Invoice B by ID). Query returns 0 rows / HTTP 404.

---

## 4. Input Validation & Injection Controls

- **Validation Engine:** `Zod` schemas enforced on all backend router inputs (`createProductSchema`, `restockSchema`, `createInvoiceSchema`, `createStoreSchema`).
- **SQL Injection Prevention:** Knex query builder uses parameterized bindings (`?`) for all variables. Zero raw SQL concatenation with user input.
- **XSS & HTML Rendering:** Next.js automatically escapes JSX strings. Content security headers enabled via `helmet` in Express backend.

---

## 5. Audit Logging Security

- **Coverage:** Sensitive actions log to `audit_logs` table (`auth.login`, `product.create`, `inventory.restock`, `billing.invoice_created`, `backup.export`, `ai.prediction_accepted`).
- **Sensitive Data Exclusion:** Passwords, hashes, JWT secrets, credit card numbers, and raw authentication tokens are strictly excluded from audit metadata.
- **Immutability:** Audit log table lacks UPDATE/DELETE endpoints in router. Only readable by authorized roles (`audit:view`).

---

## 6. Backup & Restore Security

- **Encryption & Hashing:** Backup files generated with metadata headers including store ID, creation timestamp, and SHA-256 integrity checksums.
- **Restore Authorization:** `POST /api/backup/restore` restricted exclusively to `OWNER` role.
- **Validation:** Attempting to restore tampered backup JSON returns HTTP 400 (`"Backup file checksum validation failed or structure invalid."`).

---

## 7. Dependency Security Review

- **Audit Executed:** `npm audit` executed on both `Backend` and `Frontend`.
- **Findings:** Zero critical or high severity vulnerabilities in active production runtime dependencies (`express`, `knex`, `pg`, `next`, `react`, `zod`, `jsonwebtoken`, `bcryptjs`, `sharp`).

---

## 8. Summary of Findings & Remaining Risks

| Category | Vulnerability Identified | Action Taken / Status | Remaining Risk Tier |
|----------|--------------------------|-----------------------|---------------------|
| Authentication | Token exposure in logs | Verified log statements sanitize user objects. | LOW |
| Authorization | MANAGER store edit permission | Resolved in DEF-001 (set to false). | NONE |
| Cross-Store | IDOR parameter tampering | Verified strict JWT store scoping on all endpoints. | NONE |
| Input Validation | Malformed payload handling | Zod middleware handles invalid formats cleanly. | NONE |

**Final Assessment:** The application layer meets all enterprise security benchmarks required for Release Candidate approval.
