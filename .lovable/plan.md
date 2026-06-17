## Goal
Introduce a French-style co-ownership share ("millième" / tantièmes) at the unit level and a new allocation method that splits a property-level cost across its units in proportion to those shares.

## Domain note
A *millième* is each unit's share of co-ownership expenses, expressed in thousandths of the whole property (1000 by convention, sometimes 10000). They are fixed in the co-ownership deed and apply only to charges that target the whole building. We model them on the unit and let the user pick which "key" (e.g. general, lift, heating) the allocation rule uses — without keys, allocation works but is limited to a single global share per unit.

## Data model

### Unit (`src/types/index.ts`, table `public.units`)
- Add `millièmeShares: Record<string, number>` (camelCase `millieme_shares`, jsonb in DB, default `{}`). Keys are the share-key code (e.g. `general`, `lift`, `heating`), values are integers/decimals.
- Add `millièmeBase: number` per unit, default `1000`. Stored alongside shares so we don't assume the building uses 1000ths everywhere (some deeds use 10000).
- Backwards compatibility: missing column => treat as `{}` + base `1000`; UI shows a warning that no shares are defined.

### Allocation rule (`src/types/costs.ts`, table `allocation_rules`)
- New method: `"millième"` added to `AllocationMethod`, with label `"Co-ownership share (millième)"` / `"Millièmes (quote-part)"`.
- New column `share_key text null` on `allocation_rules` so a rule can target a specific key (`general`, `lift`, …). When null, falls back to the `general` key.

### Property (`src/types/index.ts`, table `properties`)
- Add `millièmeBase: number` (default `1000`) at property level so the user sets the convention once. Unit base is derived from the property base unless overridden — keeps data entry simple.
- Add `millièmeKeys: string[]` (default `["general"]`) defining which keys exist for that property. UI for editing keys lives on the property edit dialog (Settings tab).

## Allocation computation (`src/lib/costAllocation.ts`)
New branch for `method === "millième"`:
1. Resolve `shareKey = rule.shareKey ?? "general"`.
2. Collect units of the property (respect existing occupied/unavailable filters).
3. For each unit read `share = unit.millièmeShares[shareKey] ?? 0`.
4. Compute `totalShares = Σ share`.
5. If `totalShares === 0` → return `[]` and surface a warning (no shares defined for this key).
6. Otherwise allocate `amount * share / totalShares` per unit; round to 2 decimals, drop pennies remainder onto the last allocated unit (same pattern as `surface-area`).
7. Units with `share === 0` get no row (don't pollute the allocation table).
8. **Important:** we divide by `totalShares`, not by `property.millièmeBase`. This way the allocation is mathematically correct even when the sum of declared shares ≠ 1000 (incomplete data, rounding, ancillary units excluded). A non-blocking warning is shown when `|totalShares − millièmeBase| > 1`.

## Edge cases to handle explicitly
- **Sum ≠ base** (typos, missing units): allocate proportionally + show validation warning in the rule preview and the property "Millièmes" panel.
- **Unit excluded by occupied/unavailable filter** but holds shares: its share is ignored, others absorb the cost proportionally. Surfaced in the preview ("3 units excluded representing 124/1000 — redistributed").
- **Unit added later** with no share entered: defaults to 0, excluded from allocation, flagged in the Property → Millièmes panel ("2 units have no share for key 'general'").
- **Share key missing on a rule but property has multiple keys**: default to `general`; if `general` doesn't exist, block save with a clear error.
- **Property base mismatch**: if user changes base from 1000 → 10000, existing shares stay (numbers untouched) — allocation still works because we use the proportional sum. We surface a one-time toast on save.
- **Ancillary units** (parking, storage): often have their own share or 0. We don't auto-exclude them — the deed decides. Documented in tooltip.
- **Negative or non-numeric input**: validation rejects (>= 0 only).
- **Existing rules** unaffected (new method is opt-in).

## UI

### Property edit dialog
- New collapsible "Millièmes" section: base selector (1000 / 10000 / custom), keys editor (chip list, `general` always present), and a per-unit table to enter shares for each key. Live total per key with diff vs base.

### Unit edit dialog / Unit detail
- New "Co-ownership shares" panel: read-only when the property has no keys configured; otherwise one numeric input per key, with placeholder showing the property base for context.

### Unit list (`src/pages/Units.tsx`)
- Add an optional column "Millième (general)" displaying the unit's `general` share, sortable. Hidden when the property has no shares defined to avoid clutter; can be a follow-up.

### Allocation rule dialog
- Add `"millième"` to the method dropdown.
- When picked, show a `shareKey` select populated from the property's `millièmeKeys`.
- Add a live preview table listing units, their share, computed % of total, and projected amount based on a sample cost.
- Validation warnings (sum ≠ base, excluded units, missing shares) surfaced inline.

## i18n
Add EN/FR keys for: `costs.methodOpt.millième`, `costs.shareKey`, `costs.shareKeyGeneral`, `units.millième`, `units.millièmeBase`, `units.millièmeKeys`, `units.millièmeShares`, `properties.millièmes`, `properties.millièmeBase`, validation warnings.

## Out of scope (flagged for later)
- Tantième-by-tantième invoicing on the lease side (we still compute total recoverable charge per unit and the existing reconciliation handles it).
- Importing millièmes from a CSV of the deed (manual entry only for now).
- Historization of share changes (deed amendments) — current value applies to all future allocations.

## Files to touch
- `src/types/index.ts`, `src/types/costs.ts` (types, labels).
- `src/lib/costAllocation.ts` (new branch + warnings).
- `src/pages/AllocationRules.tsx` (method option, shareKey field, preview).
- `src/pages/Properties.tsx` / property edit dialog (base + keys + per-unit grid).
- `src/components/units/*` and `src/pages/UnitDetail.tsx` (shares panel).
- `src/i18n/translations.ts`.
- One Supabase migration: add `millieme_shares jsonb default '{}'::jsonb` and `millieme_base int default 1000` on `units`; `millieme_base int default 1000` + `millieme_keys text[] default array['general']` on `properties`; `share_key text` on `allocation_rules`.
