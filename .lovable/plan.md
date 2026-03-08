

# Wire Domain Integrity Layer into Delete Flows

## Overview
Replace the current ad-hoc delete confirmations across Properties, Units, Tenants, and Leases pages (and PropertyDetail) with the centralized integrity layer. When deletion is blocked, show clear reasons and recommend alternatives. When allowed, proceed normally.

## Approach

### 1. Create a reusable `useIntegrityState()` hook
A small hook in `src/hooks/use-integrity-state.ts` that reads the data arrays from `useAppData()` and returns an `IntegrityState` object. This avoids duplicating the mapping in every page.

### 2. Create a reusable `DeleteDialog` component
`src/components/shared/DeleteDialog.tsx` — a wrapper around AlertDialog that:
- Accepts an entity type, entity ID, and the integrity state
- Calls `getDeletionImpact()` to get the `ValidationResult`
- If **allowed**: shows standard confirmation with delete button
- If **blocked**: shows blocker messages as a list, disables the delete button, and shows the recommended alternative action
- Renders warnings (if any) with appropriate severity styling (high = destructive, medium = warning)

### 3. Update pages to use the new components

**Properties.tsx** (list page):
- Import `useIntegrityState` and `DeleteDialog`
- Replace inline AlertDialog with `<DeleteDialog entityType="property" entityId={p.id} onDelete={handleDelete} />`
- Remove ad-hoc unit/lease counting logic

**Units.tsx** (list page):
- Same pattern — replace inline AlertDialog with `<DeleteDialog entityType="unit" />`
- Remove ad-hoc lease warning logic

**Tenants.tsx** (list page):
- Replace inline AlertDialog with `<DeleteDialog entityType="tenant" />`

**Leases.tsx** (list page):
- Replace inline AlertDialog with `<DeleteDialog entityType="lease" />`

**PropertyDetail.tsx** (unit delete within property):
- Replace inline AlertDialog for unit deletion with `<DeleteDialog entityType="unit" />`

### 4. DeleteDialog UI behavior

When blocked:
```
┌─────────────────────────────────────┐
│ Cannot Delete Property              │
│                                     │
│ This property has dependencies:     │
│ • Property has 4 unit(s)            │
│ • Property has 2 lease(s)           │
│ • Property has 3 cost entry(ies)    │
│                                     │
│ Recommended: Archive the property   │
│ instead of deleting it              │
│                                     │
│                        [Close]      │
└─────────────────────────────────────┘
```

When allowed:
```
┌─────────────────────────────────────┐
│ Delete Property?                    │
│                                     │
│ This action cannot be undone.       │
│                                     │
│              [Cancel]  [Delete]     │
└─────────────────────────────────────┘
```

### 5. Files to create/modify

| File | Action |
|------|--------|
| `src/hooks/use-integrity-state.ts` | Create — builds IntegrityState from context |
| `src/components/shared/DeleteDialog.tsx` | Create — reusable integrity-aware delete dialog |
| `src/pages/Properties.tsx` | Modify — use DeleteDialog |
| `src/pages/Units.tsx` | Modify — use DeleteDialog |
| `src/pages/Tenants.tsx` | Modify — use DeleteDialog |
| `src/pages/Leases.tsx` | Modify — use DeleteDialog |
| `src/pages/PropertyDetail.tsx` | Modify — use DeleteDialog for unit deletion |

