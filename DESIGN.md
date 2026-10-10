# Ownly Retail Manager - Design System

## Screens
- Dashboard - Ownly Retail Manager
- POS-Billing
- Products
- Inventory-Ledger
- Login - Ownly Retail Manager

## Brand & Style
The design system establishes a high-trust, focused, and calm operating environment tailored for retail store managers, inventory controllers, and checkout operators. Grounded in a modern utilitarian minimalist style, it merges structural clarity with dense, data-heavy tools.

- **Tone:** Authoritative, quiet, highly organized, and transparent.
- **Visual Personality:** Crisp lightness, sharp hairline boundaries, and vibrant teal accents.

## Colors
- **Primary / Accent:** `#0F766E` (Teal). Hover: `#115E59`. Background Tint: `#F0FDFA`.
- **Text (Primary):** `#1C1917` (Near Black / Stone 900)
- **Text (Secondary):** `#78716C` (Stone 500)
- **Canvas Base:** `#FAFAF9` (Stone 50) for app backgrounds and off-canvas sidebars.
- **Surface / Cards:** `#FFFFFF` for primary work surfaces and content cards.
- **Borders / Dividers:** `#E7E5E4` (Stone 200) for structural borders.
- **Hover / Muted Container:** `#F5F5F4` (Stone 100) for table headers and row hovers.
- **Success (Green):** Text `#16A34A`, Background `#F0FDF4`, Border `#BBF7D0`.
- **Warning (Orange):** Text `#D97706`, Background `#FFFBEB`, Border `#FDE68A`.
- **Danger (Red):** Text `#DC2626`, Background `#FEF2F2`, Border `1px solid rgba(220, 38, 38, 0.2)`.

## Typography
All typography strictly utilizes **DM Sans** (with a system sans-serif fallback) across everything, including all headings and body copy, to ensure clean alignment and readability.
- **NOTE:** Lora and any other serif fonts must be strictly removed from the project.
- **Headings:** DM Sans, ranging from `text-2xl` (Dashboard title) to `text-lg` (Card titles), typically `font-bold` or `font-semibold`.
- **Body Text:** DM Sans, `text-sm` for tables and standard text, `text-xs` for metadata.
- **Weights:** Regular (400), Medium (500) for actions, Semi-Bold (600) / Bold (700) for emphasis and headers.

## Corner Radius (Rounded)
- **Small (Inputs/Badges):** `rounded` (0.25rem / 4px)
- **Medium (Buttons):** `rounded-lg` (0.5rem / 8px)
- **Large (Cards/Modals):** `rounded-xl` (0.75rem / 12px)
- **Pills/Status Dots:** `rounded-full` (9999px)

## Spacing Scale
Follows standard Tailwind spacing (`gap-2`, `p-4`, `px-4`, `py-2.5`, `h-10`).
Uses high information density with generous padding for touch targets.

## Border Style
- **Flat Structural Borders:** `1px solid #E7E5E4` separates white content cards from the tinted app canvas.
- **Inner Dividers:** `border-bottom: 1px solid #E7E5E4` or `1px solid #E7E5E4` between table row lines.

## Shadow / Elevation Style
- Primarily relies on flat structural borders and planar contrast (White on Stone-50) rather than heavy blurred drop shadows.
- Primary buttons use `shadow-none`.
- Subtle components may use `shadow-xs`.

## Components

### Button Styles
- **Primary:** Background `#0F766E`, text `#FFFFFF`, border none, `rounded-lg`, height `h-10`. Hover: `#115E59`.
- **Secondary / Default:** Background `#FFFFFF`, text `#1C1917`, border `#E7E5E4`, `rounded-lg`. Hover: background `#FAFAF9`.
- **Subtle / Ghost:** Background transparent, text `#78716C`, `rounded-lg`. Hover: text `#1C1917`, background `#F5F5F4`.

### Input Styles & Search Bars
- **Container:** Height `h-10`, border `#E7E5E4`, background `#FAFAF9` or `#FFFFFF`, `rounded-lg`, text `#1C1917`.
- **Prefix / Suffix Icons:** Set in `#78716C`.

### Badge / Chip Styles
- **Shape:** `rounded` or `rounded-full`, padding `px-2 py-0.5`, text `text-xs font-semibold` or `font-medium`.
- **Success (In Stock / Paid):** Background `#F0FDF4`, text `#16A34A`, border `#BBF7D0`.
- **Warning (Low Stock):** Background `#FFFBEB`, text `#D97706`, border `#FDE68A`.
- **Danger (Out of Stock / Void):** Background `#FEF2F2`, text `#DC2626`, border `1px solid rgba(220, 38, 38, 0.2)`.

### Table Styles
- **Container:** `rounded-xl`, border `1px solid #E7E5E4`, `overflow-hidden`.
- **Header:** Background `#F5F5F4`, text `#78716C`, uppercase, `font-semibold`, `text-xs`, border-bottom `1px solid #E7E5E4`.
- **Rows:** `1px solid #E7E5E4` between rows, text `#1C1917`, `text-sm`. Hover row: background `#FAFAF9`.

### Modal & Card Styles
- **Structure:** Crisp white background `#FFFFFF`, bordered with `1px solid #E7E5E4`, `rounded-xl`.
- **Header Section:** Padding `p-4`, border-bottom `1px solid #E7E5E4` separating the body.

## Screen to Route Map

### Matched Screens and Routes
- `add staff` -> `/staff/new`
- `exchange screen` -> `/exchanges`
- `Reports and analytics` -> `/reports`
- `Products` -> `/products`
- `store settings` -> `/settings`
- `Verify - Ownly Retail Manager` -> `/verify`
- `Dashboard - Ownly Retail Manager` -> `/dashboard`
- `AI Restock Advisor - Ownly Retail Manager` -> `/ai-restock`
- `Login - Ownly Retail Manager` -> `/login`
- `Signup - Ownly Retail Manager` -> `/signup`
- `POS-Billing` -> `/billing`
- `Inventory-Ledger` -> `/inventory`
- `invoices and reciepts` -> `/invoices`
- `Restock-Normal` -> `/restock`
- `return and refunds` -> `/returns`
- `staff screen` -> `/staff`

### Routes with no design file
- `/`
- `/onboarding/retail-type`
- `/onboarding/store-setup`
- `/onboarding/complete`
- `/staff/[id]`
- `/inventory/barcodes`
- `/backup`
- `/products/new`
- `/ai-insights`
- `/products/[id]/edit`
- `/inventory/[id]`
- `/products/[id]`

### Design files with no route
- `stock ageing and dead stock`
- `Restock-Normal succes page`
- `Supplier Performance`
- `staff audit`
- `Stock Valuation`
- `returns and exchanges`
- `Invoices reciept`

## Screen to route map, extra notes
- `stock ageing and dead stock`, `Stock Valuation`, `Supplier Performance`, `staff audit` are tabs inside `/reports`.
- `Restock-Normal succes page` is the success state of `/restock`.
- `Invoices reciept` is the invoice view modal on `/invoices`.
- `returns and exchanges` is an older duplicate. Ignore it.
- Routes with no design file (onboarding, `/backup`, `/inventory/barcodes`, `/ai-insights`, `/products/new`, `/products/[id]`, `/products/[id]/edit`, `/staff/[id]`, `/inventory/[id]`) must be restyled using the shared components and styles from the pages that do have designs.
- The Tailwind-style values in this file (for example border-[#DC2626]/20) must be translated into plain CSS (for example rgba(220, 38, 38, 0.2)). Do not install Tailwind.
