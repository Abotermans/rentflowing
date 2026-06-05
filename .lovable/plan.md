## Goal

Enforce **a single active amendment per lease**. The active amendment (if any) is the authoritative delta versus the original lease. Activating a new amendment automatically ends the previous active one — regardless of which fields it touched.

```text
Effective terms = original lease, overridden by the single active amendment.
```

Anything not mentioned in the active amendment reverts to the original lease value. Each new amendment is therefore drafted as a complete delta vs. the original lease (matching how avenants are written legally — they re-state all modified clauses).

## 1. Activation — auto-end the previous active amendment

`src/context/AppContext.tsx` → `activateAmendment`:

- Before flipping the target to `active`, find every other amendment on the same lease whose status is `active` and move them to `ended`, setting `supersedesAmendmentId` on the newly-activated one to the most recent of those (latest `effectiveDate`, then `amendmentNumber`).
- Keep the existing assignment side-effects unchanged: the new amendment's own changes are written through to `leaseUnitAssignments` (rows opened/closed at `effectiveDate`).
- Remove the field-overlap heuristic — it no longer drives supersession.

Auto-activation tick (already in place) continues to call `activateAmendment`, so date-driven activation also enforces the single-active rule automatically.

## 2. Effective terms — fold only the single active amendment

`src/lib/amendments.ts`:

- `getActiveAmendmentsOn` keeps its filter but, given the new invariant, will return at most one row. Add an assertion in dev (`if (result.length > 1) console.warn(...)`) to surface accidental violations.
- `getEffectiveLeaseTerms`: behaviour unchanged in shape (still folds the active set over the baseline) but now operates on 0 or 1 amendment.
- Add a thin helper `getActiveAmendmentOn(leaseId, date, amendments): LeaseAmendment | null` for UI consumers that want the singular "current amendment".

Unit-share recomputation block at the end of `getEffectiveLeaseTerms` stays, since assignments remain the source of truth for per-unit pricing.

## 3. Integrity — conflict check becomes simpler

`src/lib/integrity/amendmentIntegrity.ts`:

- Drop the field-overlap conflict logic. Replace with a single warning when activating: if another `active` amendment exists on the lease, surface
  `AMD_WILL_END_PREVIOUS` (severity `medium`): *"Activating this amendment will end Amendment #N currently in force."*
- `scheduled` amendments are still allowed to coexist; only `active` is constrained to one.
- Scheduling check (`canScheduleAmendment`) unchanged.

## 4. UI surfacing

`src/components/amendments/AmendmentsSection.tsx`:

- Highlight the single active row (e.g. left border accent + "Current" badge using existing `primary` token).
- On the Activate / Schedule action confirmation for `scheduled → active`, when a previous active exists, show the `AMD_WILL_END_PREVIOUS` warning via the existing `StatusTransitionAlert` / override-confirm pattern (no override required — it's informational, user confirms).
- Action matrix unchanged from the previous plan otherwise.

`src/pages/LeaseDetail.tsx` lease summary:

- Add a small "Current amendment" line (Amendment #N, effective DD/MM/YYYY) next to lease status when one exists. Pulls from `getActiveAmendmentOn(leaseId, today)`.

## 5. Mock data sanity

`src/data/mockData.ts`: scan for leases that currently carry two `active` amendments simultaneously and demote the older ones to `ended` so the seeded state matches the invariant.

## 6. i18n (`src/i18n/translations.ts`)

Add EN/FR:
- `amendments.warning.willEndPrevious` — "Activating this amendment will end Amendment #{n} currently in force."
- `amendments.badge.current` — "Current" / "En vigueur".
- `leases.summary.currentAmendment` — "Current amendment" / "Avenant en vigueur".

## 7. Tests

- `src/lib/multiUnitLease.test.ts`: add a case — activating Amendment B on a lease that already has Amendment A active leaves A in `ended` with `supersedesAmendmentId = B.id` set on B, and `getActiveAmendmentsOn` returns only B.
- `src/lib/lifecycle.test.ts`: assert `getEffectiveLeaseTerms` after the swap reflects B's changes and reverts every field B does not touch back to the original lease values (not A's).

## Out of scope

- Migration of historical receivables when previous-amendment fields revert.
- Allowing operators to opt back into multi-active (no toggle).
- Backend persistence (still mock state).
