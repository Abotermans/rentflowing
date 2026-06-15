## Goal

On the Tenant Detail page, replace the current "Open Receivables" + "Financial Overview" cards with a single **Receivables** section that mirrors the Lease Detail design (KPI strip, inner-scroll sortable table, sticky totals footer), plus two extra columns — Lease reference and Unit code — since a tenant can span multiple leases/units.

## Changes

### 1. `src/pages/TenantDetail.tsx`

- **Remove** the standalone "Financial Overview" card (currently a 2–4 column KPI grid with Outstanding / Overdue / Unapplied Credit).
- **Remove** the existing "Open Receivables" card (6 columns, no sort, no totals, hidden when empty).
- **Add** a new single collapsible "Receivables" card modeled exactly on `LeaseDetail.tsx:1635–1725`:
  - Title: `t("leaseDetail.receivables")` (reuse existing key).
  - **KPI strip** (`grid grid-cols-2 md:grid-cols-4 gap-4 border-b pb-4 mb-4`):
    1. Rent collected — `text-success`
    2. Charges collected — `text-success`
    3. Outstanding — `text-foreground` (from `getTenantOutstanding(tenant.id)`)
    4. Overdue — `text-destructive` when > 0 (with `AlertTriangle`)
    5. Conditional: Unapplied credit — `text-primary` (from `getTenantUnappliedCredit`)
  - Rent/charges collected derived from `getReceivableItemsByTenant(tenant.id)` by summing `allocatedAmount` where `itemType === "rent"` and `itemType === "charges"` respectively (same approach the Lease page uses, scoped to tenant).
  - **Table wrapper** with inner vertical scroll: `max-h-[480px] overflow-y-auto rounded-md border`.
  - **Sortable sticky header** using `SortableTableHead` + `useTableSort`/`useSortedRows`. Columns:
    1. Period (`periodMonth`, supports `cycleEndDate` range rendering like LeaseDetail)
    2. Type (`itemType`)
    3. Due date
    4. **Lease** — linked `lease.leaseReference` (new vs LeaseDetail)
    5. **Unit** — `units.find(u => u.id === ri.unitId)?.unitCode` (new vs LeaseDetail)
    6. Expected (right)
    7. Allocated (right)
    8. Outstanding (right, `"—"` when 0)
    9. Status (`StatusBadge`, with overdue override when outstanding > 0 and dueDate < today)
  - Default sort: `dueDate` desc.
  - **Sticky totals footer** (`TableFooter sticky bottom-0`): label "Total" spanning the first 5 cells (Period → Unit), then Expected / Allocated / Outstanding totals, then empty status cell.
  - **All receivables listed** (no `outstandingAmount > 0` filter), still sorted by the current sort state. Empty state row when none exist.

- Data source: keep using `getReceivableItemsByTenant(tenant.id)` from `useAppData()`; pull `leases` and `units` from the same hook to resolve references.

### 2. i18n (`src/i18n/translations.ts`)

Reuse existing keys where possible (`leaseDetail.receivables`, `leaseDetail.rentCollected`, `leaseDetail.chargesCollected`, `leaseDetail.unappliedCredit`, `leaseDetail.period`, `leaseDetail.total`, `payments.table.*`, `table.outstanding`, `table.overdue`, `tenantDetail.lease`). Add only if missing:
- `tenantDetail.unit` → "Unit" / "Lot" (only if not already present in `units.*`/`payments.unit`; otherwise reuse `payments.unit`).

### 3. Out of scope

- No extraction of a shared `ReceivablesSection` component (kept inline to match the existing LeaseDetail pattern).
- No changes to `LeaseDetail.tsx`, `AppContext`, or receivables data model.
- No changes to other tenant detail sections (Notes, Contact, Active Leases, etc.).

## Technical notes

- Imports to add in `TenantDetail.tsx`: `SortableTableHead`, `useTableSort`, `useSortedRows`, `TableFooter`, `formatPeriodMonth`, plus `leases`/`units` from `useAppData()`. Remove now-unused imports tied to the old Financial Overview block (e.g. `Banknote` if no longer referenced).
- Overdue derivation: `effectiveStatus = outstandingAmount > 0 && dueDate < today ? "overdue" : status` — same rule as LeaseDetail.
- Sort key type: `"period" | "type" | "dueDate" | "lease" | "unit" | "expected" | "allocated" | "outstanding" | "status"`.
- Totals computed from the full receivables list (not the sorted/filtered view).
