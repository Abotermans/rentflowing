## Goal

Stop treating any tenant on a lease as "primary". All co-tenants are equal. Introduce an explicit **expected payer** on the lease (name + IBAN/BIC) that drives reconciliation with bank imports — independent of who is named on the lease.

## Why

- A lease can be held by several tenants (couple, flatmates, company + guarantor). None is more important than the others.
- Bank transactions carry a payer name/IBAN that may not match any tenant: a parent pays for a student, a holding pays for a subsidiary, a spouse pays from a personal account, or a single shared joint-account name covers two tenants.
- Reconciliation should match on the **lease's declared payer account**, not on a tenant pointer. That makes auto-matching work for programmatic bank feeds and avoids forcing operators to pick a fake "primary tenant".

## Use cases covered

1. Single tenant pays from their own IBAN → payer = tenant, auto-detected when lease is created.
2. Couple, one IBAN held by one of them → payer name/IBAN entered manually, may differ from the other co-tenant's name.
3. Parent pays for a student tenant → payer name = parent, IBAN = parent's; tenant on the lease is the student.
4. Company pays for an employee's housing → payer = company, with its IBAN.
5. Two separate payers (rare: split rent) → support a list of accepted payer accounts on the lease, any match counts.
6. Direct debit (SEPA) → the IBAN is the mandate account; same field reused.

## Scope of changes

### Data model (Lease)
- Add `payerAccounts: LeasePayerAccount[]` — small list, usually 1 entry.
  - `payerName: string` (free text, what shows on the bank statement)
  - `payerIban: string | null`
  - `payerBic: string | null`
  - `isDefault: boolean` (the one prefilled on manual receipts)
  - `notes: string` (e.g. "parent", "joint account")
- Drop `billingTenantId` from the UI surface; keep the field internally as deprecated, no longer shown or required.
- Remove `primaryTenantId` / `coTenantIds` from the UI vocabulary. They remain in the type as `@deprecated` mirrors only (already the case). Replace every read site that needs "a tenant to display" with either the full tenant list or — for invoicing labels — the lease's default payer name.

### Tenants on the lease
- Lease creation/edit dialog: single "Tenants" picker, multi-select, no primary toggle, no "Primary" badge.
- Lease detail header: list every tenant as equal chips.
- Remove `t("leases.primaryTenant")` badge usages in `Leases.tsx`, `LeaseDetail.tsx`, `AmendmentsSection.tsx`.

### Payer section on the lease
- New "Payer account(s)" card on `LeaseDetail.tsx`, under the tenants block.
- CRUD via the standard centered Dialog (per project memory). Fields: payer name, IBAN, BIC, default toggle, note.
- When a lease is first created with exactly one tenant, prefill one payer entry: name = tenant full name, IBAN/BIC empty (operator fills when known).

### Reconciliation logic
- Update `src/lib/reconciliation.ts` matching pipeline:
  1. Match candidate leases by `cash_receipts.payerIban` → any lease whose `payerAccounts[*].payerIban` equals it.
  2. Fallback: normalized `payerName` (trim, casefold, strip accents) equals one of the lease's `payerAccounts[*].payerName`.
  3. Fallback (current behavior): tenant name match across `tenantIds`.
  4. Fallback: remittance reference contains the lease reference.
- Surface match confidence (`iban` > `payer-name` > `tenant-name` > `reference`) for the Payments page to display.
- When an unmatched receipt is manually attached to a lease, offer "Add this payer to the lease for future auto-match" (one-click adds the receipt's payerName/IBAN to `payerAccounts`).

### Receivables generation
- `src/lib/leaseReceivables.ts` currently stamps `tenantId: lease.primaryTenantId` on every receivable. Switch to a neutral approach: `tenantId` becomes optional / nullable on `ReceivableItem`, or stores the full `tenantIds` array. Lists that show "Tenant" use a joined label of all tenants. Invoicing label uses the lease's default payer name.

### Backend
- Migration: add `payer_accounts JSONB NOT NULL DEFAULT '[]'::jsonb` on `public.leases` (small, lease-scoped, no need for a separate table since cardinality is tiny and always loaded with the lease). RLS is unchanged — it inherits from the existing lease policies.
- One-time data backfill: for each existing lease with a `billing_tenant_id` (or `primary_tenant_id`), insert one `payerAccounts` entry from that tenant's name; IBAN/BIC left null.

### i18n
- Add: `lease.payerAccounts`, `lease.payerName`, `lease.payerIban`, `lease.payerBic`, `lease.payerDefault`, `lease.addPayer`, `lease.payerAutoLearn`, `lease.matchedBy.iban|name|tenant|reference` (EN + FR).
- Remove `leases.primaryTenant` usages; keep the key for now to avoid breaking other references, mark for deletion next pass.

### UI cleanup
- `Leases.tsx` form: remove "Primary tenant" Select + the Badge in the tenant list editor.
- `LeaseDetail.tsx`: remove the "Primary" chip next to the first tenant; show all tenants symmetrically.
- `AmendmentsSection.tsx`: same removal in the rendered amendment terms.
- Amendments engine (`src/lib/amendments.ts`): keep `primaryTenantId` handling as deprecated compatibility but stop emitting amendment change rows for it; amendments now act on `tenantIds` and `payerAccounts`.

## Out of scope

- Reading from a real bank feed (still mocked).
- Splitting one receipt across multiple leases — kept as today.
- Per-payer accounting / sub-ledgers.

## Technical notes

- `LeasePayerAccount` type lives in `src/types/index.ts` next to `Lease`.
- Normalized name comparison helper in `src/lib/reconciliation.ts` (NFKD + strip diacritics + lowercase + collapse whitespace).
- IBAN comparison strips spaces and uppercases.
- The Payments page's match-confidence column is additive; existing rows render `tenant-name` for legacy matches.

## Open question

Do you want me to also let the operator mark a payer entry as "direct-debit mandate" (storing a mandate reference + signature date), or keep payer accounts purely descriptive for now and add SEPA mandate fields in a later pass?
