import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronDown, TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { useAppData } from "@/context/AppContext";
import { useUnitProfitability } from "@/hooks/use-profitability";
import { defaultPeriod, ytdPeriod, allTimePeriod, type Period } from "@/lib/profitability";

type PresetKey = "ytd" | "12m" | "all";
function pct(v: number | null): string { return v === null ? "—" : `${(v * 100).toFixed(1)}%`; }

function KpiCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "muted" }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          {hint && (
            <TooltipProvider><Tooltip>
              <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
              <TooltipContent><p className="text-xs max-w-[220px]">{hint}</p></TooltipContent>
            </Tooltip></TooltipProvider>
          )}
        </div>
        <p className={cn("text-lg font-semibold mt-0.5", tone === "muted" ? "text-muted-foreground" : "text-foreground")}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "warn" | "success" }) {
  return (
    <div className={cn("flex items-center justify-between", strong && "pt-1 mt-1 border-t border-border font-medium")}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn("text-sm tabular-nums",
        tone === "warn" && "text-warning",
        tone === "success" && "text-success",
      )}>{value}</span>
    </div>
  );
}

export function UnitProfitabilitySection({ unitId }: { unitId: string }) {
  const { units, properties, getActiveLease } = useAppData();
  const unit = units.find(u => u.id === unitId);
  const property = unit ? properties.find(p => p.id === unit.propertyId) : null;
  const activeLease = getActiveLease(unitId);
  const isFlatRate = activeLease?.chargesBillingMode === "flat-rate";

  const [preset, setPreset] = useState<PresetKey>("12m");
  const [open, setOpen] = useState(true);
  const period: Period = useMemo(() => {
    if (preset === "ytd") return ytdPeriod();
    if (preset === "all") return allTimePeriod();
    return defaultPeriod();
  }, [preset]);

  const p = useUnitProfitability(unitId, period);
  const cur = p.currencyCode;
  const locale = property?.locale ?? "fr-FR";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
    <Card>
      <CollapsibleTrigger asChild>
        <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0 gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-medium flex-1 justify-start">Operational Return</CardTitle>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Badge variant="secondary" className="text-[10px]">Before financing</Badge>
            <div className="flex rounded-md border border-border overflow-hidden">
              {(["ytd", "12m", "all"] as PresetKey[]).map(k => (
                <Button key={k} variant={preset === k ? "default" : "ghost"} size="sm"
                  className="h-7 rounded-none px-2 text-xs"
                  onClick={() => setPreset(k)}>
                  {k === "ytd" ? "YTD" : k === "12m" ? "12M" : "All"}
                </Button>
              ))}
            </div>
            <span className="inline-flex items-center justify-center h-7 w-7">
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
            </span>
          </div>
        </CardHeader>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CardContent className="space-y-4">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="Billed rent" value={formatCurrency(p.revenue.billedRent, cur, locale)} />
            <KpiCard label="Collected rent" value={formatCurrency(p.revenue.collectedRent, cur, locale)} />
            <KpiCard label="Actual charges" value={formatCurrency(p.costs.directCharges + p.costs.allocatedCharges, cur, locale)} />
            <KpiCard label="Actual taxes" value={formatCurrency(p.costs.directTaxes + p.costs.allocatedTaxes, cur, locale)} />
            <KpiCard label="Recovered" value={formatCurrency(p.recovery.actualRecovered, cur, locale)} />
            <KpiCard label="NOI" value={formatCurrency(p.noi, cur, locale)}
              hint="EGI − owner-borne charges & taxes. Before financing." />
            <KpiCard label="NOI margin" value={pct(p.noiMargin)} />
            <KpiCard label="Recovery ratio" value={pct(p.recovery.recoveryRatio)} />
            <KpiCard label="Gross yield" value="—" hint="Unavailable — add a unit valuation to enable." tone="muted" />
            <KpiCard label="Net yield" value="—" hint="Unavailable — add a unit valuation to enable." tone="muted" />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">Cost breakdown</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <Row label="Direct unit charges" value={formatCurrency(p.costs.directCharges, cur, locale)} />
                <Row label="Direct unit taxes" value={formatCurrency(p.costs.directTaxes, cur, locale)} />
                <Row label="Allocated property charges" value={formatCurrency(p.costs.allocatedCharges, cur, locale)} />
                <Row label="Allocated property taxes" value={formatCurrency(p.costs.allocatedTaxes, cur, locale)} />
                <Row strong label="Owner-borne net cost" value={formatCurrency(p.recovery.ownerBorne, cur, locale)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">Charge accounting</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <Row label="Provisions billed" value={formatCurrency(p.recovery.provisionsBilled, cur, locale)} />
                <Row label="Actual recoverable charges" value={formatCurrency(p.recovery.actualRecoverable, cur, locale)} />
                <Row label="Regularization delta"
                  value={formatCurrency(p.recovery.regularizationDelta, cur, locale)}
                  tone={p.recovery.regularizationDelta > 0 ? "warn" : p.recovery.regularizationDelta < 0 ? "success" : undefined} />
                <Row label="Recovered charges" value={formatCurrency(p.recovery.actualRecovered, cur, locale)} />
                <Row strong label="Owner-borne remainder" value={formatCurrency(p.recovery.ownerBorne, cur, locale)} />
                {isFlatRate && (
                  <Alert className="mt-2"><AlertDescription className="text-xs">
                    Active lease uses flat-rate charges — provisions and regularization don't apply.
                  </AlertDescription></Alert>
                )}
              </CardContent>
            </Card>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Operational return only — financing (loans, debt service, interest) is not included.
          </p>
        </CardContent>
      </CollapsibleContent>
    </Card>
    </Collapsible>
  );
}