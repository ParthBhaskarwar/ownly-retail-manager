# Ownly AI Retail Manager — End-User Manual

**Document ID:** D16-EUM-001  
**Version:** 2.4.1 (Week 8 Release Candidate)  
**Target Roles:** Cashiers, Sales Associates, Inventory Clerks, Floor Managers  
**Last Updated:** October 2026  

---

## Table of Contents
1. [Introduction & PWA Access](#1-introduction--pwa-access)
2. [Daily Login & Shift Start](#2-daily-login--shift-start)
3. [Point of Sale (POS) Billing](#3-point-of-sale-pos-billing)
4. [Invoices & Receipts History](#4-invoices--receipts-history)
5. [Customer Returns & Refunds](#5-customer-returns--refunds)
6. [Product Exchanges](#6-product-exchanges)
7. [Product Catalog & Stock Lookup](#7-product-catalog--stock-lookup)
8. [Inventory Ledger & Barcode Scanning](#8-inventory-ledger--barcode-scanning)
9. [Stock Receiving & Manual Restock](#9-stock-receiving--manual-restock)
10. [Offline Mode & Network Sync](#10-offline-mode--network-sync)
11. [Keyboard Shortcuts & Hotkeys](#11-keyboard-shortcuts--hotkeys)
12. [Troubleshooting Common Issues](#12-troubleshooting-common-issues)

---

## 1. Introduction & PWA Access

**Ownly AI Retail Manager** is an offline-first retail operations platform designed specifically for apparel and clothing stores. It streamlines checkout, tracks inventory down to individual variant barcodes, and facilitates returns and exchanges.

### Accessing the Application
- **URL:** Open Google Chrome or any modern browser and navigate to your store's Ownly URL (e.g., `http://localhost:3000` or your custom domain).
- **Desktop / Mobile Installation:**
  1. Click the **Install** icon in the browser address bar (or menu → **Install Ownly**).
  2. Launch Ownly directly from your desktop or tablet home screen as a standalone application.
  3. Ensure the bottom indicator in the left sidebar displays **Online Sync (Green dot)**.

---

## 2. Daily Login & Shift Start

### Logging In
1. Navigate to the login page (`/login`).
2. Enter your registered work email and password.
3. Click **Sign in to Store**.
4. Upon successful authentication, your assigned role (`CASHIER`, `INVENTORY_STAFF`, `MANAGER`, etc.) will determine which menu items are visible in the sidebar navigation.

### Shift Readiness Checklist
- [ ] Verify that your barcode scanner gun is plugged in or paired via Bluetooth.
- [ ] Confirm receipt printer is loaded with paper and turned on.
- [ ] Check sidebar indicator to verify connectivity status (`Online Sync`).
- [ ] Ensure starting cash drawer balance is counted and verified.

---

## 3. Point of Sale (POS) Billing

Access POS Billing by clicking **POS Billing** (`/billing`) in the sidebar navigation.

```
┌───────────────────────────────────────────────┬────────────────────────────────┐
│  Search Products (Name, SKU, Scan Barcode)    │  Current Order Summary         │
│  [=========================================]  │  Customer: [Walk-in / Search]  │
│                                               │                                │
│  Item Card 1       Item Card 2    Item Card 3 │  1. Slim Denim (M / Blue)  ₹999│
│  [Add to Cart]     [Add to Cart]  [Add to Cart│  2. Cotton Tee (L / Black) ₹499│
│                                               │                                │
│                                               │  Subtotal:             ₹1498.00│
│                                               │  GST (5%):               ₹74.90│
│                                               │  Total Payable:        ₹1572.90│
│                                               │  [ Cash ] [ UPI ] [ Split Pay ]│
└───────────────────────────────────────────────┴────────────────────────────────┘
```

### Step 3.1: Adding Items to the Cart
Items can be added in three ways:

1. **Barcode Scanning (Fastest):**
   - Point your handheld laser/2D scanner at the garment's barcode tag and pull the trigger.
   - The exact variant (e.g., *Oxford Shirt — Size M, Navy*) is instantly added to the cart.
   - Scanning the same barcode multiple times increments the quantity automatically.

2. **Keyboard SKU / Name Search:**
   - Press `/` or click into the product search bar at the top of the screen.
   - Type the product name, style code, or SKU (e.g., `TSH-001`).
   - Click the product card, then pick the requested **Size** (e.g., S, M, L, XL) and **Color**.

3. **Visual Catalog Grid:**
   - Click through category filters (e.g., *Men's Wear → Shirts*) to browse items visually.

### Step 3.2: Adjusting Quantities & Line Items
- **Increase / Decrease Quantity:** Use the `+` and `-` buttons in the cart line.
- **Remove Line Item:** Click the red trash icon next to the item.
- **Price Overrides & Discounts:** If permitted by your role (`billing:discount:limited` up to 10%, or `billing:discount:unlimited` for Managers), enter the discount percentage or flat amount in the discount box.

### Step 3.3: Attaching a Customer Profile
- **Walk-in Customer (Default):** No customer details required.
- **Registered Customer / Loyalty:**
  1. Click **Select / Add Customer**.
  2. Type the customer's 10-digit mobile number or name.
  3. If not found, enter their Name and Phone number and click **Save Customer**.
  4. Invoices and credit notes will automatically link to their account.

### Step 3.4: Processing Payment & Checkout
1. Review the order totals:
   - **Subtotal:** Pre-tax value.
   - **Tax (CGST + SGST):** Computed with banking-grade 2-decimal precision (`round2()`).
   - **Total Payable:** Final rounded amount.
2. Select the payment method:
   - **Cash:** Enter the cash received. The system displays the exact change due to the customer.
   - **UPI / QR:** Have the customer scan the dynamic UPI QR code on the payment terminal.
   - **Card:** Swipe/Tap on external POS card machine and click **Confirm Card Payment**.
   - **Credit Note:** Enter customer credit note code to deduct balance.
   - **Split Payment:** Combine Cash + UPI / Card for split tenders.
3. Click **Complete Checkout (`Enter`)**.
4. The sales invoice is committed atomically to the store database, inventory stock is deducted, and a print-ready receipt modal appears.

---

## 4. Invoices & Receipts History

Navigate to **Invoices & Receipts** (`/invoices`) to view all past transactions.

### Key Actions
- **Search Invoices:** Search by Invoice Number (`INV-2026-XXXX`), customer name, or date.
- **Reprint Receipt:** Click **View Receipt** → **Print Receipt** (supports 80mm thermal printers and full-page A4 PDF receipts).
- **Verify Payment Method:** Check payment timestamps, transaction IDs, and cashier names.

---

## 5. Customer Returns & Refunds

Navigate to **Returns & Refunds** (`/returns`) when a customer brings back an item.

### Step 5.1: Locating the Original Invoice
1. Ask the customer for their physical/digital receipt or mobile number.
2. In the **Find Invoice** input, enter the Invoice ID or customer phone.
3. The items purchased on that invoice will load onto the screen.

### Step 5.2: Selecting Returned Items
1. Check the box next to each garment being returned.
2. Select the **Return Quantity**.
3. Select the **Return Reason**:
   - `Size / Fit Issue`
   - `Defective / Stitching Defect`
   - `Fabric Quality / Color Bleed`
   - `Changed Mind / Unwanted Gift`

### Step 5.3: Stock Restock Assessment
- **Return to Active Stock:** Check this box if the garment is unworn, clean, and has intact tags. The inventory item will return to `AVAILABLE` status.
- **Damaged / Quarantine:** Leave unchecked if garment is defective or damaged. It will be marked `DAMAGED` and excluded from sellable stock.

### Step 5.4: Issuing the Refund
Select the refund mode:
- **Cash Refund:** For original cash purchases.
- **Credit Note (Recommended):** Generates a unique digital voucher code (e.g., `CN-XXXX-XXXX`) valid for store purchases.
- Click **Process Return**. An official Return Voucher is generated.

---

## 6. Product Exchanges

Navigate to **Product Exchanges** (`/exchanges`) when a customer wants to swap a size, color, or style.

### Exchange Workflow
1. **Step 1: Enter Original Invoice** to load eligible items.
2. **Step 2: Select the Outgoing Item** the customer is returning.
3. **Step 3: Scan the Replacement Item** the customer wants to take.
4. **Step 4: Balance Calculation:**
   - **Even Swap (Same Price):** Net payable is ₹0.00.
   - **Upgrade (Higher Price):** Customer pays the remaining difference via Cash/UPI.
   - **Downgrade (Lower Price):** Customer receives a store Credit Note or cash refund for the difference.
5. Click **Finalize Exchange**. Stock ledger is automatically balanced: old item is marked `EXCHANGED`, new item is marked `SOLD`.

---

## 7. Product Catalog & Stock Lookup

Navigate to **Products** (`/products`) to inspect inventory availability.

### Catalog Features
- **Search Filter:** Search by brand, fabric, fit, style code, or category.
- **Size Breakdown:** View live on-hand quantities per size (e.g., `S: 2`, `M: 5`, `L: 0`, `XL: 3`).
- **Low Stock Badges:**
  - `In Stock` (Green): Healthy stock levels.
  - `Low Stock` (Orange): Fewer than 3 units remaining.
  - `Out of Stock` (Red): 0 units on hand.

---

## 8. Inventory Ledger & Barcode Scanning

Navigate to **Inventory Ledger** (`/inventory`) and **Barcodes** (`/inventory/barcodes`).

### Real-Time Serialized Tracking
Every individual garment carries a unique serialized barcode generated in the format:
```
[STORE_PREFIX]-[CATEGORY_CODE]-[VARIANT_ID]-[SEQUENCE_NUMBER]
Example: STR1-SHIRT-M-NAVY-00042
```

### Validating Barcode Tags
1. When receiving shipments, open `/inventory/barcodes`.
2. Scan any garment tag.
3. The system confirms:
   - Product name and variant.
   - Stock status: `AVAILABLE`, `SOLD`, `RETURNED_TO_STOCK`, or `DAMAGED`.
   - Current cost and retail selling price.

---

## 9. Stock Receiving & Manual Restock

Navigate to **Restock** (`/restock`) to process new stock deliveries from suppliers.

### Step 9.1: Inward Delivery Form
1. Select the **Supplier / Vendor** from the dropdown.
2. Enter the Supplier Invoice or Delivery Challan number.
3. Add products and size quantities received:
   - Example: *Men's Linen Shirt — S: 10, M: 20, L: 20, XL: 10 (Total: 60 units)*.

### Step 9.2: Barcode Tag Generation
1. Click **Generate Barcodes & Inward Stock**.
2. The system creates the `restock_batch` record and assigns unique, non-duplicating barcodes.
3. Click **Print Barcode Labels** to print label sheets on your barcode thermal printer.
4. Affix physical tags to garments before placing them on the sales floor.

---

## 10. Offline Mode & Network Sync

Ownly Retail Manager is built with an **Offline-First PWA Architecture**.

### What Happens if Internet Fails?
- The sidebar indicator turns from **Online Sync** (Green) to **Offline Mode (Amber)**.
- **POS Billing continues working seamlessly:**
  - Fast barcode scanning and cart operations use local browser storage (IndexedDB).
  - Receipts print locally without interruption.
- **Automatic Background Re-sync:**
  - As soon as network connectivity is restored, cached offline transactions sync automatically to PostgreSQL.
  - Never manually clear browser cookies or data while in offline mode!

---

## 11. Keyboard Shortcuts & Hotkeys

| Shortcut | Action |
|:---:|---|
| `/` | Focus Product Search bar |
| `Ctrl + Enter` | Instant Checkout / Confirm Payment |
| `Escape` | Close Modal / Clear Active Selection |
| `F2` | New POS Sale / Clear Cart |
| `F8` | Open Barcode Scanner Input |
| `Ctrl + P` | Print Active Receipt |

---

## 12. Troubleshooting Common Issues

### Issue 1: Barcode scanner emits a beep but does not add the item to cart
- **Cause:** Scanner cursor is not focused in an input field, or scanner is in non-keyboard emulation mode.
- **Solution:** Click anywhere on the POS search bar, verify the blinking cursor, and scan again. Check USB cable connection.

### Issue 2: "Item out of stock" error during checkout
- **Cause:** Item count in database is 0 for that specific variant size.
- **Solution:** Check Inventory Ledger (`/inventory`) to verify if physical garment was counted in another size or has a pending restock batch.

### Issue 3: "Restore Confirmation" warning appears
- **Cause:** An administrative database restore was triggered.
- **Solution:** Wait for the store manager to finish database restore operations before starting new checkout transactions.
