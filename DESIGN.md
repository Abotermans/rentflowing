---
name: OneRent
description: A calm operational control system for dependable rental management.
colors:
  canvas-white: "hsl(0 0% 100%)"
  ink: "hsl(222.2 84% 4.9%)"
  trust-blue: "hsl(221 83% 53%)"
  trust-blue-on: "hsl(210 40% 98%)"
  cool-surface: "hsl(210 40% 96.1%)"
  cool-ink: "hsl(222.2 47.4% 11.2%)"
  muted-ink: "hsl(215.4 16.3% 46.9%)"
  line: "hsl(214.3 31.8% 91.4%)"
  sidebar-surface: "hsl(220 14% 96%)"
  sidebar-ink: "hsl(220 9% 26%)"
  sidebar-active: "hsl(220 13% 91%)"
  success: "hsl(142 76% 36%)"
  warning: "hsl(38 92% 50%)"
  destructive: "hsl(0 84.2% 60.2%)"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.333
    letterSpacing: "normal"
  headline:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: "normal"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.429
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.429
    letterSpacing: "normal"
  meta:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.333
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.trust-blue}"
    textColor: "{colors.trust-blue-on}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-outline:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  input-default:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
  card-default:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  status-pill:
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
---

# Design System: OneRent

## Overview

**Creative North Star: "Le poste de contrôle immobilier"**

OneRent is a sober, precise, and professional operational interface. It behaves like a dependable control surface: information is organized for scanning, comparison, and repeated action, while consequential states remain explicit. The visual system stays quiet enough for dense property-management work without becoming technical or austere.

The design relies on a restrained light palette, a single blue accent, crisp borders, compact controls, and predictable page structure. It favors clarity over decoration and reassurance over spectacle. Dense business information is softened through consistent spacing, muted secondary text, rounded but restrained forms, and semantic status colors.

**Key Characteristics:**

- Operational, calm, and information-led.
- White working surfaces framed by cool gray borders and navigation.
- Trust blue reserved for primary actions, focus, selection, and signed or scheduled states.
- Compact tables and forms balanced by clear grouping and generous section spacing.
- Semantic success, warning, and destructive colors used consistently for business state.

## Colors

The palette is a cool neutral workspace with a focused blue accent and restrained semantic colors.

### Primary

- **Bleu de confiance** (`hsl(221 83% 53%)`): primary actions, focus rings, selected navigation, links, scheduled states, and important interactive emphasis.
- **Bleu sur fond** (`hsl(210 40% 98%)`): text and icons placed on the primary blue.

### Neutral

- **Blanc de travail** (`hsl(0 0% 100%)`): page, card, input, dialog, and popover surfaces.
- **Encre profonde** (`hsl(222.2 84% 4.9%)`): primary text and high-emphasis data.
- **Surface froide** (`hsl(210 40% 96.1%)`): subtle grouping, secondary controls, hover states, and muted bands.
- **Encre secondaire** (`hsl(215.4 16.3% 46.9%)`): descriptions, metadata, placeholders, and secondary table values.
- **Trait froid** (`hsl(214.3 31.8% 91.4%)`): borders, dividers, table rows, and field outlines.
- **Panneau latéral** (`hsl(220 14% 96%)`): persistent navigation surface.
- **Sélection latérale** (`hsl(220 13% 91%)`): active and hover treatment in the sidebar.

### Semantic

- **Vert de confirmation** (`hsl(142 76% 36%)`): active, occupied, paid, matched, and completed states.
- **Ambre d'attention** (`hsl(38 92% 50%)`): pending, vacant, incomplete, under-notice, and review states.
- **Rouge d'intervention** (`hsl(0 84.2% 60.2%)`): destructive actions, overdue, urgent, terminated, and invalid states.

**The One Accent Rule.** Trust blue is the only general-purpose accent. Green, amber, and red communicate state or consequence rather than decoration.

## Typography

**Display Font:** system sans-serif (`ui-sans-serif, system-ui, sans-serif`)
**Body Font:** system sans-serif (`ui-sans-serif, system-ui, sans-serif`)
**Data Reference Font:** system monospace where identifiers require distinction

**Character:** The single system-sans family is neutral, fast, and familiar across platforms. Hierarchy comes from size and weight rather than decorative type or tight letter spacing.

### Hierarchy

- **Display** (700, 24px, 32px line-height): page titles and primary record references.
- **Headline** (600, 20px, 28px line-height): major section headings when a page needs a stronger internal break.
- **Title** (600, 18px, 24px line-height): dialogs and prominent compact sections.
- **Body** (400, 14px, 20px line-height): default application copy and table content.
- **Label** (500, 14px, 20px line-height): field labels, buttons, tabs, and table headings.
- **Meta** (500, 12px, 16px line-height): status badges, helper text, supporting values, and dense metadata.

**The Operational Scale Rule.** Type remains compact inside tools, cards, tables, and dialogs. Hero-scale typography does not belong in the authenticated application shell.

## Layout

OneRent uses a persistent 256px desktop sidebar that collapses to 48px and becomes an 288px off-canvas sheet on mobile. A sticky 56px header contains global search, portfolio switching, and the user menu. Main content uses 24px page padding, full-width operational sections, and horizontal overflow for data tables.

The spacing rhythm follows a 4px base, with 8px for tight relationships, 12–16px inside controls and groups, 24px for card and page-section padding, and 32px for larger separations. Forms use one to three columns when space permits and collapse to a vertical flow on narrow screens. Dialogs use standard, large, and wide widths while remaining within `calc(100vw - 2rem)` and `90dvh`.

Tailwind breakpoints are used as the responsive contract: 640px, 768px, 1024px, 1280px, and 1536px. Desktop navigation begins at 768px; below that point essential workflows remain available through mobile sheets, wrapping controls, and scrollable tables.

## Elevation & Depth

The system is flat by default and uses borders and tonal differences as its primary depth mechanism. Shadows are quiet and structural: cards receive only a low shadow, floating menus use a medium shadow, and dialogs or sheets receive the strongest elevation. Shadows do not decorate ordinary page sections.

### Shadow Vocabulary

- **Surface low** (`0 1px 2px 0 rgb(0 0 0 / 0.05)`): bordered cards at rest.
- **Floating control** (`0 4px 6px -1px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.10)`): selects, menus, and tooltips.
- **Modal** (`0 10px 15px -3px rgb(0 0 0 / 0.10), 0 4px 6px -4px rgb(0 0 0 / 0.10)`): dialogs, sheets, and high-priority overlays.

**The Flat Workspace Rule.** Borders establish the everyday information architecture. Elevation appears only when a surface physically overlays or temporarily commands the workspace.

## Shapes

Corners are restrained and systematic: 4px for compact menu items, 6px for controls, and 8px for cards and dialogs. Status badges, switches, avatars, and other intrinsically compact indicators use a pill or circular form. Borders are one pixel and cool gray. Decorative containers, oversized rounding, and nested card silhouettes are not part of the system.

## Components

Components are sober and reassuring: compact enough for repeated work, but never compressed at the expense of readable labels or clear states.

### Buttons

- **Shape:** 6px radius, 40px default height, 16px horizontal padding, and 8px gap between icon and label.
- **Primary:** trust blue background with near-white text; reserved for the main command in a view or dialog.
- **Hover / Focus:** subtle 10% darkening on hover; a two-pixel blue focus ring with background offset for keyboard visibility.
- **Outline / Secondary:** white or cool-gray surface with a one-pixel border; used for supporting commands.
- **Ghost / Icon:** transparent at rest with a cool-gray hover surface; icon-only actions require accessible labels and tooltips where the meaning is not obvious.
- **Destructive:** red is reserved for destructive commands and remains visually separate from routine actions.

### Chips and Status Badges

- **Style:** pill shape, 12px medium type, 10px horizontal padding, tinted background, semantic text, and a low-contrast matching border.
- **State:** green confirms positive or completed state, amber signals attention or transition, blue represents scheduled or selected state, gray is neutral or inactive, and red indicates failure, urgency, or destructive lifecycle state.

### Cards and Containers

- **Corner Style:** 8px radius.
- **Background:** white working surface.
- **Shadow Strategy:** low shadow only; border remains the main boundary.
- **Border:** one-pixel cool gray.
- **Internal Padding:** generally 24px, reduced in compact operational sections.

### Inputs and Fields

- **Style:** 40px height, white background, one-pixel cool-gray border, 6px radius, and 12px horizontal padding.
- **Focus:** two-pixel trust-blue ring with a two-pixel offset.
- **Error:** red border, low-opacity red focus ring, and a specific error message below the field.
- **Disabled:** reduced opacity with a non-interactive cursor; disabled values remain readable.

### Tables

- **Style:** full-width, 14px body text, 48px headers, 16px cell padding, and horizontal overflow when required.
- **Hierarchy:** muted medium-weight headings, strong primary identifiers, muted secondary values, and tabular or monospace treatment for references when useful.
- **State:** rows use subtle cool-gray hover and selected backgrounds; row actions are compact ghost buttons aligned at the end.

### Navigation

- **Style:** cool-gray sidebar with 16px icons and compact labels; the header and sidebar share a 56px top alignment.
- **Default / Hover / Active:** default text uses sidebar ink, hover applies a partial cool-gray accent, and active items use the full sidebar accent with medium weight.
- **Responsive:** desktop navigation collapses to icons; mobile navigation becomes an off-canvas sheet and closes after route changes.

### Form Dialogs

- **Structure:** compact header, scrollable body, and fixed footer separated by one-pixel borders.
- **Sizing:** 512px standard, 768px large, and 1080px wide, capped to the viewport.
- **Actions:** wrapped and right-aligned, with the primary action last; risky decisions use an explicit confirmation dialog.

## Do's and Don'ts

### Do:

- **Do** optimize every authenticated screen for scanning, comparison, and repeated action.
- **Do** use trust blue for primary action and interactive emphasis, while preserving semantic colors for status.
- **Do** prefer borders, spacing, and typography over decorative surfaces to organize information.
- **Do** keep forms responsive, validation adjacent to the field, and consequential effects explicit.
- **Do** preserve 40px default control height and visible keyboard focus across desktop, tablet, and mobile.

### Don't:

- **Don't** make the application look like a marketing page with oversized headings, ornamental gradients, or promotional composition.
- **Don't** push density until the interface feels technical or austere; secondary text, spacing, and clear grouping must keep it approachable.
- **Don't** introduce new accent hues when an existing semantic or trust-blue role already expresses the meaning.
- **Don't** nest decorative cards or use shadows as a substitute for information hierarchy.
- **Don't** rely on color alone for status, validation, or selection; pair it with text, icons, borders, or labels.
