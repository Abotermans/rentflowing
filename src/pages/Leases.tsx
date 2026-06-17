import { useState, useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FileText, Plus, Search, Pencil, Bell, Clock, CheckCircle2, Undo2, AlertTriangle, Info } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Link, useNavigate } from "react-router-dom";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { LEASE_STATUS_ICONS, PROPERTY_ICON } from "@/lib/filterIcons";
import { FileCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

import { Lease, LifecycleStage, LeaseStatus, RentFormula, GuaranteeStatus, TenantStatus, Tenant, getTenantFullName, getLeaseStatus, GUARANTEE_TYPE_LABELS, ASSIGNMENT_TYPE_LABELS } from "@/types";
import type { LeaseUnitAssignmentType } from "@/types";
import { X as XIcon } from "lucide-react";
import type { TranslationKey } from "@/i18n/translations";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/context/SettingsContext";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { canChangeLeaseStatus } from "@/lib/integrity/leaseIntegrity";
import { validateLeaseUnits, type DraftAssignment } from "@/lib/integrity/leaseUnitAssignmentIntegrity";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";
import { OverrideConfirmDialog } from "@/components/shared/OverrideConfirmDialog";
import { useOverrideHistory } from "@/context/OverrideContext";
import type { ValidationResult } from "@/lib/integrity/types";
import { getAllRentTiers, getMonthlyRentForMonths } from "@/lib/rentTiers";
import { formatCurrency as fmtCurrency, getCurrencySymbol } from "@/lib/formatters";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";
import { LeaseEditDialog } from "@/components/leases/LeaseEditDialog";
import { LeaseAddDialog } from "@/components/leases/LeaseAddDialog";

const LEASE_STAGES: { value: LifecycleStage; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending-signature", label: "Pending Signature" },
  { value: "signed", label: "Signed" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
  { value: "terminated", label: "Terminated" },
];

const LEASE_STATUS_FILTERS: { value: LeaseStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending-signature", label: "Pending Signature" },
  { value: "signed", label: "Signed" },
  { value: "active", label: "Active" },
  { value: "under-notice", label: "Under notice" },
  { value: "overdue-end", label: "Overdue end" },
  { value: "ended", label: "Ended" },
  { value: "terminated", label: "Terminated" },
];

type LeaseFormData = Omit<Lease, "id" | "createdAt" | "updatedAt">;
type TenantFormData = Omit<Tenant, "id" | "createdAt" | "updatedAt">;

const TENANT_STATUSES: { value: TenantStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "applicant", label: "Applicant" },
  { value: "former", label: "Former" },
];

const GUARANTEE_DISPLAY: Record<GuaranteeStatus, { icon: LucideIcon; labelKey: TranslationKey; className: string }> = {
  active:               { icon: CheckCircle2,  labelKey: "guarantee.deposited",         className: "text-success" },
  released:             { icon: Undo2,         labelKey: "guarantee.released",          className: "text-muted-foreground" },
  pending:              { icon: Clock,         labelKey: "guarantee.waiting",           className: "text-warning" },
  incomplete:           { icon: Clock,         labelKey: "guarantee.waiting",           className: "text-warning" },
  "partially-retained": { icon: AlertTriangle, labelKey: "guarantee.partiallyRetained", className: "text-warning" },
};

const ALLOWED_TRANSITIONS: Record<LifecycleStage, LifecycleStage[]> = {
  draft: ["draft", "pending-signature"],
  "pending-signature": ["pending-signature", "draft", "signed"],
  signed: ["signed", "active", "terminated"],
  active: ["active", "ended", "terminated"],
  ended: ["ended", "terminated"],
  terminated: ["terminated"],
};

export default function Leases() {
  const navigate = useNavigate();
  const { leases, tenants, units, properties, leaseUnitAssignments, addLease, updateLease, addTenant, getActiveLease, getGuaranteeByLease, getLeaseAssignments, setLeaseUnits, getAncillaryLeaseUnits } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverrideValidation, setPendingOverrideValidation] = useState<ValidationResult | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterProperty, setFilterProperty] = useState<string[]>([]);
  const [filterEndingSoon, setFilterEndingSoon] = useState(false);
  const [filterUnderNotice, setFilterUnderNotice] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingLease, setEditingLease] = useState<Lease | null>(null);

  type LSortKey = "reference" | "tenant" | "property" | "unit" | "formula" | "status" | "guarantee" | "start" | "end" | "total";
  const { sort, toggle } = useTableSort<LSortKey>();

  const emptyForm: LeaseFormData = {
    leaseReference: "", propertyId: properties[0]?.id ?? "", unitId: "", primaryTenantId: "",
    coTenantIds: [], lifecycleStage: "draft", startDate: "", endDate: "",
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
  };
  const [form, setForm] = useState<LeaseFormData>({ ...emptyForm });
  // Unified rows for every unit attached to this lease. Exactly one row must
  // carry `assignmentType === "primary"` — its unitId becomes `lease.unitId`.
  // Lease totals (`form.monthlyRent` / `monthlyCharges`) are derived from the
  // sum of these rows on save.
  type UnitRow = {
    unitId: string;
    assignmentType: LeaseUnitAssignmentType;
    rentShare: number;
    chargesShare: number;
  };
  const [unitRows, setUnitRows] = useState<UnitRow[]>([]);

  const emptyTenantForm: TenantFormData = {
    kind: "individual",
    firstName: "", lastName: "", email: "", phone: "",
    dateOfBirth: null, identificationNumber: null, currentAddress: null,
    status: "active", notes: "",
    companyName: null, legalForm: null, registrationNumber: null, vatNumber: null,
    contactFirstName: null, contactLastName: null, contactRole: null,
  };
  const [tenantForm, setTenantForm] = useState<TenantFormData>({ ...emptyTenantForm });
  const [step, setStep] = useState(1);
  const [tenantMode, setTenantMode] = useState<"existing" | "new">("existing");
  // ID being selected in the "Add existing tenant" sub-panel (not yet attached).
  const [pendingExistingTenantId, setPendingExistingTenantId] = useState<string>("");

  const openAdd = () => {
    setEditingLease(null);
    setForm({ ...emptyForm });
    setTenantForm({ ...emptyTenantForm });
    setUnitRows([]);
    setStep(1);
    setTenantMode(tenants.length > 0 ? "existing" : "new");
    setPendingExistingTenantId("");
    setSheetOpen(true);
  };
  const openEdit = (l: Lease) => {
    setEditingLease(l);
    const { id, createdAt, updatedAt, ...rest } = l;
    setForm(rest);
    const today = new Date().toISOString().slice(0, 10);
    const all = getLeaseAssignments(l.id)
      .filter(a => !a.endDate || a.endDate >= today)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    const rows: UnitRow[] = all.map(a => ({
      unitId: a.unitId,
      assignmentType: a.isPrimary ? "primary" : a.assignmentType,
      rentShare: a.rentShare ?? 0,
      chargesShare: a.chargesShare ?? 0,
    }));
    // Fallback: ensure the lease's primary unit is present even if assignments
    // weren't migrated yet.
    if (!rows.some(r => r.assignmentType === "primary") && l.unitId) {
      rows.unshift({
        unitId: l.unitId,
        assignmentType: "primary",
        rentShare: l.monthlyRent,
        chargesShare: l.monthlyCharges,
      });
    }
    setUnitRows(rows);
    setSheetOpen(true);
  };

  // Status transition validation for the form
  const statusValidation = useMemo(() => {
    if (!editingLease || form.lifecycleStage === editingLease.lifecycleStage) return null;
    return canChangeLeaseStatus(editingLease.id, form.lifecycleStage, integrityState);
  }, [editingLease, form.lifecycleStage, integrityState]);

  const availableStatuses = useMemo(() => {
    if (!editingLease) return LEASE_STAGES; // new lease: all stages
    const allowed = ALLOWED_TRANSITIONS[editingLease.lifecycleStage] || [editingLease.lifecycleStage];
    return LEASE_STAGES.filter(s => allowed.includes(s.value));
  }, [editingLease]);

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
    // Derive lease-level totals + primary unit id from the rows table.
    const primaryRow = unitRows.find(r => r.assignmentType === "primary");
    const totalRent = unitRows.reduce((s, r) => s + (r.rentShare ?? 0), 0);
    const totalCharges = unitRows.reduce((s, r) => s + (r.chargesShare ?? 0), 0);
    const formToPersist = {
      ...form,
      unitId: primaryRow?.unitId ?? form.unitId,
      monthlyRent: totalRent,
      monthlyCharges: totalCharges,
    };
    if (editingLease) {
      updateLease({ ...editingLease, ...formToPersist });
      persistAssignments(editingLease.id);
      toast({ title: "Lease updated" });
    } else {
      const created = addLease({ ...formToPersist });
      persistAssignments(created.id);
      toast({ title: "Lease added" });
    }
    setSheetOpen(false);
  };

  const handleSave = () => {
    // Derive primary unit + totals from the rows (single source of truth).
    const primaryRow = unitRows.find(r => r.assignmentType === "primary");
    const totalRent = unitRows.reduce((s, r) => s + (r.rentShare ?? 0), 0);
    const totalCharges = unitRows.reduce((s, r) => s + (r.chargesShare ?? 0), 0);
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
    if (editingLease) {
      if (!form.leaseReference.trim() || !form.propertyId || !form.primaryTenantId || !form.startDate || !form.endDate) {
        toast({ title: "Validation Error", description: "Reference, property, unit, tenant, start date, and end date are required.", variant: "destructive" });
        return;
      }
    } else {
      if (!form.leaseReference.trim() || !form.propertyId || !form.startDate || !form.endDate) {
        toast({ title: "Validation Error", description: "Reference, property, unit, start date, and end date are required.", variant: "destructive" });
        return;
      }
      if (!form.primaryTenantId) {
        toast({ title: "Validation Error", description: "Please attach at least one tenant to the lease.", variant: "destructive" });
        return;
      }
    }
    // Every selected unit must support the chosen rent formula.
    for (const row of unitRows) {
      const u = units.find(uu => uu.id === row.unitId);
      if (!u || getMonthlyRentForMonths(u, form.rentFormula) == null) {
        toast({ title: "Validation Error", description: "Selected rent formula is not available for every unit. Pick a formula common to all units.", variant: "destructive" });
        return;
      }
    }
    // Validate status transition
    if (editingLease && form.lifecycleStage !== editingLease.lifecycleStage) {
      const validation = canChangeLeaseStatus(editingLease.id, form.lifecycleStage, integrityState);
      if (!validation.allowed) {
        if (validation.overrideAllowed) {
          setPendingOverrideValidation(validation);
          setOverrideDialogOpen(true);
          return;
        }
        toast({ title: "Status change blocked", description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
        return;
      }
      // Show warning toast if allowed but has warnings
      if (validation.warnings.length > 0) {
        toast({ title: "Lease saved with warnings", description: validation.warnings.map(w => w.message).join(". ") });
      }
    }
    if (form.lifecycleStage === "active") {
      const existing = getActiveLease(effectiveUnitId);
      if (existing && existing.id !== editingLease?.id) {
        toast({ title: "Conflict", description: `Unit already has an active lease: ${existing.leaseReference}`, variant: "destructive" });
        return;
      }
    }
    // Build the assignment draft from the unified rows.
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
      editingLease?.id ?? null,
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

  const handleLeaseOverrideConfirm = (reason: string) => {
    if (!editingLease || !pendingOverrideValidation) return;
    addOverride({
      entityType: "lease",
      entityId: editingLease.id,
      action: `status_change:${form.lifecycleStage}`,
      blockerCodes: pendingOverrideValidation.blockers.map(b => b.code),
      reason,
    });
    updateLease({ ...editingLease, ...form });
    setSheetOpen(false);
    toast({ title: "Lease updated (overridden)", description: `Override reason: ${reason}` });
    setPendingOverrideValidation(null);
  };


  const now = new Date();
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const filtered = leases.filter(l => {
    const tenant = tenants.find(t => t.id === l.primaryTenantId);
    const prop = properties.find(p => p.id === l.propertyId);
    const q = search.toLowerCase();
    const matchSearch = !q || l.leaseReference.toLowerCase().includes(q) ||
      (tenant ? getTenantFullName(tenant).toLowerCase().includes(q) : false) ||
      (prop?.name.toLowerCase().includes(q) ?? false);
    const matchStatus = filterStatus.length === 0 || filterStatus.includes(getLeaseStatus(l));
    const matchProperty = filterProperty.length === 0 || filterProperty.includes(l.propertyId);
    const matchEnding = !filterEndingSoon || (l.lifecycleStage === "active" && new Date(l.endDate) <= in90Days);
    const matchNotice = !filterUnderNotice || l.noticeGiven;
    return matchSearch && matchStatus && matchProperty && matchEnding && matchNotice;
  });

  const sorted = sortRows(filtered, sort, (l, key) => {
    const tenant = tenants.find(t => t.id === l.primaryTenantId);
    const prop = properties.find(p => p.id === l.propertyId);
    const unit = units.find(u => u.id === l.unitId);
    const guarantee = getGuaranteeByLease(l.id);
    switch (key) {
      case "reference": return l.leaseReference;
      case "tenant": return tenant ? getTenantFullName(tenant) : "";
      case "property": return prop?.name ?? "";
      case "unit": return unit?.unitCode ?? "";
      case "formula": return l.rentFormula;
      case "status": return getLeaseStatus(l);
      case "guarantee": return guarantee?.status ?? null;
      case "start": return l.startDate;
      case "end": return l.endDate;
      case "total": return l.monthlyRent + l.monthlyCharges;
    }
  });

  const { pageItems: pagedLeases, page: leasePage, pageSize: leasePageSize, setPage: setLeasePage, setPageSize: setLeasePageSize, total: leaseTotal, totalPages: leaseTotalPages, from: leaseFrom, to: leaseTo } = usePagination(sorted);

  const formUnits = units.filter(u => u.propertyId === form.propertyId);

  // Intersection of advance-payment tiers across every selected unit. The
  // rent formula can only pick a duration supported by all of them, since one
  // formula applies uniformly to every unit attached to the lease.
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
  const selectedProperty = useMemo(
    () => properties.find(p => p.id === form.propertyId),
    [properties, form.propertyId],
  );

  // If the current rentFormula is no longer supported by every selected unit
  // (e.g. user added a unit without that tier), reset to monthly.
  if (form.rentFormula !== 1 && unitRows.length > 0 && !commonTiers.some(t => t.durationMonths === form.rentFormula)) {
    // Defer state update out of render.
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

  // Derived totals for the units table footer + step-3 summary.
  const totalRent = unitRows.reduce((s, r) => s + (r.rentShare ?? 0), 0);
  const totalCharges = unitRows.reduce((s, r) => s + (r.chargesShare ?? 0), 0);

  const addUnitRow = () => {
    setUnitRows(prev => {
      const hasPrimary = prev.some(r => r.assignmentType === "primary");
      return [...prev, {
        unitId: "",
        assignmentType: hasPrimary ? "parking" : "primary",
        rentShare: 0,
        chargesShare: 0,
      }];
    });
  };
  const removeUnitRow = (idx: number) => {
    setUnitRows(prev => {
      const next = prev.filter((_, i) => i !== idx);
      // Ensure at least one row stays primary.
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
      // When user picks a unit, pre-fill rent + charges from the unit's
      // tier for the currently-selected rent formula (falls back to baseRent).
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
      // Only one primary allowed: demote others to parking.
      if (role === "primary" && r.assignmentType === "primary") return { ...r, assignmentType: "parking" };
      return r;
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("leases.title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative inline-flex">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("action.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 min-w-[180px] max-w-[400px] [field-sizing:content]" />
          </div>
          <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-2" />{t("leases.add")}</Button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <MultiSelectFilter
            label={t("filter.status")}
            icon={FileCheck}
            values={filterStatus}
            onChange={setFilterStatus}
            options={LEASE_STATUS_FILTERS.map(s => ({ value: s.value, label: s.label, icon: LEASE_STATUS_ICONS[s.value] }))}
          />
          <MultiSelectFilter
            label={t("filter.property")}
            icon={PROPERTY_ICON}
            values={filterProperty}
            onChange={setFilterProperty}
            options={properties.map(p => ({ value: p.id, label: p.name, icon: PROPERTY_ICON }))}
          />
          <Button variant={filterEndingSoon ? "default" : "outline"} size="sm" className="h-9 font-normal" onClick={() => setFilterEndingSoon(!filterEndingSoon)}>
            <Clock className="h-3.5 w-3.5 text-muted-foreground mr-1.5" />{t("filter.endingSoon")}
          </Button>
          <Button variant={filterUnderNotice ? "default" : "outline"} size="sm" className="h-9 font-normal" onClick={() => setFilterUnderNotice(!filterUnderNotice)}>
            <Bell className="h-3.5 w-3.5 text-muted-foreground mr-1.5" />{t("filter.underNotice")}
          </Button>
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap mt-1.5">
          {filtered.length} {t("leases.title").toLowerCase()}
        </span>
      </div>

      {leases.length === 0 ? (
        <EmptyState icon={FileText} title={t("leases.empty")} description={t("leases.emptyDesc")} actionLabel={t("leases.add")} onAction={openAdd} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title={t("filter.noResults")} description={t("filter.noResultsDesc")} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="reference" sort={sort} onSort={toggle}>{t("leases.reference")}</SortableTableHead>
                <SortableTableHead sortKey="tenant" sort={sort} onSort={toggle}>{t("leases.tenant")}</SortableTableHead>
                <SortableTableHead sortKey="property" sort={sort} onSort={toggle}>{t("leases.property")}</SortableTableHead>
                <SortableTableHead sortKey="unit" sort={sort} onSort={toggle}>{t("leases.unit")}</SortableTableHead>
                <SortableTableHead sortKey="formula" sort={sort} onSort={toggle}>{t("leases.formula")}</SortableTableHead>
                <SortableTableHead sortKey="status" sort={sort} onSort={toggle}>{t("leases.status")}</SortableTableHead>
                <SortableTableHead sortKey="guarantee" sort={sort} onSort={toggle}>{t("leases.guarantee")}</SortableTableHead>
                <SortableTableHead sortKey="start" sort={sort} onSort={toggle}>{t("leases.start")}</SortableTableHead>
                <SortableTableHead sortKey="end" sort={sort} onSort={toggle}>{t("leases.end")}</SortableTableHead>
                <SortableTableHead sortKey="total" sort={sort} onSort={toggle} align="right">{t("leases.total")}</SortableTableHead>
                <TableHead className="text-right">{t("leases.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedLeases.map(l => {
                const tenant = tenants.find(t => t.id === l.primaryTenantId);
                const prop = properties.find(p => p.id === l.propertyId);
                const unit = units.find(u => u.id === l.unitId);
                const guarantee = getGuaranteeByLease(l.id);
                const ancillaryUnits = getAncillaryLeaseUnits(l.id, { activeOnly: true });
                const ancillaryCount = ancillaryUnits.length;
                return (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/leases/${l.id}`)}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span>{l.leaseReference}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tenant ? <Link to={`/tenants/${tenant.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{getTenantFullName(tenant)}</Link> : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {prop ? <Link to={`/properties/${prop.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{prop.name}</Link> : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        {unit ? <Link to={`/units/${unit.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{unit.unitCode}</Link> : "—"}
                        {ancillaryCount > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground cursor-help"
                              >
                                +{ancillaryCount}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <div className="space-y-0.5">
                                {ancillaryUnits.map(({ unit: u }) => (
                                  <div key={u.id} className="text-xs">{u.unitCode}</div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.rentFormula === 1
                        ? t("leases.formula.monthly")
                        : `${l.rentFormula} ${t("units.advancePeriodMonths").toLowerCase().replace(/\s*\(.*\)/, "")}`}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={getLeaseStatus(l)} />
                    </TableCell>
                    <TableCell>
                      {guarantee ? (
                        (() => {
                          const d = GUARANTEE_DISPLAY[guarantee.status];
                          const Icon = d.icon;
                          return (
                            <div className={`flex items-center gap-1.5 text-xs ${d.className}`}>
                              <Icon className="h-3.5 w-3.5" />
                              <span>{t(d.labelKey)}</span>
                            </div>
                          );
                        })()
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(l.startDate, prop?.locale)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(l.endDate, prop?.locale)}</TableCell>
                    <TableCell className="text-right font-medium text-foreground">{prop ? formatCurrency(l.monthlyRent + l.monthlyCharges, prop.currencyCode, prop.locale) : l.monthlyRent + l.monthlyCharges}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {l.lifecycleStage === "draft" && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(l); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination page={leasePage} pageSize={leasePageSize} total={leaseTotal} totalPages={leaseTotalPages} from={leaseFrom} to={leaseTo} onPageChange={setLeasePage} onPageSizeChange={setLeasePageSize} />
        </Card>
      )}

      {editingLease && (
        <LeaseEditDialog
          lease={editingLease}
          open={sheetOpen}
          onOpenChange={(open) => {
            setSheetOpen(open);
            if (!open) setEditingLease(null);
          }}
        />
      )}

      {!editingLease && (
      <LeaseAddDialog open={sheetOpen} onOpenChange={setSheetOpen} />
      )}

      {/* Override Confirm Dialog */}
      {pendingOverrideValidation && (
        <OverrideConfirmDialog
          open={overrideDialogOpen}
          onOpenChange={(v) => { setOverrideDialogOpen(v); if (!v) setPendingOverrideValidation(null); }}
          validation={pendingOverrideValidation}
          actionLabel="Override and Save"
          onOverride={handleLeaseOverrideConfirm}
        />
      )}
    </div>
  );
}
