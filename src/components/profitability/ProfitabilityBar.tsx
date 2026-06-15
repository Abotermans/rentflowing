import { useSettings } from "@/context/SettingsContext";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  revenue: number;
  ownerBorne: number;
  noi: number;
  currencyCode: string;
  locale: string;
}

/**
 * Compact horizontal bar visualising Revenue (EGI) split into Owner-borne costs + NOI.
 * Pure CSS — no chart library.
 */
export function ProfitabilityBar({ revenue, ownerBorne, noi, currencyCode, locale }: Props) {
  const { t } = useSettings();
  const total = Math.max(0, revenue);
  const costPct = total > 0 ? Math.min(100, (Math.max(0, ownerBorne) / total) * 100) : 0;
  const noiPct = total > 0 ? Math.max(0, Math.min(100 - costPct, (Math.max(0, noi) / total) * 100)) : 0;
  const negative = noi < 0;

  return (
    <Card>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground uppercase tracking-wide">{t("prof.summary.revenue")}</span>
          <span className="tabular-nums font-medium">{formatCurrency(revenue, currencyCode, locale)}</span>
        </div>
        <div className="h-3 w-full rounded-sm overflow-hidden bg-muted flex">
          <div className="bg-warning/70 h-full" style={{ width: `${costPct}%` }} title={t("prof.summary.costs")} />
          <div className={negative ? "bg-destructive/70 h-full" : "bg-success/70 h-full"}
            style={{ width: `${noiPct}%` }} title={t("prof.summary.noi")} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-warning/70" />
            <span className="text-muted-foreground">{t("prof.summary.costs")}</span>
            <span className="ml-auto tabular-nums">{formatCurrency(ownerBorne, currencyCode, locale)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-sm ${negative ? "bg-destructive/70" : "bg-success/70"}`} />
            <span className="text-muted-foreground">{t("prof.summary.noi")}</span>
            <span className="ml-auto tabular-nums font-medium">{formatCurrency(noi, currencyCode, locale)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}