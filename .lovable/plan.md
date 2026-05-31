
# Lease Amendments ("Avenants") — Implementation Plan

Adds professional amendment management on top of the existing multi-unit lease + LeaseUnitAssignment model. The Lease record stays the stable master; every contractual change becomes a structured `LeaseAmendment` with delta lines, applied prospectively from `effectiveDate`.

## 1. Data Model (`src/types/amendments.ts`)

**`LeaseAmendment`**
- `id`, `leaseId`, `amendmentNumber` (auto-incremented per lease)
- `amendmentType`: `rent-change | charges-change | term-extension | term-shortening | unit-addition | unit-removal | unit-change | tenant-addition | tenant-removal | guarantee-change | deposit-change | notice-change | clause-change | mixed`
- `title`, `reason`, `notes`
- `effectiveDate` (drives system behaviour), `signedDate` (documentary only)
- `status`: `draft | pending-signature | active | cancelled | superseded`
- `supersedesAmendmentId?` (when replacing a prior amendment)
- `createdAt`, `updatedAt`

**`LeaseAmendmentChange`** (delta line, structured not free text)
- `id`, `amendmentId`
- `fieldName`: typed union — `baseMonthlyRentTotal | baseMonthlyChargesTotal | leaseEndDate | depositAmount | noticePeriodText | primaryTenantId | coTenantIds | guaranteeSummary | unitAssignments | unitRentShare | unitChargesShare | unitAssignmentType | primaryUnitId | clauseSummary`
- `changeType`: `set | add | remove | replace`
- `oldValue`, `newValue` (JSON-serialisable scalars or arrays)
- `metadata?` (e.g. `{ unitId, assignmentType, startDate }` for unit-related changes)
- `createdAt`, `updatedAt`

Stored on `AppState` as `amendments: LeaseAmendment[]` and `amendmentChanges: LeaseAmendmentChange[]`. Seeded in `src/data/mockData.ts` with the 8 sample cases from the brief.

## 2. Effective Terms Engine (`src/lib/amendments.ts`)

Pure functions, no state mutation:

- `getLeaseAmendments(leaseId, amendments)` → sorted by `effectiveDate` then `amendmentNumber`
- `getActiveAmendmentsOn(leaseId, date, amendments)` → only `status='active'` and `effectiveDate ≤ date`
- `getEffectiveLeaseTerms(leaseId, date, state)` → `EffectiveLeaseTerms` shape (rent, charges, endDate, depositAmount, noticePeriodText, primaryTenantId, coTenantIds, units: derived view from assignments active on `date`)
- `getCurrentLeaseTerms(leaseId, state)` = `getEffectiveLeaseTerms(leaseId, today)`
- `getOriginalLeaseTerms(leaseId, state)` → baseline from Lease record + initial primary-included assignments (assignment rows created at or before lease `startDate`)
- `getLeaseAmendmentImpact(amendmentId, state)` → `{ before, after, affectedUnits, financialDelta, warnings }`
- `canActivateAmendment(amendmentId, state)` → ValidationResult

Folding rule: start from original terms, apply each active amendment in `(effectiveDate, amendmentNumber)` order; each change line replaces a field or mutates the unit-assignment projection.

The engine never mutates `LeaseUnitAssignment` rows directly. Unit changes are projected on top of the assignment table; when an amendment is **activated**, real assignment rows are created/closed prospectively (see §4).

## 3. Validation (`src/lib/integrity/amendmentIntegrity.ts`)

`validateAmendment(amendment, changes, state)` — blockers:
- lease must exist; lease not in `draft` (amendments only meaningful on signed leases)
- `active` requires `effectiveDate`
- resulting state must keep exactly one primary unit and ≥1 unit while lease is active
- added units belong to the same property
- added unit must not overlap another active lease at `effectiveDate`
- rent/charges resulting totals ≥ 0
- assignment date coherence (`startDate ≤ endDate`)
- cannot remove primary without designating a new one in the same amendment

Warnings:
- `effectiveDate` in the past
- overlaps unpaid receivables (any open ReceivableItem with `periodMonth ≥ effectiveDate`)
- conflicts with another pending/active amendment touching same field
- guarantee/deposit change while related receivables unpaid
- tenant removal while balance > 0
- primary unit change (reporting/occupancy heads-up)

Wired into the existing integrity layer via `src/lib/integrity/index.ts` and surfaced through `IntegritySummaryPanel`.

## 4. State / Activation (`src/context/AppContext.tsx`)

New API:
- `addAmendment(draft)`, `updateAmendment(a, changes)`, `deleteAmendment(id)` (draft only)
- `setAmendmentStatus(id, status)` with controlled transitions
- `activateAmendment(id)` — runs `canActivateAmendment`, on success:
  - sets `status='active'`
  - applies unit-assignment side effects prospectively: new rows with `startDate = effectiveDate`, existing rows closed via `endDate = effectiveDate - 1 day` (reuses existing `closeOpenAssignmentsForLease` pattern, scoped per unit)
  - **never** edits the Lease record directly. `Lease.monthlyRent/monthlyCharges/endDate/...` remain the original baseline. UI reads current values through `getCurrentLeaseTerms`.
- `cancelAmendment(id)`, `supersedeAmendment(id, replacementId)`

Receivable generation hook (when/if generating future receivables) reads `getEffectiveLeaseTerms(leaseId, periodMonth)` instead of raw Lease fields. Past paid receivables untouched.

## 5. UI

**Lease Detail (`src/pages/LeaseDetail.tsx`)** — 4 sections (tabs or stacked cards):
1. **Current effective terms** — rent, charges, term, tenants, units, guarantee/deposit (from `getCurrentLeaseTerms`)
2. **Original contract terms** — baseline from `getOriginalLeaseTerms`
3. **Amendments timeline** — chronological list with number, type icon, title, effective/signed dates, status badge, one-line change summary
4. **Amendment impact preview** — selected amendment: before/after diff table, affected units chips, financial delta, warnings

**Amendment dialog (`src/components/amendments/AmendmentDialog.tsx`)** — high-density centered Dialog (per project memory), guided steps inside a single form:
- Step 1: type selector (radio cards)
- Step 2: metadata (title, reason, effectiveDate, signedDate, notes)
- Step 3: type-conditional fields:
  - rent/charges-change: pricing inputs (per-unit table reused from Leases form for unit splits)
  - term-extension/shortening: new endDate
  - unit-addition: unit picker scoped to property + role + rentShare + chargesShare + startDate
  - unit-removal: pick from current active units, confirms it isn't the only primary
  - unit-change: combined remove+add with primary reassignment
  - tenant-addition/removal: tenant picker
  - guarantee/deposit/notice/clause: scalar inputs
  - mixed: collapsible sections for each affected field group
- Step 4: live impact preview (before/after) + warnings panel
- Step 5: actions — Save draft / Mark pending signature / Activate (disabled when blockers)

**Lease list (`src/pages/Leases.tsx`)** — small "+N amendments" chip next to lease reference, current effective rent shown instead of stored rent.

## 6. i18n

Add EN/FR keys in `src/i18n/translations.ts` for: section titles, amendment types, statuses, field labels, change summary verbs ("rent increased from … to …", "parking P012 added on DD/MM/YYYY"), warnings, and action buttons.

## 7. Tests (`src/lib/amendments.test.ts`)

- effective terms folding: original → rent-change → term-extension
- unit-addition projects new assignment on activation; original stays open until effectiveDate
- unit-removal closes assignment prospectively, never historically
- primary unit change keeps exactly one primary at every point in time
- past paid receivables stay; warning surfaced when effectiveDate hits unpaid period
- supersede chain: superseded amendment ignored in effective terms
- validation blockers: zero units, two primaries, cross-property, overlap

## 8. Explicitly Out of Scope

PDF/document generation, e-signature, AI drafting, full retroactive receivable rewrite, deep legal clause editor.

## Technical Notes

- All money fields stay EUR, dates DD/MM/YYYY in UI (European-first memory).
- Reuse existing patterns: centered Dialog, `validateLeaseUnits`-style ValidationResult, `OverrideConfirmDialog` for any controlled-override actions.
- No DB layer (project is client-side over mock data + AppContext) — purely typed in-memory model.
- Lease record fields (`monthlyRent`, `monthlyCharges`, `endDate`, `depositOrGuaranteeAmount`, `primaryTenantId`, `coTenantIds`, `noticePeriodText`) become **baseline-only**; a follow-up pass replaces direct reads with `getCurrentLeaseTerms` in: Reports rent roll, Receivables generation, Dashboard KPIs, UnitDetail. Listed here so the change is visible, executed file-by-file during build.

## Files Touched

- new: `src/types/amendments.ts`, `src/lib/amendments.ts`, `src/lib/amendments.test.ts`, `src/lib/integrity/amendmentIntegrity.ts`, `src/components/amendments/AmendmentDialog.tsx`, `src/components/amendments/AmendmentTimeline.tsx`, `src/components/amendments/AmendmentImpactPreview.tsx`
- edited: `src/types/index.ts` (re-export), `src/context/AppContext.tsx`, `src/lib/integrity/index.ts`, `src/hooks/use-integrity-state.ts`, `src/pages/LeaseDetail.tsx`, `src/pages/Leases.tsx`, `src/data/mockData.ts`, `src/i18n/translations.ts`
