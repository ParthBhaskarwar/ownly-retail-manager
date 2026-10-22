# Ownly AI Retail Manager — Administrator & Operations Guide

**Document ID:** D16-ADM-001  
**Version:** 2.4.1 (Week 8 Release Candidate)  
**Target Roles:** Store Owners, General Managers, IT Administrators, Operations Leads  
**Last Updated:** October 2026  

---

## Table of Contents
1. [System Architecture Overview](#1-system-architecture-overview)
2. [Initial Store Onboarding & Settings](#2-initial-store-onboarding--settings)
3. [Staff Management & Role-Based Access Control (RBAC)](#3-staff-management--role-based-access-control-rbac)
4. [AI Restock Intelligence & Product Scoring Engine](#4-ai-restock-intelligence--product-scoring-engine)
5. [Business Intelligence & Financial Reports](#5-business-intelligence--financial-reports)
6. [Backup, Disaster Recovery & Safe Restoration](#6-backup-disaster-recovery--safe-restoration)
7. [Storage Health Diagnostics & Capacity Management](#7-storage-health-diagnostics--capacity-management)
8. [Security Auditing & Audit Trail Investigation](#8-security-auditing--audit-trail-investigation)
9. [DevOps, Deployment & Production Runbook](#9-devops-deployment--production-runbook)

---

## 1. System Architecture Overview

Ownly Retail Manager is built on a high-reliability, multi-tier architecture designed for continuous store operation:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Next.js 14 Frontend PWA (Client Tier)                                │
│  - Service Worker for offline shell and asset caching                 │
│  - IndexedDB (via Dexie) for local catalog caching and offline sales   │
│  - UI Design System: Stone-50 palette, DM Sans, Teal (#0F766E)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS / REST (Bearer JWT)
┌───────────────────────────────────▼────────────────────────────────────┐
│  Express 5 Node.js API (Application Tier)                              │
│  - Stateless JWT authentication with server-side role re-validation   │
│  - Tenant-isolation middleware: every query derives store_id from JWT  │
│  - Zod request schema validation & Knex atomic SQL transactions        │
│  - CLIP Vision Embedding Engine (Transformers + pgvector)              │
│  - Analytical scoring engine (Negative Binomial, Gamma-Poisson)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Connection Pooling / SSL
┌───────────────────────────────────▼────────────────────────────────────┐
│  PostgreSQL Database (Persistence Tier)                                │
│  - Knex relational migrations (001–007)                                │
│  - pgvector extension for 512-dim visual product embeddings            │
│  - Atomic transactions for billing, returns, and inventory deductions  │
└────────────────────────────────────────────────────────────────────────┘
```

### Multi-Tenant Isolation
All multi-store safety is enforced at the database query layer:
- The backend middleware verifies the JWT signature and extracts the `userId`.
- The database is queried on every request to fetch the user's active `store_id` and `role`.
- No route or service accepts `store_id` from client request bodies or query parameters. Direct cross-tenant data tampering is mathematically prevented.

---

## 2. Initial Store Onboarding & Settings

### Step 2.1: Store Creation (`/onboarding/store-setup`)
When setting up a new store:
1. **Store Legal Name:** Enter legal registered entity name.
2. **Retail Template:** Select `Clothing / Apparel` (pre-configures clothing-specific attributes like Size, Color, Sleeve, Fit).
3. **Currency & Tax Configuration:** Configure currency symbol (default: `₹ INR`) and default GST tax slab (e.g., 5% or 12%).
4. **Store Contact Details:** Address, telephone, and invoice receipt header text.

### Step 2.2: Category & Attribute Taxonomy
Navigate to **Settings** (`/settings`):
- **Categories:** Define apparel hierarchies (e.g., *Men's Wear*, *Women's Wear*, *Kid's Wear*, *Accessories*).
- **Subcategories:** Configure sub-types (e.g., *Shirts*, *Trousers*, *Denim*, *Ethnic Wear*).
- **Custom Attributes:** Define variant attributes (Sizes: XS, S, M, L, XL, XXL; Colors; Fabrics: 100% Cotton, Linen, Polyester Blend).

---

## 3. Staff Management & Role-Based Access Control (RBAC)

Access staff administration at **Staff** (`/staff`).

### The 6 Pre-configured Roles

| Role | Intended User | Key Capabilities | Restricted Areas |
|---|---|---|---|
| **`OWNER`** | Store Owner / Founder | Full unrestricted access: legal store edits, staff creation/deactivation, backups, restore, all financial data. | None |
| **`MANAGER`** | Store General Manager | Day-to-day operations: staff management, inventory, billing, returns, backups, view settings. | Cannot edit fundamental store legal registration. |
| **`CASHIER`** | Checkout Operator | POS billing, receipts, customer returns, exchanges, inventory stock lookup. | No staff, reports, audit logs, or settings access. |
| **`INVENTORY_STAFF`** | Stockroom / Warehouse Clerk | Product catalog editing, stock receiving, restock batches, barcode printing. | No billing, POS, financial reports, or settings access. |
| **`ACCOUNTANT`** | Finance / Tax Auditor | Sales reports, financial ledgers, invoice history, credit notes, audit trail. | Cannot create sales, receive stock, or edit staff. |
| **`VIEWER`** | Franchise Auditor / Investor | Read-only dashboards and aggregate reports. | Zero modification permissions across all modules. |

### Complete RBAC Permission Matrix

| Permission Key | `OWNER` | `MANAGER` | `CASHIER` | `INVENTORY_STAFF` | `ACCOUNTANT` | `VIEWER` |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `dashboard:view` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `store:view` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `store:edit` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `staff:view` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `staff:create` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `staff:edit` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `staff:deactivate` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `inventory:view` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `inventory:edit` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `billing:view` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| `billing:create` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `billing:discount:unlimited` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `billing:discount:limited` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `returns:create` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `exchanges:create` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `credit_notes:manage` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| `reports:view` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| `settings:view` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `settings:edit` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `audit:view` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |

### Adding and Deactivating Staff
1. Go to **Staff** (`/staff`) → Click **Add Staff Member** (`/staff/new`).
2. Enter Full Name, Email, Phone Number, and select Role from dropdown.
3. Once created, provide credentials securely to the employee.
4. **Immediate Revocation:** If an employee leaves, click their profile → **Deactivate Staff Member**. Because the auth middleware re-evaluates `is_active` on every request from Postgres, the revoked user is cut off instantly on their next API call.

---

## 4. AI Restock Intelligence & Product Scoring Engine

Navigate to **AI Restock** (`/ai-restock`) and **AI Insights** (`/ai-insights`).

Ownly incorporates a 5-factor mathematical optimization model for apparel demand forecasting and purchase planning:

```
┌────────────────────────────────────────────────────────────────────────┐
│  5-Factor Restock Optimization Algorithm                              │
│                                                                        │
│  1. Poisson / Neg-Binomial Demand Rate:   λ = E[Sales | Stocked Days]  │
│  2. Cover Days & Stockout Risk:           P(Stockout in Lead Time)     │
│  3. Margin Contribution Weight:           (Selling Price - Cost) / ASP │
│  4. Size-Mix Largest-Remainder Allocation: Integer Size Ratios (S-XL)  │
│  5. Return-Rate Risk Penalty:             High returns discount buy    │
└────────────────────────────────────────────────────────────────────────┘
```

### Recommendation Decision Classes
- **`STRONG_BUY`**: High sales velocity, low cover (< 14 days), high profit margin. Allocate maximum recommended units.
- **`CONTROLLED_BUY`**: Steady demand, moderate cover. Order replenishments within standard reorder points.
- **`HOLD`**: Adequate stock cover (> 45 days) or slowing trend. Do not tie up working capital in new purchase orders.
- **`CLEARANCE`**: Old stock (> 90 days), low velocity, dead sizes. Mark down prices or schedule clearance promotion.

### Photo AI & Cold-Start Similarity (pgvector)
When restocking a brand-new style with no prior sales history:
1. Upload a garment photograph.
2. The CLIP vision model produces a 512-dimensional vector embedding stored in pgvector.
3. The system finds visual peer garments in your catalog that share similar aesthetic properties (cut, silhouette, pattern).
4. The sales velocity and size preferences of the visual peers are borrowed to predict the optimal restock volume for the new product.

---

## 5. Business Intelligence & Financial Reports

Navigate to **Reports** (`/reports`) to access analytics:

### 1. Sales Performance Report
- Aggregates gross revenue, tax collected, discounts given, and net profit.
- Filter by date preset: *Today*, *Yesterday*, *This Week*, *This Month*, *Last 90 Days*, or *Custom Range*.
- Payment split analysis: Percentage of sales completed via Cash vs UPI vs Credit Card vs Store Credit.

### 2. Stock Valuation Report
- Calculates total inventory carrying cost vs projected retail realization.
- Displays unrealized gross margin across departments.

### 3. Stock Ageing & Dead Stock Report
- Categorizes inventory items by days in inventory:
  - **Fresh Stock:** 0–30 days.
  - **Normal Stock:** 31–60 days.
  - **Slow-Moving:** 61–90 days.
  - **Dead Stock:** > 90 days.
- Critical for freeing working capital before seasonal fashion trends expire.

### 4. Cashier & Shift Audit Report
- Tracks sales, returns, discounts, and voids performed by each individual cashier.
- Useful for daily register balance reconciliation.

---

## 6. Backup, Disaster Recovery & Safe Restoration

Navigate to **Backup & Safety** (`/backup`).

### Creating Snapshots
1. Click **Create backup now** (`#export-backup-btn`).
2. The server serializes all tenant-scoped data tables into an encrypted JSON file:
   - `categories`, `subcategories`, `suppliers`, `customers`, `products`, `product_variants`
   - `inventory_items`, `inventory_movements`, `restock_batches`
   - `invoices`, `invoice_items`, `payments`, `returns`, `return_items`, `exchanges`, `credit_notes`
   - `audit_logs`
3. The snapshot is saved to the server's configured storage directory (`BACKUP_DIR`) and recorded in the database.
4. Click **Download** to save an offsite copy to external secure storage.

### Restoring from Backup (Disaster Recovery)
If accidental deletion or hardware failure occurs:
1. Locate the desired snapshot in the **Backup History** list.
2. Click **Restore**.
3. **Data Overwrite Warning Dialog (DEF-007):**
   ```
   ⚠️ Confirm Restore — Data Overwrite Warning
   "Caution: This will restore records from the selected backup file into your active store.
    This will overwrite current data. Proceed?"
   ```
4. Click **Yes, Proceed with Restore**.
5. **Idempotency Guarantee:** The restore engine executes `INSERT ... ON CONFLICT (id) DO NOTHING`. Existing current records are preserved; only missing rows are restored.

---

## 7. Storage Health Diagnostics & Capacity Management

Navigate to **Storage Health** (`/storage-health`).

Live monitoring dashboard tracks three storage layers:

```
┌───────────────────────────┬───────────────────────────┬───────────────────────────┐
│ Server Disk Storage       │ Database Record Volume    │ Client Browser & Quota    │
│ Total Backups: 4          │ Total Rows: 1,482         │ Used: 1.45 MB             │
│ Disk Size: 1.84 MB        │ Tables Tracked: 10        │ Available Quota: 144 GB   │
│ Status: [ Disk Online ]   │ Status: [ PG Active ]     │ Mode: [ PWA Persisted ]   │
└───────────────────────────┴───────────────────────────┴───────────────────────────┘
```

### Storage Health Status Tiers
- **`HEALTHY` (Green):** Backup created within the last 7 days, database connected, backup directory writeable.
- **`WARNING` (Orange):** Last backup was more than 7 days ago. A weekly snapshot is due.
- **`CRITICAL` (Red):** 0 backups exist, or the server storage directory is missing or read-only. Immediate attention required.

### Client Quota Management
- Modern browsers allocate local storage quota for PWA caching.
- If browser cache exceeds capacity, click **Clear Cache** to free unused asset memory without losing server data.

---

## 8. Security Auditing & Audit Trail Investigation

Navigate to **Audit Logs** (`/audit`).

Every security-sensitive or financial event writes an immutable row to `audit_logs`:
- Price modifications (`product.price_change`)
- Product creations and deactivations
- Inward restock completions
- Customer returns and refunds
- Manual discount overrides
- Staff credential or role modifications
- Backup creation and restoration executions

### Conducting an Audit Investigation
1. Use the **Category Filter** dropdown to narrow events (e.g., *Products*, *Billing*, *Backups*).
2. Set the **Date Range** (`From` and `To`).
3. In the search box, enter a specific user's name or product SKU.
4. Click **Inspect** on any event row to open the raw JSON metadata diff showing:
   - User identity, role, timestamp.
   - Exact previous values vs newly assigned values.
   - Business reason entered by the operator.
5. Click **Export CSV** to download evidence for accounting audits.

---

## 9. DevOps, Deployment & Production Runbook

### Environment Variables (`.env`)

| Variable | Description | Production Example |
|---|---|---|
| `PORT` | Backend listening port | `4000` |
| `NODE_ENV` | Runtime environment mode | `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@ep-cool.neon.tech/ownly?sslmode=require` |
| `JWT_SECRET` | 256-bit secret key for token signing | *(random 64-character hex string)* |
| `BACKUP_DIR` | Directory for store snapshot files | `/var/data/ownly-backups` |
| `CORS_ORIGIN` | Allowed frontend origin URLs | `https://pos.yourstore.com` |
| `EMBEDDINGS_ENABLED` | Toggle CLIP vision similarity engine | `true` |

### Database Migrations
Always run migrations before starting the application:
```bash
cd Backend
npm run db:migrate
```

### Automated Healthcheck
Monitor endpoint: `GET http://localhost:4000/api/health`
Expected response:
```json
{
  "status": "ok",
  "version": "0.7.0",
  "env": "production"
}
```

### Routine Maintenance Checklist
- **Daily:** Ensure cashier registers are reconciled against `/reports`.
- **Weekly:** Generate a server backup at `/backup` and verify `HEALTHY` status at `/storage-health`.
- **Monthly:** Review dead stock on the Stock Ageing report to initiate clearance plans.
- **Quarterly:** Audit staff list and deactivate accounts of former employees.
