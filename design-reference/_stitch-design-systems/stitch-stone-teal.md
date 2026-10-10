---
name: Stone & Teal Minimal Administration
colors:
  surface: '#fff8f5'
  surface-dim: '#e0d8d5'
  surface-bright: '#fff8f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#faf2ee'
  surface-container: '#f4ece8'
  surface-container-high: '#eee7e3'
  surface-container-highest: '#e9e1dd'
  on-surface: '#1e1b19'
  on-surface-variant: '#3e4947'
  inverse-surface: '#33302d'
  inverse-on-surface: '#f7efeb'
  outline: '#6e7977'
  outline-variant: '#bdc9c6'
  surface-tint: '#006a63'
  primary: '#005c55'
  on-primary: '#ffffff'
  primary-container: '#0f766e'
  on-primary-container: '#a3faef'
  inverse-primary: '#80d5cb'
  secondary: '#645d58'
  on-secondary: '#ffffff'
  secondary-container: '#eae1da'
  on-secondary-container: '#6a635e'
  tertiary: '#7f4025'
  on-tertiary: '#ffffff'
  tertiary-container: '#9c573a'
  on-tertiary-container: '#ffe5db'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9cf2e8'
  primary-fixed-dim: '#80d5cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#00504a'
  secondary-fixed: '#eae1da'
  secondary-fixed-dim: '#cec5bf'
  on-secondary-fixed: '#1f1b17'
  on-secondary-fixed-variant: '#4b4641'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb598'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#72361b'
  background: '#fff8f5'
  on-background: '#1e1b19'
  surface-variant: '#e9e1dd'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  table-header:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.5rem
  gutter-desktop: 1.5rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system embodies a disciplined, highly functional administrative dashboard aesthetic engineered for retail operations and management. It prioritizes information density, systematic clarity, and minimal cognitive overhead. 

The aesthetic is clean, structural, and restrained—built on a warm-neutral stone base with surgical applications of deep teal. Visual noise is actively eliminated: there are no decorative gradients, no colored card backgrounds, and no heavy drop shadows. The design projects stability, operational precision, and timeless utility.

## Colors

The palette is strictly bounded to preserve optical hierarchy and calm focus across dense data screens:

- **Canvas & Surfaces:**
  - Page Background: `#FAFAF9` (Stone 50)
  - Cards, Modals, & Panels: `#FFFFFF` (Pure White)
  - Secondary Wells & Table Headers: `#F5F5F4` (Stone 100)
  - Hover States (Rows, Nav): `#FAFAF9` (Stone 50)

- **Borders & Dividers:**
  - Universal Line Tone: `#E7E5E4` (Stone 200). Applied as a crisp 1px rule for structural separation.

- **Typography:**
  - Primary Content / Titles: `#1C1917` (Stone 900)
  - Secondary Content / Labels / Icons: `#78716C` (Stone 500)
  - Placeholder & Disabled Tone: `#A8A29E` (Stone 400)

- **Brand Accent (Teal):**
  - Base Primary: `#0F766E` (Teal 700)
  - Interactive Hover: `#115E59` (Teal 800)
  - Soft Tint / Surface Selection: `#F0FDFA` (Teal 50)
  - *Usage Rule:* Restricted strictly to primary buttons, interactive links, keyboard focus rings, and active navigation indicators.

- **Functional Status Badges (Semantic Only):**
  - Success: `#16A34A` text on `#F0FDF4` background
  - Warning: `#D97706` text on `#FFFBEB` background
  - Danger: `#DC2626` text on `#FEF2F2` background

## Typography

Inter serves as the unified typographical driver across all roles, providing objective, unembellished readability at small sizes and high tabular scanning clarity.

- **Hierarchy:** Structure is established primarily through font weight (400, 500, 600) and optical scale, rather than color shifts.
- **Labels & Microcopy:** Data headers, column names, and metadata utilize tight vertical metrics. Table column headers explicitly leverage `table-header` styling (11px, bold/semibold, uppercase, letter-spacing +0.05em) rendered in secondary text tone (`#78716C`).
- **Numbers & Metrics:** Tabular figures (`tnum`) should be enabled for all tabular rows, price listings, inventory balances, and quantitative analytics to preserve vertical alignment.

## Layout & Spacing

The layout philosophy follows a rigid, modular box grid designed for administrative dashboards:

- **Structure:** A responsive fixed-width or fluid-container layout with a persistent collapsible vertical navigation rail/sidebar (fixed 240px desktop, collapsed to 64px icon-only or hidden drawer on smaller viewports).
- **Rhythm & Grid:** Built on an 8pt architectural rhythm, with a 4pt micro-scale for compact form elements and status indicators.
- **Form Factor Adaptations:**
  - **Desktop (1024px+):** Sidebar permanently pinned on left; central canvas operates on a 12-column grid with `1.5rem` gutters and `2rem` outer padding.
  - **Tablet (768px - 1023px):** Sidebar collapses to an icon bar or overlay menu; canvas margin reduces to `1.5rem`, using a 6- or 8-column layout.
  - **Mobile (<768px):** Single-column stack with top navigation app bar; margin contracts to `1rem`; tables gain horizontal scroll containment.

## Elevation & Depth

Visual hierarchy is communicated via clean structural boundaries and surface contrast rather than spatial elevations or blur effects:

- **Flat Boundary Philosophy:** Surfaces stay ground-level. Cards, panels, sidebars, and dropdowns sit in plane, defined strictly by 1px solid `#E7E5E4` outlines.
- **Zero Colored Shadows:** Drop shadows are strictly suppressed across content components. Where overlays (modals, dropdown popovers, slide-overs) require visual separation from the canvas, use a restrained neutral shadow: `0 4px 6px -1px rgba(28, 25, 23, 0.05), 0 2px 4px -2px rgba(28, 25, 23, 0.05)`.
- **Canvas Stacking:** 
  - Base canvas: `#FAFAF9`
  - Elevated surfaces: `#FFFFFF` bounded by `#E7E5E4`
  - Inset containers / table heads: `#F5F5F4`

## Shapes

The design uses `roundedness: 1` (`0.25rem` / `4px`) as its structural standard to reinforce an organized, crisp administrative character:

- **Controls & Micro-elements:** Buttons, form inputs, badge tags, and dropdown items utilize standard radius (`0.25rem` / `4px`).
- **Cards & Data Tables:** Container surfaces use `rounded-lg` (`0.5rem` / `8px`) with `border: 1px solid #E7E5E4` and `overflow: hidden` to clip internal rows cleanly.
- **Pills/Circles:** Badges and checkboxes retain slight corner softness (`rounded-sm` or `rounded`), reserving full circles only for user avatars and circular radio selectors.

## Components

### Buttons
- **Primary:** Background `#0F766E`, text `#FFFFFF`, border none. Hover state `#115E59`. Focus state applies a 2px offset ring in `#0F766E`.
- **Secondary / Outline:** Background `#FFFFFF`, text `#1C1917`, border 1px solid `#E7E5E4`. Hover state background `#FAFAF9`.
- **Ghost:** Background transparent, text `#78716C`. Hover state background `#FAFAF9`, text `#1C1917`.

### Sidebar Navigation
- **Container:** Background `#FAFAF9` or `#FFFFFF` with a 1px solid right border `#E7E5E4`.
- **Nav Items:** Height 36px, horizontal padding `0.75rem`, rounded `4px`. Neutral items use `#78716C` text and icons, shifting to `#1C1917` on `#FAFAF9` hover.
- **Active Nav Item:** Background `#F0FDFA` (soft teal tint), text `#0F766E`, icon `#0F766E`, font weight 500.

### Tables & Data Grids
- **Header:** Background `#F5F5F4`, border-bottom 1px solid `#E7E5E4`. Column labels are small (`11px`), uppercase, bold, in secondary text `#78716C`.
- **Rows:** Alternating rows remain `#FFFFFF`. Bottom border 1px solid `#E7E5E4`. Row hover state transitions seamlessly to `#FAFAF9`.
- **Cells:** Vertical padding `0.75rem`, horizontal padding `1rem`, body text `#1C1917`.

### Status Badges
Rendered as compact inline chips (`height: 22px`, `padding: 2px 8px`, `border-radius: 4px`, `font-size: 12px`, `font-weight: 500`):
- **Success:** `#16A34A` text on `#F0FDF4` background.
- **Warning:** `#D97706` text on `#FFFBEB` background.
- **Danger:** `#DC2626` text on `#FEF2F2` background.
- No decorative borders or outer glows.

### Form Inputs & Checkboxes
- **Text Inputs:** Background `#FFFFFF`, border 1px solid `#E7E5E4`, text `#1C1917`, placeholder `#A8A29E`. Focus state changes border to `#0F766E` with an outer ring `0 0 0 1px #0F766E`.
- **Checkboxes & Radios:** Unchecked border `#E7E5E4` on `#FFFFFF`. Checked background `#0F766E`, border `#0F766E`, glyph `#FFFFFF`.

### Cards & Surfaces
- Background `#FFFFFF`, border 1px solid `#E7E5E4`, corner radius `8px`. Card headers feature an optional divider in `#E7E5E4` separating content from actions. No gradient fills or colored drop shadows.