

## Plan: Move-in, Move-out & Return Workflow

### Data Model Changes

**Extend `Lease` interface (`src/types/index.ts`)** with occupancy operations fields:

```typescript
// Move-in
moveInScheduledDate: string | null;
moveInActualDate: string | null;
moveInMeterReading: string | null;
moveInChecklist: MoveInChecklist;

// Move-out
moveOutScheduledDate: string | null;
moveOutActualDate: string | null;
moveOutMeterReading: string | null;
moveOutChecklist: MoveOutChecklist;
moveOutNotes: string;

// Keys
keyHandoverCount: number;
keyReturnCount: number;

// Return
returnStatus: ReturnStatus | null;
returnNotes: string;
```

**New types:**
- `ReturnStatus`: `"pending" | "in-review" | "completed"`
- `MoveInChecklist`: `{ leaseSigned, firstPaymentReceived, guaranteeConfirmed, keysHandedOver, meterReadingCaptured, tenantDocumentsComplete }` (all booleans)
- `MoveOutChecklist`: `{ noticeConfirmed, moveOutDateConfirmed, keysReturned, moveOutMeterReadingCaptured, balanceReviewed, guaranteeReviewCompleted }` (all booleans)
- Helper: `getMoveInStatus(lease)` → `"not-scheduled" | "scheduled" | "completed"`
- Helper: `getMoveOutStatus(lease)` → `"not-scheduled" | "scheduled" | "completed"`

### Seed Data (`src/data/mockData.ts`)

Update existing leases:
- **l1** (Marie, active): completed move-in (actual date set, checklist done, 3 keys handed over)
- **l2** (Jan, active): completed move-in
- **l3** (Luca, draft): scheduled move-in (date set, checklist incomplete)
- **l4** (Sophie, ended): completed move-in and move-out, return completed, guarantee reviewed
- **l5** (Emma, under notice): completed move-in, scheduled move-out (matching intendedMoveOutDate), return pending

### Context (`src/context/AppContext.tsx`)

No new state arrays needed — just updating `Lease` via existing `updateLease`. The `handleConfirmMoveOut` action should also set the unit status to `"vacant"` and lease status to `"ended"` when actual move-out is confirmed.

### StatusBadge Update (`src/components/shared/StatusBadge.tsx`)

Add styles for return statuses: `pending` (already exists), `in-review` (amber/warning), `completed` (already maps to existing styles). Will reuse existing mappings where possible.

### Lease Detail Update (`src/pages/LeaseDetail.tsx`)

Add an **"Occupancy Operations"** section with 4 sub-cards:

1. **Move-In Panel**: Scheduled/actual dates, checklist with toggle switches, "Schedule Move-In" / "Confirm Move-In" actions via Sheet forms
2. **Move-Out Panel**: Scheduled/actual dates, checklist with toggles, "Schedule Move-Out" / "Confirm Move-Out" actions. Confirming move-out sets unit to vacant and lease to ended.
3. **Keys & Meters Panel**: Key handover/return counts (numeric inputs), move-in/move-out meter readings. Inline editable.
4. **Return Panel**: Return status selector (pending → in-review → completed), return notes. Editable via Sheet.

### Unit Detail Update (`src/pages/UnitDetail.tsx`)

Add to the occupancy card:
- Move-in status (scheduled/completed with date)
- Planned move-out date (if under notice or scheduled)
- Return status (if move-out completed)
- "Available soon" indicator: show when move-out is scheduled with the expected date

### Leases List Update (`src/pages/Leases.tsx`)

Add small inline indicators/badges:
- "Move-in pending" (if scheduled but not completed)
- "Move-out scheduled" (if moveOutScheduledDate set, not completed)
- "Return pending" (if returnStatus is pending or in-review)

### Dashboard Update (`src/pages/Dashboard.tsx`)

Add 3 new KPI cards:
- **Upcoming Move-Ins**: count of leases with moveInScheduledDate in future and no moveInActualDate
- **Upcoming Move-Outs**: count with moveOutScheduledDate in future and no moveOutActualDate
- **Returns Pending**: count with returnStatus = "pending" or "in-review"

Add a small table for upcoming move-ins/move-outs (next 30 days).

### Files Summary

| Action | File |
|--------|------|
| Modify | `src/types/index.ts` — add checklist types, return status, extend Lease, helpers |
| Modify | `src/data/mockData.ts` — update lease seed data with move-in/out/return fields |
| Modify | `src/components/shared/StatusBadge.tsx` — add `in-review` style |
| Modify | `src/context/AppContext.tsx` — add confirmMoveOut logic (unit→vacant, lease→ended) |
| Modify | `src/pages/LeaseDetail.tsx` — add occupancy operations section with 4 panels + forms |
| Modify | `src/pages/UnitDetail.tsx` — add move-in/out/return indicators |
| Modify | `src/pages/Leases.tsx` — add move-in/out/return badges |
| Modify | `src/pages/Dashboard.tsx` — add move-in/out/return KPIs + table |

