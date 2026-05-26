## Goal

Replace every right-side `Sheet` used for Add/Edit/record actions with a centered `Dialog` (shadcn `dialog.tsx`) so all "Add" modals open as popups in the middle of the screen. Keep behaviour, fields, and validation identical — this is a presentation-layer swap.

## Audit — Sheets to Convert

Twelve files, ~17 sheets total:

**List pages (Add/Edit entity):**
1. `src/pages/Properties.tsx` — uses Dialog already (only file that does). Use as reference.
2. `src/pages/Units.tsx` — Add/Edit Unit
3. `src/pages/Tenants.tsx` — Add/Edit Tenant
4. `src/pages/Leases.tsx` — Add/Edit Lease (large form — needs `max-w-2xl`)
5. `src/pages/Vendors.tsx` — Add/Edit Vendor
6. `src/pages/Maintenance.tsx` — New/Edit Ticket
7. `src/pages/Payments.tsx` — Record Cash Receipt + Manual Allocation
8. `src/pages/CostCategories.tsx` — Add/Edit Category
9. `src/pages/CostEntries.tsx` — Add/Edit Entry
10. `src/pages/AllocationRules.tsx` — Add/Edit Rule

**Detail pages (sub-entity actions):**
11. `src/pages/PropertyDetail.tsx` — Add/Edit Unit
12. `src/pages/LeaseDetail.tsx` — Record Receipt, Add/Edit Guarantee, Register Notice, Move-In, Move-Out
13. `src/pages/MaintenanceDetail.tsx` — Edit Ticket

## Conversion Pattern

For every sheet, swap imports and JSX in a mechanical way:

```diff
- import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
+ import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

- <Sheet open={open} onOpenChange={setOpen}>
-   <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
-     <SheetHeader><SheetTitle>...</SheetTitle></SheetHeader>
+ <Dialog open={open} onOpenChange={setOpen}>
+   <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
+     <DialogHeader><DialogTitle>...</DialogTitle></DialogHeader>
      ...
-     <SheetFooter>...</SheetFooter>
-   </SheetContent>
- </Sheet>
+     <DialogFooter>...</DialogFooter>
+   </DialogContent>
+ </Dialog>
```

### Width mapping
- Sheets previously `sm:max-w-md` → `DialogContent max-w-md`
- Sheets previously `sm:max-w-lg` → `DialogContent max-w-lg`
- Large lease form → `max-w-2xl` (more horizontal room than the current narrow sheet, since center dialog handles wide forms better than a side panel)

All `DialogContent` get `max-h-[90vh] overflow-y-auto` so long forms still scroll.

## Verification

1. `bunx vitest run` to confirm no test regression.
2. Browser-navigate to each affected route and screenshot the open Add modal:
   - `/units`, `/tenants`, `/leases`, `/vendors`, `/maintenance`, `/payments`, `/costs/categories`, `/costs/entries`, `/costs/allocations`
   - `/properties/p1` (Add Unit), `/leases/l1` (Record Receipt + Add Guarantee), `/maintenance/<id>` (Edit Ticket)
3. Confirm each opens centered, scrolls correctly, and the existing layout/fields render unchanged.

## Memory Update

The existing core rule `B2B UI: High-density, Sheet/Drawer for CRUD` directly contradicts this new direction. Update `mem://index.md` to replace "Sheet/Drawer" with "centered Dialog" for the CRUD pattern. Update `mem://style/operational-ui-design` body accordingly.

## Files Touched

- `src/pages/Units.tsx`, `Tenants.tsx`, `Leases.tsx`, `Vendors.tsx`, `Maintenance.tsx`, `Payments.tsx`, `CostCategories.tsx`, `CostEntries.tsx`, `AllocationRules.tsx`, `PropertyDetail.tsx`, `LeaseDetail.tsx`, `MaintenanceDetail.tsx`
- `mem://index.md` and `mem://style/operational-ui-design`

No data-model, business-logic, or test changes.
