# design-reference

Exported Stitch screens, renamed to match the app's routes. Each screen = `<name>.html` (markup) + `<name>.png` (picture).

## Read this first: two themes are mixed

The screens were exported with **two different looks**. Do not copy colors or fonts from the HTML files. Use `DESIGN.md` in the project root for all colors, fonts, radii and borders. Use the HTML/PNG only for layout, structure, spacing and content blocks.

- **OK / A**: uses the stone and teal hex values (`#FAFAF9`, `#0F766E`, `#E7E5E4`). Matches DESIGN.md.
- **LAYOUT ONLY / B**: uses Stitch's own tokens: cream background `#fff8f5`, dark green `#005c55`, Inter font, no borders, sidebar with no icons. Take the layout, recolor from DESIGN.md.
- **LAYOUT ONLY / C** (login, signup, verify): cream `#faf8f5` and a serif font (Newsreader). Take the layout, no serif.

## Screens

| File | Route | Status | Note |
|---|---|---|---|
| `dashboard` | `/dashboard` | OK: stone/teal hex classes (matches DESIGN.md) |  |
| `billing` | `/billing` | OK: stone/teal hex classes (matches DESIGN.md) |  |
| `billing-payment-single` | `/billing (modal)` | Mostly OK, small leftovers | has serif title refs; use DM Sans |
| `billing-payment-split` | `/billing (modal)` | OK: stone/teal hex classes (matches DESIGN.md) | uses Inter + mono font; use DM Sans |
| `billing-sale-complete` | `/billing (modal)` | Mostly OK, small leftovers | has serif title refs; use DM Sans |
| `invoices` | `/invoices` | OK: stone/teal hex classes (matches DESIGN.md) |  |
| `invoices-view-modal` | `/invoices (modal)` | Mostly OK, small leftovers | semantic tokens + serif refs; recolor from DESIGN.md |
| `returns` | `/returns` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `exchanges` | `/exchanges` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `products-list` | `/products` | OK: stone/teal hex classes (matches DESIGN.md) |  |
| `products-detail` | `/products/[id]` | Mostly OK, small leftovers | semantic tokens + serif refs; recolor from DESIGN.md |
| `restock` | `/restock` | OK: stone/teal hex classes (matches DESIGN.md) |  |
| `restock-success` | `/restock (success state)` | OK: stone/teal hex classes (matches DESIGN.md) |  |
| `ai-restock` | `/ai-restock` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `inventory` | `/inventory` | OK: stone/teal hex classes (matches DESIGN.md) |  |
| `barcodes` | `/inventory/barcodes` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `staff-list` | `/staff` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `staff-add` | `/staff/new` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `reports-sales-profit` | `/reports (Sales & Profit tab)` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `reports-stock-valuation` | `/reports (Stock Valuation tab)` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `reports-stock-ageing` | `/reports (Stock Ageing tab)` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `reports-suppliers` | `/reports (Supplier Performance tab)` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `reports-returns-damages` | `/reports (Returns & Damages tab)` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `reports-staff-audit` | `/reports (Staff Audit tab)` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `ai-insights` | `/ai-insights` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `backup` | `/backup` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `settings` | `/settings` | LAYOUT ONLY: cream bg + dark green + Inter |  |
| `login` | `/login` | LAYOUT ONLY: cream bg + serif headings |  |
| `signup` | `/signup` | LAYOUT ONLY: cream bg + serif headings |  |
| `verify` | `/verify` | LAYOUT ONLY: cream bg + serif headings |  |
| `onboarding-1-retail-type` | `/onboarding/retail-type` | Mostly OK, small leftovers | serif refs; use DM Sans |
| `onboarding-2-store-setup` | `/onboarding/store-setup` | Mostly OK, small leftovers | serif refs; use DM Sans |
| `onboarding-3-complete` | `/onboarding/complete` | Mostly OK, small leftovers | serif refs; use DM Sans |

## Folders

- `screens/`: the final screens to use.
- `assets/`: logo and the sample manager photo (placeholder only, do not ship).
- `_alternates/`: older variants of 5 report tabs, with extra columns that are not in the app. Ignore unless asked.
- `_stitch-design-systems/`: Stitch's own design-system files. The stone-teal one has a cream surface (`#fff8f5`), so do not use it. Use the DESIGN.md in the project root.
- `_old-app-screenshots/`: screenshots of the existing app, for before/after comparison only.

## Not designed (restyle from shared components)

`/products/new`, `/products/[id]/edit`, `/staff/[id]`, `/inventory/[id]`, audit trail modal, discount modal, customer select modal.

## Sample data

Names, numbers and photos in the HTML are placeholders. Keep the app's real data and logic.
