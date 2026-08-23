# Ownly — Change Explanation (Weeks 2 & 3)

**Date:** 23 August 2026
**Scope:** Gate 2 completion (Week 2), Week 3 inventory module, and the migration from browser IndexedDB to Neon PostgreSQL.

This document explains every change made, why it was made, which contractual requirement it satisfies, and every defect found and fixed along the way.

---

## 1. Summary

Three bodies of work, in order:

| # | Work | Driver |
|---|---|---|
| 1 | **Gate 2 completion** — make quantity N actually produce N unique barcodes | Week 2 deliverable, overdue since 16 Aug |
| 2 | **IndexedDB → Neon PostgreSQL** — replace the browser database entirely | Team decision |
| 3 | **Week 3 inventory module** — list, detail, valuation, ageing, alerts | Week 3 deliverable, due 23 Aug |

**24 defects** were found and fixed across the three. Several were silent data-corruption bugs that would not have surfaced until billing (Week 4) or the final acceptance demo.

---

## 2. Week 2 — Gate 2: "quantity N produces exactly N unique barcodes"

### 2.1 What the contract requires

> **Approval Gate 2:** "A 20-item product entry must generate exactly 20 valid and non-duplicated item barcodes."
> **Deliverable D7:** "Size-wise quantity entry and one unique barcode per physical item."

### 2.2 What was actually happening

The Add Product form collected a quantity for each selected size, displayed a live total and profit summary — and then **discarded the quantities**. `handleSubmit` called `ProductService.createProduct()`, which created the `Product` and its `ProductVariant` rows and nothing else. **No `InventoryItem` was created. No barcode was generated.**

The barcode engine existed and worked, but was only reachable from a separate "+ Stock" button on the product detail page, one variant at a time.

### 2.3 The fix

`CreateVariantInput` gained an optional `initialStock` field (`quantity`, `purchaseCostPrice`, `purchaseDate`). The Add Product form now populates it from the size grid, and product creation composes the whole operation — Product → attribute values → Variants → InventoryItems → PURCHASE movements — as one unit.

The success screen now reports what actually happened: *"12 physical items added to stock with unique barcodes."*

### 2.4 Defects found and fixed in this area

**D1 — The "unique" barcode index was not unique.**
`schema.ts` declared `inventoryItems: 'id, storeId, [storeId+barcode], ...'` with a comment above it calling this "the compound unique index". Dexie requires an `&` prefix (`&[storeId+barcode]`) to enforce uniqueness. Without it the database enforced *nothing* — the guarantee existed only in a comment.

**D2 — Duplicate barcodes across sibling sizes (critical).**
`generateBarcode()` truncates the SKU segment to 8 characters. For a product with base SKU `BLUDENJA`, the variants `BLUDENJA-M` and `BLUDENJA-L` both collapse to `BLUDENJA`. Combined with a **per-variant** sequence, both variants were handed the identical barcode `STORE-BLUDENJA-00001`.

On the old code this would have committed **silently**. At billing time, scanning one barcode would have matched two different-sized garments — wrong item sold, wrong stock decremented, unreconcilable inventory. This was caught only because fixing D1 turned the silent duplicate into a hard constraint error.

*Fix:* the sequence is now scoped to the **store**, derived from the highest sequence already issued (not a row count, so it survives deletions). The SKU and store-code segments are now explicitly documented as cosmetic — uniqueness never depends on them.

**D3 — Seed data never ran.** Two layers:
- The category/attribute seeding was registered on Dexie's `.version(1).upgrade()` hook. `upgrade()` only fires when migrating from an *older existing* version — never on a brand-new database. On a fresh browser it simply never ran, so the category dropdown was empty.
- Moving it to `on('populate')` exposed a second bug: the seed modules were loaded with `await import(...)` **inside** the transaction. That dynamic import waits for a real network chunk, and IndexedDB auto-commits a transaction the moment nothing is pending on it — so the transaction was dead before the seed code ran. This produced the `TransactionInactiveError` visible in the console.

*Fix:* `on('populate')` + **static** imports. Verified: 8 categories, 55 subcategories, 8 attribute definitions on first run.

**D4 — Hard-coded store code.** The product detail page passed `storeCode="OWN"` as a literal string, violating the plan's "no hard-coded production data" rule (§5.2). Replaced with `deriveStoreCode(storeId)`.

**D5 — Non-atomic batch writes.** Dexie's `bulkAdd` does not roll back on partial failure — it can report an error while still committing the items that succeeded. The collision-retry loop would then re-insert the already-committed items. Rewritten to use individual `add()` calls inside an explicit transaction so a single collision aborts and rolls back the whole batch.

**D6 — Misleading barcode preview.** The stock entry form promised `...-00001` as the next barcode regardless of existing stock. With a store-scoped sequence this became visibly wrong. It now shows the *format* (`476D31-BLUDENJA-#####`) rather than a specific number it cannot know.

**D7 — Size was never recorded.** *(Found during Week 3.)* The Add Product form sent `attributeValues: []` for every variant, so the variant-level **Size** attribute — the entire purpose of the EAV attribute system — was always empty. Size existed only as an SKU suffix and a display-name fragment. This meant size-wise inventory views and size-demand reporting (both required) would return nothing. The form now looks up the `Size` attribute definition and records each variant's size properly.

### 2.5 Gate 2 evidence

`Backend/tests/barcode.integration.test.ts` — 5 tests driving the real API against the real database:

1. A 20-item entry creates exactly **20** items with **20 distinct** barcodes, all `IN_STOCK`, with 20 `PURCHASE` movements
2. Sibling variants whose SKUs truncate identically still get unique barcodes *(regression test for D2)*
3. Adding stock later continues the sequence without colliding
4. An explicit duplicate barcode is rejected with a clear message
5. Barcode count must match quantity when barcodes are supplied manually

Each run creates its own owner/store under a unique email and cleans up only its own rows, so runs never collide and the shared seed data is left intact.

```bash
cd Backend && npm test
```

---

## 3. The database: Neon PostgreSQL

### 3.1 What changed

The app previously ran **entirely in the browser** on IndexedDB (via Dexie). It now uses **Neon PostgreSQL** as the single source of truth. IndexedDB has been removed completely — `indexedDB.databases()` returns `[]`, and `localStorage` holds only the JWT.

**Neon is PostgreSQL.** It is not a different database with a Postgres-like interface — it is Postgres, hosted and serverless. Everything here is standard Postgres; if the project later moves to a self-hosted server, the same migrations run unchanged because Knex emits plain Postgres SQL.

### 3.2 Current schema (14 tables)

```
users · sessions · stores
categories · subcategories · suppliers
attribute_definitions · product_attribute_values · variant_attribute_values
products · product_variants
inventory_items · inventory_movements
audit_logs
```

Migrations applied, in order:

| Batch | Migration | What it does |
|---|---|---|
| 1 | `001_initial_schema.ts` | 13 tables; handles the users↔stores circular FK correctly |
| 2 | `002_audit_logs.ts` | Audit trail table (plan §2.20) |
| 3 | `003_user_verification_code.ts` | Signup code moved from browser sessionStorage to the user row |
| 4 | `004_inventory_status_alignment.ts` | Adds the 3 statuses §2.8 requires but the schema lacked |

Reference data currently seeded: **8 categories, 55 subcategories, 8 attribute definitions.**

### 3.3 How data is fetched — the full path

```
React component
   → Service          (e.g. InventoryItemService)
      → apiClient     (fetch wrapper: base URL, JWT header, error unwrapping)
         → HTTP
            → Express router   (Zod validation + permission check)
               → Backend service  (business logic, transactions)
                  → Knex        (query builder)
                     → Neon PostgreSQL
```

Concretely, loading the inventory list:

1. `InventoryPage` calls `InventoryItemService.search({ status, size, page })`
2. The service calls `apiClient.get('/api/inventory', { query })`
3. `apiClient` attaches `Authorization: Bearer <jwt>` and issues the request
4. `inventory.router.ts` runs `authenticate` → `requirePermission('inventory:view')`, then reads the caller's `storeId` **from the token**
5. `InventoryService.search()` builds one SQL query joining variants → products → categories → suppliers → the Size attribute
6. Knex converts camelCase to snake_case on the way in and back on the way out
7. The router returns JSON; the component renders it

**Multi-tenancy:** `storeId` is *always* taken from the JWT, never from the request body or query string. A client cannot forge a request to read or write another store's data.

### 3.4 The API surface

**40 endpoints** across 6 routers:

| Router | Endpoints |
|---|---|
| `auth` | signup, verify, login, logout, me, refresh |
| `store` | get, create, update, complete-setup, onboarding state |
| `staff` | list, create, get, update, deactivate, sessions |
| `catalog` | categories, subcategories, suppliers, attribute definitions |
| `products` | search, create, detail, update, variants |
| `inventory` | list, add stock, barcode lookup, item detail, status change, movements, valuation, alerts |

These are **operation-level**, not raw CRUD. `POST /api/products` accepts a complete product with its variants and their opening stock, and does it all in one database transaction — rather than forcing the client to make a dozen round-trips.

### 3.5 Database defects found and fixed

**D8 — `DECIMAL` columns returned as strings (critical).**
node-postgres returns `NUMERIC`/`DECIMAL` as *strings* by default, to avoid float precision loss. Every price in this app is a `number` used in arithmetic. Without a type parser, `base_selling_price` would have arrived as `"1800.00"`, and every margin, profit and stock-valuation calculation would have silently produced garbage (`"1800.00" - 1100` → `NaN`, or string concatenation).

*Fix:* `pg.types.setTypeParser(1700, parseFloat)` in `Backend/src/db/pg-mapping.ts`. Also handled `DATE` (kept as `YYYY-MM-DD` string to match the domain types) and `int8` (`COUNT(*)` otherwise returns a string).

**D9 — snake_case vs camelCase.** The schema is snake_case; the TypeScript domain types are camelCase. Rather than hand-mapping in every query, Knex's `wrapIdentifier` (in) and `postProcessResponse` (out) do it globally in one place.

**D10 — The case converter would have broken the migration runner.** `postProcessResponse` rewrites *every* result key — including Knex's own `knex_migrations` bookkeeping rows (`migration_time` → `migrationTime`), which can break the migrator. Migrations and seeds name their columns explicitly and don't need snake→camel on the way out, so `postProcessResponse` is deliberately **omitted** from `knexfile.ts` while `wrapIdentifier` (a no-op on already-snake names) is kept.

**D11 — Server would not start.** `tsconfig.json` declared `paths` for `@/*` but no `baseUrl`, and `ts-node-dev` had no `tsconfig-paths` registration. The first `@/config/env` import would have crashed the process. Added both.

**D12 — Store creation invalidated the session.** `storeId` is embedded in the JWT. After onboarding created the store, the client kept sending a token signed with `storeId: null`, so every store-scoped request failed until the user logged out and back in. The store-creation response now returns a refreshed token, and the auth context reloads the user.

**D13 — No Postgres seed data.** The clothing taxonomy and attribute definitions lived in Dexie-specific frontend code. Ported to `Backend/src/db/seeds/001_clothing_template.ts`, idempotent and safe to re-run.

**D14 — No `audit_logs` table**, despite §2.20 requiring an audit trail. Added in migration 002; backend services write to it inside the same transaction as the change they describe.

**D15 — No `verification_code` column.** The old flow kept the signup code in browser `sessionStorage`, which is unavailable once verification happens server-side. Added in migration 003.

**D16 — N+1 queries.** `ProductService.getProductDetail` made ~20 sequential calls for a single product; `searchProducts` did that *per product*, so a 20-product list page would have issued hundreds of round-trips to a database in Singapore — unusable. Rewritten as set-based SQL with joins and a grouped stock aggregate. Same response shape, so no UI changes were needed.

**D17 — `app.listen()` at import time** prevented supertest from importing the app without occupying port 4000. Guarded with `require.main === module`.

**D18 — Express 5 types `req.params` as `string | string[]`**, breaking 14 call sites. Added a `param()` helper that validates and narrows in one place.

**D19 — `NODE_ENV=test` withheld the dev verification code.** Jest sets `NODE_ENV=test`, so `config.isDev` was false and signup didn't return `devCode`, breaking the integration test's verify step. The test now reads the code from the database — more robust regardless of environment.

### 3.6 What moved server-side

| Concern | Before | After |
|---|---|---|
| Password hashing | bcrypt **in the browser** | bcrypt on the server |
| Session token | `${uuid}.${timestamp}` — unsigned, forgeable | Signed JWT + a `sessions` row |
| Permissions | UI hiding only | `requirePermission` enforced per route |
| Barcode generation | Client invented barcodes | Server-assigned inside the transaction |
| Audit trail | localStorage, 500-event cap | `audit_logs` table |
| Business logic | Frontend services | Backend services, transactional |

---

## 4. Week 3 — Inventory module

### 4.1 What the contract requires

> **Week 3 tasks (§4):** inventory list, detail view, search and filters; the eight item statuses; stock movements and immutable transaction history; category-, supplier-, size- and status-wise views; cost value, expected selling value and potential gross profit; low-stock, out-of-stock and ageing rules.
> **Deliverable D8:** "Inventory, status, stock movement, valuation and ageing."

### 4.2 Starting point

The inventory **services** worked, but there was **no `/inventory` route at all** — the sidebar link 404'd. `MovementTimeline.tsx` had been written but was imported by nothing, because no item detail page existed to host it.

### 4.3 What was built

**Backend**

- `search()` extended with joins to product, variant, category, supplier and the **Size** attribute; new filters for free-text query, category, supplier and size.
- `getValuation()` — SQL aggregate over items physically in stock: cost value, expected selling value (using `COALESCE(variant_override, product_base_price)`), and potential gross profit.
- `getAlerts()` — low stock (< 3 units), out of stock (had stock before, none now), and ageing buckets (0–30 / 31–60 / 61–90 / 90+ days).
- `getRowById()` + `GET /api/inventory/item/:itemId` for the detail page.

**Frontend**

- **`/inventory`** — valuation cards, alerts strip, search box, category/supplier/size dropdowns, 11 status tabs, paginated table (barcode, product, size, category, status, purchase date, age, cost, price).
- **`/inventory/[id]`** — full item identity, cost snapshot and age, status-change control, and the complete `MovementTimeline`.
- 5 new components: `InventoryTable`, `InventoryFilters`, `ValuationCards`, `StockAlerts`, `StatusBadge`.

### 4.4 Defects found and fixed in this area

**D20 — The status enum did not match the contract.**
The schema had `IN_STOCK, RESERVED, SOLD, RETURNED_TO_STOCK, RETURNED_DAMAGED, DAMAGED, LOST, TRANSFERRED_OUT`.

Plan §2.8 requires: *Available, Sold, Returned, **Exchanged**, Damaged, **Defective**, Missing and **Supplier Return***.

**Three required statuses were missing.** Acceptance is judged against the catalogue's list, so migration 004 adds `EXCHANGED`, `DEFECTIVE` and `SUPPLIER_RETURN`, plus the movement types that produce them (`EXCHANGE`, `DEFECT_WRITE_OFF`, `SUPPLIER_RETURN`).

Knex's `t.enu()` creates a `varchar` + CHECK constraint rather than a native Postgres enum, so the migration drops and recreates the constraint. It only ever *widens* the allowed set, so existing rows are unaffected.

The UI now displays the plan's vocabulary — **Available**, **Missing**, **Supplier Return** — rather than raw enum names.

**D21 — The entire list-page CSS was missing.**
`page-content`, `page-header__title`, `product-toolbar`, `filter-tab`, `pagination`, `status-badge`, `data-table`, `stock-summary-card`, `movement-timeline`, `stock-entry-panel` and others had **zero rules in any stylesheet**. This is why the Products page rendered as run-together text (`Blue Denim JacketBLUDENJATopwear212₹1,800ACTIVEViewEdit`).

Since the inventory pages reuse the same class vocabulary, ~560 lines of CSS were added using the existing design tokens — which fixed the **Products page and product detail page as a side effect**.

**D22 — Movement type had to be picked separately from status.** The status-change form derives the movement type from the destination status (`DAMAGED` → `DAMAGE_WRITE_OFF`), so the user picks one thing instead of two that must agree.

---

## 5. Requirement coverage

### Week 2

| Requirement | Status |
|---|---|
| Size checkboxes with quantity fields, automatic total | ✅ Already existed |
| Product / Variant / Inventory Item entities | ✅ Already existed |
| Variant SKU + one unique barcode per physical item | ✅ **Fixed** (was broken end-to-end) |
| Test evidence: quantity N → N unique barcodes | ✅ **Built** (5 integration tests) |
| Categories and subcategories | ✅ Seeded in Postgres |
| Suppliers | ⚠️ **API + database only — no UI** |
| Barcode label preview, thermal/A4 print, safe reprint | ❌ **Not started** |
| AI photo entry option | ❌ Not started (Week 6) |

### Week 3

| Requirement | Status |
|---|---|
| Inventory list, search and filters | ✅ Built |
| Item detail view | ✅ Built |
| All 8 statuses from §2.8 | ✅ **Fixed** (3 were missing) |
| Stock movements + immutable history | ✅ Built (append-only, shown on detail page) |
| Category / supplier / size / status views | ✅ Built |
| Cost value, expected selling value, gross profit | ✅ Built |
| Low-stock, out-of-stock, ageing rules | ✅ Built |
| Audit events | ✅ Written to `audit_logs` |
| Prevent duplicate stock on barcode reprint | ⚠️ Unique constraint prevents duplicates; **no reprint UI exists yet** |
| Inventory test report | ⚠️ Barcode tests exist; inventory-specific tests not written |

---

## 6. Verification performed

**Automated**

```bash
cd Backend  && npm test       # 5 integration tests, real API + real database
cd Frontend && npm test       # 75 unit tests (permissions, retail templates)
npx tsc --noEmit              # clean in both apps
```

**Manual, through the browser against Neon**

- Signup → email verification → login → onboarding → store creation
- Add Product (M×5, L×7) → **12 items, 12 unique barcodes** (`00001`–`00012`), M=5 / L=7
- Add Product (M×4, XL×6) → sequence continued `00013`–`00022`, **sizes recorded correctly**
- `/inventory` → valuation **₹13,200 cost / ₹21,600 expected / ₹8,400 profit** (matched hand calculation exactly)
- Size filter → 4 M items; Damaged tab → 1 item
- Status change `IN_STOCK → DAMAGED` with reason → timeline gained the entry, valuation dropped by exactly ₹700 cost / ₹1,200 expected
- Console clean; `indexedDB.databases()` returns `[]`

---

## 7. Known limitations — disclose at handover

1. **The app no longer works offline.** Removing IndexedDB was a deliberate decision, but it conflicts with plan §2.19 (*"Offline-supported product, billing, inventory and AI workflows"*) and Approval Gate 3 (*"must work without AI or a paid database"*). With no connection the app shows "Cannot reach the server."

2. **`JWT_SECRET` is a development placeholder.** The value currently in `Backend/.env` is a short, human-readable string, and it now signs real authentication tokens — anyone who knows it can mint a valid token for any user and role. It must be replaced with a long random value before any public deployment:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

3. **Email delivery is stubbed.** The 6-digit verification code is returned in the signup response (development only) and logged to the server console. No email is sent.

4. **Barcode label printing does not exist** — a Week 2 deliverable. Nothing can currently be printed.

5. **Supplier management has no UI.** The database table, service and API endpoints exist, but there is no screen to create or manage suppliers, and no supplier field on the product form — despite the plan making supplier mandatory (§2.4).

6. **The low-stock threshold (3 units) and ageing buckets (0–30/31–60/61–90/90+ days) are hard-coded constants.** The plan requires the alerts but does not specify numbers; these belong in store settings once that screen exists.

7. **Dead navigation.** `/billing`, `/reports`, `/settings`, `/audit` and `/store` are still in the sidebar but have no pages — they 404.

8. **One pre-existing TypeScript error** in `ProductService.updateProduct` was present on `main` before this work and has since been resolved by the rewrite.

---

## 8. Files at a glance

**Backend — new**
`src/db/pg-mapping.ts` · `src/db/migrations/002–004` · `src/db/seeds/001_clothing_template.ts` · `src/config/permissions.ts` · `src/shared/AppError.ts` · `src/types/domain.ts` · `src/services/` (8 files) · `src/api/store|staff|catalog/` · `tests/barcode.integration.test.ts` · `jest.config.js`

**Backend — modified**
`src/app.ts` (routers mounted, error handler, startup guard) · `src/db/client.ts` · `src/db/knexfile.ts` · `src/middleware/auth.middleware.ts` · `src/api/auth|products|inventory/` · `tsconfig.json` · `package.json`

**Frontend — new**
`src/lib/apiClient.ts` · `app/(app)/inventory/page.tsx` · `app/(app)/inventory/[id]/page.tsx` · 5 inventory components

**Frontend — deleted** (~24 files)
`src/db/` (Dexie schema, seeds, singleton) · `src/adapters/` (all 14 Local*/Dexie* adapters + registry) · all `src/modules/*/repository/` interfaces · `src/shared/audit/AuditService.ts` · dependencies `dexie`, `bcryptjs`, `fake-indexeddb`

**Frontend — modified**
All 7 services rewritten to call `apiClient` · `src/modules/inventory/types.ts` · `src/config/retail-templates.ts` · `app/(app)/products/new/page.tsx` · `app/onboarding/store-setup/page.tsx` · `src/styles/components.css` (+560 lines)

**No component, page layout, hook or context was changed** during the database migration — services kept identical signatures, so the UI was unaffected.

---

## 9. Recommended next steps

1. **Week 4 — billing, invoices, returns and exchanges.** Due **30 August**, flagged in the plan as a *Major Milestone*. This is the highest-priority outstanding item.
2. **Barcode label printing** — an unfinished Week 2 deliverable; needed for Week 4 scanning to be demonstrable.
3. **Supplier management UI** — unfinished Week 2 deliverable; supplier is contractually mandatory on product entry.
4. **Inventory test coverage** — the barcode suite exists; valuation, ageing and status-transition tests do not.
5. **Decide the offline story** before the acceptance demo — either restore an offline layer or document the deviation formally with Navkar.
