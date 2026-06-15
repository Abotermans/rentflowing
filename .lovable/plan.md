## Goal
Unify every collapsible section on the lease page to the same structure, behavior, and visuals as **Receivables / Cash Receipts / Allocation History**.

## Reference pattern (don't change these)
```tsx
<Collapsible open={X} onOpenChange={setX}>
  <Card>
    <CollapsibleTrigger asChild>
      <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
        <CardTitle className="text-base font-medium flex-1 text-left">…</CardTitle>
        {/* optional action buttons here, with stopPropagation */}
        <span className="inline-flex items-center justify-center h-7 w-7">
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", X && "rotate-180")} />
        </span>
      </CardHeader>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <CardContent>…</CardContent>
    </CollapsibleContent>
  </Card>
</Collapsible>
```

Key behaviors to enforce everywhere:
- Whole header row is the click target (`cursor-pointer`), not a separate chevron button.
- Chevron is a non-interactive `<span>` that rotates 180° when open.
- Header padding is `py-3` (not `pb-3`).
- Content sits inside `<CollapsibleContent>` (animated), not behind `{open && …}`.
- Any action button in the header (Edit, Add, etc.) gets `onClick={e => { e.stopPropagation(); … }}` so it doesn't toggle the section.

## Sections to refactor

### In `src/pages/LeaseDetail.tsx`
1. **Advance Billing** (~L1270) — replace custom chevron `<Button>` + `{advanceBillingOpen && …}` with the Collapsible wrapper. Keep state `advanceBillingOpen`.
2. **Deposit / Guarantee** (~L1386) — same refactor. Keep the "Edit / Add guarantee" button inside the header, but wrap its `onClick` with `stopPropagation`. Keep state `depositOpen`.
3. **Occupancy Operations** (~L1437) — currently a bare `<div>` with a chevron button next to an `<h2>`. Convert to the same `Collapsible` + `Card` shell so it matches the rest visually (title "Occupancy Operations" in CardHeader, grid of Move-In / Move-Out / Meters / Keys & Badges inside `CollapsibleContent` → `CardContent`). Keep state `occupancyOpen`.
4. **Notes** (~L1801) — same refactor. Keep the "Edit" button in the header with `stopPropagation`. Keep state `notesOpen`.

### In `src/components/amendments/AmendmentsSection.tsx`
5. **Amendments / Avenants** (L157–172) — replace the chevron `<Button>` + `{sectionOpen && …}` body with `Collapsible` / `CollapsibleTrigger` / `CollapsibleContent`. Keep the "New amendment" `<Button>` inside the header with `stopPropagation`.

### In `src/components/leases/ChargesReconciliationSection.tsx`
6. **Charges Reconciliation** — two header variants exist (L240 empty-state and L266 normal). Refactor both to the standard pattern. Action buttons in the header (e.g. "New reconciliation") keep `stopPropagation`.

## Out of scope
- Sections that currently have **no** collapse on the lease page (Lease Summary, Payer Accounts, the inner Meters / Keys & Badges cards). Leaving them as-is unless you want them collapsible too — happy to add if you confirm.
- No business-logic, data, or translation changes; visual/behavioral refactor only.

## Technical notes
- All required primitives already imported in each file (`Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`, `ChevronDown`, `cn`). No new dependencies.
- Initial-open defaults preserved from existing `useState` values, so nothing changes for the user on first render.
- `CollapsibleTrigger asChild` forwards the click handler to `CardHeader`, so removing the separate chevron `<Button>` does not lose keyboard/ARIA behavior (Radix handles it).
