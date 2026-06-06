# Consolidate lease units into a single table in Lease Summary

## 1. Replace the unit list block in Lease Summary with a table
In `src/pages/LeaseDetail.tsx` (the Summary card, around lines 658–686), replace the current vertical list of unit chips with a compact table showing one row per active assignment:

Columns:
- Unit (code + label, link to unit detail)
- Role (primary / ancillary type badge)
- Start date (`assignment.startDate`)
- End date (`assignment.endDate ?? "—"` since open assignments inherit the lease's effective end)
- Rent share (EUR)
- Charges share (EUR)

Footer row: Σ totals for rent and charges, matching the visual treatment already used in the "Assigned Units" card (border-t, bg-muted/30, font-semibold).

Per-unit start/end dates make sense: amendments can add a parking spot mid-lease, or remove a unit early, and each assignment row already carries its own `startDate` / `endDate`. The table will surface that variability instead of the single lease-level "Start / End" fields.

## 2. Remove the duplicate "Assigned Units" card
Delete the entire block at lines 711–780 (`{(() => { const assignments = ...; return (<Card>…</Card>); })()}`). The new in-summary table replaces it.

## 3. Remove the rent/charges scalar fields from the Summary grid
Delete the two grid cells at lines 694–695 (`leases.monthlyRent` and `leases.monthlyCharges`). The totals appear in the new table footer. Keep `detail.totalMonthly` (rent + charges combined) as a single bold number — useful at-a-glance, not duplicated by the table.

## 4. Per-unit deposit / notice / signed date — push back
The user asked whether deposit, notice period, and signed date should also become per-unit. They should not:

- **Deposit / guarantee** is a single legal obligation against the contract (one bank guarantee, one cash deposit). Splitting it per unit would not match how it is held, returned, or accounted for, and the amendment model already represents deposit changes as a single `depositAmount` field, not per unit.
- **Notice period** is governed by the lease contract (and French law tied to the lease type), not by individual lots. The notice given for a primary apartment automatically frees its parking.
- **Signed date** is the date the lease (or its amendment) was signed — it is a document-level fact, not a per-unit one. Per-unit dating already exists via `assignment.startDate` / `endDate` and via the linked amendment's `effectiveDate` / `signedDate`.

So these three stay as lease-level fields in the Summary grid. If the user wants per-amendment visibility (e.g. "deposit was raised to X on date Y"), that information is already shown in the Amendments section just below.

## Files touched
- `src/pages/LeaseDetail.tsx`

No type, context, or translation changes are required; all required keys (`leases.col.unit/role/start/rentShare/chargesShare`) already exist and are used by the deleted "Assigned Units" card. One new key may be needed: `leases.col.end` — will reuse `leases.endDate` if no dedicated key exists.
