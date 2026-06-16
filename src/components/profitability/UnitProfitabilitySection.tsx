import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useUnitProfitability } from "@/hooks/use-profitability";
import { defaultPeriod, ytdPeriod, allTimePeriod, type Period } from "@/lib/profitability";
import { ProfitabilityBar } from "./ProfitabilityBar";

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
  const { t } = useSettings();
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
  const showRegularization = !isFlatRate && Math.abs(p.recovery.regularizationDelta) > 0.5;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
    <Card>
      <CollapsibleTrigger asChild>
        <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0 gap-2">
          <CardTitle className="text-base font-medium flex-1 justify-start">{t("prof.title")}</CardTitle>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Badge variant="secondary" className="text-[10px]">{t("prof.beforeFinancing")}</Badge>
            <div className="flex rounded-md border border-border overflow-hidden">
              {(["ytd", "12m", "all"] as PresetKey[]).map(k => (
                <Button key={k} variant={preset === k ? "default" : "ghost"} size="sm"
                  className="h-7 rounded-none px-2 text-xs"
                  onClick={() => setPreset(k)}>
                  {k === "ytd" ? t("prof.period.ytd") : k === "12m" ? t("prof.period.12m") : t("prof.period.all")}
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

          <ProfitabilityBar revenue={p.revenue.egi} ownerBorne={p.recovery.ownerBorne} noi={p.noi}
            currencyCode={cur} locale={locale} />

          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">{t("prof.group.income")}</p>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              <KpiCard label={t("prof.kpi.billedRent")} value={formatCurrency(p.revenue.billedRent, cur, locale)} hint={t("prof.kpi.billedRentHint")} />
              <KpiCard label={t("prof.kpi.collectedRent")} value={formatCurrency(p.revenue.collectedRent, cur, locale)} hint={t("prof.kpi.collectedRentHint")} />
              <KpiCard label={t("prof.kpi.vacancyLoss")} value={formatCurrency(p.revenue.vacancyLoss, cur, locale)} hint={t("prof.kpi.vacancyLossHint")} />
              <KpiCard label={t("prof.kpi.unpaidLoss")} value={formatCurrency(p.revenue.unpaidLoss, cur, locale)} hint={t("prof.kpi.unpaidLossHint")} />
              <KpiCard label={t("prof.kpi.egi")} value={formatCurrency(p.revenue.egi, cur, locale)} hint={t("prof.kpi.egiHint")} />
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">{t("prof.group.costs")}</p>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              <KpiCard label={t("prof.kpi.actualCharges")} value={formatCurrency(p.costs.directCharges + p.costs.allocatedCharges, cur, locale)} />
              <KpiCard label={t("prof.kpi.actualTaxes")} value={formatCurrency(p.costs.directTaxes + p.costs.allocatedTaxes, cur, locale)} />
              <KpiCard label={t("prof.kpi.recovered")} value={formatCurrency(p.recovery.actualRecovered, cur, locale)} />
              <KpiCard label={t("prof.recovery.ownerBorne")} value={formatCurrency(p.recovery.ownerBorne, cur, locale)} />
              <KpiCard label={t("prof.kpi.recoveryRatio")} value={pct(p.recovery.recoveryRatio)} hint={t("prof.kpi.recoveryRatioHint")} />
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">{t("prof.group.return")}</p>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              <KpiCard label={t("prof.kpi.noi")} value={formatCurrency(p.noi, cur, locale)} hint={t("prof.kpi.noiHint")} />
              <KpiCard label={t("prof.kpi.noiMargin")} value={pct(p.noiMargin)} hint={t("prof.kpi.noiMarginHint")} />
              <KpiCard label={t("prof.kpi.grossYield")} value="—" hint={`${t("prof.kpi.grossYieldHint")} ${t("prof.kpi.yieldUnavailable")}`} tone="muted" />
              <KpiCard label={t("prof.kpi.netYield")} value="—" hint={`${t("prof.kpi.netYieldHint")} ${t("prof.kpi.yieldUnavailable")}`} tone="muted" />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">{t("prof.costs.title")}</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <Row label={t("prof.costs.directUnitCharges")} value={formatCurrency(p.costs.directCharges, cur, locale)} />
                <Row label={t("prof.costs.directUnitTaxes")} value={formatCurrency(p.costs.directTaxes, cur, locale)} />
                <Row label={t("prof.costs.allocPropCharges")} value={formatCurrency(p.costs.allocatedCharges, cur, locale)} />
                <Row label={t("prof.costs.allocPropTaxes")} value={formatCurrency(p.costs.allocatedTaxes, cur, locale)} />
                <Row strong label={t("prof.costs.ownerBorneNet")} value={formatCurrency(p.recovery.ownerBorne, cur, locale)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">{t("prof.recovery.title")}</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <div className="space-y-1.5">
                    <Row label={t("prof.recovery.provisionsBilled")} value={formatCurrency(p.recovery.provisionsBilled, cur, locale)} />
                    <Row label={t("prof.recovery.actualRecoverable")} value={formatCurrency(p.recovery.actualRecoverable, cur, locale)} />
                    <RowWithHint label={t("prof.recovery.regularizationDelta")}
                      hint={t("prof.recovery.regularizationHint")}
                      value={formatCurrency(p.recovery.regularizationDelta, cur, locale)}
                      tone={p.recovery.regularizationDelta > 0 ? "warn" : p.recovery.regularizationDelta < 0 ? "success" : undefined} />
                  </div>
                  <div className="space-y-1.5">
                    <Row label={t("prof.recovery.provisionsCollected")} value={formatCurrency(p.recovery.provisionsCollected, cur, locale)} />
                    <Row label={t("prof.recovery.recovered")} value={formatCurrency(p.recovery.actualRecovered, cur, locale)} />
                    {p.recovery.provisionsSurplus > 0 && (
                      <Row label={t("prof.recovery.provisionsSurplus")} value={formatCurrency(p.recovery.provisionsSurplus, cur, locale)} tone="success" />
                    )}
                    <Row strong label={t("prof.recovery.ownerBorneRemainder")} value={formatCurrency(p.recovery.ownerBorne, cur, locale)} />
                  </div>
                </div>
                {isFlatRate && (
                  <Alert className="mt-3"><AlertDescription className="text-xs">{t("prof.recovery.flatRateNote")}</AlertDescription></Alert>
                )}
                {showRegularization && (
                  <p className="text-xs text-muted-foreground mt-2">{t("prof.recovery.regularizationNote")}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <p className="text-[11px] text-muted-foreground">{t("prof.operationalOnlyFooter")}</p>
        </CardContent>
      </CollapsibleContent>
    </Card>
    </Collapsible>
  );
}

function RowWithHint({ label, hint, value, tone }:
  { label: string; hint: string; value: string; tone?: "warn" | "success" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-xs inline-flex items-center gap-1">
        {label}
        <TooltipProvider><Tooltip>
          <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/70" /></TooltipTrigger>
          <TooltipContent><p className="text-xs max-w-[220px]">{hint}</p></TooltipContent>
        </Tooltip></TooltipProvider>
      </span>
      <span className={cn("text-sm tabular-nums",
        tone === "warn" && "text-warning",
        tone === "success" && "text-success",
      )}>{value}</span>
    </div>
  );
}