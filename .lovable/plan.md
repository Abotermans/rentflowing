# Harmonize all banners on the Lease Detail page

## Goal
Make every warning / status banner on the Lease Detail page share the exact same visual shell: same min-height, padding, icon size, typography, vertical centering, semantic color tokens, and action-button layout. The current `LeaseBanner` warnings already look uniform, but the activation-blocker alerts still use the old `StatusTransitionAlert` styling and are visually inconsistent.

## Current state
- Lease warning banners (guarantee, notice, move-in/out, end-of-lease, overdue) are rendered by a local `LeaseBanner` component in `src/pages/LeaseDetail.tsx`. They are consistent with each other.
- Activation blocker / warning banners for `draft` and `active` (unsigned) leases are rendered by `StatusTransitionAlert`, which uses a different `Alert` shell: smaller icon, different padding, direct `amber-500` colors, and a different text stack.
- The two groups sit in the page with ad-hoc spacing (`space-y-6` + internal `mt-2`), so they also differ in rhythm.

## Plan

1. **Extract a shared `LeaseBanner` component**
   - Move the local `LeaseBanner` shell from `src/pages/LeaseDetail.tsx` to `src/components/shared/LeaseBanner.tsx` so it can be reused for the activation blockers without duplicating markup.
   - Keep the same API: `tone: "warning" | "destructive" | "info"`, `icon`, `title`, `description?`, `actions?`.
   - Keep semantic tokens only: `warning`, `destructive`, `border`, `muted`, etc. No hardcoded amber or other one-off colors.

2. **Render activation blockers with the same banner shell**
   - In `LeaseDetail.tsx`, replace the two `StatusTransitionAlert` calls with a small local helper that maps the `ValidationResult` into `LeaseBanner` instances:
     - One **destructive** banner for `blockers` (icon `XCircle`).
     - One **warning** banner for `warnings` (icon `AlertTriangle`).
     - The override hint and recommended action become a description line inside the relevant banner, or a separate muted sub-line if no banner is shown.
   - Preserve the existing validation logic (`canSendForSignature`, `canMarkSigned`).

3. **Unify the banner stack spacing**
   - Wrap all alert banners (activation blockers + warning banners) in a single section with `className="space-y-3"`.
   - Let the page-level `space-y-6` continue to separate the banner section from the header and lease summary card.

4. **Polish vertical alignment and action layout**
   - Ensure every banner row uses `flex items-center gap-3`, `min-h-[64px]`, `px-4 py-3`.
   - Icon is `h-5 w-5 shrink-0 self-center`.
   - Text column is `flex flex-col justify-center leading-snug` with `text-sm font-medium` title and optional `text-xs opacity-90` description.
   - Actions are `flex flex-wrap items-center justify-end gap-2 shrink-0`.

5. **Verify in preview**
   - Open a lease that shows multiple banners at once (e.g. a draft lease with missing data + a pending guarantee) and confirm the stack looks uniform.

## Optional extension
If you want the same banner design on the other pages that use `StatusTransitionAlert` (Properties, Units, Tenants, dialogs), I can update the shared component to use the new `LeaseBanner` shell globally. That is not required for the lease page and is left as a separate decision.

## Files likely touched
- `src/pages/LeaseDetail.tsx`
- `src/components/shared/LeaseBanner.tsx` (new)
- `src/components/shared/StatusTransitionAlert.tsx` (only if we choose the optional global extension)