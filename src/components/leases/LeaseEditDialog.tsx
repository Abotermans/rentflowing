import { useState, useMemo, useEffect } from "react";
import { useAppData } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Plus, X as XIcon, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Lease, LifecycleStage, RentFormula, getTenantFullName } from "@/types";
import type { LeaseUnitAssignmentType } from "@/types";
import type { TranslationKey } from "@/i18n/translations";
import { useSettings } from "@/context/SettingsContext";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { canChangeLeaseStatus } from "@/lib/integrity/leaseIntegrity";
import { validateLeaseUnits, type DraftAssignment } from "@/lib/integrity/leaseUnitAssignmentIntegrity";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";
import { OverrideConfirmDialog } from "@/components/shared/OverrideConfirmDialog";
import { useOverrideHistory } from "@/context/OverrideContext";
import type { ValidationResult } from "@/lib/integrity/types";
import { getAllRentTiers, getMonthlyRentForMonths } from "@/lib/rentTiers";
import { formatCurrency as fmtCurrency, getCurrencySymbol } from "@/lib/formatters";

type LeaseFormData = Omit<Lease, "id" | "createdAt" | "updatedAt">;

const LEASE_STAGES: { value: LifecycleStage; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending-signature", label: "Pending Signature" },
  { value: "signed", label: "Signed" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
  { value: "terminated", label: "Terminated" },
];

const ALLOWED_TRANSITIONS: Record<LifecycleStage, LifecycleStage[]> = {
  draft: ["draft", "pending-signature"],
  "pending-signature": ["pending-signature", "draft", "signed"],
  signed: ["signed", "active", "terminated"],
  active: ["active", "ended", "terminated"],
  ended: ["ended", "terminated"],
  terminated: ["terminated"],
};

type UnitRow = {
  unitId: string;
  assignmentType: LeaseUnitAssignmentType;
  rentShare: number;
  chargesShare: number;
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
    getActiveLease, getLeaseAssignments,
    updateLease, setLeaseUnits,
  } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();

  const [form, setForm] = useState<LeaseFormData>(() => {
    const { id, createdAt, updatedAt, ...rest } = lease;
    return rest;
  });
  const [unitRows, setUnitRows] = useState<UnitRow[]>([]);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverrideValidation, setPendingOverrideValidation] = useState<ValidationResult | null>(null);

  useEffect(() => {
    if (open) {
      const { id, createdAt, updatedAt, ...rest } = lease;
      setForm(rest);
      const today = new Date().toISOString().slice(0, 10);
      const all = getLeaseAssignments(lease.id)
        .filter(a => !a.endDate || a.endDate >= today)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
      const rows: UnitRow[] = all.map(a => ({
        unitId: a.unitId,
        assignmentType: a.isPrimary ? "primary" : a.assignmentType,
        rentShare: a.rentShare ?? 0,
        chargesShare: a.chargesShare ?? 0,
      }));
      if (!rows.some(r => r.assignmentType === "primary") && lease.unitId) {
        rows.unshift({
          unitId: lease.unitId,
          assignmentType: "primary",
          rentShare: lease.monthlyRent,
          chargesShare: lease.monthlyCharges,
        });
      }
      setUnitRows(rows);
    }
  }, [open, lease.id]);

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

  const availableStatuses = useMemo(() => {
    const allowed = ALLOWED_TRANSITIONS[lease.lifecycleStage] || [lease.lifecycleStage];
    return LEASE_STAGES.filter(s => allowed.includes(s.value));
  }, [lease.lifecycleStage]);

  const statusValidation = useMemo(() => {
    if (form.lifecycleStage === lease.lifecycleStage) return null;
    return canChangeLeaseStatus(lease.id, form.lifecycleStage, integrityState);
  }, [form.lifecycleStage, lease.id, lease.lifecycleStage, integrityState]);

  const addUnitRow = () => {
    setUnitRows(prev => {
      const hasPrimary = prev.some(r => r.assignmentType === "primary");
      return [
        ...prev,
        {
          unitId: "",
          assignmentType: hasPrimary ? "parking" : "primary",
          rentShare: 0,
          chargesShare: 0,
        },
      ];
    });
  };

  const removeUnitRow = (idx: number) => {
    setUnitRows(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length > 0 && !next.some(r => r.assignmentType === "primary")) {
        next[0] = { ...next[0], assignmentType: "primary" };
      }
      return next;
    });
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
          next.chargesShare = u.baseCharges ?? 0;
        }
      }
      return next;
    }));
  };

  const setRoleForRow = (idx: number, role: LeaseUnitAssignmentType) => {
    setUnitRows(prev => prev.map((r, i) => {
      if (i === idx) return { ...r, assignmentType: role };
      if (role === "primary" && r.assignmentType === "primary") return { ...r, assignmentType: "parking" };
      return r;
    }));
  };

  const executeLeaseSave = () => {
    const persistAssignments = (leaseId: string) => {
      const draft = unitRows.map(r => ({
        unitId: r.unitId,
        assignmentType: r.assignmentType,
        isPrimary: r.assignmentType === "primary",
        rentShare: r.rentShare,
        chargesShare: r.chargesShare,
        startDate: form.startDate,
      }));
      setLeaseUnits(leaseId, form.propertyId, draft);
    };
    const primaryRow = unitRows.find(r => r.assignmentType === "primary");
    const computedTotalRent = unitRows.reduce((s, r) => s + (r.rentShare ?? 0), 0);
    const computedTotalCharges = unitRows.reduce((s, r) => s + (r.chargesShare ?? 0), 0);
    const formToPersist = {
      ...form,
      unitId: primaryRow?.unitId ?? form.unitId,
      monthlyRent: computedTotalRent,
      monthlyCharges: computedTotalCharges,
    };
    updateLease({ ...lease, ...formToPersist });
    persistAssignments(lease.id);
    toast({ title: "Lease updated" });
    onOpenChange(false);
    onSaved?.();
  };

  const handleSave = () => {
    const primaryRow = unitRows.find(r => r.assignmentType === "primary");
    if (unitRows.length === 0 || !primaryRow || !primaryRow.unitId) {
      toast({ title: "Validation Error", description: "Add at least one unit with role Primary.", variant: "destructive" });
      return;
    }
    if (unitRows.some(r => !r.unitId)) {
      toast({ title: "Validation Error", description: "Every row in Units must have a unit selected.", variant: "destructive" });
      return;
    }
    if (unitRows.filter(r => r.assignmentType === "primary").length !== 1) {
      toast({ title: "Validation Error", description: "Exactly one unit must be marked as Primary.", variant: "destructive" });
      return;
    }
    const dupCheck = new Set(unitRows.map(r => r.unitId));
    if (dupCheck.size !== unitRows.length) {
      toast({ title: "Validation Error", description: "Duplicate units in the table.", variant: "destructive" });
      return;
    }
    const effectiveUnitId = primaryRow.unitId;
    if (!form.leaseReference.trim() || !form.propertyId || !form.primaryTenantId || !form.startDate || !form.endDate) {
      toast({ title: "Validation Error", description: "Reference, property, unit, tenant, start date, and end date are required.", variant: "destructive" });
      return;
    }
    if (form.lifecycleStage !== lease.lifecycleStage) {
      const validation = canChangeLeaseStatus(lease.id, form.lifecycleStage, integrityState);
      if (!validation.allowed) {
        if (validation.overrideAllowed) {
          setPendingOverrideValidation(validation);
          setOverrideDialogOpen(true);
          return;
        }
        toast({ title: "Status change blocked", description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
        return;
      }
      if (validation.warnings.length > 0) {
        toast({ title: "Lease saved with warnings", description: validation.warnings.map(w => w.message).join(". ") });
      }
    }
    if (form.lifecycleStage === "active") {
      const existing = getActiveLease(effectiveUnitId);
      if (existing && existing.id !== lease.id) {
        toast({ title: "Conflict", description: `Unit already has an active lease: ${existing.leaseReference}`, variant: "destructive" });
        return;
      }
    }
    const draft: DraftAssignment[] = unitRows.map(r => ({
      unitId: r.unitId,
      assignmentType: r.assignmentType,
      isPrimary: r.assignmentType === "primary",
      startDate: form.startDate,
      endDate: null,
      rentShare: r.rentShare,
      chargesShare: r.chargesShare,
    }));
    const unitsValidation = validateLeaseUnits(
      lease.id,
      form.propertyId,
      draft,
      { monthlyRent: totalRent, monthlyCharges: totalCharges },
      integrityState,
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
    executeLeaseSave();
  };

  const handleOverrideConfirm = (reason: string) => {
    if (!pendingOverrideValidation) return;
    addOverride({
      entityType: "lease",
      entityId: lease.id,
      action: `status_change:${form.lifecycleStage}`,
      blockerCodes: pendingOverrideValidation.blockers.map(b => b.code),
      reason,
    });
    executeLeaseSave();
    setPendingOverrideValidation(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[760px] max-w-[95vw] max-h-[95vh] overflow-y-auto">
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
                  onValueChange={v => {
                    setForm(f => ({ ...f, propertyId: v, unitId: "" }));
                    setUnitRows([]);
                  }}
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
                <Table className="w-auto [&_th]:px-2 [&_td]:px-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-9 w-auto">{t("leases.col.unit")}</TableHead>
                      <TableHead className="h-9 w-auto">{t("leases.col.role")}</TableHead>
                      <TableHead className="h-9 w-auto text-right">{t("leases.monthlyRent")}</TableHead>
                      <TableHead className="h-9 w-auto text-right">{t("leases.monthlyCharges")}</TableHead>
                      <TableHead className="h-9 w-auto text-right">{t("leases.units.total")}</TableHead>
                      <TableHead className="h-9 w-[40px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unitRows.map((row, idx) => {
                      const usedIds = new Set<string>(unitRows.filter((_, i) => i !== idx).map(x => x.unitId).filter(Boolean));
                      const options = formUnits.filter(u => !usedIds.has(u.id));
                      const rowTotal = (row.rentShare ?? 0) + (row.chargesShare ?? 0);
                      return (
                        <TableRow key={idx}>
                          <TableCell className="py-1.5">
                            <Select value={row.unitId} onValueChange={v => updateUnitRow(idx, { unitId: v })}>
                              <SelectTrigger className="h-8 w-auto min-w-[140px]"><SelectValue placeholder={t("leases.selectUnit")} /></SelectTrigger>
                              <SelectContent>
                                {options.map(u => {
                                  const existing = getActiveLease(u.id);
                                  const blocked = existing && existing.id !== lease.id;
                                  return (
                                    <SelectItem key={u.id} value={u.id} disabled={!!blocked}>
                                      {u.unitCode} — {u.unitLabel}{blocked ? ` (${t("leases.activeLease")})` : ""}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Select value={row.assignmentType} onValueChange={v => setRoleForRow(idx, v as LeaseUnitAssignmentType)}>
                              <SelectTrigger className="h-8 w-auto min-w-[90px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(["primary", "parking", "cellar", "storage", "ancillary", "office-secondary", "commercial-addon", "other"] as LeaseUnitAssignmentType[]).map(at => (
                                  <SelectItem key={at} value={at}>{t(`leases.assignmentType.${at}` as TranslationKey)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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
                      <TableCell colSpan={2} className="py-2 text-xs uppercase tracking-wide text-muted-foreground">
                        {t("leases.units.grandTotal")}
                      </TableCell>
                      <TableCell className="py-2 text-right">{fmtCurrency(totalRent, selectedProperty?.currencyCode, selectedProperty?.locale)}</TableCell>
                      <TableCell className="py-2 text-right">{fmtCurrency(totalCharges, selectedProperty?.currencyCode, selectedProperty?.locale)}</TableCell>
                      <TableCell className="py-2 text-right">{fmtCurrency(totalRent + totalCharges, selectedProperty?.currencyCode, selectedProperty?.locale)}</TableCell>
                      <TableCell className="py-2" />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </div>

            <div>
              <div className="grid grid-cols-[160px_minmax(0,1fr)] items-start gap-4">
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
                        return tier == null ? r : { ...r, rentShare: tier };
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
                </div>
                {form.rentFormula !== 1 && (
                  <div>
                    <Label className="mb-2 flex h-5 items-center gap-1 whitespace-nowrap">
                      Generate next cycle
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-pointer" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[260px]">
                          <p className="text-xs">Number of days before the next payment is due that open receivables are created. Default is 15 days.</p>
                        </TooltipContent>
                      </Tooltip>
                    </Label>
                    <div className="flex h-9 items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={120}
                        value={form.advanceCycleLeadDays ?? 15}
                        onChange={e => setForm(f => ({ ...f, advanceCycleLeadDays: e.target.value === "" ? null : Number(e.target.value) }))}
                        className="h-9 w-[80px]"
                      />
                      <span className="text-sm text-muted-foreground">days before next payment is due</span>
                    </div>
                  </div>
                )}
              </div>
              {commonTiers.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">{t("leases.formula.requiresCommonTiers")}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("leases.primaryTenant")} *</Label>
                <Select
                  value={form.primaryTenantId}
                  onValueChange={v => setForm(f => ({ ...f, primaryTenantId: v }))}
                >
                  <SelectTrigger><SelectValue placeholder={t("leases.selectTenant")} /></SelectTrigger>
                  <SelectContent>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{getTenantFullName(t)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("leases.status")} *</Label>
                <Select
                  value={form.lifecycleStage}
                  onValueChange={v => setForm(f => ({ ...f, lifecycleStage: v as LifecycleStage }))}
                >
                  <SelectTrigger><StatusBadge status={form.lifecycleStage} /></SelectTrigger>
                  <SelectContent>{availableStatuses.map(s => <SelectItem key={s.value} value={s.value} textValue={s.label}><StatusBadge status={s.value} /></SelectItem>)}</SelectContent>
                </Select>
                <StatusTransitionAlert validation={statusValidation} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("leases.startDate")} *</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div><Label>{t("leases.endDate")} *</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4 items-end">
              <div className="rounded-md border border-border px-3 py-2 text-xs">
                <div className="text-muted-foreground uppercase tracking-wide text-[10px]">{t("leases.units.grandTotal")}</div>
                <div className="mt-1 text-foreground">
                  {t("leases.monthlyRent")}: <span className="font-medium">{fmtCurrency(totalRent, selectedProperty?.currencyCode, selectedProperty?.locale)}</span>
                  {" · "}
                  {t("leases.monthlyCharges")}: <span className="font-medium">{fmtCurrency(totalCharges, selectedProperty?.currencyCode, selectedProperty?.locale)}</span>
                  {" · "}
                  {t("leases.units.total")}: <span className="font-medium">{fmtCurrency(totalRent + totalCharges, selectedProperty?.currencyCode, selectedProperty?.locale)}</span>
                </div>
              </div>
              <div><Label>{t("leases.dueDay")}</Label><Input type="number" min={1} max={28} value={form.dueDayOfMonth} onChange={e => setForm(f => ({ ...f, dueDayOfMonth: Number(e.target.value) || 1 }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("leases.deposit")}</Label><Input type="number" min={0} value={form.depositOrGuaranteeAmount ?? ""} onChange={e => setForm(f => ({ ...f, depositOrGuaranteeAmount: e.target.value ? Number(e.target.value) : null }))} /></div>
              <div><Label>{t("leases.noticePeriod")}</Label><Input value={form.noticePeriodText} onChange={e => setForm(f => ({ ...f, noticePeriodText: e.target.value }))} /></div>
            </div>
            <div>
              <Label>{t("leases.chargesBillingMode")}</Label>
              <Select
                value={form.chargesBillingMode ?? "provision-reconciled"}
                onValueChange={v => setForm(f => ({ ...f, chargesBillingMode: v as "provision-reconciled" | "flat-rate" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="provision-reconciled">{t("leases.chargesMode.provision")}</SelectItem>
                  <SelectItem value="flat-rate">{t("leases.chargesMode.flat")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {form.chargesBillingMode === "flat-rate"
                  ? t("leases.chargesMode.flatHelp")
                  : t("leases.chargesMode.provisionHelp")}
              </p>
            </div>
            <div><Label>{t("leases.signedDate")}</Label><Input type="date" value={form.signedDate ?? ""} onChange={e => setForm(f => ({ ...f, signedDate: e.target.value || null }))} /></div>
            <div><Label>{t("common.notes")}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{t("action.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingOverrideValidation && (
        <OverrideConfirmDialog
          open={overrideDialogOpen}
          onOpenChange={(v) => { setOverrideDialogOpen(v); if (!v) setPendingOverrideValidation(null); }}
          validation={pendingOverrideValidation}
          actionLabel="Override and Save"
          onOverride={handleOverrideConfirm}
        />
      )}
    </>
  );
}
