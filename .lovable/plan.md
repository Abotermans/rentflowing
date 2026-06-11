
## Problem

On a lease's **Charges reconciliation** section, the cost overview table only shows costs that have a row in `costAllocationResults`. That table is populated **only** when a cost entry is **property-level with an allocation rule** (see `addCostEntry` / `updateCostEntry` in `src/context/AppContext.tsx`, lines 1180 & 1199 — both guarded by `!newEntry.unitId && newEntry.allocationRuleId`).

As a result:
- A cost entry created **directly on a unit** (`unitId` set) never produces an allocation result → it never appears in the lease overview, even when the unit is on the lease and the dates overlap.
- This matches the user's report: adding a new cost entry to the unit has no effect on the lease's reconciliation table.

The Costs > Allocations page already accounts for this case by reading direct unit costs from `costEntries` (lines 38–43, 63–72 of `src/pages/CostsAllocations.tsx`), but the lease-level overview does not.

## Fix

Update `computeLeaseCostOverview` in `src/lib/chargesReconciliation.ts` so it also includes **unit-scoped cost entries** for each unit assigned to the lease, in addition to the existing `costAllocationResults` loop.

For every active lease unit assignment, iterate `costEntries` where:
- `e.unitId === assignment.unitId`, and
- `e.status === "active"` (skip draft / cancelled / closed), and
- the cost period (`startDate` → `endDate ?? startDate`) overlaps the assignment window intersected with the reconciliation window,

then build a synthetic `LeaseCostOverviewLine` using the same pro-rata math already used for allocation results:
- `costFullAmount = allocatedAmount = e.amount` (the unit bears 100% of a direct unit cost)
- `recoverableAmount` / `ownerBurdenAmount` derived from `e.recoveryType` using the same split as `computeRecoverySplit` in `src/lib/costAllocation.ts` (owner-only → 0 / amount; tenant-recoverable → amount / 0; partially-recoverable → 50/50; informational → 0/0)
- `proRataFactor`, `overlapDays`, `totalDays`, `proRatedAllocated`, `proRatedRecoverable`, `proRatedOwnerBurden` computed via the existing helpers
- `addedByAmendment` / `removedByAmendment` flags reused from the assignment

De-dup guard: if a `CostAllocationResult` already exists for `(costEntryId, unitId)` (covers the edge case where a unit-scoped cost also happens to have an allocation result), skip the synthetic line so the row is not double-counted.

Signature change: pass the full `costEntries` array (already passed) — no new arguments needed. Totals at the bottom of the table will reconcile automatically because they sum `lines`.

## Technical details

File to change:
- `src/lib/chargesReconciliation.ts` — extend `computeLeaseCostOverview` with a second loop over `costEntries` for unit-scoped active entries; add a small `splitRecovery(amount, recoveryType)` helper (copy of the one in `costAllocation.ts`, kept local to avoid a circular import).

No changes needed in:
- `ChargesReconciliationSection.tsx` (already calls `computeLeaseCostOverview` with `costEntries`).
- `AppContext.tsx` allocation logic (we deliberately do not create persisted allocation results for unit-scoped costs; they're handled at read-time, consistent with `CostsAllocations.tsx`).
- The reconciliation engine that compares provisions vs. recoverable (`computeReconciliation`) — out of scope; user's issue is specifically the overview table not reflecting added unit costs. If desired we can extend it later in the same way, but keeping this patch focused on the reported symptom.

## Verification

After implementation:
1. Open a lease whose primary unit is, say, U-101, with dates covering 2026.
2. Go to **Costs > Entries**, add a new active cost entry scoped to U-101 with a period inside the lease window.
3. Return to the lease → **Charges reconciliation** → the new cost appears as a row with correct full / overlap / pro-rated columns and contributes to the totals.
4. Type-check (`tsc --noEmit`) stays clean.
