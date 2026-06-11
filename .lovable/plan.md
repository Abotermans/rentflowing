## Goal
On the Amendments timeline table (lease detail), show how many changes each amendment carries, and let the user open a Before/After diff modal by clicking the count.

## Changes

### 1. New column in the amendments timeline table
File: `src/components/amendments/AmendmentsSection.tsx`

- Insert a new `<TableHead>` "Changes" between Title and Effective date.
- For each amendment row, render a cell with the change count using `getAmendmentChanges(a.id).length` (already computed as `chs`).
- The count is a button (`variant="link"`, size sm, `h-auto p-0`) styled as an inline link, wrapped with `e.stopPropagation()` so it doesn't trigger the row's edit click.
- Clicking sets a new local state `diffAmendment` and opens a new modal.
- If count is 0, show a muted "—" with no button.

### 2. New "Amendment changes" modal
New file: `src/components/amendments/AmendmentChangesDialog.tsx`

A Dialog (centered popup, per project convention) showing a table with columns: Field, Before, After.

The diff is computed using the existing helper `getEffectiveLeaseTerms` from `src/lib/amendments.ts`:
- `after` = terms on the amendment's `effectiveDate` (which already folds this amendment if active; for draft/scheduled we simulate it as active using the same shallow-copy trick used in `getLeaseAmendmentImpact`).
- `before` = terms one day before the amendment's `effectiveDate`, excluding this amendment.

Row generation mirrors the logic already in `AmendmentConfirmDialog.tsx` (same field-by-field switch over `LeaseAmendmentChange.fieldName`), so labels and formatting stay consistent across the app. We will reuse that mapping by extracting it into a small local helper inside the new dialog (kept colocated to avoid scope creep; no refactor of the confirm dialog).

Modal structure:
- Title: `t("amendments.changesTitle")` — "Changes in amendment #N"
- Subheader: amendment title + effective date badge
- Table with `Field | Before | After` columns, same compact styling as the confirm dialog table
- Footer: single "Close" button

### 3. Translations
File: `src/i18n/translations.ts`

Add keys in both `en` and `fr`:
- `amendments.col.changes` → "Changes" / "Modifications"
- `amendments.changesTitle` → "Changes in amendment #{n}" / "Modifications de l'avenant n°{n}"
- `amendments.field` → "Field" / "Champ" (only if not already present; otherwise reuse `amendments.summary`)

## Out of scope
- No changes to amendment data model, lib helpers, or the confirm dialog.
- No changes to other tabs (Current terms, Original terms).
