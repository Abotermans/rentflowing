## Changes to `src/pages/LeaseDetail.tsx` and related files

### 1. Split "Keys & Meters" card into two separate cards
- Rename existing card to "Compteurs" (Meters) — keep only electricity + water rows.
- Add unit suffix in the entry/exit Input fields:
  - Electricity entry/exit → suffix `kWh` (visible inside or to the right of the input)
  - Water entry/exit → suffix `m³`
- Remove the old simple `keysHandedOver` / `keysReturned` count inputs from this card.

### 2. New "Clés & Badges" card (separate section)
List-based UI supporting multiple items, each with:
- Type: Key or Badge (toggle/select)
- Identifier (ID/label, e.g. "Front door", "Badge #A12")
- Handover date (date picker)
- Return date (date picker, optional — empty = not returned)
- Delete row button
- "Add key" and "Add badge" buttons below the list

Empty state: "No keys or badges registered."

### 3. Remove the "Restitution" (Return) card entirely
- Delete the `Return Panel` card block (currently at lines 1085–1106).
- Keep the underlying `returnStatus` / `returnNotes` fields and the `openReturnForm` Sheet logic untouched for now (used elsewhere via move-out flow), only the visual card is removed. If unused after removal, prune dead handlers in a follow-up.

### 4. Data model (`src/types/index.ts` + `src/data/mockData.ts`)
- Add new type:
  ```ts
  type LeaseKeyItem = {
    id: string;
    kind: "key" | "badge";
    label: string;            // identifier
    handedOverDate: string | null;
    returnedDate: string | null;
  };
  ```
- Add `keys: LeaseKeyItem[]` to `Lease`.
- Seed each lease in `mockData.ts` with an empty array (or derive a couple from existing `keyHandoverCount` for the demo lease).
- Keep `keyHandoverCount` / `keyReturnCount` for backwards compatibility with the move-in/out sheets (they still use those counters); they become derived/legacy and are no longer edited from the detail page.

### 5. i18n
Add EN/FR keys under `detail.*`:
- `detail.meters` ("Compteurs" / "Meters")
- `detail.keysBadges` ("Clés & badges" / "Keys & badges")
- `detail.addKey`, `detail.addBadge`
- `detail.identifier`, `detail.handedOver`, `detail.returned`
- `detail.noKeysBadges`
- `detail.kindKey`, `detail.kindBadge`

### Out of scope
- No changes to the Move-in / Move-out Sheets.
- Receivables, guarantee, checklist sections untouched.
