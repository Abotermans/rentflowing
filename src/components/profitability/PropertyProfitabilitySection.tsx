import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { usePropertyProfitability, useProfitabilityInputs } from "@/hooks/use-profitability";
import {
  defaultPeriod, ytdPeriod, allTimePeriod,
  getUnitProfitability, type Period,
} from "@/lib/profitability";
import { ProfitabilityBar } from "./ProfitabilityBar";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";

type PresetKey = "ytd" | "12m" | "all";

function pct(v: number | null): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function KpiCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "default" | "muted" }) {
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

export function PropertyProfitabilitySection({ propertyId }: { propertyId: string }) {
  const { t } = useSettings();
  const { properties, units } = useAppData();
  const property = properties.find(p => p.id === propertyId);
  const [preset, setPreset] = useState<PresetKey>("12m");
  const [open, setOpen] = useState(true);

  const period: Period = useMemo(() => {
    if (preset === "ytd") return ytdPeriod();
    if (preset === "all") return allTimePeriod();
    return defaultPeriod();
  }, [preset]);

  const p = usePropertyProfitability(propertyId, period);
  const inputs = useProfitabilityInputs();
  const propUnits = useMemo(() => units.filter(u => u.propertyId === propertyId), [units, propertyId]);
  const cur = p.currencyCode;
  const locale = property?.locale ?? "fr-FR";

  const unitRows = useMemo(() => propUnits.map(u => {
    const up = getUnitProfitability(u.id, inputs, property ?? null, period);
    return { unit: u, prof: up };
  }), [propUnits, inputs, property, period]);

  type SortKey = "unit" | "billed" | "collected" | "costs" | "taxes" | "recovered" | "noi" | "margin" | "recovery";
  const { sort, toggle } = useTableSort<SortKey>("noi", "desc");
  const sortedRows = useMemo(() => sortRows(unitRows, sort, (row, k) => {
    switch (k) {
      case "unit": return row.unit.unitCode;
      case "billed": return row.prof.revenue.billedRent;
      case "collected": return row.prof.revenue.collectedRent;
      case "costs": return row.prof.costs.directCharges + row.prof.costs.allocatedCharges;
      case "taxes": return row.prof.costs.directTaxes + row.prof.costs.allocatedTaxes;
      case "recovered": return row.prof.recovery.actualRecovered;
      case "noi": return row.prof.noi;
      case "margin": return row.prof.noiMargin ?? -Infinity;
      case "recovery": return row.prof.recovery.recoveryRatio ?? -Infinity;
    }
  }), [unitRows, sort]);

  const showRegularization = Math.abs(p.recovery.regularizationDelta) > 0.5;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
    <Card>
      <CollapsibleTrigger asChild>
        <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0 gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
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
          <Alert className="py-2">
            <AlertDescription className="text-xs">{t("prof.beforeFinancingNote")}</AlertDescription>
          </Alert>

          {/* Revenue vs Costs vs NOI summary bar */}
          <ProfitabilityBar revenue={p.revenue.egi} ownerBorne={p.recovery.ownerBorne} noi={p.noi}
            currencyCode={cur} locale={locale} />

          {/* Income KPIs */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">{t("prof.group.income")}</p>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              <KpiCard label={t("prof.kpi.theoreticalRent")} value={formatCurrency(p.revenue.theoreticalRent, cur, locale)} />
              <KpiCard label={t("prof.kpi.billedRent")} value={formatCurrency(p.revenue.billedRent, cur, locale)} />
              <KpiCard label={t("prof.kpi.collectedRent")} value={formatCurrency(p.revenue.collectedRent, cur, locale)} />
              <KpiCard label={t("prof.kpi.vacancyLoss")} value={formatCurrency(p.revenue.vacancyLoss, cur, locale)} />
              <KpiCard label={t("prof.kpi.unpaidLoss")} value={formatCurrency(p.revenue.unpaidLoss, cur, locale)} />
              <KpiCard label={t("prof.kpi.egi")} value={formatCurrency(p.revenue.egi, cur, locale)} hint={t("prof.kpi.egiHint")} />
            </div>
          </div>

          {/* Return KPIs */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">{t("prof.group.return")}</p>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              <KpiCard label={t("prof.kpi.noi")} value={formatCurrency(p.noi, cur, locale)} hint={t("prof.kpi.noiHint")} />
              <KpiCard label={t("prof.kpi.noiMargin")} value={pct(p.noiMargin)} />
              <KpiCard label={t("prof.kpi.oer")} value={pct(p.oer)} hint={t("prof.kpi.oerHint")} />
              <KpiCard label={t("prof.kpi.recoveryRatio")} value={pct(p.recovery.recoveryRatio)} hint={t("prof.kpi.recoveryRatioHint")} />
              <KpiCard label={t("prof.kpi.grossYield")} value="—" hint={t("prof.kpi.yieldUnavailable")} tone="muted" />
              <KpiCard label={t("prof.kpi.netYield")} value="—" hint={t("prof.kpi.yieldUnavailable")} tone="muted" />
            </div>
          </div>

          {/* Cost & recovery breakdown */}
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">{t("prof.costs.title")}</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <div className="grid grid-cols-3 text-[11px] uppercase tracking-wide text-muted-foreground pb-1 border-b border-border">
                  <span />
                  <span className="text-right">{t("prof.costs.charges")}</span>
                  <span className="text-right">{t("prof.costs.taxes")}</span>
                </div>
                <BreakdownRow label={t("prof.costs.directProperty")}
                  charges={p.costs.directCharges} taxes={p.costs.directTaxes} cur={cur} locale={locale} />
                <BreakdownRow label={t("prof.costs.directUnit")}
                  charges={p.costs.allocatedCharges} taxes={p.costs.allocatedTaxes} cur={cur} locale={locale} />
                <BreakdownRow strong label={t("prof.costs.totalActual")}
                  charges={p.costs.directCharges + p.costs.allocatedCharges}
                  taxes={p.costs.directTaxes + p.costs.allocatedTaxes} cur={cur} locale={locale} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">{t("prof.recovery.title")}</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <Row label={t("prof.recovery.provisionsBilled")} value={formatCurrency(p.recovery.provisionsBilled, cur, locale)} />
                <Row label={t("prof.recovery.actualRecoverable")} value={formatCurrency(p.recovery.actualRecoverable, cur, locale)} />
                <Row label={t("prof.recovery.provisionsCollected")} value={formatCurrency(p.recovery.provisionsCollected, cur, locale)} />
                <Row label={t("prof.recovery.recovered")} value={formatCurrency(p.recovery.actualRecovered, cur, locale)} />
                {p.recovery.provisionsSurplus > 0 && (
                  <Row label={t("prof.recovery.provisionsSurplus")} value={formatCurrency(p.recovery.provisionsSurplus, cur, locale)} tone="success" />
                )}
                <Row label={t("prof.recovery.regularizationDelta")}
                  value={formatCurrency(p.recovery.regularizationDelta, cur, locale)}
                  tone={p.recovery.regularizationDelta > 0 ? "warn" : p.recovery.regularizationDelta < 0 ? "success" : undefined} />
                <Row strong label={t("prof.recovery.ownerBorne")} value={formatCurrency(p.recovery.ownerBorne, cur, locale)} />
              </CardContent>
            </Card>
          </div>

          {showRegularization && (
            <p className="text-xs text-muted-foreground">{t("prof.recovery.regularizationNote")}</p>
          )}

          {/* Per-unit ranked table */}
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead<SortKey> sortKey="unit" sort={sort} onSort={toggle} className="text-xs">{t("prof.table.unit")}</SortableTableHead>
                  <SortableTableHead<SortKey> sortKey="billed" sort={sort} onSort={toggle} align="right" className="text-xs">{t("prof.table.billedRent")}</SortableTableHead>
                  <SortableTableHead<SortKey> sortKey="collected" sort={sort} onSort={toggle} align="right" className="text-xs">{t("prof.table.collected")}</SortableTableHead>
                  <SortableTableHead<SortKey> sortKey="costs" sort={sort} onSort={toggle} align="right" className="text-xs">{t("prof.table.actualCosts")}</SortableTableHead>
                  <SortableTableHead<SortKey> sortKey="taxes" sort={sort} onSort={toggle} align="right" className="text-xs">{t("prof.table.taxes")}</SortableTableHead>
                  <SortableTableHead<SortKey> sortKey="recovered" sort={sort} onSort={toggle} align="right" className="text-xs">{t("prof.table.recovered")}</SortableTableHead>
                  <SortableTableHead<SortKey> sortKey="noi" sort={sort} onSort={toggle} align="right" className="text-xs">{t("prof.table.noi")}</SortableTableHead>
                  <SortableTableHead<SortKey> sortKey="margin" sort={sort} onSort={toggle} align="right" className="text-xs">{t("prof.table.noiMargin")}</SortableTableHead>
                  <SortableTableHead<SortKey> sortKey="recovery" sort={sort} onSort={toggle} align="right" className="text-xs">{t("prof.table.recovery")}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-6">{t("prof.table.noUnits")}</TableCell></TableRow>
                )}
                {sortedRows.map(({ unit, prof }) => {
                  const charges = prof.costs.directCharges + prof.costs.allocatedCharges;
                  const taxes = prof.costs.directTaxes + prof.costs.allocatedTaxes;
                  
                  return (
                <TableRow key={unit.id}>
                      <TableCell className="text-sm">
                        <Link to={`/units/${unit.id}`} className="hover:underline">{unit.unitCode}</Link>
                      </TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground tabular-nums">{formatCurrency(prof.revenue.billedRent, cur, locale)}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground tabular-nums">{formatCurrency(prof.revenue.collectedRent, cur, locale)}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground tabular-nums">{formatCurrency(charges, cur, locale)}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground tabular-nums">{formatCurrency(taxes, cur, locale)}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground tabular-nums">{formatCurrency(prof.recovery.actualRecovered, cur, locale)}</TableCell>
                      <TableCell className={cn("text-sm text-right tabular-nums font-medium", prof.noi < 0 && "text-destructive")}>{formatCurrency(prof.noi, cur, locale)}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground tabular-nums">{pct(prof.noiMargin)}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground tabular-nums">{pct(prof.recovery.recoveryRatio)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <p className="text-[11px] text-muted-foreground">{t("prof.operationalOnlyFooter")}</p>
        </CardContent>
      </CollapsibleContent>
    </Card>
    </Collapsible>
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

function BreakdownRow({ label, charges, taxes, cur, locale, strong }:
  { label: string; charges: number; taxes: number; cur: string; locale: string; strong?: boolean }) {
  return (
    <div className={cn("grid grid-cols-3 items-center", strong && "pt-1 mt-1 border-t border-border font-medium")}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm tabular-nums text-right">{formatCurrency(charges, cur, locale)}</span>
      <span className="text-sm tabular-nums text-right">{formatCurrency(taxes, cur, locale)}</span>
    </div>
  );
}