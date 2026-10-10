---
name: Calm Editorial Retail
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#43474f'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#747780'
  outline-variant: '#c3c6d0'
  surface-tint: '#3f5f92'
  primary: '#0e3566'
  on-primary: '#ffffff'
  primary-container: '#2b4c7e'
  on-primary-container: '#9ebdf7'
  inverse-primary: '#a9c7ff'
  secondary: '#5c5f62'
  on-secondary: '#ffffff'
  secondary-container: '#dee0e4'
  on-secondary-container: '#606366'
  tertiary: '#4b2f00'
  on-tertiary: '#ffffff'
  tertiary-container: '#694400'
  on-tertiary-container: '#e7b369'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#a9c7ff'
  on-primary-fixed: '#001b3d'
  on-primary-fixed-variant: '#254778'
  secondary-fixed: '#e1e2e6'
  secondary-fixed-dim: '#c5c6ca'
  on-secondary-fixed: '#191c1f'
  on-secondary-fixed-variant: '#44474a'
  tertiary-fixed: '#ffddb3'
  tertiary-fixed-dim: '#f3bd72'
  on-tertiary-fixed: '#291800'
  on-tertiary-fixed-variant: '#624000'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  headline-xl:
    fontFamily: Newsreader
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: 2.75rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Newsreader
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Newsreader
    fontSize: 1.375rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Newsreader
    fontSize: 1.25rem
    fontWeight: '500'
    lineHeight: 1.625rem
  title-md:
    fontFamily: DM Sans
    fontSize: 1rem
    fontWeight: '600'
    lineHeight: 1.375rem
  body-lg:
    fontFamily: DM Sans
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.5rem
  body-md:
    fontFamily: DM Sans
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
  body-sm:
    fontFamily: DM Sans
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.125rem
  label-md:
    fontFamily: DM Sans
    fontSize: 0.75rem
    fontWeight: '600'
    lineHeight: 1rem
    letterSpacing: 0.05em
  data-mono:
    fontFamily: DM Sans
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-lg: 1.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 1.75rem
---

## Brand & Style

The design system establishes a high-trust, focused, and calm operating environment tailored for retail store managers, inventory controllers, and checkout operators. Grounded in a modern editorial minimalist style, it merges literary editorial warmth with dense, utilitarian data tools. 

Key attributes:
- **Tone:** Authoritative, quiet, highly organized, and transparent.
- **Visual Personality:** Near-monochrome paper-like lightness, sharp hairline boundaries, and restrained slate blue accents. Visual drama is achieved through typographic contrast (authoritative editorial serif titles paired with structural modern sans-serif body and tabular data) rather than saturated colors or deep drop shadows.
- **Experience Goals:** Eliminate cognitive fatigue during 10-hour shifts, guarantee accurate high-velocity scanning and financial bookkeeping, and offer ergonomically generous touch targets suitable for desktop monitors and point-of-sale tablets alike.

## Colors

The palette operates on crisp, near-monochrome clarity accented by an understated heritage blue.

### Neutral Tier (Canvas & Structure)
- **Canvas Base:** `#F8F9FA` for app backgrounds, off-canvas sidebars, and nested data panels.
- **Surface Elevation:** `#FFFFFF` for primary work surfaces, active row highlights, and content cards.
- **Subtle Surface Container:** `#F1F3F5` for table headers, disabled elements, and input backgrounds.
- **Hairline Divider / Border:** `#E2E5E8` (outer cards) and `#EAECF0` (table row lines, nested borders).

### Typography Tones
- **Primary Text:** `#1A1D20` (near-black charcoal for extreme legibility without harsh absolute black).
- **Secondary / Supporting Text:** `#5F666E` (balanced contrast for metadata, timestamps, and column labels).
- **Muted / Placeholder:** `#949CA6`.

### Accent & Interaction
- **Primary Brand Accent:** `#2B4C7E` (muted slate navy) used selectively for key CTA buttons, active sidebar tabs, focused border states, and significant progress metrics.
- **Focus Rings:** `rgba(43, 76, 126, 0.15)` with an inner `#2B4C7E` border.

### Status Indicators (Desaturated, Clear)
- **Positive / Paid / In Stock:** Badge fill `#DCFCE7`, border `rgba(22, 101, 52, 0.15)`, text `#166534`.
- **Warning / Low Stock:** Badge fill `#FEF3C7`, border `rgba(180, 83, 9, 0.15)`, text `#B45309`.
- **Critical / Out of Stock / Return:** Badge fill `#FEE2E2`, border `rgba(153, 27, 27, 0.15)`, text `#991B1B`.
- **Information / System State:** Badge fill `#EBF3FE`, border `rgba(43, 76, 126, 0.15)`, text `#2B4C7E`.

## Typography

The type system creates an intentional dual-character atmosphere:
1. **Editorial Display (`Newsreader`):** Applied exclusively to major section headers, page titles, and modal banner captions. It imparts craft, quality, and legacy retail elegance.
2. **Operational Core (`DM Sans`):** Neutral, open geometric sans-serif tuned for dense data intake, checkout line items, and navigation.
3. **Financial & Identification Rule:** All currency values (₹ INR), SKU identifiers, serial tags, and tabular calculations must enable tabular lining numbers (`font-variant-numeric: tabular-nums;`) to maintain strict vertical decimal and digit alignment across large inventories.
4. **Uppercase Micro-Labels:** Table column labels and category overlines utilize `label-md` with `text-transform: uppercase` and `0.05em` letter spacing for fast horizontal scanning.

## Layout & Spacing

The spatial architecture is calibrated for high information density and quick POS peripheral navigation.

### Global Rhythm
- Base spacing is built on a tight 4px / 8px scale.
- **Sidebar Navigation:** Fixed width at `240px` on desktop, collapsable to an icon rail (`64px`) on compact displays.
- **Dashboard & Work Surfaces:** Contained fluid grid with a standard `1.75rem` outer page margin on desktop, compressing to `1rem` on tablet/mobile screens.
- **Interactive Targets:** While UI density is high, interactive rows, table actions, and form inputs strictly enforce minimum touch targets of `40px` to `44px` height to prevent fat-finger entry errors on touch register tablets.

### Data Dense Grids
- Table row height standard: `48px` for data tables; `40px` for compact billing ledgers.
- Column gap: `1rem` to `1.5rem` to avoid visual collisions between numbers, text, and micro-actions.

## Elevation & Depth

This design system avoids heavy blurred drop shadows and glossy skeuomorphism in favor of **structural hairlines, planar contrast, and micro-elevation**:

1. **Flat Structural Borders:** Depth is primarily established through 1px border dividers (`#E2E5E8` or `#EAECF0`) separating white content cards (`#FFFFFF`) from the tinted app canvas (`#F8F9FA`).
2. **Layered Surfaces:** Secondary containers, filter wells, and banner highlights sit flush inside white cards using `#F8F9FA` or `#F1F3F5` background fills rather than raised shadow tiers.
3. **Floating Overlays & Popovers:** Modals, dropdown menus, and date pickers use a precise, tight drop shadow with zero spread to float just above the operational workspace: `0 4px 16px -2px rgba(26, 29, 32, 0.08), 0 1px 2px 0 rgba(26, 29, 32, 0.04)`.
4. **Active Selection Depth:** Active tabs and segmented controls sit flat with a hairline border or an inverted dark fill (`#1A1D20`), eliminating multi-level simulated Z-index stacks.

## Shapes

The shape geometry is crisp, quiet, and disciplined (`roundedness: 1`):
- **Base Elements (Buttons, Inputs, Badges, Tabs):** `0.25rem` (4px). Provides subtle softening while maintaining a precise, structured architectural line.
- **Cards, Panels, and Table Enclosures:** `0.5rem` (8px). Keeps screen sections clearly demarcated without excessive pillowy corners.
- **Pills / Status Dots:** Circular or full pill radii (`9999px`) are reserved exclusively for counter dots (e.g., active outlet status indicator) and status chips.

## Components

### Buttons
- **Primary:** Background `#2B4C7E`, text `#FFFFFF`, border none, border-radius `4px`, height `40px` (or `36px` compact). Hover: `#223D65`. Active: `#1A2F4F`.
- **Secondary / Default:** Background `#FFFFFF`, text `#1A1D20`, border `1px solid #E2E5E8`. Hover: `#F8F9FA` border `#D0D5DD`.
- **Subtle / Ghost:** Background transparent, text `#5F666E`. Hover: `#F1F3F5` with text `#1A1D20`.
- **Segmented Toggle Group:** Enclosed pill or rounded container (`#F1F3F5`) with `2px` padding. Active item: solid `#1A1D20` with white text, or pure `#FFFFFF` card with thin border and navy text.

### Data Tables
- **Header:** `#F8F9FA` surface, text `#5F666E`, font-weight `600`, letter-spacing `0.05em`, border-bottom `1px solid #E2E5E8`.
- **Rows:** Alternating transparent and `#FFFFFF` background. Hover row: `#F8F9FA`. Bottom divider: `1px solid #EAECF0`.
- **Numeric Columns:** Right-aligned with tabular numbers for currency (`₹`) and inventory quantities.

### Inputs & Search Bars
- **Container:** Height `40px`, border `1px solid #E2E5E8`, background `#FFFFFF`, text `#1A1D20`.
- **Placeholder:** `#949CA6`.
- **Focus:** Border color `#2B4C7E`, ring `3px solid rgba(43, 76, 126, 0.12)`.
- **Prefix / Suffix Elements:** Barcode icon or currency symbol set in `#5F666E` with background `#F8F9FA` divider.

### Chips & Badges
- **Status Badges:** Height `24px`, padding `0 8px`, border-radius `4px` or `9999px`.
  - *Success (In Stock / Paid):* Background `#DCFCE7`, text `#166534`, border `1px solid rgba(22, 101, 52, 0.2)`.
  - *Warning (Low Stock):* Background `#FEF3C7`, text `#B45309`, border `1px solid rgba(180, 83, 9, 0.2)`.
  - *Danger (Out of Stock / Void):* Background `#FEE2E2`, text `#991B1B`, border `1px solid rgba(153, 27, 27, 0.2)`.
  - *Location Tag:* White background, border `1px solid #E2E5E8`, with a `6px` green dot indicator.

### Cards & Panels
- **Structure:** Crisp white background `#FFFFFF`, bordered with `1px solid #E2E5E8`, radius `8px`.
- **Header Section:** Padding `16px 20px`, accompanied by `Newsreader` title (`1.25rem`) and optional right-aligned metadata counter.
- **Divider:** Subtle `1px solid #EAECF0` separator between card body and header/footer.

### Informational Callouts (AI & Policy Alerts)
- **Background:** Subtle tinted blue `#EBF3FE` or off-white with `#E2E5E8` border.
- **Accent:** Thin left border indicator or full hairline container with `#2B4C7E` copy.