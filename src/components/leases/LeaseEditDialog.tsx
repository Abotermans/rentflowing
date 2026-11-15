import { useState, useMemo, useEffect, useCallback } from "react";
import { propertyBusinessDateISO } from "@/lib/businessTimeZone";
import { useAppData } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Plus, X as XIcon, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Lease, RentFormula, getTenantFullName, isAncillaryUnitType } from "@/types";
import { useSettings } from "@/context/SettingsContext";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { validateLeaseUnits, type DraftAssignment } from "@/lib/integrity/leaseUnitAssignmentIntegrity";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DateInput } from "@/components/shared/DateInput";
import { Switch } from "@/components/ui/switch";
import { getAllRentTiers, getMonthlyRentForMonths } from "@/lib/rentTiers";
import { formatCurrency as fmtCurrency, getCurrencySymbol } from "@/lib/formatters";
import { parseNoticeText, serializeNotice, type NoticeUnit } from "@/lib/noticePeriod";
import { validateDateOrder } from "@/lib/dateValidation";

type LeaseFormData = Omit<Lease, "id" | "createdAt" | "updatedAt">;

type UnitRow = {
  unitId: string;
  rentShare: number;
  chargesShare: number;
  startDate: string;
  endDate: string | null;
};

export interface LeaseEditDialogProps {
  lease: Lease;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function LeaseEditDialog({ lease, open, onOpenChange, onSaved }: LeaseEditDialogProps) {
  const {
    units, properties, tenants,
    getLeaseAssignments,
    updateLeaseWithAssignmentsPersisted,
  } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const integrityState = useIntegrityState();
  const isMainRow = useCallback((row: Pick<UnitRow, "unitId">) => {
    const unit = units.find(u => u.id === row.unitId);
    return !!unit && !isAncillaryUnitType(unit.unitType);
  }, [units]);
  const [form, setForm] = useState<LeaseFormData>(() => {
    const { id, createdAt, updatedAt, ...rest } = lease;
    return rest;
  });
  const [unitRows, setUnitRows] = useState<UnitRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const { id, createdAt, updatedAt, ...rest } = lease;
      setForm(rest);
      const today = propertyBusinessDateISO(properties.find(property => property.id === lease.propertyId));
      const all = getLeaseAssignments(lease.id)
        .filter(a => !a.endDate || a.endDate >= today)
        .sort((a, b) => Number(isMainRow(b)) - Number(isMainRow(a)));
      const rows: UnitRow[] = all.map(a => {
        return {
          unitId: a.unitId,
          rentShare: a.rentShare ?? 0,
          chargesShare: a.chargesShare ?? 0,
          startDate: a.startDate ?? lease.startDate ?? "",
          endDate: a.endDate ?? lease.endDate ?? null,
        };
      });
      if (!rows.some(isMainRow) && lease.unitId) {
        rows.unshift({
          unitId: lease.unitId,
          rentShare: lease.monthlyRent,
          chargesShare: lease.monthlyCharges,
          startDate: lease.startDate ?? "",
          endDate: lease.endDate ?? null,
        });
      }
      setUnitRows(rows);
    }
  }, [open, lease, properties, getLeaseAssignments, isMainRow]);

  const formUnits = units.filter(u => u.propertyId === form.propertyId);
  const selectedProperty = useMemo(
    () => properties.find(p => p.id === form.propertyId),
    [properties, form.propertyId],
  );

  const commonTiers = useMemo(() => {
    const rowsWithUnits = unitRows
      .map(r => units.find(u => u.id === r.unitId))
      .filter((u): u is NonNullable<typeof u> => !!u);
    if (rowsWithUnits.length === 0) return [];
    const perUnit = rowsWithUnits.map(u =>
      new Map(getAllRentTiers(u).map(t => [t.durationMonths, t.monthlyRent])),
    );
    const [first, ...rest] = perUnit;
    return [...first.entries()]
      .filter(([months]) => rest.every(m => m.has(months)))
      .map(([durationMonths]) => ({ durationMonths }))
      .sort((a, b) => a.durationMonths - b.durationMonths);
  }, [unitRows, units]);

  if (form.rentFormula !== 1 && unitRows.length > 0 && !commonTiers.some(t => t.durationMonths === form.rentFormula)) {
    Promise.resolve().then(() => {
      setForm(f => ({
        ...f,
        rentFormula: 1,
        hasAdvancePayment: false,
        advancePaymentAmount: null,
        advancePaymentDate: null,
        advanceAllocationMethod: null,
        advanceAppliedTo: null,
        advanceAllocationStartDate: null,
        advanceAllocationDurationMonths: null,
        fixedMonthlyReductionAmount: null,
      }));
    });
  }

  const totalRent = unitRows.reduce((s, r) => s + (r.rentShare ?? 0), 0);
  const totalCharges = unitRows.reduce((s, r) => s + (r.chargesShare ?? 0), 0);
  const allInclusive = form.pricingMode === "all-inclusive";

  const unitDateConflictMessages = useMemo(() => {
    if (!form.propertyId || unitRows.length === 0) return [];
    const draft: DraftAssignment[] = unitRows.map(r => ({
      unitId: r.unitId,
      startDate: r.startDate,
      endDate: r.endDate,
      rentShare: r.rentShare,
      chargesShare: r.chargesShare,
    }));
    return validateLeaseUnits(
      lease.id,
      form.propertyId,
      draft,
      { monthlyRent: totalRent, monthlyCharges: totalCharges },
      integrityState,
    ).blockers
      .filter(b => b.code === "LUA_UNIT_OVERLAP" || b.code === "LUA_BILLING_WINDOW_MISMATCH")
      .map(b => b.message);
  }, [lease.id, form.propertyId, unitRows, totalRent, totalCharges, integrityState]);

  const addUnitRow = () => {
    setUnitRows(prev => {
      const seed = prev[0];
      return [
        ...prev,
        {
          unitId: "",
          rentShare: 0,
          chargesShare: 0,
          startDate: seed?.startDate ?? "",
          endDate: seed?.endDate ?? null,
        },
      ];
    });
  };

  const removeUnitRow = (idx: number) => {
    setUnitRows(prev => prev.filter((_, i) => i !== idx));
  };

  const updateUnitRow = (idx: number, patch: Partial<UnitRow>) => {
    setUnitRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, ...patch };
      if (patch.unitId !== undefined) {
        const u = units.find(uu => uu.id === patch.unitId);
        if (u) {
          const tierRent = getMonthlyRentForMonths(u, form.rentFormula);
          next.rentShare = tierRent ?? u.baseRent ?? 0;
          next.chargesShare = allInclusive ? 0 : (u.baseCharges ?? 0);
        }
      }
      if (allInclusive) next.chargesShare = 0;
      return next;
    }));
  };

  const executeLeaseSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
    const primaryRow = unitRows.find(isMainRow);
    const computedTotalRent = unitRows.reduce((s, r) => s + (r.rentShare ?? 0), 0);
    const computedTotalCharges = unitRows.reduce((s, r) => s + (r.chargesShare ?? 0), 0);
    const derivedStart = unitRows.map(r => r.startDate).sort()[0] ?? form.startDate;
    const anyOpen = unitRows.some(r => !r.endDate);
    const derivedEnd = anyOpen
      ? ""
      : unitRows.map(r => r.endDate as string).sort().slice(-1)[0] ?? "";
    const formToPersist = {
      ...form,
      startDate: derivedStart,
      endDate: derivedEnd,
      tenantIds: [form.primaryTenantId, ...form.coTenantIds].filter(Boolean),
      billingTenantId: form.billingTenantId || form.primaryTenantId,
      unitId: primaryRow?.unitId ?? form.unitId,
      monthlyRent: computedTotalRent,
      monthlyCharges: form.pricingMode === "all-inclusive" ? 0 : computedTotalCharges,
      // Keep chargesBillingMode in sync with pricingMode for backwards-compat:
      // all-inclusive and flat-charges leases use a flat-rate charge billing
      // mode (no reconciliation), separated leases keep provision-reconciled.
      chargesBillingMode:
        form.pricingMode === "separated"
          ? (form.chargesBillingMode ?? "provision-reconciled")
          : "flat-rate",
    };
    await updateLeaseWithAssignmentsPersisted({ ...lease, ...formToPersist }, unitRows.map(row => ({
      unitId: row.unitId,
      rentShare: row.rentShare,
      chargesShare: form.pricingMode === "all-inclusive" ? 0 : row.chargesShare,
      startDate: row.startDate,
      endDate: row.endDate,
    })));
    toast({ title: "Lease updated" });
    onOpenChange(false);
    onSaved?.();
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (form.lifecycleStage !== lease.lifecycleStage) {
      toast({ title: t("common.validationError"), description: "Change lease status using the dedicated action on the lease page.", variant: "destructive" });
      return;
    }
    const primaryRow = unitRows.find(isMainRow);
    if (unitRows.length === 0 || !primaryRow || !primaryRow.unitId) {
      toast({ title: "Validation Error", description: "Add at least one residential or main commercial unit.", variant: "destructive" });
      return;
    }
    if (unitRows.some(r => !r.unitId)) {
      toast({ title: "Validation Error", description: "Every row in Units must have a unit selected.", variant: "destructive" });
      return;
    }
    if (unitRows.filter(isMainRow).length === 0) {
      toast({ title: "Validation Error", description: "At least one selected unit must be residential or main commercial.", variant: "destructive" });
      return;
    }
    const dupCheck = new Set(unitRows.map(r => r.unitId));
    if (dupCheck.size !== unitRows.length) {
      toast({ title: "Validation Error", description: "Duplicate units in the table.", variant: "destructive" });
      return;
    }
    const effectiveUnitId = primaryRow.unitId;
    if (!form.leaseReference.trim() || !form.propertyId || !form.primaryTenantId) {
      toast({ title: "Validation Error", description: "Reference, property, and tenant are required.", variant: "destructive" });
      return;
    }
    if (unitRows.some(r => !r.startDate)) {
      toast({ title: "Validation Error", description: "Every unit must have a start date.", variant: "destructive" });
      return;
    }
    const derivedStart = unitRows.map(r => r.startDate).sort()[0];
    const anyOpen = unitRows.some(r => !r.endDate);
    const derivedEnd = anyOpen
      ? ""
      : unitRows.map(r => r.endDate as string).sort().slice(-1)[0];
    const rowDateChecks = unitRows.flatMap(r =>
      r.endDate
        ? [{ earlier: r.startDate, later: r.endDate, message: t("validation.dates.endBeforeStart") }]
        : []
    );
    const dateErrors = validateDateOrder([
      ...rowDateChecks,
      { earlier: form.signedDate, later: derivedStart, message: t("validation.dates.signedAfterStart") },
      { earlier: form.advancePaymentDate, later: form.advanceAllocationStartDate, message: t("validation.dates.allocationStartBeforePayment") },
      { earlier: form.noticeDate, later: form.intendedMoveOutDate, message: t("validation.dates.intendedMoveOutBeforeNotice") },
      { earlier: form.moveInScheduledDate, later: form.moveInActualDate, message: t("validation.dates.moveInActualBeforeScheduled") },
      { earlier: form.moveOutScheduledDate, later: form.moveOutActualDate, message: t("validation.dates.moveOutActualBeforeScheduled") },
      { earlier: form.moveInActualDate, later: form.moveOutActualDate, message: t("validation.dates.moveOutBeforeMoveIn") },
    ]);
    if (dateErrors.length > 0) {
      toast({ title: t("validation.dates.title"), description: dateErrors.join(" "), variant: "destructive" });
      return;
    }
    if (!Number.isInteger(form.dueDayOfMonth) || form.dueDayOfMonth < 1 || form.dueDayOfMonth > 28) {
      toast({ title: "Validation Error", description: t("leases.dueDayRequired"), variant: "destructive" });
      return;
    }
    const draft: DraftAssignment[] = unitRows.map(r => ({
      unitId: r.unitId,
      startDate: r.startDate,
      endDate: r.endDate,
      rentShare: r.rentShare,
      chargesShare: r.chargesShare,
    }));
    const unitsValidation = validateLeaseUnits(
      lease.id,
      form.propertyId,
      draft,
      { monthlyRent: totalRent, monthlyCharges: totalCharges },
      integrityState,
      { startDate: derivedStart, endDate: derivedEnd || null },
    );
    if (!unitsValidation.allowed) {
      toast({
        title: "Unit assignments blocked",
        description: unitsValidation.blockers.map(b => b.message).join(". "),
        variant: "destructive",
      });
      return;
    }
    if (unitsValidation.warnings.length > 0) {
      toast({
        title: "Lease saved with warnings",
        description: unitsValidation.warnings.map(w => w.message).join(". "),
      });
    }
    void executeLeaseSave();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="wide">
          <DialogHeader>
            <DialogTitle>{t("leases.edit")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("leases.leaseReference")} *</Label>
                <Input
                  value={form.leaseReference}
                  onChange={e => setForm(f => ({ ...f, leaseReference: e.target.value }))}
                  placeholder="e.g. BAIL-PAR-003"
                />
              </div>
              <div>
                <Label>{t("leases.property")} *</Label>
                <Select
                  value={form.propertyId}
                  disabled
                >
                  <SelectTrigger><SelectValue placeholder={t("leases.selectProperty")} /></SelectTrigger>
                  <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("leases.units.title")} *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!form.propertyId}
                  onClick={addUnitRow}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />{t("leases.addUnit")}
                </Button>
              </div>
              {unitRows.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-3 py-4 text-center">{t("leases.units.empty")}</p>
              ) : (
                <Table className="w-full [&_th]:px-2 [&_td]:px-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-9 w-auto">{t("leases.col.unit")}</TableHead>
                      <TableHead className="h-9 w-auto">{t("leases.col.start")}</TableHead>
                      <TableHead className="h-9 w-auto">{t("leases.col.end")}</TableHead>
                      <TableHead className="h-9 w-auto text-right">{t("leases.monthlyRent")}</TableHead>
                      {!allInclusive && (
                        <TableHead className="h-9 w-auto text-right">{t("leases.monthlyCharges")}</TableHead>
                      )}
                      <TableHead className="h-9 w-auto text-right">{t("leases.units.total")}</TableHead>
                      <TableHead className="h-9 w-[40px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unitRows.map((row, idx) => {
                      const usedIds = new Set<string>(unitRows.filter((_, i) => i !== idx).map(x => x.unitId).filter(Boolean));
                      const options = formUnits.filter(u => !usedIds.has(u.id));
                      const rowTotal = (row.rentShare ?? 0) + (allInclusive ? 0 : (row.chargesShare ?? 0));
                      return (
                        <TableRow key={idx}>
                          <TableCell className="py-1.5">
                            <Select value={row.unitId} onValueChange={v => updateUnitRow(idx, { unitId: v })}>
                              <SelectTrigger className="h-8 w-full min-w-[140px]"><SelectValue placeholder={t("leases.selectUnit")} /></SelectTrigger>
                              <SelectContent>
                                {options.map(u => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.unitCode} — {u.unitLabel}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <DateInput
                              value={row.startDate}
                              max={row.endDate ?? undefined}
                              onChange={value => updateUnitRow(idx, { startDate: value })}
                              className="h-8 w-[140px]"
                            />
                          </TableCell>
                          <TableCell className="py-1.5">
                            <DateInput
                              value={row.endDate ?? ""}
                              min={row.startDate || undefined}
                              onChange={value => updateUnitRow(idx, { endDate: value || null })}
                              className="h-8 w-[140px]"
                            />
                          </TableCell>
                          <TableCell className="py-1.5">
                            <div className="flex items-center gap-1 justify-end">
                              <Input
                                type="number" min={0}
                                value={row.rentShare}
                                onChange={ev => updateUnitRow(idx, { rentShare: Number(ev.target.value) || 0 })}
                                className="h-8 w-[90px] text-right"
                              />
                              <span className="text-xs text-muted-foreground">{selectedProperty ? getCurrencySymbol(selectedProperty.currencyCode) : ""}</span>
                            </div>
                          </TableCell>
                          {!allInclusive && (
                            <TableCell className="py-1.5">
                              <div className="flex items-center gap-1 justify-end">
                                <Input
                                  type="number" min={0}
                                  value={row.chargesShare}
                                  onChange={ev => updateUnitRow(idx, { chargesShare: Number(ev.target.value) || 0 })}
                                  className="h-8 w-[90px] text-right"
                                />
                                <span className="text-xs text-muted-foreground">{selectedProperty ? getCurrencySymbol(selectedProperty.currencyCode) : ""}</span>
                              </div>
                            </TableCell>
                          )}
                          <TableCell className="py-1.5 text-right font-medium">
                            {fmtCurrency(rowTotal, selectedProperty?.currencyCode, selectedProperty?.locale)}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeUnitRow(idx)}>
                              <XIcon className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/30 font-medium">
                      <TableCell colSpan={3} className="py-2 text-xs uppercase tracking-wide text-muted-foreground">
                        {t("leases.units.grandTotal")}
                      </TableCell>
                      <TableCell className="py-2 text-right">{fmtCurrency(totalRent, selectedProperty?.currencyCode, selectedProperty?.locale)}</TableCell>
                      {!allInclusive && (
                        <TableCell className="py-2 text-right">{fmtCurrency(totalCharges, selectedProperty?.currencyCode, selectedProperty?.locale)}</TableCell>
                      )}
                      <TableCell className="py-2 text-right">{fmtCurrency(totalRent + (allInclusive ? 0 : totalCharges), selectedProperty?.currencyCode, selectedProperty?.locale)}</TableCell>
                      <TableCell className="py-2" />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
              {unitDateConflictMessages.length > 0 && (
                <div className="mt-2 rounded border border-destructive/30 bg-destructive/5 p-2">
                  <div className="flex items-start gap-2 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <p className="font-medium">Unit dates and pricing</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {unitDateConflictMessages.map(message => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 flex h-5 items-center">{t("leases.formula")} *</Label>
                <Select
                  value={String(form.rentFormula)}
                  disabled={commonTiers.length === 0}
                  onValueChange={(raw) => {
                    const months = Number(raw) as RentFormula;
                    setUnitRows(prev => prev.map(r => {
                      const u = units.find(uu => uu.id === r.unitId);
                      if (!u) return r;
                      const tier = getMonthlyRentForMonths(u, months);
                      if (tier == null) return r;
                      return {
                        ...r,
                        rentShare: tier,
                        chargesShare: allInclusive ? 0 : (u.baseCharges ?? 0),
                      };
                    }));
                    setForm(f => ({
                      ...f,
                      rentFormula: months,
                      hasAdvancePayment: false,
                      advancePaymentAmount: null,
                      advancePaymentDate: null,
                      advanceAllocationMethod: null,
                      advanceAppliedTo: null,
                      advanceAllocationStartDate: null,
                      advanceAllocationDurationMonths: null,
                      fixedMonthlyReductionAmount: null,
                    }));
                  }}
                >
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {commonTiers.length === 0 && (
                      <SelectItem value="1" disabled>{t("leases.formula.notAvailable")}</SelectItem>
                    )}
                    {commonTiers.map(tier => (
                      <SelectItem key={tier.durationMonths} value={String(tier.durationMonths)}>
                        {tier.durationMonths === 1
                          ? t("leases.formula.monthly")
                          : `${tier.durationMonths} months`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {commonTiers.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">{t("leases.formula.requiresCommonTiers")}</p>
                )}
              </div>
              <div>
                <Label>{t("leases.dueDay")} *</Label>
                <Input type="number" min={1} max={28} value={form.dueDayOfMonth} onChange={e => setForm(f => ({ ...f, dueDayOfMonth: Number(e.target.value) || 1 }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("leases.tenant")} *</Label>
                {(() => {
                  const attachedIds = [form.primaryTenantId, ...form.coTenantIds].filter(Boolean);
                  const availableExisting = tenants.filter(tt => !attachedIds.includes(tt.id));
                  const removeTenant = (id: string) => setForm(f => {
                    if (f.primaryTenantId === id) {
                      const [next, ...rest] = f.coTenantIds;
                      return { ...f, primaryTenantId: next ?? "", coTenantIds: rest ?? [] };
                    }
                    return { ...f, coTenantIds: f.coTenantIds.filter(x => x !== id) };
                  });
                  const makePrimary = (id: string) => setForm(f => {
                    if (f.primaryTenantId === id) return f;
                    const newCo = [f.primaryTenantId, ...f.coTenantIds].filter(x => x && x !== id);
                    return { ...f, primaryTenantId: id, coTenantIds: newCo };
                  });
                  const addTenant = (id: string) => setForm(f => {
                    if (!id) return f;
                    if (!f.primaryTenantId) return { ...f, primaryTenantId: id };
                    if (f.primaryTenantId === id || f.coTenantIds.includes(id)) return f;
                    return { ...f, coTenantIds: [...f.coTenantIds, id] };
                  });
                  return (
                    <div className="space-y-2">
                      {attachedIds.length > 0 && (
                        <div className="rounded-md border">
                          <Table>
                            <TableBody>
                              {attachedIds.map(id => {
                                const tt = tenants.find(x => x.id === id);
                                const isPrimary = id === form.primaryTenantId;
                                return (
                                  <TableRow key={id}>
                                    <TableCell className="py-1.5">
                                      <div className="text-sm font-medium">{tt ? getTenantFullName(tt) : "—"}</div>
                                      {tt?.email && <div className="text-xs text-muted-foreground">{tt.email}</div>}
                                    </TableCell>
                                    <TableCell className="py-1.5 w-32">
                                      {isPrimary ? (
                                        <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">{t("leases.primaryTenant")}</span>
                                      ) : (
                                        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => makePrimary(id)}>
                                          {t("leases.primaryTenant")}
                                        </Button>
                                      )}
                                    </TableCell>
                                    <TableCell className="py-1.5 w-10 text-right">
                                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeTenant(id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                      <Select value="" onValueChange={addTenant}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("leases.selectTenant")} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableExisting.length === 0 ? (
                            <SelectItem value="__none" disabled>—</SelectItem>
                          ) : availableExisting.map(tt => (
                            <SelectItem key={tt.id} value={tt.id}>{getTenantFullName(tt)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
              </div>
              <div>
                <Label>{t("leases.status")}</Label>
                <div className="flex h-10 items-center"><StatusBadge status={lease.lifecycleStage} /></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("leases.signedDate")}</Label><DateInput value={form.signedDate ?? ""} onChange={value => setForm(f => ({ ...f, signedDate: value || null }))} /></div>
            </div>
            <div>
              <Label>{t("leases.dueDay")} *</Label>
              <Input type="number" min={1} max={28} value={form.dueDayOfMonth} onChange={e => setForm(f => ({ ...f, dueDayOfMonth: Number(e.target.value) || 1 }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("leases.deposit")}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    value={form.depositOrGuaranteeAmount ?? ""}
                    onChange={e => setForm(f => ({ ...f, depositOrGuaranteeAmount: e.target.value ? Number(e.target.value) : null }))}
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedProperty ? getCurrencySymbol(selectedProperty.currencyCode) : ""}
                  </span>
                </div>
              </div>
              <div>
                <Label>{t("leases.noticePeriod")}</Label>
                {(() => {
                  const parsed = parseNoticeText(form.noticePeriodText);
                  const setNotice = (value: string, unit: NoticeUnit) => {
                    setForm(f => ({ ...f, noticePeriodText: serializeNotice(value, unit) }));
                  };
                  return (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        className="w-24"
                        value={parsed.value}
                        onChange={e => setNotice(e.target.value, parsed.unit)}
                      />
                      <Select value={parsed.unit} onValueChange={v => setNotice(parsed.value, v as NoticeUnit)}>
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="days">{t("amendments.noticeUnit.days")}</SelectItem>
                          <SelectItem value="weeks">{t("amendments.noticeUnit.weeks")}</SelectItem>
                          <SelectItem value="months">{t("amendments.noticeUnit.months")}</SelectItem>
                          <SelectItem value="years">{t("amendments.noticeUnit.years")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div>
              <Label>{t("leases.pricingMode")}</Label>
              <Select
                value={form.pricingMode ?? (form.chargesBillingMode === "flat-rate" ? "flat-charges" : "separated")}
                onValueChange={v => {
                  const mode = v as "separated" | "flat-charges" | "all-inclusive";
                  setForm(f => ({ ...f, pricingMode: mode }));
                  if (mode === "all-inclusive") {
                    setUnitRows(prev => prev.map(r => ({ ...r, chargesShare: 0 })));
                  } else {
                    setUnitRows(prev => prev.map(r => {
                      const u = units.find(uu => uu.id === r.unitId);
                      return { ...r, chargesShare: u?.baseCharges ?? 0 };
                    }));
                  }
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="separated">{t("leases.pricingMode.separated")}</SelectItem>
                  <SelectItem value="flat-charges">{t("leases.pricingMode.flatCharges")}</SelectItem>
                  <SelectItem value="all-inclusive">{t("leases.pricingMode.allInclusive")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {form.pricingMode === "all-inclusive"
                  ? t("leases.pricingMode.allInclusiveHelp")
                  : form.pricingMode === "flat-charges"
                    ? t("leases.pricingMode.flatChargesHelp")
                    : t("leases.pricingMode.separatedHelp")}
              </p>
              {form.pricingMode === "all-inclusive" && totalCharges > 0 && (
                <p className="text-xs text-warning mt-1">{t("leases.allInclusive.chargesForced")}</p>
              )}
            </div>
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm font-medium">{t("leaseDetail.rentIndexation")}</Label>
                  <p className="mt-1 text-xs text-muted-foreground">{t("leaseIndexation.leaseHelp")}</p>
                </div>
                <Switch
                  checked={!!form.indexationEnabled}
                  onCheckedChange={checked => setForm(f => ({
                    ...f,
                    indexationEnabled: checked,
                    indexationFrequency: "yearly",
                    indexationBaseDate: checked ? (f.indexationBaseDate || f.startDate || null) : f.indexationBaseDate,
                  }))}
                />
              </div>
              {form.indexationEnabled && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <Label>{t("leaseIndexation.baseDate")}</Label>
                    <DateInput value={form.indexationBaseDate ?? ""} onChange={value => setForm(f => ({ ...f, indexationBaseDate: value || null }))} />
                  </div>
                  <div>
                    <Label>{t("leaseIndexation.baseIndex")}</Label>
                    <Input type="number" min={0} step="0.0001" value={form.indexationBaseIndex ?? ""} onChange={e => setForm(f => ({ ...f, indexationBaseIndex: e.target.value ? Number(e.target.value) : null }))} />
                  </div>
                  <div>
                    <Label>{t("leaseIndexation.currentIndex")}</Label>
                    <Input type="number" min={0} step="0.0001" value={form.indexationCurrentIndex ?? ""} onChange={e => setForm(f => ({ ...f, indexationCurrentIndex: e.target.value ? Number(e.target.value) : null }))} />
                  </div>
                  <div>
                    <Label>{t("leaseIndexation.cap")}</Label>
                    <Input type="number" min={0} step="0.01" value={form.indexationCapPercent ?? ""} onChange={e => setForm(f => ({ ...f, indexationCapPercent: e.target.value ? Number(e.target.value) : null }))} />
                  </div>
                  <div>
                    <Label>{t("leaseIndexation.rounding")}</Label>
                    <Select value={form.indexationRoundingMode ?? "nearest-cent"} onValueChange={value => setForm(f => ({ ...f, indexationRoundingMode: value as Lease["indexationRoundingMode"] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nearest-cent">{t("leaseIndexation.nearestCent")}</SelectItem>
                        <SelectItem value="nearest-euro">{t("leaseIndexation.nearestEuro")}</SelectItem>
                        <SelectItem value="none">{t("leaseIndexation.noMonthlyRounding")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-3">
                    <Label>{t("leaseIndexation.regulatoryNotes")}</Label>
                    <Textarea value={form.indexationNotes ?? ""} onChange={e => setForm(f => ({ ...f, indexationNotes: e.target.value }))} rows={2} />
                  </div>
                </div>
              )}
            </div>

            <div><Label>{t("common.notes")}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>{t("action.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
