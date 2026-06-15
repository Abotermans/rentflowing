import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { useAppData } from "@/context/AppContext";
import { usePropertyProfitability, useProfitabilityInputs } from "@/hooks/use-profitability";
import {
  defaultPeriod, ytdPeriod, allTimePeriod,
  getUnitProfitability, type Period,
} from "@/lib/profitability";

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
          {/* KPI grid */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
            <KpiCard label="EGI" value={formatCurrency(p.revenue.egi, cur, locale)}
              hint="Effective Gross Income = billed rent − vacancy − unpaid. Other income unavailable." />
            <KpiCard label="NOI" value={formatCurrency(p.noi, cur, locale)}
              hint="EGI − owner-borne charges & taxes. Before financing." />
            <KpiCard label="NOI margin" value={pct(p.noiMargin)} />
            <KpiCard label="OER" value={pct(p.oer)} hint="Owner-borne / EGI" />
            <KpiCard label="Recovery ratio" value={pct(p.recovery.recoveryRatio)}
              hint="Recovered charges / recoverable charges." />
            <KpiCard label="Gross yield" value="—" hint="Unavailable — add a property valuation to enable." tone="muted" />
            <KpiCard label="Net yield" value="—" hint="Unavailable — add a property valuation to enable." tone="muted" />
          </div>

          {/* Cost & recovery breakdown */}
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">Costs (actual)</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <Row label="Property charges" value={formatCurrency(p.costs.directCharges, cur, locale)} />
                <Row label="Property taxes" value={formatCurrency(p.costs.directTaxes, cur, locale)} />
                <Row label="Unit-direct charges" value={formatCurrency(p.costs.allocatedCharges, cur, locale)} />
                <Row label="Unit-direct taxes" value={formatCurrency(p.costs.allocatedTaxes, cur, locale)} />
                <Row strong label="Total actual" value={formatCurrency(p.costs.totalActual, cur, locale)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">Recovery & owner burden</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <Row label="Provisions billed" value={formatCurrency(p.recovery.provisionsBilled, cur, locale)} />
                <Row label="Actual recoverable" value={formatCurrency(p.recovery.actualRecoverable, cur, locale)} />
                <Row label="Actually recovered" value={formatCurrency(p.recovery.actualRecovered, cur, locale)} />
                <Row label="Regularization delta"
                  value={formatCurrency(p.recovery.regularizationDelta, cur, locale)}
                  tone={p.recovery.regularizationDelta > 0 ? "warn" : p.recovery.regularizationDelta < 0 ? "success" : undefined} />
                <Row strong label="Owner-borne" value={formatCurrency(p.recovery.ownerBorne, cur, locale)} />
              </CardContent>
            </Card>
          </div>

          {/* Per-unit table */}
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Unit</TableHead>
                  <TableHead className="text-xs text-right">Billed rent</TableHead>
                  <TableHead className="text-xs text-right">Collected</TableHead>
                  <TableHead className="text-xs text-right">Actual costs</TableHead>
                  <TableHead className="text-xs text-right">Taxes</TableHead>
                  <TableHead className="text-xs text-right">Recovered</TableHead>
                  <TableHead className="text-xs text-right">NOI</TableHead>
                  <TableHead className="text-xs text-right">NOI margin</TableHead>
                  <TableHead className="text-xs text-right">Recovery</TableHead>
                  <TableHead className="text-xs">Vacancy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unitRows.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-6">No units</TableCell></TableRow>
                )}
                {unitRows.map(({ unit, prof }) => {
                  const charges = prof.costs.directCharges + prof.costs.allocatedCharges;
                  const taxes = prof.costs.directTaxes + prof.costs.allocatedTaxes;
                  return (
                    <TableRow key={unit.id}>
                      <TableCell className="text-sm">
                        <Link to={`/units/${unit.id}`} className="hover:underline">{unit.unitLabel || unit.unitCode}</Link>
                      </TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">{formatCurrency(prof.revenue.billedRent, cur, locale)}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">{formatCurrency(prof.revenue.collectedRent, cur, locale)}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">{formatCurrency(charges, cur, locale)}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">{formatCurrency(taxes, cur, locale)}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">{formatCurrency(prof.recovery.actualRecovered, cur, locale)}</TableCell>
                      <TableCell className="text-sm text-right">{formatCurrency(prof.noi, cur, locale)}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">{pct(prof.noiMargin)}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">{pct(prof.recovery.recoveryRatio)}</TableCell>
                      <TableCell className="text-sm">
                        {prof.revenue.vacancyLoss > 0
                          ? <Badge variant="outline" className="text-[10px] text-warning border-warning/40">Vacant</Badge>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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