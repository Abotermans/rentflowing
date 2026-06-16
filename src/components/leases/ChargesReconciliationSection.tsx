import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Trash2, Calculator, Info, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Lease } from "@/types";
import type { ReconciliationResolution } from "@/types/chargesReconciliation";
import { suggestResolution, computeLeaseCostOverview, type ReconciliationWindow } from "@/lib/chargesReconciliation";

interface Props { lease: Lease; currency: string; locale: string; }

export function ChargesReconciliationSection({ lease, currency, locale }: Props) {
  const { t } = useSettings();
  const { toast } = useToast();
  const {
    getChargesReconciliationsByLease,
    previewChargesReconciliation,
    applyChargesReconciliation,
    deleteChargesReconciliation,
    leaseUnitAssignments,
    units,
    costAllocationResults,
    costEntries,
  } = useAppData();

  const mode = lease.chargesBillingMode ?? "provision-reconciled";
  const history = getChargesReconciliationsByLease(lease.id);
  const [sectionOpen, setSectionOpen] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  const lastEnd = history[0]?.periodEnd ?? null;
  const defaultStart = lastEnd ?? lease.startDate;

  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(today);
  const [resolution, setResolution] = useState<ReconciliationResolution>("none");
  const [notes, setNotes] = useState("");

  const window: ReconciliationWindow = { start, end };
  const breakdown = useMemo(() => {
    if (!open) return null;
    if (!start || !end || end < start) return null;
    return previewChargesReconciliation(lease.id, window);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, start, end, lease.id]);

  const overview = useMemo(
    () => computeLeaseCostOverview(lease, leaseUnitAssignments, units, costAllocationResults, costEntries),
    [lease, leaseUnitAssignments, units, costAllocationResults, costEntries],
  );

  const overviewCard = (
    <div className="space-y-2">
      <Label className="text-xs">{t("reconciliation.overview.title")}</Label>
      <div className="rounded border overflow-hidden">
        <Table className="[&_th]:px-2 [&_td]:px-2">
          <TableHeader>
            <TableRow className="h-8">
              <TableHead className="h-8 text-xs">{t("reconciliation.col.cost")}</TableHead>
              <TableHead className="h-8 text-xs">{t("reconciliation.overview.col.unit")}</TableHead>
              <TableHead className="h-8 text-xs">{t("reconciliation.col.period")}</TableHead>
              <TableHead className="h-8 text-xs">{t("reconciliation.overview.col.bearer")}</TableHead>
              <TableHead className="h-8 text-xs text-right">{t("reconciliation.overview.col.totalAmount")}</TableHead>
              <TableHead className="h-8 text-xs text-right">{t("reconciliation.col.full")}</TableHead>
              <TableHead className="h-8 text-xs text-right">{t("reconciliation.col.overlap")}</TableHead>
              <TableHead className="h-8 text-xs text-right">{t("reconciliation.col.prorated")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overview.lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-xs text-muted-foreground text-center py-3">
                  {t("reconciliation.overview.empty")}
                </TableCell>
              </TableRow>
            ) : overview.lines.map((l, idx) => (
              <TableRow key={`${l.costEntryId}-${l.unitId}-${idx}`} className="h-8">
                <TableCell className="text-xs">
                  <Link to={`/costs/entries?edit=${l.costEntryId}`} className="hover:underline text-primary">
                    {l.costLabel}
                  </Link>
                </TableCell>
                <TableCell className="text-xs">
                  <div className="flex items-center gap-1">
                    <span>{l.unitLabel}</span>
                    {l.addedByAmendment && (
                      <span className="text-[10px] text-primary border border-primary/30 rounded px-1 py-0">
                        {t("reconciliation.overview.addedByAmendment")}
                      </span>
                    )}
                    {l.removedByAmendment && (
                      <span className="text-[10px] text-muted-foreground border border-border rounded px-1 py-0">
                        {t("reconciliation.overview.removedByAmendment")}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs">{formatDate(l.costPeriodStart, locale)} → {formatDate(l.costPeriodEnd, locale)}</TableCell>
                <TableCell className="text-xs">
                  {l.recoveryType === "owner-only" && t("reconciliation.overview.bearer.ownerOnly" as never)}
                  {l.recoveryType === "tenant-recoverable" && t("reconciliation.overview.bearer.tenantOnly" as never)}
                  {l.recoveryType === "partially-recoverable" && t("reconciliation.overview.bearer.mix" as never)}
                  {l.recoveryType === "informational" && t("reconciliation.overview.bearer.informational" as never)}
                </TableCell>
                <TableCell className="text-xs text-right">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
                        {formatCurrency(l.allocatedAmount, currency, locale)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-sm p-3 text-xs space-y-2">
                      <div className="font-medium text-sm border-b pb-1.5">{l.costLabel}</div>
                      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                        <span className="text-muted-foreground">{t("reconciliation.overview.tip.fullCost")}</span>
                        <span className="text-right tabular-nums">{formatCurrency(l.costFullAmount, currency, locale)}</span>
                        <span className="text-muted-foreground">{t("reconciliation.overview.tip.unitShare")} ({l.unitLabel})</span>
                        <span className="text-right tabular-nums">
                          {l.costFullAmount > 0 ? `${((l.allocatedAmount / l.costFullAmount) * 100).toFixed(1)}%` : "—"}
                        </span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] gap-x-3 border-t pt-1.5">
                        <span className="font-medium">{t("reconciliation.overview.col.totalAmount")}</span>
                        <span className="text-right font-semibold tabular-nums">{formatCurrency(l.allocatedAmount, currency, locale)}</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-xs text-right">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
                        {formatCurrency(l.recoverableAmount, currency, locale)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-sm p-3 text-xs space-y-2">
                      <div className="font-medium text-sm border-b pb-1.5">{l.costLabel}</div>
                      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                        <span className="text-muted-foreground">{t("reconciliation.overview.col.totalAmount")}</span>
                        <span className="text-right tabular-nums">{formatCurrency(l.allocatedAmount, currency, locale)}</span>
                        <span className="text-muted-foreground">{t("reconciliation.overview.tip.recovery")}</span>
                        <span className="text-right">{t(`reconciliation.overview.tip.recoveryType.${l.recoveryType}` as never)}</span>
                        <span className="text-muted-foreground">{t("reconciliation.overview.tip.recoverable")}</span>
                        <span className="text-right tabular-nums">
                          {l.allocatedAmount > 0 ? `${((l.recoverableAmount / l.allocatedAmount) * 100).toFixed(0)}%` : "—"}
                        </span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] gap-x-3 border-t pt-1.5">
                        <span className="font-medium">{t("reconciliation.col.full")}</span>
                        <span className="text-right font-semibold tabular-nums">{formatCurrency(l.recoverableAmount, currency, locale)}</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-xs text-right">
                  {l.overlapDays}/{l.totalDays} {t("amendments.noticeUnit.days" as never)} ({Math.round(l.proRataFactor * 100)}%)
                </TableCell>
                <TableCell className="text-xs text-right font-medium">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
                        {formatCurrency(l.proRatedRecoverable, currency, locale)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-sm p-3 text-xs space-y-2">
                      <div className="font-medium text-sm border-b pb-1.5">{l.costLabel}</div>
                      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                        <span className="text-muted-foreground">{t("reconciliation.col.period")}</span>
                        <span className="text-right tabular-nums">{formatDate(l.costPeriodStart, locale)} → {formatDate(l.costPeriodEnd, locale)}</span>
                        <span className="text-muted-foreground">{t("reconciliation.overview.tip.timeProRata")}</span>
                        <span className="text-right tabular-nums">{l.overlapDays}/{l.totalDays}</span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] gap-x-3 border-t pt-1.5">
                        <span className="font-medium">{t("reconciliation.overview.tip.timeProRata")}</span>
                        <span className="text-right font-semibold tabular-nums">{(l.proRataFactor * 100).toFixed(1)}%</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {overview.lines.length > 0 && (
              <TableRow className="h-8 border-t bg-muted/30">
                <TableCell className="text-xs font-semibold" colSpan={4}>{t("reconciliation.overview.totals")}</TableCell>
                <TableCell className="text-xs text-right font-semibold tabular-nums">{formatCurrency(overview.totals.fullAllocated, currency, locale)}</TableCell>
                <TableCell className="text-xs text-right font-semibold tabular-nums">{formatCurrency(overview.totals.fullRecoverable, currency, locale)}</TableCell>
                <TableCell className="text-xs text-right" />
                <TableCell className="text-xs text-right font-semibold tabular-nums">{formatCurrency(overview.totals.recoverable, currency, locale)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  const openDialog = () => {
    const s = lastEnd ?? lease.startDate;
    setStart(s);
    setEnd(today);
    setResolution("none");
    setNotes("");
    setOpen(true);
  };

  // Auto-suggest resolution when delta changes
  useMemo(() => {
    if (breakdown && resolution === "none") {
      setResolution(suggestResolution(breakdown.delta));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdown?.delta]);

  const handleSave = () => {
    if (!breakdown) return;
    applyChargesReconciliation({ leaseId: lease.id, window, resolution, notes });
    toast({ title: t("reconciliation.toast.created") });
    setOpen(false);
  };

  if (mode === "flat-rate") {
    return (
      <Collapsible open={sectionOpen} onOpenChange={setSectionOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex items-center gap-1.5 flex-1 text-left">
              {t("reconciliation.title")}
              <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">
                {t("reconciliation.flatBadge")}
              </span>
            </CardTitle>
            <span className="inline-flex items-center justify-center h-7 w-7">
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", sectionOpen && "rotate-180")} />
            </span>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>{t("reconciliation.flatExplain")}</AlertDescription>
            </Alert>
            {overviewCard}
          </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>
    );
  }

  return (
    <Collapsible open={sectionOpen} onOpenChange={setSectionOpen}>
    <Card>
      <CollapsibleTrigger asChild>
        <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
          <CardTitle className="text-base font-medium flex flex-col items-start gap-0.5 flex-1 justify-start">
            <span className="leading-tight">{t("reconciliation.title")}</span>
            <span className="text-[10px] text-muted-foreground font-normal">
              {"\n"}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openDialog(); }}>
              <Calculator className="h-3.5 w-3.5 mr-1" />{t("reconciliation.runButton")}
            </Button>
            <span className="inline-flex items-center justify-center h-7 w-7">
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", sectionOpen && "rotate-180")} />
            </span>
          </div>
        </CardHeader>
      </CollapsibleTrigger>
      <CollapsibleContent>
      <CardContent className="space-y-4">
        {overviewCard}
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("reconciliation.noHistory")}</p>
        ) : (
          <div className="rounded border overflow-hidden">
            <Table className="[&_th]:px-2 [&_td]:px-2">
              <TableHeader>
                <TableRow className="h-8">
                  <TableHead className="h-8 text-xs">{t("reconciliation.periodStart")}</TableHead>
                  <TableHead className="h-8 text-xs">{t("reconciliation.periodEnd")}</TableHead>
                  <TableHead className="h-8 text-xs text-right">{t("reconciliation.provisionsCollected")}</TableHead>
                  <TableHead className="h-8 text-xs text-right">{t("reconciliation.actualRecoverable")}</TableHead>
                  <TableHead className="h-8 text-xs text-right">{t("reconciliation.delta")}</TableHead>
                  <TableHead className="h-8 text-xs">{t("reconciliation.resolution")}</TableHead>
                  <TableHead className="h-8 w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map(r => (
                  <TableRow key={r.id} className="h-8">
                    <TableCell className="text-xs">{formatDate(r.periodStart, locale)}</TableCell>
                    <TableCell className="text-xs">{formatDate(r.periodEnd, locale)}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(r.provisionsCollected, currency, locale)}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(r.actualRecoverable, currency, locale)}</TableCell>
                    <TableCell className={`text-xs text-right font-medium ${r.delta > 0 ? "text-success" : r.delta < 0 ? "text-destructive" : ""}`}>
                      {formatCurrency(r.delta, currency, locale)}
                    </TableCell>
                    <TableCell className="text-xs">{t(`reconciliation.resolution.${r.resolution === "carry-forward" ? "carry" : r.resolution}` as never)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { deleteChargesReconciliation(r.id); toast({ title: t("reconciliation.toast.deleted") }); }}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      </CollapsibleContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("reconciliation.dialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("reconciliation.periodStart")}</Label>
                <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
              </div>
              <div>
                <Label>{t("reconciliation.periodEnd")}</Label>
                <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
              </div>
            </div>

            {breakdown && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded border p-3">
                    <div className="text-[10px] uppercase text-muted-foreground">{t("reconciliation.provisionsCollected")}</div>
                    <div className="text-base font-semibold">{formatCurrency(breakdown.provisionsCollected, currency, locale)}</div>
                  </div>
                  <div className="rounded border p-3">
                    <div className="text-[10px] uppercase text-muted-foreground">{t("reconciliation.actualRecoverable")}</div>
                    <div className="text-base font-semibold">{formatCurrency(breakdown.actualRecoverable, currency, locale)}</div>
                  </div>
                  <div className={`rounded border p-3 ${breakdown.delta > 0 ? "border-success/40 bg-success/5" : breakdown.delta < 0 ? "border-destructive/40 bg-destructive/5" : ""}`}>
                    <div className="text-[10px] uppercase text-muted-foreground">
                      {Math.abs(breakdown.delta) < 0.01 ? t("reconciliation.deltaBalanced") : breakdown.delta > 0 ? t("reconciliation.deltaSurplus") : t("reconciliation.deltaShortfall")}
                    </div>
                    <div className="text-base font-semibold">{formatCurrency(breakdown.delta, currency, locale)}</div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">{t("reconciliation.costBreakdown")}</Label>
                  <div className="rounded border overflow-hidden mt-1">
                    <Table className="[&_th]:px-2 [&_td]:px-2">
                      <TableHeader>
                        <TableRow className="h-8">
                          <TableHead className="h-8 text-xs">{t("reconciliation.col.cost")}</TableHead>
                          <TableHead className="h-8 text-xs">{t("reconciliation.col.period")}</TableHead>
                          <TableHead className="h-8 text-xs text-right">{t("reconciliation.col.full")}</TableHead>
                          <TableHead className="h-8 text-xs text-right">{t("reconciliation.col.overlap")}</TableHead>
                          <TableHead className="h-8 text-xs text-right">{t("reconciliation.col.prorated")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {breakdown.lines.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-xs text-muted-foreground text-center py-3">{t("reconciliation.noCosts")}</TableCell></TableRow>
                        ) : breakdown.lines.map(l => (
                          <TableRow key={l.costEntryId} className="h-8">
                            <TableCell className="text-xs">
                              <Link to={`/costs/entries?edit=${l.costEntryId}`} className="hover:underline text-primary">
                                {l.label}
                              </Link>
                            </TableCell>
                            <TableCell className="text-xs">{formatDate(l.costPeriodStart, locale)} → {formatDate(l.costPeriodEnd, locale)}</TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(l.fullRecoverable, currency, locale)}</TableCell>
                            <TableCell className="text-xs text-right">{l.overlapDays}/{l.totalDays} ({Math.round(l.proRataFactor * 100)}%)</TableCell>
                            <TableCell className="text-xs text-right font-medium">{formatCurrency(l.proRatedRecoverable, currency, locale)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">{t("reconciliation.resolution")}</Label>
                  <RadioGroup value={resolution} onValueChange={v => setResolution(v as ReconciliationResolution)} className="mt-1 space-y-1">
                    {breakdown.delta < -0.005 && (
                      <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <RadioGroupItem value="owe" className="mt-1" />
                        <div><div className="font-medium">{t("reconciliation.resolution.owe")}</div><div className="text-xs text-muted-foreground">{t("reconciliation.resolution.oweHelp")}</div></div>
                      </label>
                    )}
                    {breakdown.delta > 0.005 && (
                      <>
                        <label className="flex items-start gap-2 text-sm cursor-pointer">
                          <RadioGroupItem value="carry-forward" className="mt-1" />
                          <div><div className="font-medium">{t("reconciliation.resolution.carry")}</div><div className="text-xs text-muted-foreground">{t("reconciliation.resolution.carryHelp")}</div></div>
                        </label>
                        <label className="flex items-start gap-2 text-sm cursor-pointer">
                          <RadioGroupItem value="refund" className="mt-1" />
                          <div><div className="font-medium">{t("reconciliation.resolution.refund")}</div><div className="text-xs text-muted-foreground">{t("reconciliation.resolution.refundHelp")}</div></div>
                        </label>
                      </>
                    )}
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="none" className="mt-1" />
                      <div><div className="font-medium">{t("reconciliation.resolution.none")}</div></div>
                    </label>
                  </RadioGroup>
                </div>

                <div>
                  <Label className="text-xs">{t("reconciliation.notes")}</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave} disabled={!breakdown}>{t("reconciliation.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
    </Collapsible>
  );
}