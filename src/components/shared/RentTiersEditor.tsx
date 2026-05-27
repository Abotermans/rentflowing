import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { formatCurrency } from "@/lib/formatters";

export interface RentTiersEditorProps {
  baseRent: number | null;
  rentTiers: { durationMonths: number; monthlyRent: number }[];
  currencyCode: string;
  locale?: string;
  onChange: (baseRent: number | null, rentTiers: { durationMonths: number; monthlyRent: number }[]) => void;
}

/**
 * Editable rent-tiers grid. The first row is always the 1-month tier (mapped to
 * `baseRent`). All other rows live in `rentTiers` with any integer duration ≥ 2.
 */
export function RentTiersEditor({ baseRent, rentTiers, currencyCode, locale, onChange }: RentTiersEditorProps) {
  const { t } = useSettings();

  const updateBase = (value: number | null) => onChange(value, rentTiers);
  const updateTier = (idx: number, patch: Partial<{ durationMonths: number; monthlyRent: number }>) => {
    const next = rentTiers.map((tier, i) => (i === idx ? { ...tier, ...patch } : tier));
    onChange(baseRent, next);
  };
  const removeTier = (idx: number) => onChange(baseRent, rentTiers.filter((_, i) => i !== idx));
  const addTier = () => {
    const used = new Set([1, ...rentTiers.map(t => t.durationMonths)]);
    let next = 6;
    while (used.has(next)) next += 1;
    onChange(baseRent, [...rentTiers, { durationMonths: next, monthlyRent: baseRent ?? 0 }]);
  };

  const totalFor = (months: number, rent: number | null) =>
    rent != null ? formatCurrency(months * rent, currencyCode, locale) : "—";

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs w-[140px]">{t("units.advancePeriodMonths")}</TableHead>
            <TableHead className="text-xs">{t("units.monthlyRent")} ({currencyCode})</TableHead>
            <TableHead className="text-xs text-right">{t("units.totalForPeriod")}</TableHead>
            <TableHead className="w-[40px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>
              <Input type="number" value={1} disabled className="h-8" />
            </TableCell>
            <TableCell>
              <Input
                type="number" min={0}
                value={baseRent ?? ""}
                onChange={e => updateBase(e.target.value ? Number(e.target.value) : null)}
                className="h-8"
              />
            </TableCell>
            <TableCell className="text-right text-sm text-muted-foreground">{totalFor(1, baseRent)}</TableCell>
            <TableCell />
          </TableRow>
          {rentTiers.map((tier, idx) => (
            <TableRow key={idx}>
              <TableCell>
                <Input
                  type="number" min={2} step={1}
                  value={tier.durationMonths}
                  onChange={e => updateTier(idx, { durationMonths: Math.max(2, Number(e.target.value) || 2) })}
                  className="h-8"
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number" min={0}
                  value={tier.monthlyRent}
                  onChange={e => updateTier(idx, { monthlyRent: Number(e.target.value) || 0 })}
                  className="h-8"
                />
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">{totalFor(tier.durationMonths, tier.monthlyRent)}</TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeTier(idx)} aria-label={t("action.delete")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button type="button" variant="outline" size="sm" className="h-8" onClick={addTier}>
        <Plus className="h-3.5 w-3.5 mr-1" />{t("units.addTier")}
      </Button>
    </div>
  );
}