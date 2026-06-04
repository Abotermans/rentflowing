# Amendments UX & Lease Summary refinement

Polish the "Avenants" section on the Lease Detail page and make the main Lease Summary reflect the lease as it actually stands today (original terms + activated amendments).

## 1. Amendments timeline (AmendmentsSection)

- **Remove the "Impact preview" tab entirely.** It compares one selected amendment vs. baseline and becomes misleading once 2+ amendments exist. Keep tabs: Timeline · Current effective terms · Original contract terms.
- **Remove the "Summary" column** from the timeline table — low signal, truncated, not actionable.
- **Add a "New end date" column.** Show the `leaseEndDate` from the amendment's changes; "—" if the amendment doesn't touch the end date.
- **Whole row is clickable** → opens the edit dialog (same behaviour as the pencil button). Action buttons keep `stopPropagation`. Add `cursor-pointer hover:bg-accent/30`.
- **Tooltips on action buttons** (using `@/components/ui/tooltip`, already in shadcn): Edit → "Modifier l'avenant" / "Edit amendment", Activate → "Activer cet avenant" / "Activate amendment", Cancel → "Annuler cet avenant (l'historique est conservé)" / "Cancel amendment (history preserved)", Delete → "Supprimer ce brouillon" / "Delete draft".
- **Gap warning (light, per-row).** When the amendment's `effectiveDate` is strictly after the current lease end date (effective end date, i.e. derived from already-active amendments), show a small amber `AlertTriangle` next to the effective date with a tooltip: "L'avenant commence après la fin actuelle du bail — certains jours ne seront pas couverts." / "Amendment starts after the current lease end — some days will not be covered." This is a warning, not a blocker.

Final columns: `#` · Type · Title · Effective date (with optional gap icon) · New end date · Status · Actions.

## 2. Lease Summary card reflects effective terms

Today the Lease Summary block uses raw `lease.monthlyRent`, `lease.monthlyCharges`, `lease.endDate`, `lease.depositOrGuaranteeAmount`, `lease.noticePeriodText`. Replace those reads with `getEffectiveLeaseTerms(leaseId, today, integrityState)` (already exists in `src/lib/amendments.ts`). Fallback to the lease record if the effective terms are null.

- Rent / charges / end date / deposit / notice in the Summary use the *effective* values (= active amendments whose `effectiveDate ≤ today` folded in).
- When the effective value differs from `lease.*`, show a tiny `(amendment n°X)` muted suffix so users know it's not the original contract.
- Pure presentation change — no edits to `Lease` records, no business-logic shifts. Receivables generation is untouched (already amendment-aware elsewhere).

## 3. AmendmentDialog — Add/Remove unit UX

Current dialog hides Add/Remove unit blocks behind the type selector and lumps Add + Remove in a "mixed" dump. Make them direct and clear:

- For `unit-addition` / `unit-removal` / `mixed`, replace the current bare selects with a **two-pane "Unit changes" panel**:
  - Left column "Lots actuels / Current units": list current assignments as rows. Each non-primary row shows a `−` button. Selected rows are visually marked "À retirer / To remove".
  - Right column "Lots disponibles / Available units": list eligible same-property units. Each row has a `+` button. Picking one reveals an inline tiny form (Role, Rent, Charges) and marks it "À ajouter / To add".
- A summary line at the bottom: "1 lot à ajouter · 1 lot à retirer" / "1 unit to add · 1 unit to remove".
- Keep the same change-emission shape (`unitAssignments add`/`remove`) so downstream logic is untouched.

## 4. French audit on the edit modal

Replace remaining hardcoded English with `t()` keys:
- "Title" → `amendments.titleField` ("Titre" / "Title")
- "Notice period" → reuse existing `leases.noticePeriod` translation
- "Clause summary" → `amendments.clauseSummary` ("Résumé de clause" / "Clause summary")
- "Tenant" → reuse `tenants.tenant`
- Select placeholders "Unit" → `amendments.selectUnit`
- Validation alert messages: switch the `<li>` rendering to look up a translated message via a new `amendments.error.<code>` map (fallback to the raw English `message` field when no key exists) so blockers like `AMD_UNIT_PROPERTY_MISMATCH`, `AMD_END_BEFORE_START`, etc. show in French.
- Confirm FR strings exist for every new key and aren't truncated.

## 5. Translations

Add to `src/i18n/translations.ts` (EN + FR):
- `amendments.titleField`, `amendments.clauseSummary`, `amendments.selectUnit`, `amendments.newEndDateCol`, `amendments.gapWarning`, `amendments.currentUnits`, `amendments.availableUnits`, `amendments.toAdd`, `amendments.toRemove`, `amendments.unitChanges`, `amendments.tooltip.edit/activate/cancel/delete`, `amendments.error.<code>` for each existing blocker/warning code in `amendmentIntegrity.ts`.
- Remove unused `amendments.impact`, `amendments.before`, `amendments.after`, `amendments.financialDelta`, `amendments.affectedUnits`, `amendments.summary` keys (no longer referenced).

## Technical notes

- Files touched: `src/components/amendments/AmendmentsSection.tsx`, `src/components/amendments/AmendmentDialog.tsx`, `src/pages/LeaseDetail.tsx` (Lease Summary block only), `src/i18n/translations.ts`.
- No changes to `src/lib/amendments.ts`, `src/lib/integrity/amendmentIntegrity.ts`, `AppContext`, or types — purely presentation + i18n.
- "Current lease end date" used for the gap warning = `getEffectiveLeaseTerms(leaseId, today, s).endDate`, computed once per render of the section.
- Use `Tooltip`, `TooltipTrigger`, `TooltipContent` from `@/components/ui/tooltip` wrapped in a single `TooltipProvider` at the section root.

## Out of scope

- No new amendment validation rules (gap remains a soft visual warning, not an integrity blocker).
- No changes to receivables, occupancy, or amendment activation logic.
- No backend / schema changes.
