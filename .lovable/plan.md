

# Controlled Override Flow

## Summary
Add a reusable override confirmation dialog that captures a mandatory reason, an in-memory audit log for override history, and wire it into the specific places where `overrideAllowed: true` is already returned by the integrity layer. Structural blockers (deletion with dependencies, duplicate active leases) remain strictly non-overridable.

## Overridable Cases (from existing code)
These already return `overrideAllowed: true`:
- **Unit → vacant** with active lease (data cleanup / legacy correction)
- **Unit → unavailable/reserved** with active lease (warnings, already allowed)
- **Tenant → former** with open balances/guarantees (operational exception)
- **Lease → ended** with open receivables/guarantees (business decision)
- **Lease → terminated** when not active (edge case)

New cases to mark `overrideAllowed: true`:
- **Unit → occupied** without active lease (pre-import / legacy data)

## Non-Overridable (unchanged)
- All deletion blockers (`canDeleteProperty`, `canDeleteUnit`, `canDeleteTenant`, `canDeleteLease`, etc.)
- Lease activation with missing tenant or conflicting active lease
- Lease revert to draft

## Files

### 1. `src/types/override.ts` — New
```ts
interface OverrideRecord {
  id: string;
  entityType: IntegrityEntityType;
  entityId: string;
  action: string;           // e.g. "status_change:vacant", "status_change:former"
  blockerCodes: string[];   // which integrity codes were overridden
  reason: string;
  timestamp: string;
}
```

### 2. `src/context/OverrideContext.tsx` — New
Simple context with `overrideHistory: OverrideRecord[]` and `addOverride(record)`. Stores in state (lightweight, no persistence yet). Also exports `useOverrideHistory()` hook.

### 3. `src/components/shared/OverrideConfirmDialog.tsx` — New
A Dialog component that:
- Shows the validation blockers/warnings being overridden
- Has a required `Textarea` for reason (min length enforced)
- Shows a clear warning banner: "This override bypasses normal safeguards"
- Confirm button disabled until reason is filled
- On confirm: calls `onOverride(reason)` callback
- Professional styling with amber/warning theme

### 4. `src/pages/Units.tsx` — Modify
In `handleSave`, when `validation.allowed === false && validation.overrideAllowed`:
- Instead of blocking with toast, open `OverrideConfirmDialog`
- On override confirm: proceed with `updateUnit`, record override

### 5. `src/pages/PropertyDetail.tsx` — Modify
Same pattern for unit status changes in the property detail unit form.

### 6. `src/pages/Tenants.tsx` — Modify
Wire override for tenant status change to "former" when blocked by active leases (need to check current code).

### 7. `src/pages/LeaseDetail.tsx` — Modify
Wire override for "Mark Ended" and "Terminate" actions when warnings exist with `overrideAllowed: true`.

### 8. `src/lib/integrity/unitIntegrity.ts` — Modify
Add `overrideAllowed: true` for `occupied` without active lease (currently a hard blocker — change to overridable for the "no active lease" case only, keep "multiple active leases" as hard blocker).

### 9. `src/components/shared/IntegritySummaryPanel.tsx` — Modify
When `overrideAllowed` is true on the validation, show a subtle indicator: "Override available for exceptional cases".

### 10. `src/context/AppContext.tsx` — Modify
Wrap children with `OverrideProvider`.

## UX Flow
1. User attempts blocked action (e.g., unit → vacant with active lease)
2. Instead of hard block toast, `OverrideConfirmDialog` opens
3. Dialog shows blockers, warnings, and recommended action
4. User must type a reason (minimum 10 characters)
5. User clicks "Override and Proceed"
6. Action executes, override is recorded in `overrideHistory`
7. Toast confirms with "(overridden)" note

