import { useEffect, useMemo, useState } from "react";
import { localTodayISO } from "@/lib/calendarToday";
import { propertyBusinessDateISO } from "@/lib/businessTimeZone";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { DateInput } from "@/components/shared/DateInput";
import { AlertTriangle, Info, Plus, X as XIcon, Search, Users, ChevronDown } from "lucide-react";
import { Lease, LifecycleStage, RentFormula, Tenant, TenantStatus, getTenantFullName, isAncillaryUnitType } from "@/types";
import { validateLeaseUnits, type DraftAssignment } from "@/lib/integrity/leaseUnitAssignmentIntegrity";
import { getAllRentTiers, getMonthlyRentForMonths } from "@/lib/rentTiers";
import { generateHistoricalPaidLeaseReceivables } from "@/lib/leaseReceivables";
import { formatCurrency as fmtCurrency, getCurrencySymbol } from "@/lib/formatters";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { parseNoticeText, serializeNotice, type NoticeUnit } from "@/lib/noticePeriod";
import { validateDateOrder } from "@/lib/dateValidation";
import { isValidEmail } from "@/lib/validation";

type LeaseFormData = Omit<Lease, "id" | "createdAt" | "updatedAt">;
type TenantFormData = Omit<Tenant, "id" | "createdAt" | "updatedAt">;
type LeaseErrorKey = "leaseReference" | "propertyId" | "units" | "primaryTenantId" | "dueDayOfMonth";
type InlineTenantErrorKey = "firstName" | "lastName" | "email";

type UnitRow = {
  unitId: string;
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

const HISTORICAL_BACKFILL_STAGES = new Set<LifecycleStage>(["active", "ended", "terminated"]);

interface LeaseAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (lease: Lease) => void;
  /** When set, locks the property to this id and pre-adds a primary unit row. */
  prefillPropertyId?: string;
  prefillUnitId?: string;
}

export function LeaseAddDialog({ open, onOpenChange, onCreated, prefillPropertyId, prefillUnitId }: LeaseAddDialogProps) {
  const {
    tenants, units, properties, addLease, addTenantPersisted, updateUnitPersisted,
  } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const integrityState = useIntegrityState();
  const [savingLease, setSavingLease] = useState(false);
  const isMainRow = (row: Pick<UnitRow, "unitId">) => {
    const unit = units.find(u => u.id === row.unitId);
    return !!unit && !isAncillaryUnitType(unit.unitType);
  };

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
    indexationEnabled: false,
    indexationFrequency: "yearly",
    indexationBaseDate: null,
    indexationBaseIndex: null,
    indexationCurrentIndex: null,
    indexationCapPercent: null,
    indexationRoundingMode: "nearest-cent",
    indexationNotes: "",
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
  const [formulaDraftOpen, setFormulaDraftOpen] = useState(false);
  const [formulaDraft, setFormulaDraft] = useState({ durationMonths: "", monthlyRent: "" });
  const [errors, setErrors] = useState<Partial<Record<LeaseErrorKey, string>>>({});
  const [tenantErrors, setTenantErrors] = useState<Partial<Record<InlineTenantErrorKey, string>>>({});

  const buildEmptyUnitRow = (seed?: Partial<Pick<UnitRow, "startDate" | "endDate">>): UnitRow => ({
    unitId: "",
    rentShare: 0,
    chargesShare: 0,
    startDate: seed?.startDate ?? "",
    endDate: seed?.endDate ?? null,
  });

  const buildDefaultUnitRowForProperty = (
    propertyId: string,
    seed?: Partial<Pick<UnitRow, "startDate" | "endDate">>,
  ): UnitRow => {
    const [firstUnit] = units
      .filter(unit => unit.propertyId === propertyId)
      .sort((a, b) => a.unitCode.localeCompare(b.unitCode, undefined, { numeric: true, sensitivity: "base" }));
    if (!firstUnit) return buildEmptyUnitRow(seed);
    return {
      unitId: firstUnit.id,
      rentShare: getMonthlyRentForMonths(firstUnit, 1) ?? firstUnit.baseRent ?? 0,
      chargesShare: form.pricingMode === "all-inclusive" ? 0 : (firstUnit.baseCharges ?? 0),
      startDate: seed?.startDate ?? "",
      endDate: seed?.endDate ?? null,
    };
  };

  // Reset internal state every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const initialForm = buildEmptyForm();
    setForm(initialForm);
    setTenantForm({ ...emptyTenantForm });
    setStep(1);
    setTenantSubView("workspace");
    setPendingExistingTenantId("");
    setFormulaDraftOpen(false);
    setFormulaDraft({ durationMonths: "", monthlyRent: "" });
    setErrors({});
    setTenantErrors({});

    // Pre-add a unit row when a unit is prefilled. The assignment type is
    // derived from the unit type, not selected manually.
    if (prefillUnitId) {
      const u = units.find(uu => uu.id === prefillUnitId);
      setUnitRows([{
        unitId: prefillUnitId,
        rentShare: u?.baseRent ?? 0,
        chargesShare: u?.baseCharges ?? 0,
        startDate: "",
        endDate: null,
      }]);
    } else {
      setUnitRows([buildEmptyUnitRow()]);
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
  const todayISO = propertyBusinessDateISO(selectedProperty);

  const formulaUnits = useMemo(() => (
    unitRows
      .map(row => units.find(unit => unit.id === row.unitId))
      .filter((unit): unit is NonNullable<typeof unit> => !!unit)
  ), [unitRows, units]);
  const formulaCreationUnit = formulaUnits.length === 1 ? formulaUnits[0] : null;
  const formulaDraftMonths = Number(formulaDraft.durationMonths);
  const formulaDraftRent = Number(formulaDraft.monthlyRent);
  const formulaDraftTotal =
    Number.isFinite(formulaDraftMonths) && Number.isFinite(formulaDraftRent) && formulaDraftMonths > 0 && formulaDraftRent >= 0
      ? formulaDraftMonths * formulaDraftRent
      : null;

  useEffect(() => {
    if (form.rentFormula !== 1 && unitRows.length > 0 && !commonTiers.some(c => c.durationMonths === form.rentFormula)) {
      setForm(f => ({
        ...f, rentFormula: 1,
        hasAdvancePayment: false, advancePaymentAmount: null, advancePaymentDate: null,
        advanceAllocationMethod: null, advanceAppliedTo: null,
        advanceAllocationStartDate: null, advanceAllocationDurationMonths: null,
        fixedMonthlyReductionAmount: null,
      }));
    }
  }, [commonTiers, form.rentFormula, unitRows.length]);

  const totalRent = unitRows.reduce((s, r) => s + (r.rentShare ?? 0), 0);
  const totalCharges = unitRows.reduce((s, r) => s + (r.chargesShare ?? 0), 0);
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
      null,
      form.propertyId,
      draft,
      { monthlyRent: totalRent, monthlyCharges: totalCharges },
      integrityState,
    ).blockers
      .filter(b => b.code === "LUA_UNIT_OVERLAP" || b.code === "LUA_BILLING_WINDOW_MISMATCH")
      .map(b => b.message);
  }, [form.propertyId, unitRows, totalRent, totalCharges, integrityState]);
  const historicalBackfillPreview = useMemo(() => {
    if (!HISTORICAL_BACKFILL_STAGES.has(form.lifecycleStage)) return { count: 0 };
    if (!form.propertyId || !form.primaryTenantId) return { count: 0 };
    if (!Number.isInteger(form.dueDayOfMonth) || form.dueDayOfMonth < 1) return { count: 0 };
    if (unitRows.length === 0 || unitRows.some(row => !row.unitId || !row.startDate)) return { count: 0 };
    if (!unitRows.some(row => row.startDate < todayISO)) return { count: 0 };

    const primaryRow = unitRows.find(row => {
      const unit = units.find(u => u.id === row.unitId);
      return !!unit && !isAncillaryUnitType(unit.unitType);
    });
    if (!primaryRow) return { count: 0 };

    const derivedStart = unitRows.map(row => row.startDate).sort()[0];
    const anyOpen = unitRows.some(row => !row.endDate);
    const derivedEnd = anyOpen
      ? ""
      : unitRows.map(row => row.endDate as string).sort().slice(-1)[0];
    const previewLease: Lease = {
      ...form,
      id: "preview",
      startDate: derivedStart,
      endDate: derivedEnd,
      unitId: primaryRow.unitId,
      monthlyRent: totalRent,
      monthlyCharges: allInclusive ? 0 : totalCharges,
      createdAt: todayISO,
      updatedAt: todayISO,
    };
    const assignments = unitRows.map((row, index) => ({
      id: `preview-${index}`,
      leaseId: "preview",
      unitId: row.unitId,
      startDate: row.startDate,
      endDate: row.endDate,
      rentShare: row.rentShare,
      chargesShare: allInclusive ? 0 : row.chargesShare,
      notes: "",
      createdAt: todayISO,
      updatedAt: todayISO,
    }));
    const result = generateHistoricalPaidLeaseReceivables(previewLease, {
      currencyCode: selectedProperty?.currencyCode ?? "EUR",
      genId: prefix => `preview-${prefix}`,
      today: todayISO,
      assignments,
      units,
    });
    return { count: result.receivables.length };
  }, [
    allInclusive,
    form,
    selectedProperty?.currencyCode,
    todayISO,
    totalCharges,
    totalRent,
    unitRows,
    units,
  ]);

  const addUnitRow = () => {
    setUnitRows(prev => {
      const seed = prev[0];
      return [...prev, {
        unitId: "",
        rentShare: 0,
        chargesShare: 0,
        startDate: seed?.startDate ?? "",
        endDate: seed?.endDate ?? null,
      }];
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

  const validateStepOne = () => {
    const nextErrors: Partial<Record<LeaseErrorKey, string>> = {};
    const primaryRow = unitRows.find(isMainRow);
    if (!form.leaseReference.trim()) nextErrors.leaseReference = t("common.mandatoryField");
    if (!form.propertyId) nextErrors.propertyId = t("common.mandatoryField");
    if (unitRows.length === 0 || !primaryRow?.unitId || unitRows.some(r => !r.unitId)) {
      nextErrors.units = t("common.mandatoryField");
    }
    setErrors(prev => ({ ...prev, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  };

  const validateStepTwo = () => {
    const nextErrors: Partial<Record<LeaseErrorKey, string>> = {};
    if (!form.primaryTenantId) nextErrors.primaryTenantId = t("common.mandatoryField");
    setErrors(prev => ({ ...prev, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  };

  const validateInlineTenant = () => {
    const nextErrors: Partial<Record<InlineTenantErrorKey, string>> = {};
    if (!tenantForm.firstName.trim()) nextErrors.firstName = t("common.mandatoryField");
    if (!tenantForm.lastName.trim()) nextErrors.lastName = t("common.mandatoryField");
    if (!tenantForm.email.trim()) nextErrors.email = t("common.mandatoryField");
    else if (!isValidEmail(tenantForm.email)) nextErrors.email = t("common.invalidEmail");
    setTenantErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const applyRentFormula = (months: RentFormula) => {
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
      hasAdvancePayment: false, advancePaymentAmount: null, advancePaymentDate: null,
      advanceAllocationMethod: null, advanceAppliedTo: null,
      advanceAllocationStartDate: null, advanceAllocationDurationMonths: null,
      fixedMonthlyReductionAmount: null,
    }));
  };

  const openFormulaDraft = () => {
    if (!formulaCreationUnit) return;
    const currentRent = getMonthlyRentForMonths(formulaCreationUnit, form.rentFormula) ?? formulaCreationUnit.baseRent ?? 0;
    setFormulaDraft({
      durationMonths: "",
      monthlyRent: currentRent ? String(currentRent) : "",
    });
    setFormulaDraftOpen(true);
  };

  const saveFormulaDraft = async () => {
    if (!formulaCreationUnit) {
      toast({ title: "Validation Error", description: "Select one unit before creating a rent formula.", variant: "destructive" });
      return;
    }
    const durationMonths = Math.floor(Number(formulaDraft.durationMonths));
    const monthlyRent = Number(formulaDraft.monthlyRent);
    if (!Number.isInteger(durationMonths) || durationMonths < 1) {
      toast({ title: "Validation Error", description: "Enter a period of at least 1 month.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(monthlyRent) || monthlyRent < 0) {
      toast({ title: "Validation Error", description: "Enter a valid monthly rent.", variant: "destructive" });
      return;
    }

    const nextUnit = durationMonths === 1
      ? { ...formulaCreationUnit, baseRent: monthlyRent }
      : {
          ...formulaCreationUnit,
          rentTiers: [
            ...(formulaCreationUnit.rentTiers ?? []).filter(tier => tier.durationMonths !== durationMonths),
            { durationMonths, monthlyRent },
          ].sort((a, b) => a.durationMonths - b.durationMonths),
        };
    try {
      await updateUnitPersisted(nextUnit);
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      return;
    }
    setUnitRows(prev => prev.map(row => (
      row.unitId === formulaCreationUnit.id
        ? {
            ...row,
            rentShare: monthlyRent,
            chargesShare: allInclusive ? 0 : (formulaCreationUnit.baseCharges ?? 0),
          }
        : row
    )));
    setForm(f => ({
      ...f,
      rentFormula: durationMonths,
      hasAdvancePayment: false, advancePaymentAmount: null, advancePaymentDate: null,
      advanceAllocationMethod: null, advanceAppliedTo: null,
      advanceAllocationStartDate: null, advanceAllocationDurationMonths: null,
      fixedMonthlyReductionAmount: null,
    }));
    setFormulaDraftOpen(false);
    setFormulaDraft({ durationMonths: "", monthlyRent: "" });
    toast({ title: t("leases.formula.saved"), description: formulaCreationUnit.unitCode });
  };

  const handleSave = async () => {
    if (savingLease) return;
    const primaryRow = unitRows.find(isMainRow);
    const totalR = unitRows.reduce((s, r) => s + (r.rentShare ?? 0), 0);
    const totalC = unitRows.reduce((s, r) => s + (r.chargesShare ?? 0), 0);
    if (unitRows.length === 0 || !primaryRow || !primaryRow.unitId) {
      setErrors(prev => ({ ...prev, units: t("common.mandatoryField") }));
      toast({ title: "Validation Error", description: "Add at least one residential or main commercial unit.", variant: "destructive" });
      return;
    }
    if (unitRows.some(r => !r.unitId)) {
      setErrors(prev => ({ ...prev, units: t("common.mandatoryField") }));
      toast({ title: "Validation Error", description: "Every row in Units must have a unit selected.", variant: "destructive" });
      return;
    }
    if (unitRows.filter(isMainRow).length === 0) {
      setErrors(prev => ({ ...prev, units: t("common.mandatoryField") }));
      toast({ title: "Validation Error", description: "At least one selected unit must be residential or main commercial.", variant: "destructive" });
      return;
    }
    const dupCheck = new Set(unitRows.map(r => r.unitId));
    if (dupCheck.size !== unitRows.length) {
      toast({ title: "Validation Error", description: "Duplicate units in the table.", variant: "destructive" });
      return;
    }
    if (!form.leaseReference.trim() || !form.propertyId) {
      setErrors(prev => ({
        ...prev,
        leaseReference: !form.leaseReference.trim() ? t("common.mandatoryField") : prev.leaseReference,
        propertyId: !form.propertyId ? t("common.mandatoryField") : prev.propertyId,
      }));
      toast({ title: "Validation Error", description: "Reference and property are required.", variant: "destructive" });
      return;
    }
    if (unitRows.some(r => (r.rentShare ?? 0) < 0 || (r.chargesShare ?? 0) < 0)) {
      toast({ title: "Validation Error", description: "Rent and charges cannot be negative.", variant: "destructive" });
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
      setErrors(prev => ({ ...prev, primaryTenantId: t("common.mandatoryField") }));
      toast({ title: "Validation Error", description: "Please attach at least one tenant to the lease.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(form.dueDayOfMonth) || form.dueDayOfMonth < 1 || form.dueDayOfMonth > 28) {
      setErrors(prev => ({ ...prev, dueDayOfMonth: t("common.mandatoryField") }));
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
    const draft: DraftAssignment[] = unitRows.map(r => ({
      unitId: r.unitId,
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
    const receivableAssignments = unitRows.map(r => ({
      unitId: r.unitId,
      rentShare: r.rentShare,
      chargesShare: form.pricingMode === "all-inclusive" ? 0 : r.chargesShare,
      startDate: r.startDate,
      endDate: r.endDate,
    }));
    let created: Lease;
    setSavingLease(true);
    try {
      created = await addLease(
        { ...formToPersist },
        {
          receivableAssignments,
          historicalPaidBackfill: historicalBackfillPreview.count > 0,
        },
      );
    } catch (error) {
      toast({ title: "Lease could not be saved", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      return;
    } finally {
      setSavingLease(false);
    }
    toast({ title: "Lease added" });
    onOpenChange(false);
    onCreated?.(created);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>{t("leases.add")}</DialogTitle>
        </DialogHeader>
          <ol className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              { number: 1, label: t("leases.wizard.leaseDetails") },
              { number: 2, label: t("leases.wizard.tenantDetails") },
              { number: 3, label: t("leases.wizard.terms") },
            ].map(({ number, label }) => {
              const isCurrent = step === number;
              const isComplete = step > number;
              return (
                <li key={number}>
                  <button
                    type="button"
                    aria-current={isCurrent ? "step" : undefined}
                    onClick={() => setStep(number)}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                      isCurrent
                        ? "border-primary/40 bg-primary/5 text-foreground"
                        : isComplete
                          ? "border-border bg-muted/40 text-foreground"
                          : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                        isCurrent || isComplete
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {number}
                    </span>
                    <span className="truncate">{label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        <div className="space-y-4 mt-3">
          {step === 1 && (<>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t("leases.leaseReference")} required error={errors.leaseReference}>
              <Input value={form.leaseReference} aria-invalid={!!errors.leaseReference} onChange={e => setForm(f => ({ ...f, leaseReference: e.target.value }))} placeholder="e.g. BAIL-PAR-003" />
            </FormField>
            <FormField label={t("leases.property")} required error={errors.propertyId}>
              <Select
                value={form.propertyId}
                disabled={!!prefillPropertyId}
                onValueChange={v => {
                  const defaultRow = buildDefaultUnitRowForProperty(v, unitRows[0]);
                  setForm(f => ({
                    ...f,
                    propertyId: v,
                    unitId: defaultRow.unitId,
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
                  setUnitRows([defaultRow]);
                  setFormulaDraftOpen(false);
                  setErrors(prev => ({ ...prev, propertyId: undefined, units: undefined }));
                }}
              >
                <SelectTrigger aria-invalid={!!errors.propertyId}><SelectValue placeholder={t("leases.selectProperty")} /></SelectTrigger>
                <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
          </div>
          {/* Unified units table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("leases.units.title")} *</Label>
                {errors.units && <p className="mt-1 text-xs font-medium text-destructive">{errors.units}</p>}
              </div>
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
              <div className="overflow-x-auto">
              <Table className="w-full min-w-[960px] [&_th]:px-2 [&_td]:px-2">
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-9 w-[260px]">{t("leases.col.unit")}</TableHead>
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
                    const selectedUnit = units.find(unit => unit.id === row.unitId);
                    const rowTotal = (row.rentShare ?? 0) + (allInclusive ? 0 : (row.chargesShare ?? 0));
                    return (
                      <TableRow key={idx}>
                        <TableCell className="py-1.5">
                          <Select value={row.unitId} onValueChange={v => updateUnitRow(idx, { unitId: v })}>
                            <SelectTrigger
                              aria-invalid={!!errors.units && !row.unitId}
                              className="h-8 w-full gap-2 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:text-left [&>svg]:shrink-0"
                              title={selectedUnit ? `${selectedUnit.unitCode} — ${selectedUnit.unitLabel}` : undefined}
                            >
                              <SelectValue placeholder={t("leases.selectUnit")} />
                            </SelectTrigger>
                            <SelectContent>
                              {options.map(u => {
                                return (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.unitCode} — {u.unitLabel}
                                  </SelectItem>
                                );
                              })}
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
              </div>
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
            {historicalBackfillPreview.count > 0 && (
              <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">
                      {historicalBackfillPreview.count} historical paid receivable{historicalBackfillPreview.count === 1 ? "" : "s"} will be created
                    </p>
                    <p className="mt-1 text-xs text-blue-900">
                      This lease starts in the past. Past due rent and charge receivables up to the next scheduled receivable will be created as paid so unit and property returns include the historical lease activity.
                    </p>
                  </div>
                </div>
              </div>
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
                disabled={commonTiers.length === 0 && !formulaCreationUnit}
                onValueChange={(raw) => {
                  if (raw === "__new_formula__") {
                    openFormulaDraft();
                    return;
                  }
                  applyRentFormula(Number(raw) as RentFormula);
                }}
              >
                <SelectTrigger className="h-9 w-fit min-w-32 max-w-full gap-4"><SelectValue /></SelectTrigger>
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
                  <SelectSeparator />
                  <SelectItem value="__new_formula__" disabled={!formulaCreationUnit}>
                    <span className="flex items-center gap-2">
                      <Plus className="h-3.5 w-3.5" />
                      {t("leases.formula.new")}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {commonTiers.length === 0 && !formulaCreationUnit && (
                <p className="text-xs text-muted-foreground mt-1">{t("leases.formula.requiresCommonTiers")}</p>
              )}
              {formulaDraftOpen && (
                <div className="mt-3 rounded-md border bg-muted/20 p-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[140px_minmax(0,1fr)_160px_auto]">
                    <div>
                      <Label className="text-xs">{t("units.advancePeriodMonths")}</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={formulaDraft.durationMonths}
                        onChange={event => setFormulaDraft(draft => ({ ...draft, durationMonths: event.target.value }))}
                        className="mt-1 h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t("units.monthlyRent")} ({selectedProperty?.currencyCode ?? ""})</Label>
                      <Input
                        type="number"
                        min={0}
                        value={formulaDraft.monthlyRent}
                        onChange={event => setFormulaDraft(draft => ({ ...draft, monthlyRent: event.target.value }))}
                        className="mt-1 h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t("units.totalForPeriod")}</Label>
                      <div className="mt-1 flex h-8 items-center justify-end rounded-md border bg-background px-2 text-sm text-muted-foreground">
                        {formulaDraftTotal == null
                          ? "—"
                          : fmtCurrency(formulaDraftTotal, selectedProperty?.currencyCode, selectedProperty?.locale)}
                      </div>
                    </div>
                    <div className="flex items-end justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setFormulaDraftOpen(false)}>
                        {t("action.cancel")}
                      </Button>
                      <Button type="button" size="sm" className="h-8" onClick={saveFormulaDraft}>
                        {t("action.save")}
                      </Button>
                    </div>
                  </div>
                </div>
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
                  setPendingExistingTenantId("");
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
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <Label className="text-sm">{t("leases.tenant")} *</Label>
                            {errors.primaryTenantId && <p className="mt-1 text-xs font-medium text-destructive">{errors.primaryTenantId}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            {attachedIds.length > 0 && availableExisting.length > 0 && !pendingExistingTenantId && (
                              <Button type="button" variant="outline" size="sm" onClick={() => setPendingExistingTenantId("__select__")}>
                                <Plus className="h-4 w-4 mr-1" />
                                Add tenant
                              </Button>
                            )}
                            <Button type="button" size="sm" onClick={() => setTenantSubView("create")}>
                              <Plus className="h-4 w-4 mr-1" />
                              {t("leases.wizard.createNewTenant")}
                            </Button>
                          </div>
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
                              {(attachedIds.length === 0 || !!pendingExistingTenantId) && (
                                <TableRow>
                                  <TableCell>
                                    <Select
                                      value=""
                                      onValueChange={(v) => { if (v) attachAsPrimary(v); }}
                                      disabled={availableExisting.length === 0}
                                    >
                                      <SelectTrigger className="h-8" aria-invalid={!!errors.primaryTenantId}>
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
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </>
                    )}

                    {tenantSubView === "create" && (
                      <div className="space-y-3">
                        <Label className="text-sm">{t("leases.wizard.createNewTenant")}</Label>
                        <div className="grid grid-cols-2 gap-3">
                          <FormField label={t("tenants.firstName")} required error={tenantErrors.firstName}>
                            <Input value={tenantForm.firstName} aria-invalid={!!tenantErrors.firstName} onChange={e => setTenantForm(f => ({ ...f, firstName: e.target.value }))} />
                          </FormField>
                          <FormField label={t("tenants.lastName")} required error={tenantErrors.lastName}>
                            <Input value={tenantForm.lastName} aria-invalid={!!tenantErrors.lastName} onChange={e => setTenantForm(f => ({ ...f, lastName: e.target.value }))} />
                          </FormField>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <FormField label={t("tenants.email")} required error={tenantErrors.email}>
                            <Input type="email" value={tenantForm.email} aria-invalid={!!tenantErrors.email} onChange={e => setTenantForm(f => ({ ...f, email: e.target.value }))} />
                          </FormField>
                          <div><Label className="text-xs">{t("tenants.phone")}</Label><Input value={tenantForm.phone} onChange={e => setTenantForm(f => ({ ...f, phone: e.target.value }))} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label className="text-xs">{t("tenants.dateOfBirth")}</Label><DateInput value={tenantForm.dateOfBirth ?? ""} onChange={value => setTenantForm(f => ({ ...f, dateOfBirth: value || null }))} /></div>
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
          <FormField label={t("leases.dueDay")} required error={errors.dueDayOfMonth}>
            <Input
              type="number"
              min={1}
              max={28}
              placeholder="1–28"
              aria-invalid={!!errors.dueDayOfMonth}
              value={form.dueDayOfMonth > 0 ? form.dueDayOfMonth : ""}
              onChange={e => setForm(f => ({
                ...f,
                dueDayOfMonth: e.target.value === "" ? 0 : Number(e.target.value),
              }))}
            />
          </FormField>
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
          <div><Label>{t("leases.signedDate")}</Label><DateInput value={form.signedDate ?? ""} onChange={value => setForm(f => ({ ...f, signedDate: value || null }))} /></div>
          <div><Label>{t("common.notes")}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </>)}
        </div>
        <DialogFooter>
          {step === 2 && tenantSubView === "create" ? (
            <>
              <Button variant="outline" onClick={() => { setTenantForm({ ...emptyTenantForm }); setTenantSubView("workspace"); }}>{t("action.cancel")}</Button>
              <Button
                onClick={async () => {
                  if (!validateInlineTenant()) {
                    toast({ title: "Validation Error", description: t("common.fixHighlightedFields"), variant: "destructive" });
                    return;
                  }
                  if (tenantForm.dateOfBirth) {
                    const today = localTodayISO();
                    const dateErrors = validateDateOrder([
                      { earlier: tenantForm.dateOfBirth, later: today, message: t("validation.dates.dateOfBirthInFuture") },
                    ]);
                    if (dateErrors.length > 0) {
                      toast({ title: t("validation.dates.title"), description: dateErrors.join(" "), variant: "destructive" });
                      return;
                    }
                  }
                  let created;
                  try {
                    created = await addTenantPersisted(tenantForm);
                  } catch (err) {
                    toast({ title: t("common.validationError"), description: err instanceof Error ? err.message : "Tenant could not be saved.", variant: "destructive" });
                    return;
                  }
                  setForm(f => {
                    if (!f.primaryTenantId) return { ...f, primaryTenantId: created.id };
                    if (f.primaryTenantId === created.id || f.coTenantIds.includes(created.id)) return f;
                    return { ...f, coTenantIds: [...f.coTenantIds, created.id] };
                  });
                  setTenantForm({ ...emptyTenantForm });
                  setTenantErrors({});
                  toast({ title: "Tenant created", description: getTenantFullName(created) });
                  setTenantSubView("workspace");
                }}
              >
                {t("action.saveTenant")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t("action.cancel")}</Button>
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep(s => s - 1)}>{t("action.back")}</Button>
              )}
              {step < 3 ? (
                <Button
                  onClick={() => {
                    if (step === 1) {
                      if (!validateStepOne()) {
                        toast({ title: "Validation Error", description: t("common.fixHighlightedFields"), variant: "destructive" });
                        return;
                      }
                      if (unitRows.some(r => (r.rentShare ?? 0) < 0 || (r.chargesShare ?? 0) < 0)) {
                        toast({ title: "Validation Error", description: "Rent and charges cannot be negative.", variant: "destructive" });
                        return;
                      }
                    }
                    if (step === 2 && !validateStepTwo()) {
                      toast({ title: "Validation Error", description: t("common.fixHighlightedFields"), variant: "destructive" });
                      return;
                    }
                    setStep(s => s + 1);
                  }}
                >
                  {t("action.next")}
                </Button>
              ) : (
                <Button onClick={handleSave} disabled={savingLease}>{t("leases.add")}</Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
