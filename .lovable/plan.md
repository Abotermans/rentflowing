# Add navigation links on the Allocations list

## Context
On `/payments` → **Allocations** tab, each row shows the receipt reference, the receivable label, its type, the tenant, and the amount. Only the tenant is currently clickable. The user wants to jump from an allocation to the underlying item that justified it (the lease the rent/charges/deposit belong to, the unit, etc.).

## Where the link should point
Every `ReceivableItem` already carries `leaseId`, `propertyId`, `unitId`. The item type determines the most useful target:

| Item type | Target route |
|---|---|
| rent, charges, deposit, guarantee, advance-payment, late-fee, adjustment, credit-note | `/leases/{leaseId}` |
| repair-recharge | `/leases/{leaseId}` (no ticketId stored on receivable today — keep simple, out of scope to add) |
| other / no lease | fallback to `/units/{unitId}` then `/tenants/{tenantId}` |

A small helper `getReceivableTargetHref(item)` in `src/pages/Payments.tsx` (or colocated util) returns the best href.

## UI changes (Payments.tsx, Allocations tab only)

1. **Receivable column** — wrap `al.ri?.label` in a `<Link>` to the computed target. Style: `hover:underline text-foreground`, same pattern as the existing tenant link. Fallback "—" when no target.
2. **Receipt Ref column** — make the reference clickable too, opening the existing receipt detail (today there is no receipt detail page; instead, switch to the **Receipts** tab and scroll/filter to that receipt). Simplest: leave the reference as plain text for now and only add the receivable link. (Open question below.)
3. Add a small `ExternalLink` / chevron icon next to the receivable label for affordance (optional, matches existing list patterns).

No changes to data model, reconciliation logic, or other tabs.

## Files touched
- `src/pages/Payments.tsx` — add helper + wrap receivable label in `<Link>`.

## Out of scope
- Adding a `ticketId` to `ReceivableItem` to deep-link `repair-recharge` to a maintenance ticket.
- Building a dedicated CashReceipt detail page.
- Changes to the Receipts or Receivables tabs.

## Open question
Should the **Receipt Ref** column also become clickable? If yes, where should it go — a new receipt detail drawer, or just filter the Receipts tab on that reference?
