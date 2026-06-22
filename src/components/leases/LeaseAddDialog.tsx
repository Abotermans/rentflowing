import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/shared/EmptyState";
import { Plus, X as XIcon, Search, Users, ChevronDown } from "lucide-react";
import { Lease, LifecycleStage, RentFormula, Tenant, TenantStatus, getTenantFullName } from "@/types";
import type { LeaseUnitAssignmentType } from "@/types";
import type { TranslationKey } from "@/i18n/translations";
import { validateLeaseUnits, type DraftAssignment } from "@/lib/integrity/leaseUnitAssignmentIntegrity";
import { getAllRentTiers, getMonthlyRentForMonths } from "@/lib/rentTiers";
import { formatCurrency as fmtCurrency, getCurrencySymbol } from "@/lib/formatters";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { parseNoticeText, serializeNotice, type NoticeUnit } from "@/lib/noticePeriod";
import { validateDateOrder } from "@/lib/dateValidation";

type LeaseFormData = Omit<Lease, "id" | "createdAt" | "updatedAt">;
type TenantFormData = Omit<Tenant, "id" | "createdAt" | "updatedAt">;

type UnitRow = {
  unitId: string;
  assignmentType: LeaseUnitAssignmentType;
  rentShare: number;
  chargesShare: number;
  startDate: string;
  endDate: string | null;
};

const LEASE_STAGES: { value: LifecycleStage; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending-signature", label: "Pending Signature" },
  { value: "signed", label: "Signed" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
  { value: "terminated", label: "Terminated" },
];

const TENANT_STATUSES: { value: TenantStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "applicant", label: "Applicant" },
  { value: "former", label: "Former" },
];

interface LeaseAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, locks the property to this id and pre-adds a primary unit row. */
  prefillPropertyId?: string;
  prefillUnitId?: string;
}

export function LeaseAddDialog({ open, onOpenChange, prefillPropertyId, prefillUnitId }: LeaseAddDialogProps) {
  const {
    tenants, units, properties, addLease, addTenant, getActiveLease, setLeaseUnits,
  } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const integrityState = useIntegrityState();

  const buildEmptyForm = (): LeaseFormData => ({
    leaseReference: "",
    propertyId: prefillPropertyId ?? properties[0]?.id ?? "",
    unitId: prefillUnitId ?? "",
    primaryTenantId: "",
    coTenantIds: [], lifecycleStage: "draft", startDate: "", endDate: "",
    // dueDayOfMonth: 0 = unset. User must enter a value (1–28) before saving.
    monthlyRent: 0, monthlyCharges: 0, dueDayOfMonth: 0,
    depositOrGuaranteeAmount: null, noticePeriodText: "3 months",
    signedDate: null, notes: "", rentFormula: 1,
    noticeGiven: false, noticeDate: null, intendedMoveOutDate: null, terminationReason: null,
    moveInScheduledDate: null, moveInActualDate: null, moveInMeterReading: null, moveInWaterMeterReading: null,
    moveInChecklist: { leaseSigned: false, firstPaymentReceived: false, guaranteeConfirmed: false, keysHandedOver: false, meterReadingCaptured: false, tenantDocumentsComplete: false },
    moveOutScheduledDate: null, moveOutActualDate: null, moveOutMeterReading: null, moveOutWaterMeterReading: null,
    moveOutChecklist: { noticeConfirmed: false, moveOutDateConfirmed: false, keysReturned: false, moveOutMeterReadingCaptured: false, balanceReviewed: false, guaranteeReviewCompleted: false },
    moveOutNotes: "", keyHandoverCount: 0, keyReturnCount: 0, returnStatus: null, returnNotes: "",
    hasAdvancePayment: false, advancePaymentAmount: null, advancePaymentDate: null,
    advanceAllocationMethod: null, advanceAppliedTo: null, advanceAllocationStartDate: null,
    advanceAllocationDurationMonths: null, fixedMonthlyReductionAmount: null,
    advanceCycleLeadDays: 15,
    chargesBillingMode: "provision-reconciled",
    pricingMode: "separated",
  });

  const emptyTenantForm: TenantFormData = {
    kind: "individual",
    firstName: "", lastName: "", email: "", phone: "",
    dateOfBirth: null, identificationNumber: null, currentAddress: null,
    status: "active", notes: "",
    companyName: null, legalForm: null, registrationNumber: null, vatNumber: null,
    contactFirstName: null, contactLastName: null, contactRole: null,
  };

  const [form, setForm] = useState<LeaseFormData>(buildEmptyForm);
  const [unitRows, setUnitRows] = useState<UnitRow[]>([]);
  const [tenantForm, setTenantForm] = useState<TenantFormData>({ ...emptyTenantForm });
  const [step, setStep] = useState(1);
  const [tenantSubView, setTenantSubView] = useState<"workspace" | "search" | "create">("workspace");
  const [pendingExistingTenantId, setPendingExistingTenantId] = useState<string>("");

  // Reset internal state every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const initialForm = buildEmptyForm();
    setForm(initialForm);
    setTenantForm({ ...emptyTenantForm });
    setStep(1);
    setTenantSubView("workspace");
    setPendingExistingTenantId("");

    // Pre-add a primary unit row when a unit is prefilled.
    if (prefillUnitId) {
      const u = units.find(uu => uu.id === prefillUnitId);
      setUnitRows([{
        unitId: prefillUnitId,
        assignmentType: "primary",
        rentShare: u?.baseRent ?? 0,
        chargesShare: u?.baseCharges ?? 0,
        startDate: "",
        endDate: null,
      }]);
    } else {
      setUnitRows([{
        unitId: "",
        assignmentType: "primary",
        rentShare: 0,
        chargesShare: 0,
        startDate: "",
        endDate: null,
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const formUnits = units.filter(u => u.propertyId === form.propertyId);
  const allInclusive = form.pricingMode === "all-inclusive";

  const commonTiers = useMemo(() => {
    const rowsWithUnits = unitRows
      .map(r => units.find(u => u.id === r.unitId))
      .filter((u): u is NonNullable<typeof u> => !!u);
    if (rowsWithUnits.length === 0) return [];
    const perUnit = rowsWithUnits.map(u =>
      new Map(getAllRentTiers(u).map(tier => [tier.durationMonths, tier.monthlyRent])),
    );
    const [first, ...rest] = perUnit;
    return [...first.entries()]
      .filter(([months]) => rest.every(m => m.has(months)))
      .map(([durationMonths]) => ({ durationMonths }))
      .sort((a, b) => a.durationMonths - b.durationMonths);
  }, [unitRows, units]);

  const selectedProperty = useMemo(
    () => properties.find(p => p.id === form.propertyId),
    [properties, form.propertyId],
  );

  if (form.rentFormula !== 1 && unitRows.length > 0 && !commonTiers.some(c => c.durationMonths === form.rentFormula)) {
    Promise.resolve().then(() => {
      setForm(f => ({
        ...f, rentFormula: 1,
        hasAdvancePayment: false, advancePaymentAmount: null, advancePaymentDate: null,
        advanceAllocationMethod: null, advanceAppliedTo: null,
        advanceAllocationStartDate: null, advanceAllocationDurationMonths: null,
        fixedMonthlyReductionAmount: null,
      }));
    });
  }

  const totalRent = unitRows.reduce((s, r) => s + (r.rentShare ?? 0), 0);
  const totalCharges = unitRows.reduce((s, r) => s + (r.chargesShare ?? 0), 0);

  const addUnitRow = () => {
    setUnitRows(prev => {
      const hasPrimary = prev.some(r => r.assignmentType === "primary");
      const seed = prev[0];
      return [...prev, {
        unitId: "",
        assignmentType: hasPrimary ? "parking" : "primary",
        rentShare: 0,
        chargesShare: 0,
        startDate: seed?.startDate ?? "",
        endDate: seed?.endDate ?? null,
      }];
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
          next.chargesShare = allInclusive ? 0 : (u.baseCharges ?? 0);
        }
      }
      if (allInclusive) next.chargesShare = 0;
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

  const handleSave = () => {
    const primaryRow = unitRows.find(r => r.assignmentType === "primary");
    const totalR = unitRows.reduce((s, r) => s + (r.rentShare ?? 0), 0);
    const totalC = unitRows.reduce((s, r) => s + (r.chargesShare ?? 0), 0);
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
    if (!form.leaseReference.trim() || !form.propertyId) {
      toast({ title: "Validation Error", description: "Reference and property are required.", variant: "destructive" });
      return;
    }
    if (unitRows.some(r => !r.startDate)) {
      toast({ title: "Validation Error", description: "Every unit must have a start date.", variant: "destructive" });
      return;
    }
    // Derived lease-level dates from the per-unit rows.
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
      { earlier: form.advancePaymentDate, later: form.advanceAllocationStartDate, message: t("validation.dates.allocationStartBeforePayment") },
    ]);
    if (dateErrors.length > 0) {
      toast({ title: t("validation.dates.title"), description: dateErrors.join(" "), variant: "destructive" });
      return;
    }
    if (!form.primaryTenantId) {
      toast({ title: "Validation Error", description: "Please attach at least one tenant to the lease.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(form.dueDayOfMonth) || form.dueDayOfMonth < 1 || form.dueDayOfMonth > 28) {
      toast({ title: "Validation Error", description: t("leases.dueDayRequired"), variant: "destructive" });
      return;
    }
    for (const row of unitRows) {
      const u = units.find(uu => uu.id === row.unitId);
      if (!u || getMonthlyRentForMonths(u, form.rentFormula) == null) {
        toast({ title: "Validation Error", description: "Selected rent formula is not available for every unit. Pick a formula common to all units.", variant: "destructive" });
        return;
      }
    }
    const effectiveUnitId = primaryRow.unitId;
    if (form.lifecycleStage === "active") {
      const existing = getActiveLease(effectiveUnitId);
      if (existing) {
        toast({ title: "Conflict", description: `Unit already has an active lease: ${existing.leaseReference}`, variant: "destructive" });
        return;
      }
    }
    const draft: DraftAssignment[] = unitRows.map(r => ({
      unitId: r.unitId,
      assignmentType: r.assignmentType,
      isPrimary: r.assignmentType === "primary",
      startDate: r.startDate,
      endDate: r.endDate,
      rentShare: r.rentShare,
      chargesShare: r.chargesShare,
    }));
    const unitsValidation = validateLeaseUnits(
      null,
      form.propertyId,
      draft,
      { monthlyRent: totalR, monthlyCharges: totalC },
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
    const formToPersist = {
      ...form,
      startDate: derivedStart,
      endDate: derivedEnd,
      unitId: effectiveUnitId,
      monthlyRent: totalR,
      monthlyCharges: form.pricingMode === "all-inclusive" ? 0 : totalC,
      chargesBillingMode:
        form.pricingMode === "separated"
          ? (form.chargesBillingMode ?? "provision-reconciled")
          : "flat-rate",
    };
    const created = addLease({ ...formToPersist });
    setLeaseUnits(created.id, form.propertyId, unitRows.map(r => ({
      unitId: r.unitId,
      assignmentType: r.assignmentType,
      isPrimary: r.assignmentType === "primary",
      rentShare: r.rentShare,
      chargesShare: form.pricingMode === "all-inclusive" ? 0 : r.chargesShare,
      startDate: r.startDate,
      endDate: r.endDate,
    })));
    toast({ title: "Lease added" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[760px] max-w-[95vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("leases.add")}</DialogTitle>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              {[1, 2, 3].map(n => (
                <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-muted"}`} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("leases.wizard.step")} {step} {t("leases.wizard.of")} 3 — {step === 1 ? t("leases.wizard.leaseDetails") : step === 2 ? t("leases.wizard.tenantDetails") : t("leases.wizard.terms")}
            </p>
          </div>
        </DialogHeader>
        <div className="space-y-4 mt-3">
          {step === 1 && (<>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>{t("leases.leaseReference")} *</Label><Input value={form.leaseReference} onChange={e => setForm(f => ({ ...f, leaseReference: e.target.value }))} placeholder="e.g. BAIL-PAR-003" /></div>
            <div><Label>{t("leases.property")} *</Label>
              <Select
                value={form.propertyId}
                disabled={!!prefillPropertyId}
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
          {/* Unified units table */}
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
                    <TableHead className="h-9 w-auto">{t("leases.col.role")}</TableHead>
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
                              {options.map(u => {
                                const existing = getActiveLease(u.id);
                                const blocked = !!existing;
                                return (
                                  <SelectItem key={u.id} value={u.id} disabled={blocked}>
                                    {u.unitCode} — {u.unitLabel}{blocked ? ` (${t("leases.activeLease")})` : ""}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Select value={row.assignmentType} onValueChange={v => setRoleForRow(idx, v as LeaseUnitAssignmentType)}>
                            <SelectTrigger className="h-8 w-full min-w-[90px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(["primary","parking","cellar","storage","ancillary","office-secondary","commercial-addon","other"] as LeaseUnitAssignmentType[]).map(at => (
                                <SelectItem key={at} value={at}>{t(`leases.assignmentType.${at}` as TranslationKey)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input
                            type="date"
                            value={row.startDate}
                            onChange={ev => updateUnitRow(idx, { startDate: ev.target.value })}
                            className="h-8 w-[140px]"
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input
                            type="date"
                            value={row.endDate ?? ""}
                            onChange={ev => updateUnitRow(idx, { endDate: ev.target.value || null })}
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
                    <TableCell colSpan={4} className="py-2 text-xs uppercase tracking-wide text-muted-foreground">
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
          </div>
          <div className="flex items-start gap-4">
            <div className="w-[300px]">
              <Label className="mb-2 flex h-5 items-center">{t("leases.pricingMode")}</Label>
              <Select
                value={form.pricingMode ?? "separated"}
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
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
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
            </div>
            <div className="flex-1 min-w-0">
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
                    ...f, rentFormula: months,
                    hasAdvancePayment: false, advancePaymentAmount: null, advancePaymentDate: null,
                    advanceAllocationMethod: null, advanceAppliedTo: null,
                    advanceAllocationStartDate: null, advanceAllocationDurationMonths: null,
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
          </div>
          </>)}

          {step === 2 && (
            <div className="space-y-4">
              {(() => {
                const attachedIds = [form.primaryTenantId, ...form.coTenantIds].filter(Boolean);
                const attachAsPrimary = (id: string) => {
                  setForm(f => {
                    if (!f.primaryTenantId) return { ...f, primaryTenantId: id };
                    if (f.primaryTenantId === id || f.coTenantIds.includes(id)) return f;
                    return { ...f, coTenantIds: [...f.coTenantIds, id] };
                  });
                };
                const removeAttached = (id: string) => {
                  setForm(f => {
                    if (f.primaryTenantId === id) {
                      const [next, ...rest] = f.coTenantIds;
                      return { ...f, primaryTenantId: next ?? "", coTenantIds: rest ?? [] };
                    }
                    return { ...f, coTenantIds: f.coTenantIds.filter(x => x !== id) };
                  });
                };
                const availableExisting = tenants.filter(tt => !attachedIds.includes(tt.id));
                return (
                  <>
                    {tenantSubView === "workspace" && (
                      <>
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">{t("leases.tenant")}</Label>
                          <Button type="button" size="sm" onClick={() => setTenantSubView("create")}>
                            <Plus className="h-4 w-4 mr-1" />
                            {t("leases.wizard.createNewTenant")}
                          </Button>
                        </div>
                        <div className="rounded-md border">
                          <Table className="w-full">
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t("leases.tenant")}</TableHead>
                                <TableHead>{t("tenants.email")}</TableHead>
                                <TableHead className="w-[60px]" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {attachedIds.map(id => {
                                const tt = tenants.find(x => x.id === id);
                                return (
                                  <TableRow key={id}>
                                    <TableCell>
                                      <div className="font-medium text-sm">{tt ? getTenantFullName(tt) : "—"}</div>
                                    </TableCell>
                                    <TableCell>
                                      <span className="text-sm text-muted-foreground">{tt?.email ?? "—"}</span>
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => removeAttached(id)}
                                      >
                                        <XIcon className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                              <TableRow>
                                <TableCell>
                                  <Select
                                    value=""
                                    onValueChange={(v) => { if (v) attachAsPrimary(v); }}
                                    disabled={availableExisting.length === 0}
                                  >
                                    <SelectTrigger className="h-8">
                                      <SelectValue placeholder={t("leases.selectTenant")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableExisting.map(tt => (
                                        <SelectItem key={tt.id} value={tt.id}>
                                          {getTenantFullName(tt)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <span className="text-xs text-muted-foreground">—</span>
                                </TableCell>
                                <TableCell />
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </>
                    )}

                    {tenantSubView === "create" && (
                      <div className="space-y-3">
                        <Label className="text-sm">{t("leases.wizard.createNewTenant")}</Label>
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label className="text-xs">{t("tenants.firstName")} *</Label><Input value={tenantForm.firstName} onChange={e => setTenantForm(f => ({ ...f, firstName: e.target.value }))} /></div>
                          <div><Label className="text-xs">{t("tenants.lastName")} *</Label><Input value={tenantForm.lastName} onChange={e => setTenantForm(f => ({ ...f, lastName: e.target.value }))} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label className="text-xs">{t("tenants.email")} *</Label><Input type="email" value={tenantForm.email} onChange={e => setTenantForm(f => ({ ...f, email: e.target.value }))} /></div>
                          <div><Label className="text-xs">{t("tenants.phone")}</Label><Input value={tenantForm.phone} onChange={e => setTenantForm(f => ({ ...f, phone: e.target.value }))} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label className="text-xs">{t("tenants.dateOfBirth")}</Label><Input type="date" value={tenantForm.dateOfBirth ?? ""} onChange={e => setTenantForm(f => ({ ...f, dateOfBirth: e.target.value || null }))} /></div>
                          <div><Label className="text-xs">{t("filter.status")} *</Label>
                            <Select value={tenantForm.status} onValueChange={v => setTenantForm(f => ({ ...f, status: v as TenantStatus }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>{TENANT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}><StatusBadge status={s.value} /></SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div><Label className="text-xs">{t("tenants.identificationNumber")}</Label><Input value={tenantForm.identificationNumber ?? ""} onChange={e => setTenantForm(f => ({ ...f, identificationNumber: e.target.value || null }))} /></div>
                        <div><Label className="text-xs">{t("tenants.currentAddress")}</Label><Textarea value={tenantForm.currentAddress ?? ""} onChange={e => setTenantForm(f => ({ ...f, currentAddress: e.target.value || null }))} rows={2} /></div>
                        <div><Label className="text-xs">{t("common.notes")}</Label><Textarea value={tenantForm.notes} onChange={e => setTenantForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {step === 3 && (<>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>{t("leases.primaryTenant")} *</Label>
              <Select value={form.primaryTenantId} onValueChange={v => setForm(f => ({ ...f, primaryTenantId: v }))} disabled={true}>
                <SelectTrigger><SelectValue placeholder={t("leases.selectTenant")} /></SelectTrigger>
                <SelectContent>{tenants.map(tt => <SelectItem key={tt.id} value={tt.id}>{getTenantFullName(tt)}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {getTenantFullName({ ...tenantForm, id: "", createdAt: "", updatedAt: "" } as Tenant).trim() || "—"}
              </p>
            </div>
            <div><Label>{t("leases.status")} *</Label>
              <Select value={form.lifecycleStage} onValueChange={v => setForm(f => ({ ...f, lifecycleStage: v as LifecycleStage }))}>
                <SelectTrigger><StatusBadge status={form.lifecycleStage} /></SelectTrigger>
                <SelectContent>{LEASE_STAGES.map(s => <SelectItem key={s.value} value={s.value} textValue={s.label}><StatusBadge status={s.value} /></SelectItem>)}</SelectContent>
              </Select>
              <StatusTransitionAlert validation={null} />
            </div>
          </div>
          <div>
            <Label>{t("leases.dueDay")} *</Label>
            <Input
              type="number"
              min={1}
              max={28}
              placeholder="1–28"
              value={form.dueDayOfMonth > 0 ? form.dueDayOfMonth : ""}
              onChange={e => setForm(f => ({
                ...f,
                dueDayOfMonth: e.target.value === "" ? 0 : Number(e.target.value),
              }))}
            />
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
          <div><Label>{t("leases.signedDate")}</Label><Input type="date" value={form.signedDate ?? ""} onChange={e => setForm(f => ({ ...f, signedDate: e.target.value || null }))} /></div>
          <div><Label>{t("common.notes")}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </>)}
        </div>
        <DialogFooter className="mt-6">
          {step === 2 && tenantSubView === "create" ? (
            <>
              <Button variant="outline" onClick={() => { setTenantForm({ ...emptyTenantForm }); setTenantSubView("workspace"); }}>{t("action.cancel")}</Button>
              <Button
                onClick={() => {
                  if (!tenantForm.firstName.trim() || !tenantForm.lastName.trim() || !tenantForm.email.trim()) {
                    toast({ title: "Validation Error", description: "First name, last name, and email are required.", variant: "destructive" });
                    return;
                  }
                  if (tenantForm.dateOfBirth) {
                    const today = new Date().toISOString().slice(0, 10);
                    const dateErrors = validateDateOrder([
                      { earlier: tenantForm.dateOfBirth, later: today, message: t("validation.dates.dateOfBirthInFuture") },
                    ]);
                    if (dateErrors.length > 0) {
                      toast({ title: t("validation.dates.title"), description: dateErrors.join(" "), variant: "destructive" });
                      return;
                    }
                  }
                  const created = addTenant(tenantForm);
                  setForm(f => {
                    if (!f.primaryTenantId) return { ...f, primaryTenantId: created.id };
                    if (f.primaryTenantId === created.id || f.coTenantIds.includes(created.id)) return f;
                    return { ...f, coTenantIds: [...f.coTenantIds, created.id] };
                  });
                  setTenantForm({ ...emptyTenantForm });
                  toast({ title: "Tenant created", description: getTenantFullName(created) });
                  setTenantSubView("workspace");
                }}
              >
                {t("action.saveTenant")}
              </Button>
            </>
          ) : (
            <>
              {step > 1 ? (
                <Button variant="outline" onClick={() => setStep(s => s - 1)}>{t("action.back")}</Button>
              ) : (
                <Button variant="outline" onClick={() => onOpenChange(false)}>{t("action.cancel")}</Button>
              )}
              {step < 3 ? (
                <Button
                  disabled={step === 2 && !form.primaryTenantId}
                  onClick={() => {
                    if (step === 1) {
                      const primaryRow = unitRows.find(r => r.assignmentType === "primary");
                      if (!form.leaseReference.trim() || !form.propertyId || unitRows.length === 0 || !primaryRow?.unitId || unitRows.some(r => !r.unitId)) {
                        toast({ title: "Validation Error", description: "Reference, property, and at least one unit (with a Primary role) are required.", variant: "destructive" });
                        return;
                      }
                    }
                    setStep(s => s + 1);
                  }}
                >
                  {t("action.next")}
                </Button>
              ) : (
                <Button onClick={handleSave}>{t("leases.add")}</Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}