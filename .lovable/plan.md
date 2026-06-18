## Goal

Make the all-inclusive pricing mode hide charges in the lease creation/edit UI (since they don't exist contractually), and fix the post-creation "Lease not found" bug.

---

## 1. Adapt the unit table when pricing mode is "all-inclusive"

In `src/components/leases/LeaseAddDialog.tsx` and `src/components/leases/LeaseEditDialog.tsx`:

- Compute `const allInclusive = form.pricingMode === "all-inclusive"`.
- In the units table:
  - Hide the **"Monthly Charges"** column header and the per-row charges input when `allInclusive`. (`colSpan` on the grand-total row adjusted accordingly.)
  - Hide the **"Charges total"** footer cell; only rent total + grand total remain.
- In row handlers:
  - `updateUnitRow` / `addUnitRow`: when `allInclusive`, force `chargesShare = 0` (also when a unit is picked — never seed from `u.baseCharges`).
  - When user switches pricing mode → all-inclusive, run a one-time sweep that zeros every existing row's `chargesShare`.
- On save (`handleSave`):
  - `monthlyCharges` is already forced to 0 for all-inclusive — keep.
  - Also pass `chargesShare: 0` for every row in the `setLeaseUnits` payload when `allInclusive` (so assignments don't carry phantom charges).
- The "Monthly Rent" column header label stays `leases.monthlyRent`; consider showing the "All-inclusive" badge inline next to the rent column header when active (small visual cue, optional).

The visible `pricingMode` Select stays where it already is (just under the units table), per the previous change.

## 2. Fix the "Lease not found" bug after creation

Symptom (from session replay): user creates a lease, gets navigated/refreshed to `/leases/{newId}`, and `LeaseDetail` renders "Lease not found." because `leases.find(l => l.id === id)` returns nothing.

Likely cause: the freshly-created lease never lands in the scoped list because the in-memory `properties` lookup uses `form.propertyId`, but the persisted property may belong to a different portfolio than `currentPortfolioId` (the `scoped` memo filters leases through `propIds = properties.filter(p => p.portfolioId === currentPortfolioId)`). Secondary candidate: a render-time crash in the new receivables-status column for all-inclusive leases (no `charges` receivable) silently hides the row.

Investigation + fix:

- Add a pre-save guard in `LeaseAddDialog.handleSave` that verifies the selected `propertyId` belongs to the active portfolio; if not, toast and abort.
- Defensive fix in `AppContext.addLease`: stamp the created lease with `portfolioId: currentPortfolioId` if the property scope lookup fails, so the scoping memo can't drop it.
- Audit the receivables-status cell on `src/pages/Leases.tsx` to ensure it handles leases with zero `charges` receivables (all-inclusive) without throwing — fall back to "rent only" status.

## Files to touch

- `src/components/leases/LeaseAddDialog.tsx`
- `src/components/leases/LeaseEditDialog.tsx`
- `src/context/AppContext.tsx` (addLease defensive scoping)
- `src/pages/Leases.tsx` (receivables-status cell hardening)

## Out of scope

- Receivables generation logic (already correct for all-inclusive).
- Profitability / cost allocation (already adapted).
- Any data migration of existing leases.
