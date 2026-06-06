## What's duplicated today

In `src/pages/LeaseDetail.tsx` (Summary card):

- **Units table** (lines 671–723) already shows per-row `Start` and `End` for each assignment.
- **Summary grid below** (lines 729–730) re-displays a single lease-level `Start date` (`lease.startDate`) and `End date` (`effEndDate`).

What each value actually means today:
- Table `Start` = `assignment.startDate` — when *that specific unit* joined the lease (parking added by an avenant has a later start than the primary apartment).
- Table `End` = `assignment.endDate` when the assignment was closed early, otherwise it falls back to `effEndDate` (the lease's current effective end).
- Grid `Start date` = `lease.startDate` — equals the earliest (primary) assignment start.
- Grid `End date` = `effEndDate` — the same value the table already shows for every still-open row.

So the grid fields are 100% redundant with the table. They also hide the real story: when a parking spot was added mid-lease, the lease-level "Start" hides that the parking's start is different.

## Decision

The user is right on both points:

1. The **end date is contract-level** — when the lease ends (via avenant or natural term), every still-open assignment ends with it. We should not repeat it as a per-row cell that just echoes the lease end for every row.
2. The **start date is per-unit** — each assignment already carries its own start, and the table is the right place to surface that variability.

## Changes

In `src/pages/LeaseDetail.tsx`:

1. **Remove the redundant grid fields** at lines 729–730 (`leases.startDate` and `leases.endDate`). Those facts now live in the table (start per row) and in a single contract-level line (end, see below).

2. **Drop the `End` column from the per-unit table**. Replace the per-row end with a single contract-level line shown just above or below the table, e.g.:

   > `Lease ends on {effEndDate}{amSuffix(endAmNum)} — applies to all units`

   This keeps the avenant suffix (`amSuffix`) visible exactly once, where it belongs.

3. **Handle the rare "unit removed early" case explicitly**. If an assignment has its own `endDate` that is earlier than `effEndDate`, render that row with a small inline note in the `Start` cell (or a dedicated badge) such as `→ ended {date}`. This preserves the information without bringing back a column that would be empty 99% of the time.

   In practice this row will already be filtered out of the active table (it uses `!a.endDate`), so historically-removed units stay in the existing Amendments section history — no extra column needed in the active table.

4. **Keep the `Start` column** in the table (already correct). The earliest row's start equals `lease.startDate`; later rows reflect avenant-added units. No code change needed here beyond removing the End column.

5. **Keep deposit / notice / due day / signed date / notice-given fields** in the grid — those are genuine contract-level facts not represented elsewhere.

## Resulting Summary layout

```text
Tenant: Jane Doe (primary), John Doe (co-tenant)

Units (2)
┌──────────────────────┬──────────┬────────────┬──────────┬──────────┬──────────┐
│ Unit                 │ Role     │ Start      │ Rent     │ Charges  │ Total    │
├──────────────────────┼──────────┼────────────┼──────────┼──────────┼──────────┤
│ A101 — Apt 3rd floor │ Primary  │ 01/09/2024 │ 1 200 €  │ 80 €     │ 1 280 €  │
│ P12  — Parking       │ Parking  │ 01/03/2026 │ 80 €     │ 0 €      │ 80 €     │
├──────────────────────┴──────────┴────────────┼──────────┼──────────┼──────────┤
│ Σ                                            │ 1 280 €  │ 80 €     │ 1 360 €  │
└──────────────────────────────────────────────┴──────────┴──────────┴──────────┘

Lease ends on 31/08/2027 (av. 2) — applies to all units

Due day · 5    Deposit · 2 400 €    Notice · 3 months
Signed · 15/08/2024    Notice given · No
```

## Files touched
- `src/pages/LeaseDetail.tsx` (only)

No type, context, or translation changes required — `leases.endDate` key is already used and will be reused for the single contract-level line.
