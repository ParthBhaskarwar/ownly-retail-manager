# OWNLY AI Retail Manager — User Acceptance Test (UAT) Report

**Release Candidate Scope:** Week 8 System Integration & Acceptance  
**Date:** September 28, 2026  
**Execution Environment:** Node.js v20.14.0 | Next.js 14.2.35 | Express 5.0.0 | PostgreSQL 16 (Neon)  
**Overall Status:** PASS (26 / 26 Scenarios Passed)  

---

## Acceptance Test Scenarios Matrix

| Scenario ID | Scenario Description | Preconditions | Expected Result | Actual Result | Status | Evidence Reference |
|-------------|----------------------|---------------|-----------------|---------------|--------|--------------------|
| **UAT-01** | Create store & user login | Fresh database / user registration | User created, store initialized, JWT token issued, redirected to onboarding/dashboard. | Registration and store creation successful; JWT stored securely in localStorage. | **PASS** | UAT-EVID-01 |
| **UAT-02** | Create clothing category/product | Store onboarding completed | Category "Men's Apparel" and Product "Denim Jacket" created in PostgreSQL database. | Product created with auto-assigned category and base SKU `BLUDENJA`. | **PASS** | UAT-EVID-02 |
| **UAT-03** | Add category-specific attributes | Category exists | Fit, Fabric, Season, Care attributes attached to retail template & product. | Attributes stored in `product_attribute_values` and mapped correctly. | **PASS** | UAT-EVID-03 |
| **UAT-04** | Add product photos | Product created | Product photo uploaded, stored in storage directory, and thumbnail rendered. | Image processed, saved to public storage, and displayed in product gallery. | **PASS** | UAT-EVID-04 |
| **UAT-05** | Create variants and sizes | Product created | Size variants (M, L, XL, XXL) created with distinct SKUs. | Variants created: `BLUDENJA-M`, `BLUDENJA-L`, `BLUDENJA-XL`, `BLUDENJA-XXL`. | **PASS** | UAT-EVID-05 |
| **UAT-06** | Generate SKU/barcode | Variants created | Store-scoped unique barcodes generated for each size variant. | Barcodes generated in format `STR001-BLUDENJA-00001` to `00004`. | **PASS** | UAT-EVID-06 |
| **UAT-07** | Add inventory | Variants & barcodes ready | Physical stock added per variant with purchase cost price and purchase date. | `inventory_items` rows created; status set to `IN_STOCK`. | **PASS** | UAT-EVID-07 |
| **UAT-08** | Perform stock movement | Inventory items exist | Stock quantity updated or status adjusted; movement logged in `inventory_movements`. | Movement recorded with movement type, actor ID, and timestamp. | **PASS** | UAT-EVID-08 |
| **UAT-09** | Create customer | POS/Billing system active | Customer record created with name, phone, email, and GSTIN. | Customer inserted into `customers` table with valid store ID scoping. | **PASS** | UAT-EVID-09 |
| **UAT-10** | Complete POS sale | Cart containing items | Invoice generated with tax, discounts, and payment mode (UPI/Cash/Card). | Invoice created with status `PAID`; receipt printable. | **PASS** | UAT-EVID-10 |
| **UAT-11** | Verify inventory deduction | POS sale completed | Sold item statuses updated from `IN_STOCK` to `SOLD`; stock count decrements. | Items marked `SOLD`; `SALE` movement logged; stock counts decremented. | **PASS** | UAT-EVID-11 |
| **UAT-12** | Process return | Completed invoice exists | Return processed; customer refunded; item returned to stock or marked damaged. | Return record created; item status set to `RETURNED_TO_STOCK`; stock incremented. | **PASS** | UAT-EVID-12 |
| **UAT-13** | Process exchange | Return processed | Return item exchanged for another item; net price difference calculated. | Exchange transaction atomic; old item returned, new item marked `SOLD`. | **PASS** | UAT-EVID-13 |
| **UAT-14** | Run restocking workflow | Low stock detected | Manual restock batch submitted for multiple variants simultaneously. | `restock_batches` row created; physical units added in single transaction. | **PASS** | UAT-EVID-14 |
| **UAT-15** | Run AI-assisted restocking | Store sales data available | AI engine calculates scores (demand, selling, profitability, dead-stock, return-risk). | AI Restock recommendations rendered with size-wise breakdown and decisions. | **PASS** | UAT-EVID-15 |
| **UAT-16** | Accept/modify/reject AI recommendation | AI restock recommendations generated | Store Owner accepts, modifies quantity, or rejects recommendation. | Decision recorded in `ai_predictions`; owner overrides persisted. | **PASS** | UAT-EVID-16 |
| **UAT-17** | Verify prediction history | Decisions logged | AI Prediction history view shows past predictions vs actual outcomes. | Prediction history rendered with decision comparison metrics. | **PASS** | UAT-EVID-17 |
| **UAT-18** | View AI Insights | AI pipeline initialized | Dashboard displays AI Insights (sell-through probability, time-to-clear, recommendations). | AI Insights dashboard components render accurately with confidence metrics. | **PASS** | UAT-EVID-18 |
| **UAT-19** | Generate backup | Database populated | Complete store data backup archive generated with SHA-256 integrity hash. | JSON backup file exported containing all tables and metadata. | **PASS** | UAT-EVID-19 |
| **UAT-20** | Test restore in test environment | Valid backup archive | Backup restored into isolated test database; schema & data verified. | All store entities restored cleanly; zero data corruption. | **PASS** | UAT-EVID-20 |
| **UAT-21** | Check audit log | Sensitive actions performed | Audit log records all logins, price edits, returns, restocks, backups. | Audit entries present with actor, action, entity, metadata, timestamp. | **PASS** | UAT-EVID-21 |
| **UAT-22** | Test unauthorized action | Logged in as CASHIER or MANAGER | API call to unauthorized endpoint (`PUT /api/store` by MANAGER) rejected. | Backend returns HTTP 403 Forbidden with clean error response. | **PASS** | UAT-EVID-22 |
| **UAT-23** | Test mobile layout | Mobile viewport (390 x 844) | All UI elements responsive; zero horizontal scroll; mobile nav drawer functional. | Navigation drawer operates smoothly; POS & forms fit 390px viewport. | **PASS** | UAT-EVID-23 |
| **UAT-24** | Test tablet layout | Tablet viewport (820 x 1180) | 2-column card grid; billing split view readable; tables scrollable. | Dashboard and inventory tables format cleanly on tablet screens. | **PASS** | UAT-EVID-24 |
| **UAT-25** | Test desktop layout | Desktop viewport (1440 x 900) | Full multi-column dashboard grid; sidebar pinned; instant search. | Desktop layout spacious, responsive, and wows with dark glassmorphic theme. | **PASS** | UAT-EVID-25 |
| **UAT-26** | Install & test PWA | PWA browser environment | Web App Manifest recognized; Service Worker registered; shell cached offline. | PWA manifest valid (`/manifest.json`); Service Worker active. | **PASS** | UAT-EVID-26 |

---

## Detailed Scenario Execution Notes

### Scenario 15 & 16: AI Restock Decision Workflow
- **Precondition:** Store inventory contains garment variants with 30-day sales history.
- **Execution:** User clicked **⚡ Restock** -> **AI Recommendations**.
- **Observation:** The AI restock engine computed size-level demand. For size `M`, recommended quantity was `12` with decision `Strong Buy`. User edited quantity to `10` (`MODIFY`) and accepted.
- **Verification:** Database table `ai_predictions` updated with `owner_decision = 'MODIFY'` and `modified_quantity = 10`. Restock batch succeeded.

### Scenario 22: Backend Permission Security (RBAC)
- **Precondition:** Authenticated JWT session for role `MANAGER`.
- **Execution:** Issued direct HTTP request `PUT http://localhost:4000/api/store` with payload `{ name: "Unauthorized Name Change" }`.
- **Observation:** Backend returned status `403 Forbidden` with body `{ "error": "Permission denied: settings:edit required." }`.
- **Verification:** Store settings remained untouched in database.

---

## Conclusion

All 26 UAT scenarios passed verification. The application state is fully accepted for Release Candidate readiness.
