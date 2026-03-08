

## Review: Implementation vs. Requested Scope

After scanning all pages and types, here are the mismatches found — grouped by severity.

---

### 1. Property locale/currency not used consistently

**Issue**: Multiple pages format currency/dates without passing the property's locale/currency, defaulting to `EUR`/`fr-FR` instead of using the record's own settings (e.g., GBP for London properties).

| Location | Problem |
|----------|---------|
| `Payments.tsx` KPI cards (lines 137-138) | `formatCurrency(k.value)` — no currency/locale passed. Mixes currencies across properties. |
| `Payments.tsx` subtitle (line 124) | Duplicates title text instead of showing a subtitle |
| `TenantDetail.tsx` lease history table (line 228) | `formatDate(l.startDate)` — no locale |
| `TenantDetail.tsx` timestamps (lines 248-249) | `formatDate(tenant.createdAt)` — no locale |
| `VendorDetail.tsx` ticket dates (line 132) | `formatDate(t.createdDate)` — no property locale |
| `MaintenanceDetail.tsx` all dates (lines 57, 142-153, 189-190) | `formatDate(...)` — no property locale |
| `Reports.tsx` OccupancyReport (line 192) | `formatDate(d.u.availableFrom)` — no locale |
| `Dashboard.tsx` KPI section titles (lines 66, 75, 83, 92) | Hardcoded English ("Portfolio", "Leases", etc.) — not translated |
| `Dashboard.tsx` many card titles/labels | Hardcoded English ("Units by Status", "Upcoming Operations", etc.) |
| `PropertyDetail.tsx` all labels | Hardcoded English (KPI labels, card titles, form labels, etc.) |
| `UnitDetail.tsx` all labels | Hardcoded English |
| `LeaseDetail.tsx` all labels | Hardcoded English |
| `TenantDetail.tsx` all labels | Hardcoded English |
| `MaintenanceDetail.tsx` all labels | Hardcoded English |
| `VendorDetail.tsx` all labels | Hardcoded English |

### 2. Detail pages not translated

All detail pages (PropertyDetail, UnitDetail, LeaseDetail, TenantDetail, MaintenanceDetail, VendorDetail) have **zero i18n** — every string is hardcoded English. The list pages were translated but the detail pages were skipped.

**Fix**: Add translation keys for all detail page labels and use `t()`.

### 3. StatusBadge shows raw English status strings

`StatusBadge` renders `status` as-is (e.g., "under-notice", "partially-paid", "not-scheduled"). These are not translated and display raw kebab-case to users.

**Fix**: Add a status label map that respects locale, pass it through the badge.

### 4. Payments KPI cards mix currencies

The Payments KPIs sum amounts across all properties (EUR + GBP) and format without specifying a currency. This is misleading for multi-currency portfolios.

**Fix**: Show the dominant currency, or label as "mixed" when multiple currencies exist.

### 5. Surface label hardcoded in PropertyDetail form

`PropertyDetail.tsx` line 290: `<Label>Surface (m²)</Label>` — hardcoded metric regardless of the property's `measurementSystem`. Should dynamically show "m²" or "sq ft".

### 6. Dashboard section labels and card titles not translated

Lines 66, 75, 83, 92 use hardcoded English for KPI section titles. Lines 149, 179, 222, 257, 296, 332, 372, 413, 445, 479, 498, 519 use hardcoded English for card titles.

### 7. Payments subtitle is wrong

`Payments.tsx` line 124: `<p className="text-sm text-muted-foreground">{t("payments.title")}</p>` duplicates the title. Should be a proper subtitle like "Manage rent collection and track payment history".

---

### Plan

Given the volume of hardcoded strings (~200+ across detail pages, dashboard, StatusBadge), the changes group into:

**A. Add ~150 translation keys** to `translations.ts` covering:
- All detail page labels (PropertyDetail, UnitDetail, LeaseDetail, TenantDetail, MaintenanceDetail, VendorDetail)
- Dashboard section/card titles
- StatusBadge status labels
- Payments subtitle fix

**B. Update StatusBadge** to accept an optional label or use a translated label map, so statuses display in the active locale.

**C. Fix locale/currency pass-through** in:
- `Payments.tsx` KPIs (note: multi-currency requires labeling, not just passing one)
- `TenantDetail.tsx` dates
- `VendorDetail.tsx` dates
- `MaintenanceDetail.tsx` dates
- `Reports.tsx` OccupancyReport dates

**D. Fix PropertyDetail surface label** to use property's measurement system.

**E. Translate all 6 detail pages** using `useSettings()` + `t()`.

**F. Translate Dashboard** hardcoded strings.

### Files to modify

| File | Changes |
|------|---------|
| `src/i18n/translations.ts` | Add ~150 keys for detail pages, dashboard, status labels |
| `src/components/shared/StatusBadge.tsx` | Accept locale-aware label rendering |
| `src/pages/Dashboard.tsx` | Translate all hardcoded strings |
| `src/pages/PropertyDetail.tsx` | Translate labels, fix surface unit label |
| `src/pages/UnitDetail.tsx` | Translate labels, pass property locale to all dates |
| `src/pages/LeaseDetail.tsx` | Translate labels |
| `src/pages/TenantDetail.tsx` | Translate labels, fix date locale pass-through |
| `src/pages/MaintenanceDetail.tsx` | Translate labels, pass property locale to dates |
| `src/pages/VendorDetail.tsx` | Translate labels, pass property locale to dates |
| `src/pages/Payments.tsx` | Fix subtitle, fix KPI currency display |
| `src/pages/Reports.tsx` | Fix date locale in OccupancyReport |
| `src/context/SettingsContext.tsx` | No changes needed |

