import { useState, useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FileText, Plus, Search, Pencil, Trash2, Bell, Clock, CheckCircle2, Undo2, AlertTriangle, Info } from "lucide-react";
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
import { DeleteDialog } from "@/components/shared/DeleteDialog";
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

const LEASE_STAGES: { value: LifecycleStage; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
  { value: "terminated", label: "Terminated" },
];

const LEASE_STATUS_FILTERS: { value: LeaseStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
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
  draft: ["draft", "active"],
  active: ["active", "ended", "terminated"],
  ended: ["ended"],
  terminated: ["terminated"],
};

export default function Leases() {
  const navigate = useNavigate();
  const { leases, tenants, units, properties, leaseUnitAssignments, addLease, updateLease, deleteLease, addTenant, getActiveLease, getGuaranteeByLease, getLeaseAssignments, setLeaseUnits, getAncillaryLeaseUnits } = useAppData();
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

  const emptyForm: LeaseFormData = {
    leaseReference: "", propertyId: properties[0]?.id ?? "", unitId: "", primaryTenantId: "",
    coTenantIds: [], lifecycleStage: "draft", startDate: "", endDate: "",
    monthlyRent: 0, monthlyCharges: 0, dueDayOfMonth: 1,
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
    firstName: "", lastName: "", email: "", phone: "",
    dateOfBirth: null, identificationNumber: null, currentAddress: null,
    status: "active", notes: "",
  };
  const [tenantForm, setTenantForm] = useState<TenantFormData>({ ...emptyTenantForm });
  const [step, setStep] = useState(1);
  const [tenantMode, setTenantMode] = useState<"existing" | "new">("existing");

  const openAdd = () => {
    setEditingLease(null);
    setForm({ ...emptyForm });
    setTenantForm({ ...emptyTenantForm });
    setUnitRows([]);
    setStep(1);
    setTenantMode(tenants.length > 0 ? "existing" : "new");
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
      if (tenantMode === "new") {
        const newTenant = addTenant(tenantForm);
        const created = addLease({ ...formToPersist, primaryTenantId: newTenant.id });
        persistAssignments(created.id);
        toast({ title: "Lease added", description: `Tenant ${getTenantFullName(newTenant)} created` });
      } else {
        const created = addLease({ ...formToPersist });
        persistAssignments(created.id);
        toast({ title: "Lease added" });
      }
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
      if (tenantMode === "new") {
        if (!tenantForm.firstName.trim() || !tenantForm.lastName.trim() || !tenantForm.email.trim()) {
          toast({ title: "Validation Error", description: "Tenant first name, last name, and email are required.", variant: "destructive" });
          return;
        }
      } else {
        if (!form.primaryTenantId) {
          toast({ title: "Validation Error", description: "Please select a tenant.", variant: "destructive" });
          return;
        }
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

  const handleDelete = (lid: string) => {
    deleteLease(lid);
    toast({ title: "Lease deleted" });
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
          <Button variant={filterEndingSoon ? "default" : "outline"} size="sm" className="h-9" onClick={() => setFilterEndingSoon(!filterEndingSoon)}>
            {t("filter.endingSoon")}
          </Button>
          <Button variant={filterUnderNotice ? "default" : "outline"} size="sm" className="h-9" onClick={() => setFilterUnderNotice(!filterUnderNotice)}>
            <Bell className="h-3.5 w-3.5 mr-1" />{t("filter.underNotice")}
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
                <TableHead>{t("leases.reference")}</TableHead>
                <TableHead>{t("leases.tenant")}</TableHead>
                <TableHead>{t("leases.property")}</TableHead>
                <TableHead>{t("leases.unit")}</TableHead>
                <TableHead>{t("leases.formula")}</TableHead>
                <TableHead>{t("leases.status")}</TableHead>
                <TableHead>{t("leases.guarantee")}</TableHead>
                <TableHead>{t("leases.start")}</TableHead>
                <TableHead>{t("leases.end")}</TableHead>
                <TableHead className="text-right">{t("leases.total")}</TableHead>
                <TableHead className="text-right">{t("leases.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(l => {
                const tenant = tenants.find(t => t.id === l.primaryTenantId);
                const prop = properties.find(p => p.id === l.propertyId);
                const unit = units.find(u => u.id === l.unitId);
                const guarantee = getGuaranteeByLease(l.id);
                const ancillaryCount = getAncillaryLeaseUnits(l.id, { activeOnly: true }).length;
                return (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/leases/${l.id}`)}>
                    <TableCell className="font-mono text-xs font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="text-foreground">{l.leaseReference}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tenant ? <Link to={`/tenants/${tenant.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{getTenantFullName(tenant)}</Link> : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {prop ? <Link to={`/properties/${prop.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{prop.name}</Link> : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        {unit ? <Link to={`/units/${unit.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{unit.unitCode}</Link> : "—"}
                        {ancillaryCount > 0 && (
                          <span
                            className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                            title={`${ancillaryCount} ${t("leases.role.ancillary")}`}
                          >
                            +{ancillaryCount}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
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
                    <TableCell className="text-muted-foreground text-xs">{formatDate(l.startDate, prop?.locale)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatDate(l.endDate, prop?.locale)}</TableCell>
                    <TableCell className="text-right font-medium text-foreground">{prop ? formatCurrency(l.monthlyRent + l.monthlyCharges, prop.currencyCode, prop.locale) : l.monthlyRent + l.monthlyCharges}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(l); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <div onClick={(e) => e.stopPropagation()}>
                          <DeleteDialog entityType="lease" entityId={l.id} entityLabel="lease" onDelete={handleDelete} />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="w-[760px] max-w-[95vw] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLease ? t("leases.edit") : t("leases.add")}</DialogTitle>
            {!editingLease && (
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
            )}
          </DialogHeader>
          <div className="space-y-4 mt-6">
            {(editingLease || step === 1) && (<>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("leases.leaseReference")} *</Label><Input value={form.leaseReference} onChange={e => setForm(f => ({ ...f, leaseReference: e.target.value }))} placeholder="e.g. BAIL-PAR-003" /></div>
              <div><Label>{t("leases.property")} *</Label>
                <Select value={form.propertyId} onValueChange={v => {
                  setForm(f => ({ ...f, propertyId: v, unitId: "" }));
                  setUnitRows([]);
                }}>
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
                                  const blocked = existing && existing.id !== editingLease?.id;
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
                                {(["primary","parking","cellar","storage","ancillary","office-secondary","commercial-addon","other"] as LeaseUnitAssignmentType[]).map(at => (
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
            </>)}
            {(editingLease || step === 3) && (<>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("leases.primaryTenant")} *</Label>
                <Select value={form.primaryTenantId} onValueChange={v => setForm(f => ({ ...f, primaryTenantId: v }))} disabled={!editingLease}>
                  <SelectTrigger><SelectValue placeholder={t("leases.selectTenant")} /></SelectTrigger>
                  <SelectContent>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{getTenantFullName(t)}</SelectItem>)}</SelectContent>
                </Select>
                {!editingLease && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {getTenantFullName({ ...tenantForm, id: "", createdAt: "", updatedAt: "" } as Tenant).trim() || "—"}
                  </p>
                )}
              </div>
            <div><Label>{t("leases.status")} *</Label>
                <Select value={form.lifecycleStage} onValueChange={v => setForm(f => ({ ...f, lifecycleStage: v as LifecycleStage }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{availableStatuses.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
                <StatusTransitionAlert validation={statusValidation} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("leases.startDate")} *</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div><Label>{t("leases.endDate")} *</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            </>)}
            {(editingLease || step === 1) && (
            <div>
              <div className="grid grid-cols-[160px_minmax(0,1fr)] items-start gap-4">
                <div>
                  <Label className="mb-2 flex h-5 items-center">{t("leases.formula")} *</Label>
                  <Select
                    value={String(form.rentFormula)}
                    disabled={commonTiers.length === 0}
                    onValueChange={(raw) => {
                  const months = Number(raw) as RentFormula;
                  // Rewrite every row's rent share to the chosen tier for that unit.
                  setUnitRows(prev => prev.map(r => {
                    const u = units.find(uu => uu.id === r.unitId);
                    if (!u) return r;
                    const tier = getMonthlyRentForMonths(u, months);
                    return tier == null ? r : { ...r, rentShare: tier };
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
            )}
            {(editingLease || step === 3) && (<>
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
            <div><Label>{t("leases.signedDate")}</Label><Input type="date" value={form.signedDate ?? ""} onChange={e => setForm(f => ({ ...f, signedDate: e.target.value || null }))} /></div>
            <div><Label>{t("common.notes")}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
            </>)}
            {!editingLease && step === 2 && (
              <div className="space-y-4">
                <div className="inline-flex rounded-md border border-input p-0.5 bg-muted/30">
                  <button
                    type="button"
                    onClick={() => setTenantMode("existing")}
                    disabled={tenants.length === 0}
                    className={`px-3 py-1.5 text-xs rounded-sm transition-colors ${tenantMode === "existing" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {t("leases.wizard.useExistingTenant")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTenantMode("new")}
                    className={`px-3 py-1.5 text-xs rounded-sm transition-colors ${tenantMode === "new" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {t("leases.wizard.createNewTenant")}
                  </button>
                </div>
                {tenantMode === "existing" ? (
                  <div>
                    <Label>{t("leases.primaryTenant")} *</Label>
                    <Select value={form.primaryTenantId} onValueChange={v => setForm(f => ({ ...f, primaryTenantId: v }))}>
                      <SelectTrigger><SelectValue placeholder={t("leases.wizard.selectTenantPlaceholder")} /></SelectTrigger>
                      <SelectContent>
                        {tenants.map(tt => (
                          <SelectItem key={tt.id} value={tt.id}>
                            {getTenantFullName(tt)} — {tt.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (<>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>{t("tenants.firstName")} *</Label><Input value={tenantForm.firstName} onChange={e => setTenantForm(f => ({ ...f, firstName: e.target.value }))} /></div>
                  <div><Label>{t("tenants.lastName")} *</Label><Input value={tenantForm.lastName} onChange={e => setTenantForm(f => ({ ...f, lastName: e.target.value }))} /></div>
                </div>
                <div><Label>{t("tenants.email")} *</Label><Input type="email" value={tenantForm.email} onChange={e => setTenantForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div><Label>{t("tenants.phone")}</Label><Input value={tenantForm.phone} onChange={e => setTenantForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>{t("tenants.dateOfBirth")}</Label><Input type="date" value={tenantForm.dateOfBirth ?? ""} onChange={e => setTenantForm(f => ({ ...f, dateOfBirth: e.target.value || null }))} /></div>
                  <div><Label>{t("filter.status")} *</Label>
                    <Select value={tenantForm.status} onValueChange={v => setTenantForm(f => ({ ...f, status: v as TenantStatus }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TENANT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>{t("tenants.identificationNumber")}</Label><Input value={tenantForm.identificationNumber ?? ""} onChange={e => setTenantForm(f => ({ ...f, identificationNumber: e.target.value || null }))} /></div>
                <div><Label>{t("tenants.currentAddress")}</Label><Textarea value={tenantForm.currentAddress ?? ""} onChange={e => setTenantForm(f => ({ ...f, currentAddress: e.target.value || null }))} rows={2} /></div>
                <div><Label>{t("common.notes")}</Label><Textarea value={tenantForm.notes} onChange={e => setTenantForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
                </>)}
              </div>
            )}
          </div>
          <DialogFooter className="mt-6">
            {editingLease ? (
              <>
                <Button variant="outline" onClick={() => setSheetOpen(false)}>{t("action.cancel")}</Button>
                <Button onClick={handleSave}>{t("action.save")}</Button>
              </>
            ) : (
              <>
                {step > 1 ? (
                  <Button variant="outline" onClick={() => setStep(s => s - 1)}>{t("action.back")}</Button>
                ) : (
                  <Button variant="outline" onClick={() => setSheetOpen(false)}>{t("action.cancel")}</Button>
                )}
                {step < 3 ? (
                  <Button onClick={() => {
                    if (step === 1) {
                      const primaryRow = unitRows.find(r => r.assignmentType === "primary");
                      if (!form.leaseReference.trim() || !form.propertyId || unitRows.length === 0 || !primaryRow?.unitId || unitRows.some(r => !r.unitId)) {
                        toast({ title: "Validation Error", description: "Reference, property, and at least one unit (with a Primary role) are required.", variant: "destructive" });
                        return;
                      }
                    } else if (step === 2) {
                      if (tenantMode === "new") {
                        if (!tenantForm.firstName.trim() || !tenantForm.lastName.trim() || !tenantForm.email.trim()) {
                          toast({ title: "Validation Error", description: "First name, last name, and email are required.", variant: "destructive" });
                          return;
                        }
                      } else if (!form.primaryTenantId) {
                        toast({ title: "Validation Error", description: "Please select a tenant.", variant: "destructive" });
                        return;
                      }
                    }
                    setStep(s => s + 1);
                  }}>{t("action.next")}</Button>
                ) : (
                  <Button onClick={handleSave}>{t("leases.add")}</Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
