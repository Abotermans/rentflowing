## Goal
Add explanatory tooltips to every revenue (Income) KPI card in the Operational Return section, and audit existing tooltips so the label ("title") and hint ("description") match in English and French.

## Scope
Applies to the **Income** group on both:
- `src/components/profitability/PropertyProfitabilitySection.tsx` (cards: Theoretical rent, Billed rent, Collected rent, Vacancy loss, Unpaid loss, EGI)
- `src/components/profitability/UnitProfitabilitySection.tsx` (cards: Billed rent, Collected rent, Vacancy loss, Unpaid loss, EGI)

Today only **EGI** has a tooltip in the Income group. The other revenue cards have none.

## Changes

### 1. Add `hint` to every Income KPI card
Wire `hint={t("prof.kpi.<key>Hint")}` to: `theoreticalRent`, `billedRent`, `collectedRent`, `vacancyLoss`, `unpaidLoss`. EGI already has one (kept, but text refined — see below).

### 2. New translation keys (added to EN and FR blocks in `src/i18n/translations.ts`)

| Key | EN | FR |
|---|---|---|
| `prof.kpi.theoreticalRentHint` | Contractual rent expected over the period, before vacancy and unpaid amounts. | Loyer contractuel attendu sur la période, avant vacance et impayés. |
| `prof.kpi.billedRentHint` | Rent actually invoiced to tenants over the period (excludes vacant time). | Loyer effectivement facturé aux locataires sur la période (hors vacance). |
| `prof.kpi.collectedRentHint` | Rent actually received from tenants over the period. | Loyer effectivement encaissé auprès des locataires sur la période. |
| `prof.kpi.vacancyLossHint` | Rent lost while the unit was unoccupied: theoretical rent − billed rent. | Loyer perdu pendant la vacance du lot : loyer théorique − loyer facturé. |
| `prof.kpi.unpaidLossHint` | Billed rent that has not been collected: billed rent − collected rent. | Loyer facturé non encaissé : loyer facturé − loyer encaissé. |

### 3. Audit & align existing hints (EN ↔ FR parity)
Rewrite the existing keys so the English and French versions describe the same thing in the same structure:

- `prof.kpi.egiHint`
  - EN: `Effective Gross Income = collected rent − vacancy loss − unpaid loss. Other income is not tracked.`
  - FR: `Revenu brut effectif = loyer encaissé − perte sur vacance − perte sur impayés. Autres revenus non suivis.`
  - (Current EN says "billed rent −" while FR says "loyer facturé −"; aligned to the formula actually used by `useProfitability`. Will confirm against `src/lib/profitability.ts` before writing and adjust to match the real formula on both sides.)

- `prof.kpi.noiHint`
  - EN: `Net Operating Income — operational return. EGI − owner-borne charges and taxes. Excludes loans, interest, and debt service.`
  - FR: `Résultat d'exploitation net — rendement opérationnel. EGI − charges et taxes à la charge du bailleur. Hors emprunts, intérêts et service de la dette.`

- `prof.kpi.oerHint`
  - EN: `Operating Expense Ratio = owner-borne charges and taxes / EGI.`
  - FR: `Ratio des charges d'exploitation = charges et taxes à la charge du bailleur / EGI.`

- `prof.kpi.recoveryRatioHint`
  - EN: `Provisions collected from tenants / actual recoverable charges. Capped at 100%.`
  - FR: `Provisions encaissées auprès des locataires / charges récupérables réelles. Plafonné à 100 %.`

- `prof.kpi.yieldUnavailable`
  - EN: `Add a property valuation to compute yields.`
  - FR: `Ajoutez une valorisation du bien pour calculer les rendements.`

### 4. Labels (titles) parity check
Labels are already symmetric (e.g. `NOI` / `NOI`, `Billed rent` / `Loyer facturé`). No label changes required.

## Out of scope
- Cost cards, Return cards (other than the hint-text alignment above), the breakdown tables, the per-unit table.
- No business-logic changes; presentation/i18n only.

## Verification
After edits: visually check Property and Unit pages with language toggled EN/FR — every Income card shows an `Info` icon with a matching tooltip, and existing tooltips read consistently across both languages.