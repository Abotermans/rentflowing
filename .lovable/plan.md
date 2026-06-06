# Amendment dialog polish + lease/amendment consistency

## 1. Remove duplicate "effective date in past" warning
In `src/components/amendments/AmendmentDialog.tsx`, the bottom Alert iterates over `liveValidation.warnings`. Filter out `AMD_EFFECTIVE_IN_PAST` from the displayed warnings (the date-field tooltip already shows it). Drop the alert entirely when only that warning remains and there's no other content.

## 2. Structured notice period field
Replace the free-text `newNotice` input with a numeric input + unit selector.

- New state: `newNoticeValue` (string number) and `newNoticeUnit` ("days" | "weeks" | "months" | "years"), default unit `months`.
- On open (existing amendment or lease default), parse `noticePeriodText` with regex `^\s*(\d+)\s*(day|week|month|year)s?\s*$` (case-insensitive, FR aware: `jour|semaine|mois|année|an`). If no match, fall back to value `""` and unit `months` and keep raw text only as a tooltip hint — but per the requirement we standardize, so we replace.
- Serialize back to `noticePeriodText` as `"<n> <unit>"` (canonical English form, e.g. `"3 months"`). The downstream code only reads it as a string label, so a stable canonical format is acceptable.
- UI: two side-by-side controls under the same `Label` ("Préavis"): `Input type="number" min="0"` (w-20) + `Select` with localized unit options.
- Add translation keys: `amendments.noticeUnit.days|weeks|months|years` (EN + FR: jours/semaines/mois/années).

## 3. Improve bottom Alert design
Currently it uses `<Alert variant="destructive">` or default with a single `AlertTriangle` and bullets. Improvements:

- When the alert is a "warning-only" state (no blockers), use a new soft amber styling: `border-warning/40 bg-warning/10 text-warning-foreground` with the `AlertTriangle` colored `text-warning`.
- When destructive: keep variant but ensure the icon inherits `text-destructive` (already does via the variant — verify).
- Render blockers vs warnings as two grouped sections with a small colored leading dot, instead of mixed bullet list with inline `text-warning` class.

Concretely: split list into two `<ul>`s; render warning icon color matching the alert tone; tighten spacing.

## 4. Cascade lease end/terminate to active amendments
In `src/context/AppContext.tsx`, the `updateLease` cascade block (around lines 346–365) detects `becameClosed` when a lease transitions from `active` → `ended`/`terminated`. Add an amendment cascade inside that block:

```
setAmendments(prev => prev.map(a =>
  a.leaseId === l.id && a.status === "active"
    ? { ...a, status: l.lifecycleStage === "terminated" ? "terminated" : "ended", updatedAt: ts }
    : a,
));
```

Mirror the same logic in `confirmMoveOut` (which forces `lifecycleStage: "ended"`): after updating leases, mark active amendments of that lease as `ended`.

This guarantees: a lease cannot be ended/terminated while its amendment still shows as Actif/active.

## Files touched
- `src/components/amendments/AmendmentDialog.tsx` — notice field, alert filtering + restyle
- `src/context/AppContext.tsx` — amendment cascade in `updateLease` + `confirmMoveOut`
- `src/i18n/translations.ts` — 4 unit labels × 2 locales
