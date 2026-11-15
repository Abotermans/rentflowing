import { useParams, Link, useNavigate } from "react-router-dom";
import { propertyBusinessDateISO } from "@/lib/businessTimeZone";
import { useBusinessNow } from "@/hooks/use-business-now";
import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityLabel } from "@/components/shared/PriorityLabel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DateInput } from "@/components/shared/DateInput";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, Home, Ruler, BedDouble, Bath, Sofa, CalendarClock, Clock, Building2, Globe, Pencil, AlertTriangle, Bell, Truck, Banknote, Plus, Trash2, DoorOpen, MoreVertical, Archive, ArchiveRestore, ArrowUpRight, Tag, ChevronDown, FileText } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { formatCurrency, formatArea, formatDate, UNIT_TYPE_KEYS, getCountryName } from "@/lib/formatters";
import { getTenantFullName, getLeaseStatus, getMoveInStatus, getMoveOutStatus, getUnitMillieme, DEFAULT_MILLIEME_KEY } from "@/types";
import { MAINTENANCE_CATEGORY_LABELS } from "@/types/maintenance";
import { getDerivedOccupancy, isUnitOccupiedOn } from "@/lib/occupancy";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { canChangeUnitStatus } from "@/lib/integrity/unitIntegrity";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Unit, UnitType, UnitStatus } from "@/types";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";
import { OverrideConfirmDialog } from "@/components/shared/OverrideConfirmDialog";
import { useOverrideHistory } from "@/context/OverrideContext";
import type { ValidationResult } from "@/lib/integrity/types";
import { RentTiersEditor } from "@/components/shared/RentTiersEditor";
import { getAllRentTiers } from "@/lib/rentTiers";
import { LeaseAddDialog } from "@/components/leases/LeaseAddDialog";
import { MaintenanceTicketDialog } from "@/components/maintenance/MaintenanceTicketDialog";
import { CostEntryDialog } from "@/components/costs/CostEntryDialog";
import { UnitProfitabilitySection } from "@/components/profitability/UnitProfitabilitySection";
import { detailLinkClass } from "@/lib/detailLinks";
import { formatMilliemeBase, getAllocationBaseAmount, getManagedOwnershipShare, getMilliemeCapacityForUnit, getUnitMilliemeCapacityViolations, parseMilliemeShareInput } from "@/lib/propertyOwnership";
import { nonNegativeNumber, normalizedCode, positiveNumber } from "@/lib/validation";
import { splitCostRecovery } from "@/lib/costRecovery";
import { buildCostOverview } from "@/lib/costOverview";
import { formatMoneyGroups, sumMoneyByCurrency, type MoneyGroup } from "@/lib/money";
import { usePortfolioWriteAccess } from "@/hooks/use-portfolio-write-access";
import { isReceivableAllocatable } from "@/lib/reconciliation";

import type { TranslationKey } from "@/i18n/translations";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import type { CostNature, CostFrequency, RecoveryType, AllocationMethod } from "@/types/costs";

const UNIT_TYPES: { value: UnitType; labelKey: TranslationKey }[] = [
  { value: "apartment", labelKey: "units.apartment" },
  { value: "studio", labelKey: "units.studio" },
  { value: "office", labelKey: "units.office" },
  { value: "parking", labelKey: "units.parking" },
  { value: "storage", labelKey: "units.storage" },
  { value: "house", labelKey: "units.house" },
  { value: "commercial-unit", labelKey: "units.commercialUnit" },
];
const UNIT_STATUSES: { value: UnitStatus; labelKey: TranslationKey }[] = [
  { value: "vacant", labelKey: "status.vacant" },
  { value: "occupied", labelKey: "status.occupied" },
  { value: "reserved", labelKey: "status.reserved" },
  { value: "unavailable", labelKey: "status.unavailable" },
  { value: "archived", labelKey: "status.archived" },
];
// Status options selectable when no active lease exists.
// `occupied` is intentionally excluded — occupancy is derived from an active lease.
const UNIT_STATUSES_NO_LEASE: { value: UnitStatus; labelKey: TranslationKey }[] = [
  { value: "vacant", labelKey: "status.vacant" },
  { value: "reserved", labelKey: "status.reserved" },
  { value: "unavailable", labelKey: "status.unavailable" },
  { value: "archived", labelKey: "status.archived" },
];

const UNIT_STATUS_LABEL_KEYS: Record<UnitStatus, TranslationKey> = {
  vacant: "status.vacant",
  occupied: "status.occupied",
  reserved: "status.reserved",
  unavailable: "status.unavailable",
  archived: "status.archived",
};

type EditSection = "info" | "financials" | "notes" | null;
type UnitFormData = Omit<Unit, "id" | "createdAt" | "updatedAt">;

export default function UnitDetail() {
  const businessNow = useBusinessNow();
  const { id } = useParams<{ id: string }>();
  const { units, properties, leases, leaseUnitAssignments, updateUnitPersisted, deleteUnitPersisted, getActiveLease, tenants, getReceivableItemsByLease, getTenantUnappliedCredit, getTicketsByUnit, getCostEntriesByUnit, getAllocationResultsByUnit, getCostCategoryById, getAllocationRuleById, costEntries, costAllocationResults, confirmMoveOut } = useAppData();
  const { t } = useSettings();
  const canWrite = usePortfolioWriteAccess();
  const { toast } = useToast();
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();
  const navigate = useNavigate();

  // Sort state for the unified Costs & Taxes table (direct + allocated).
  type CostRowKey = "source" | "label" | "category" | "nature" | "recovery" | "period" | "method";
  const { sort: costsSort, toggle: toggleCostsSort } = useTableSort<CostRowKey>();

  // Sort state for the per-unit leases table inside the Occupancy section.
  type UnitLeaseRowKey = "reference" | "tenant" | "start" | "end" | "rent" | "status";
  const { sort: unitLeasesSort, toggle: toggleUnitLeasesSort } = useTableSort<UnitLeaseRowKey>("start", "desc");

  const unit = units.find(u => u.id === id);
  const property = unit ? properties.find(p => p.id === unit.propertyId) : null;

  const [editSection, setEditSection] = useState<EditSection>(null);
  const [form, setForm] = useState<UnitFormData | null>(null);
  const [infoSaveAttempted, setInfoSaveAttempted] = useState(false);
  const [milliemeDrafts, setMilliemeDrafts] = useState<Record<string, string>>({});
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [pendingOverride, setPendingOverride] = useState<ValidationResult | null>(null);
  const [vacateValidation, setVacateValidation] = useState<ValidationResult | null>(null);
  const [vacateOverrideOpen, setVacateOverrideOpen] = useState(false);
  const [archiveValidation, setArchiveValidation] = useState<ValidationResult | null>(null);
  const [archiveOverrideOpen, setArchiveOverrideOpen] = useState(false);
  const [vacateEndDialogOpen, setVacateEndDialogOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  const [financialsOpen, setFinancialsOpen] = useState(true);
  const [addLeaseOpen, setAddLeaseOpen] = useState(false);
  const [addTicketOpen, setAddTicketOpen] = useState(false);
  const [addCostOpen, setAddCostOpen] = useState(false);
  const [occupancyOpen, setOccupancyOpen] = useState(true);
  const [maintenanceOpen, setMaintenanceOpen] = useState(true);
  const [costsOpen, setCostsOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const [vacateEndDate, setVacateEndDate] = useState("");

  const openEdit = (section: Exclude<EditSection, null>) => {
    if (!canWrite || !unit) return;
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = unit;
    setForm(rest);
    setInfoSaveAttempted(false);
    setMilliemeDrafts(Object.fromEntries(Object.entries(rest.milliemeShares ?? {}).map(([key, value]) => [key, String(value)])));
    setEditSection(section);
  };
  const closeEdit = () => { setEditSection(null); setForm(null); setMilliemeDrafts({}); };

  const statusValidation = (() => {
    if (!unit || !form || form.currentStatus === unit.currentStatus) return null;
    return canChangeUnitStatus(unit.id, form.currentStatus, integrityState);
  })();
  const milliemeViolations = unit && form && editSection === "info"
    ? getUnitMilliemeCapacityViolations(form, property, units, unit.id)
    : [];
  const infoErrors: Partial<Record<"unitCode" | "unitLabel" | "surfaceArea" | "bedrooms" | "bathrooms", string>> = {};
  if (form && unit && editSection === "info") {
    if (!form.unitCode.trim()) infoErrors.unitCode = t("common.mandatoryField");
    else if (units.some(other => other.id !== unit.id && other.propertyId === form.propertyId && normalizedCode(other.unitCode) === normalizedCode(form.unitCode))) {
      infoErrors.unitCode = t("units.codesUniqueWithinProperty");
    }
    if (!form.unitLabel.trim()) infoErrors.unitLabel = t("common.mandatoryField");
    if (form.surfaceArea != null && !positiveNumber(form.surfaceArea)) infoErrors.surfaceArea = t("units.positive");
    if (!nonNegativeNumber(form.bedrooms)) infoErrors.bedrooms = t("units.nonNegative");
    if (!nonNegativeNumber(form.bathrooms)) infoErrors.bathrooms = t("units.nonNegative");
  }
  const invalidMilliemeKey = Object.entries(milliemeDrafts).find(([, raw]) => !parseMilliemeShareInput(raw).valid)?.[0];

  const saveUnit = async (next: Unit): Promise<boolean> => {
    if (!canWrite) return false;
    try {
      await updateUnitPersisted(next);
      return true;
    } catch (err) {
      toast({ title: t("common.validationError"), description: err instanceof Error ? err.message : "Unit could not be saved.", variant: "destructive" });
      return false;
    }
  };

  const persist = async (patch: Partial<UnitFormData>) => {
    if (!unit || !await saveUnit({ ...unit, ...patch })) return;
    toast({ title: t("units.toastUpdated") });
    closeEdit();
  };

  const handleSave = () => {
    if (!unit || !form) return;
    if (editSection === "info") {
      setInfoSaveAttempted(true);
      if (Object.keys(infoErrors).length > 0 || invalidMilliemeKey || milliemeViolations.length > 0) return;
      if (form.currentStatus !== unit.currentStatus) {
        const v = canChangeUnitStatus(unit.id, form.currentStatus, integrityState);
        if (!v.allowed) {
          if (v.overrideAllowed) { setPendingOverride(v); setOverrideOpen(true); return; }
          toast({ title: t("units.statusChangeBlocked"), description: v.blockers.map(b => b.message).join(". "), variant: "destructive" });
          return;
        }
      }
      persist({
        unitCode: form.unitCode, unitLabel: form.unitLabel, unitType: form.unitType,
        floor: form.floor, surfaceArea: form.surfaceArea, bedrooms: form.bedrooms, bathrooms: form.bathrooms,
        furnished: form.furnished, availableFrom: form.availableFrom, currentStatus: form.currentStatus,
        description: form.description ?? "",
        milliemeShares: form.milliemeShares ?? {},
        milliemeBase: form.milliemeBase,
      });
    } else if (editSection === "financials") {
      persist({
        baseRent: form.baseRent,
        rentTiers: [...form.rentTiers].sort((a, b) => a.durationMonths - b.durationMonths),
        baseCharges: form.baseCharges,
      });
    } else if (editSection === "notes") {
      persist({ notes: form.notes });
    }
  };

  const handleOverrideConfirm = async (reason: string) => {
    if (!unit || !form || !pendingOverride) return;
    if (!await saveUnit({
      ...unit,
      unitCode: form.unitCode, unitLabel: form.unitLabel, unitType: form.unitType,
      floor: form.floor, surfaceArea: form.surfaceArea, bedrooms: form.bedrooms, bathrooms: form.bathrooms,
      furnished: form.furnished, availableFrom: form.availableFrom, currentStatus: form.currentStatus,
    })) return;
    addOverride({
      entityType: "unit", entityId: unit.id,
      action: `status_change:${form.currentStatus}`,
      blockerCodes: pendingOverride.blockers.map(b => b.code),
      reason,
    });
    toast({ title: t("units.updatedOverridden"), description: t("units.overrideReason").replace("{reason}", reason) });
    setPendingOverride(null);
    setOverrideOpen(false);
    closeEdit();
  };

  const handleMakeVacant = async () => {
    if (!unit) return;
    const v = canChangeUnitStatus(unit.id, "vacant", integrityState);
    if (v.allowed) {
      if (!await saveUnit({ ...unit, currentStatus: "vacant" })) return;
      toast({ title: t("units.toastUpdated") });
      return;
    }
    if (v.overrideAllowed) {
      setVacateValidation(v);
      setVacateOverrideOpen(true);
      return;
    }
    toast({ title: t("units.statusChangeBlocked"), description: v.blockers.map(b => b.message).join(". "), variant: "destructive" });
  };

  const handleVacateOverride = async (reason: string) => {
    if (!unit || !vacateValidation) return;
    if (!await saveUnit({ ...unit, currentStatus: "vacant" })) return;
    addOverride({
      entityType: "unit", entityId: unit.id,
      action: "status_change:vacant",
      blockerCodes: vacateValidation.blockers.map(b => b.code),
      reason,
    });
    toast({ title: t("units.updatedOverridden"), description: t("units.overrideReason").replace("{reason}", reason) });
    setVacateValidation(null);
    setVacateOverrideOpen(false);
  };

  const handleDeleteUnit = async (uid: string) => {
    if (!canWrite) return;
    await deleteUnitPersisted(uid);
    toast({ title: t("units.toastDeleted") || "Unit deleted" });
    navigate("/units");
  };

  const handleArchive = async () => {
    if (!unit) return;
    const v = canChangeUnitStatus(unit.id, "archived", integrityState);
    if (v.allowed) {
      if (!await saveUnit({ ...unit, currentStatus: "archived" })) return;
      toast({ title: t("units.toastArchived") });
      return;
    }
    if (v.overrideAllowed) {
      setArchiveValidation(v);
      setArchiveOverrideOpen(true);
      return;
    }
    toast({ title: t("units.archiveBlocked"), description: v.blockers.map(b => b.message).join(". "), variant: "destructive" });
  };

  const handleArchiveOverride = async (reason: string) => {
    if (!unit || !archiveValidation) return;
    if (!await saveUnit({ ...unit, currentStatus: "archived" })) return;
    addOverride({
      entityType: "unit", entityId: unit.id,
      action: "status_change:archived",
      blockerCodes: archiveValidation.blockers.map(b => b.code),
      reason,
    });
    toast({ title: t("units.updatedOverridden"), description: t("units.overrideReason").replace("{reason}", reason) });
    setArchiveValidation(null);
    setArchiveOverrideOpen(false);
  };

  const handleUnarchive = async () => {
    if (!unit) return;
    if (!await saveUnit({ ...unit, currentStatus: "vacant" })) return;
    toast({ title: t("units.toastUnarchived") });
  };

  const openVacateWithLeaseEnd = () => {
    if (!canWrite) return;
    setVacateEndDate(propertyBusinessDateISO(property));
    setVacateEndDialogOpen(true);
  };

  const confirmVacateWithLeaseEnd = async () => {
    if (!canWrite || !unit) return;
    const lease = getActiveLease(unit.id);
    if (!lease) {
      setVacateEndDialogOpen(false);
      return;
    }
    const ed = vacateEndDate || propertyBusinessDateISO(property);
    try {
      await confirmMoveOut({
        ...lease,
        moveOutActualDate: ed,
        moveOutScheduledDate: lease.moveOutScheduledDate || ed,
        moveOutChecklist: {
          noticeConfirmed: true,
          moveOutDateConfirmed: true,
          keysReturned: lease.moveOutChecklist.keysReturned,
          moveOutMeterReadingCaptured: lease.moveOutChecklist.moveOutMeterReadingCaptured,
          balanceReviewed: lease.moveOutChecklist.balanceReviewed,
          guaranteeReviewCompleted: lease.moveOutChecklist.guaranteeReviewCompleted,
        },
        returnStatus: lease.returnStatus || "pending",
      });
      toast({ title: t("units.toastUpdated") });
      setVacateEndDialogOpen(false);
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  if (!unit || !property) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("detail.unitNotFound")}</p>
        <Button variant="link" asChild className="mt-2"><Link to="/units">← {t("nav.units")}</Link></Button>
      </div>
    );
  }

  const today = propertyBusinessDateISO(property, businessNow);
  const occupancy = getDerivedOccupancy(
    unit.id, unit.currentStatus, leases, leaseUnitAssignments, unit,
    today,
  );
  const activeLease = occupancy.activeLease ?? getActiveLease(unit.id, today);
  const tenant = activeLease ? tenants.find(tn => tn.id === activeLease.primaryTenantId) : null;
  const lifecycle = activeLease ? getLeaseStatus(activeLease, today) : null;
  const moveIn = activeLease ? getMoveInStatus(activeLease) : null;
  const moveOut = activeLease ? getMoveOutStatus(activeLease, today) : null;

  const receivables = activeLease ? getReceivableItemsByLease(activeLease.id) : [];
  const unappliedCredit = tenant && activeLease ? getTenantUnappliedCredit(tenant.id, property.currencyCode, activeLease.id) : 0;
  const nextDueItem = receivables.filter(ri => isReceivableAllocatable(ri) && ri.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  // One row per lease; the latest assignment carries this unit's current share.
  const seenLeaseIds = new Set<string>();
  const unitLeaseRows = leaseUnitAssignments
    .filter(a => a.unitId === unit.id)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .filter(a => {
      if (seenLeaseIds.has(a.leaseId)) return false;
      seenLeaseIds.add(a.leaseId);
      return true;
    })
    .map(a => {
      const lease = leases.find(l => l.id === a.leaseId);
      const leaseTenant = lease ? tenants.find(tn => tn.id === lease.primaryTenantId) : undefined;
      return { assignment: a, lease, tenant: leaseTenant };
    })
    .filter((r): r is { assignment: typeof r.assignment; lease: NonNullable<typeof r.lease>; tenant: typeof r.tenant } => !!r.lease);

  const sortedUnitLeaseRows = sortRows(unitLeaseRows, unitLeasesSort, (row, key) => {
    switch (key) {
      case "reference": return row.lease.leaseReference;
      case "tenant": return row.tenant ? getTenantFullName(row.tenant) : "";
      case "start": return row.lease.startDate;
      case "end": return row.lease.endDate;
      case "rent": return (row.assignment.rentShare ?? 0) + (row.assignment.chargesShare ?? 0);
      case "status": return getLeaseStatus(row.lease, propertyBusinessDateISO(property, businessNow));
      default: return "";
    }
  });

  const infoItems = [
    { label: t("units.label"), value: unit.unitLabel, icon: Tag },
    { label: t("units.type"), value: t(UNIT_TYPE_KEYS[unit.unitType]), icon: Home },
    { label: t("units.floor"), value: unit.floor != null ? String(unit.floor) : "—", icon: Home },
    { label: t("units.surface"), value: unit.surfaceArea != null ? formatArea(unit.surfaceArea, property.measurementSystem) : "—", icon: Ruler },
    { label: t("units.bedrooms"), value: String(unit.bedrooms), icon: BedDouble },
    { label: t("units.bathrooms"), value: String(unit.bathrooms), icon: Bath },
    { label: t("units.furnished"), value: unit.furnished ? t("common.yes") : t("common.no"), icon: Sofa },
    { label: t("units.availableFrom"), value: unit.availableFrom ? formatDate(unit.availableFrom, property.locale) : "—", icon: CalendarClock },
    {
      label: t("units.millieme"),
      value: (() => {
        const v = getUnitMillieme(unit);
        const base = property.milliemeBase ?? unit.milliemeBase ?? 1000;
        return v > 0 ? `${v} / ${base}` : "—";
      })(),
      icon: Ruler,
    },
    { label: t("common.description"), value: unit.description || "—", icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link to="/units"><ArrowLeft className="h-4 w-4 mr-1" />{t("nav.units")}</Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{unit.unitCode}</h1>
              <StatusBadge status={occupancy.derived} />
            </div>
          </div>
          {canWrite && <div className="flex items-center gap-2 shrink-0">
            {unit.currentStatus !== "archived" && !getActiveLease(unit.id) && (unit.currentStatus === "vacant" || unit.currentStatus === "reserved") && (
              <Button size="sm" onClick={() => setAddLeaseOpen(true)}>
                <Plus className="h-4 w-4" />{t("occupancy.createLeaseAction")}
              </Button>
            )}
            {unit.currentStatus !== "vacant" && unit.currentStatus !== "archived" && !getActiveLease(unit.id) && (
              <Button size="sm" variant="outline" onClick={handleMakeVacant}>
                <DoorOpen className="h-4 w-4" />{t("occupancy.makeVacantAction")}
              </Button>
            )}
            {unit.currentStatus !== "archived" && getActiveLease(unit.id) && (
              <Button size="sm" variant="outline" onClick={openVacateWithLeaseEnd}>
                <DoorOpen className="h-4 w-4" />{t("occupancy.makeVacantAction")}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("units.moreActions")}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {unit.currentStatus === "archived" ? (
                  <DropdownMenuItem onClick={handleUnarchive}>
                    <ArchiveRestore className="h-4 w-4 mr-2" />{t("units.unarchiveAction")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handleArchive}>
                    <Archive className="h-4 w-4 mr-2" />{t("units.archiveAction")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DeleteDialog
                  entityType="unit"
                  entityId={unit.id}
                  entityLabel={unit.unitCode}
                  onDelete={handleDeleteUnit}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />{t("action.delete")}
                    </DropdownMenuItem>
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>}
        </div>
      </div>

      {/* Reconciliation panel — one truth, one suggested fix */}
      {occupancy.inconsistent && occupancy.inconsistencyKey && (
        <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <div className="font-semibold mb-1">{t("occupancy.needsAttention")}</div>
            <p className="text-xs mb-1">{t(occupancy.inconsistencyKey)}</p>
            {occupancy.suggestedFix && (
              <p className="text-xs text-muted-foreground mb-2">{t(occupancy.suggestedFix.rationaleKey)}</p>
            )}
            {canWrite && occupancy.suggestedFix && (
              <div className="flex flex-wrap gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const target = occupancy.suggestedFix!.targetStatus;
                    const prev = unit.currentStatus;
                    if (!await saveUnit({ ...unit, currentStatus: target })) return;
                    addOverride({
                      entityType: "unit",
                      entityId: unit.id,
                      action: `status_reconcile:${prev}->${target}`,
                      blockerCodes: [],
                      reason: t("occupancy.reconcileReason"),
                    });
                    toast({ title: t("occupancy.syncedToastTitle"), description: `${t(UNIT_STATUS_LABEL_KEYS[prev])} → ${t(UNIT_STATUS_LABEL_KEYS[target])}` });
                  }}
                >
                  {t(occupancy.suggestedFix.labelKey)}
                </Button>
                {occupancy.suggestedFix.secondaryAction === "create-lease" && (
                  <Button size="sm" variant="default" onClick={() => setAddLeaseOpen(true)}>
                    {t("occupancy.createLeaseAction")}
                  </Button>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Main Info */}
      <Collapsible open={infoOpen} onOpenChange={setInfoOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex-1 justify-start">{t("detail.unitInformation")}</CardTitle>
            <div className="flex items-center gap-2">
              {canWrite && <Button variant="outline" size="sm" className="h-8 gap-1" onClick={(e) => { e.stopPropagation(); openEdit("info"); }}><Pencil className="h-3.5 w-3.5" />{t("action.edit")}</Button>}
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", infoOpen && "rotate-180")} />
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {infoItems.map(item => (
              <div key={item.label} className="flex items-start gap-2">
                <item.icon className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div><p className="text-xs text-muted-foreground">{item.label}</p><p className="text-sm font-medium text-foreground">{item.value}</p></div>
              </div>
            ))}
          </div>
          <div className="pt-3 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />{t("detail.propertyContext")}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><p className="text-xs text-muted-foreground">{t("table.property")}</p><Link to={`/properties/${property.id}`} className={`text-sm font-medium ${detailLinkClass}`}>{property.name}</Link></div>
              <div><p className="text-xs text-muted-foreground">{t("properties.city")}</p><p className="text-sm font-medium text-foreground">{property.city}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("properties.country")}</p><p className="text-sm font-medium text-foreground">{getCountryName(property.countryCode)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("properties.currency")}</p><p className="text-sm font-medium text-foreground font-mono">{property.currencyCode}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("properties.locale")}</p><p className="text-sm font-medium text-foreground font-mono">{property.locale}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("properties.measurement")}</p><p className="text-sm font-medium text-foreground capitalize">{property.measurementSystem}</p></div>
            </div>
          </div>
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      {/* Financial Defaults */}
      <Collapsible open={financialsOpen} onOpenChange={setFinancialsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex-1 justify-start">{t("detail.financialDefaults")}</CardTitle>
            <div className="flex items-center gap-2">
              {canWrite && <Button variant="outline" size="sm" className="h-8 gap-1" onClick={(e) => { e.stopPropagation(); openEdit("financials"); }}><Pencil className="h-3.5 w-3.5" />{t("action.edit")}</Button>}
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", financialsOpen && "rotate-180")} />
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
        <CardContent className="space-y-4">
          {(() => {
            const rows = getAllRentTiers(unit);
            if (rows.length === 0) {
              return <p className="text-sm text-muted-foreground">{t("detail.noActiveLeaseDesc")}</p>;
            }
            return (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t("units.advancePeriodMonths")}</TableHead>
                    <TableHead className="text-xs text-right">{t("units.monthlyRent")}</TableHead>
                    <TableHead className="text-xs text-right">{t("units.totalForPeriod")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.durationMonths}>
                      <TableCell className="text-sm font-medium text-foreground">{r.durationMonths}</TableCell>
                      <TableCell className="text-right text-sm text-foreground">{formatCurrency(r.monthlyRent, property.currencyCode, property.locale)}</TableCell>
                      <TableCell className="text-right text-sm font-semibold text-foreground">{formatCurrency(r.monthlyRent * r.durationMonths, property.currencyCode, property.locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            );
          })()}
          <div className="grid grid-cols-2 gap-6 pt-2 border-t">
            <div><p className="text-xs text-muted-foreground">{t("detail.baseCharges")}</p><p className="text-sm font-semibold text-foreground">{unit.baseCharges != null ? formatCurrency(unit.baseCharges, property.currencyCode, property.locale) : "—"}</p></div>
          </div>
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      {/* Occupancy */}
      <Collapsible open={occupancyOpen} onOpenChange={setOccupancyOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex-1 justify-start">{t("detail.occupancySection")}</CardTitle>
            {canWrite && unit.currentStatus !== "archived" && (
              <Button
                size="sm"
                className="mr-2"
                onClick={(e) => { e.stopPropagation(); setAddLeaseOpen(true); }}
              >
                <Plus className="h-4 w-4" />{t("occupancy.createLeaseAction")}
              </Button>
            )}
            <span className="inline-flex items-center justify-center h-7 w-7">
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", occupancyOpen && "rotate-180")} />
            </span>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
        <CardContent>
          {sortedUnitLeaseRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("detail.noActiveLeaseDesc")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="reference" sort={unitLeasesSort} onSort={toggleUnitLeasesSort}>{t("leases.reference")}</SortableTableHead>
                  <SortableTableHead sortKey="tenant" sort={unitLeasesSort} onSort={toggleUnitLeasesSort}>{t("table.tenant")}</SortableTableHead>
                  <SortableTableHead sortKey="start" sort={unitLeasesSort} onSort={toggleUnitLeasesSort}>{t("leases.startDate")}</SortableTableHead>
                  <SortableTableHead sortKey="end" sort={unitLeasesSort} onSort={toggleUnitLeasesSort}>{t("leases.endDate")}</SortableTableHead>
                  <SortableTableHead sortKey="rent" sort={unitLeasesSort} onSort={toggleUnitLeasesSort} align="right">{t("common.total")}</SortableTableHead>
                  <SortableTableHead sortKey="status" sort={unitLeasesSort} onSort={toggleUnitLeasesSort}>{t("table.status")}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUnitLeaseRows.map(({ assignment, lease, tenant: leaseTenant }) => {
                  const status = getLeaseStatus(lease, propertyBusinessDateISO(property, businessNow));
                  return (
                    <TableRow key={assignment.id}>
                      <TableCell>
                        <Link to={`/leases/${lease.id}`} className={`text-sm font-medium ${detailLinkClass}`}>{lease.leaseReference}</Link>
                      </TableCell>
                      <TableCell>
                        {leaseTenant ? (
                          <Link to={`/tenants/${leaseTenant.id}`} className={`text-sm ${detailLinkClass}`}>{getTenantFullName(leaseTenant)}</Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(lease.startDate, property.locale)}</TableCell>
                      <TableCell className="text-sm">{formatDate(lease.endDate, property.locale)}</TableCell>
                      <TableCell className="text-sm text-right">{formatCurrency((assignment.rentShare ?? 0) + (assignment.chargesShare ?? 0), property.currencyCode, property.locale)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          <StatusBadge status={status} />
                          {lease.noticeGiven && status === "active" && (
                            <Bell className="h-3.5 w-3.5 text-warning" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      {/* Property Context */}
      {/* Maintenance */}
      {(() => {
        const unitTickets = getTicketsByUnit(unit.id);
        return (
          <Collapsible open={maintenanceOpen} onOpenChange={setMaintenanceOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
                <CardTitle className="text-base font-medium flex-1 justify-start">{t("detail.maintenanceCount").replace("{count}", String(unitTickets.length))}
                </CardTitle>
                {canWrite && <Button
                  size="sm"
                  variant="outline"
                  className="mr-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddTicketOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />{t("maintenance.add")}
                </Button>}
                <span className="inline-flex items-center justify-center h-7 w-7">
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", maintenanceOpen && "rotate-180")} />
                </span>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
            <CardContent>
              {unitTickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("detail.noMaintenanceTickets")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t("table.title")}</TableHead>
                      <TableHead className="text-xs">{t("table.category")}</TableHead>
                      <TableHead className="text-xs">{t("table.priority")}</TableHead>
                      <TableHead className="text-xs">{t("table.status")}</TableHead>
                      <TableHead className="text-xs">{t("table.created")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unitTickets.map(tk => (
                      <TableRow key={tk.id}>
                        <TableCell className="font-medium"><Link to={`/maintenance/${tk.id}`} className={detailLinkClass}>{tk.title}</Link></TableCell>
                        <TableCell className="text-xs">{MAINTENANCE_CATEGORY_LABELS[tk.category]}</TableCell>
                        <TableCell><PriorityLabel priority={tk.priority} /></TableCell>
                        <TableCell><StatusBadge status={tk.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(tk.createdDate, property.locale)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            </CollapsibleContent>
          </Card>
          </Collapsible>
        );
      })()}

      {/* Costs & Taxes */}
      {(() => {
        const activeCostById = new Map(costEntries.filter(entry => entry.status === "active").map(entry => [entry.id, entry]));
        const directEntries = getCostEntriesByUnit(unit.id).filter(entry => entry.status === "active");
        const allocResults = getAllocationResultsByUnit(unit.id).filter(result => {
          const parent = activeCostById.get(result.costEntryId);
          return parent?.unitId === null && parent.propertyId === unit.propertyId && result.propertyId === unit.propertyId;
        });
        if (directEntries.length === 0 && allocResults.length === 0) return null;
        const overview = buildCostOverview(costEntries, costAllocationResults, properties, units);
        const summary = overview.units.find(item => item.unitId === unit.id);
        const hasAllocationExcess = overview.allocationExcesses.some(excess =>
          allocResults.some(result => result.costEntryId === excess.costEntryId));
        const display = (groups: MoneyGroup[] | undefined) =>
          formatMoneyGroups(groups ?? [], formatCurrency(0, property.currencyCode, property.locale));

        return (
          <Collapsible open={costsOpen} onOpenChange={setCostsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
                <CardTitle className="text-base font-medium flex-1 justify-start">{t("units.costsTaxesBurden")}
                </CardTitle>
                {canWrite && <Button
                  size="sm"
                  variant="outline"
                  className="mr-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddCostOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />{t("costs.addEntry")}
                </Button>}
                <span className="inline-flex items-center justify-center h-7 w-7">
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", costsOpen && "rotate-180")} />
                </span>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
            <CardContent className="space-y-4">
              {hasAllocationExcess && (
                <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{t("costs.allocationExcessWarning")}</AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0 p-3 rounded-md bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">{t("units.ownerBorne")}</p>
                  <p className="text-lg font-bold text-destructive break-words">{display(summary?.ownerBorne)}</p>
                </div>
                <div className="min-w-0 p-3 rounded-md bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">{t("units.recoverable")}</p>
                  <p className="text-lg font-bold text-success break-words">{display(summary?.recoverable)}</p>
                </div>
              </div>
              {(() => {
                type Row = {
                  id: string;
                  sourceEntryId: string;
                  source: "direct" | "allocated";
                  label: string;
                  category: string;
                  nature: CostNature;
                  recovery: RecoveryType;
                  periodStart: string | null;
                  periodEnd: string | null;
                  frequency: CostFrequency | null;
                  method: AllocationMethod | null;
                  amount: number;
                  totalCost: number;
                  ownerBorne: number;
                  recoverable: number;
                  currencyCode: string;
                  milliemeShare?: number;
                  milliemeTotalShares?: number;
                  milliemeBase?: number;
                  milliemeAllocationMode?: "normalized" | "absolute";
                  allocationBaseAmount?: number;
                  ownedShares?: number;
                };
                const rows: Row[] = [];
                for (const e of directEntries) {
                  const s = splitCostRecovery(e.amount, e.recoveryType, e.recoverablePercentage);
                  rows.push({
                    id: `d-${e.id}`,
                    sourceEntryId: e.id,
                    source: "direct",
                    label: e.label,
                    category: getCostCategoryById(e.categoryId)?.name ?? "—",
                    nature: e.isTax ? "tax" : "charge",
                    recovery: e.recoveryType,
                    periodStart: e.startDate,
                    periodEnd: e.endDate,
                    frequency: e.frequency,
                    method: null,
                    amount: e.amount,
                    totalCost: e.amount,
                    ownerBorne: s.ownerBurdenAmount,
                    recoverable: s.recoverableAmount,
                    currencyCode: e.currencyCode || property.currencyCode,
                  });
                }
                for (const r of allocResults) {
                  const parent = costEntries.find(e => e.id === r.costEntryId);
                  const rule = getAllocationRuleById(parent?.allocationRuleId ?? "");
                  const parentProperty = parent ? properties.find(p => p.id === parent.propertyId) : undefined;
                  const allocationBaseAmount = parent && rule
                    ? getAllocationBaseAmount(parent, rule, parentProperty, units)
                    : parent?.amount ?? r.allocatedAmount;
                  const ownershipKey = rule?.method === "millieme" && rule.milliemeAllocationMode === "absolute"
                    ? rule.shareKey || DEFAULT_MILLIEME_KEY
                    : DEFAULT_MILLIEME_KEY;
                  const ownership = parent && parentProperty?.isPartiallyOwned
                    ? getManagedOwnershipShare(parentProperty, units, parent.propertyId, ownershipKey)
                    : null;
                  let milliemeShare: number | undefined;
                  let milliemeTotalShares: number | undefined;
                  let milliemeBase: number | undefined = ownership?.base;
                  if (rule?.method === "millieme" && parent) {
                    const key = (rule.shareKey ?? DEFAULT_MILLIEME_KEY) || DEFAULT_MILLIEME_KEY;
                    let propUnits = units.filter(u => u.propertyId === parent.propertyId);
                    if (rule.applyOnlyToOccupiedUnits) {
                      propUnits = propUnits.filter(u => isUnitOccupiedOn(u.id, parent.startDate, leases, leaseUnitAssignments));
                    }
                    if (!rule.includeUnavailableUnits) {
                      propUnits = propUnits.filter(u => u.currentStatus !== "unavailable");
                    }
                    const shares = propUnits
                      .map(u => getUnitMillieme(u, key))
                      .filter(s => s > 0);
                    milliemeTotalShares = shares.reduce((sum, s) => sum + s, 0);
                    milliemeShare = getUnitMillieme(unit, key);
                    milliemeBase = parentProperty?.milliemeBase ?? unit.milliemeBase ?? 1000;
                  }
                  rows.push({
                    id: `a-${r.id}`,
                    sourceEntryId: r.costEntryId,
                    source: "allocated",
                    label: parent?.label ?? "—",
                    category: parent ? (getCostCategoryById(parent.categoryId)?.name ?? "—") : "—",
                    nature: parent ? (parent.isTax ? "tax" : "charge") : "charge",
                    recovery: r.recoveryType,
                    periodStart: r.periodStart,
                    periodEnd: r.periodEnd,
                    frequency: parent?.frequency ?? null,
                    method: rule?.method ?? null,
                    amount: r.allocatedAmount,
                    totalCost: parent?.amount ?? r.allocatedAmount,
                    ownerBorne: r.ownerBurdenAmount,
                    recoverable: r.recoverableAmount,
                    currencyCode: parent?.currencyCode || property.currencyCode,
                    milliemeShare,
                    milliemeTotalShares,
                    milliemeBase,
                    milliemeAllocationMode: rule?.milliemeAllocationMode ?? "normalized",
                    allocationBaseAmount,
                    ownedShares: ownership?.ownedShares,
                  });
                }
                if (rows.length === 0) return null;
                const sorted = sortRows(rows, costsSort, (row, key) => {
                  switch (key) {
                    case "source": return row.source;
                    case "label": return row.label;
                    case "category": return row.category;
                    case "nature": return row.nature;
                    case "recovery": return row.recovery;
                    case "period": return row.periodStart ?? "";
                    case "method": return row.method ?? "";
                  }
                });
                const periodCell = (row: Row) => {
                  if (row.periodStart && row.periodEnd) {
                    return `${formatDate(row.periodStart, property.locale)} → ${formatDate(row.periodEnd, property.locale)}`;
                  }
                  if (row.periodStart) return formatDate(row.periodStart, property.locale);
                  return row.frequency ? t(`costs.frequency.${row.frequency}` as TranslationKey) : "—";
                };
                const formatRowAmount = (row: Row, amount: number) =>
                  formatCurrency(amount, row.currencyCode, property.locale);
                const totalInvoices = sumMoneyByCurrency(sorted.map(row => ({
                  amount: row.totalCost, currencyCode: row.currencyCode, locale: property.locale,
                })));
                return (
                  <div className="rounded border overflow-hidden">
                  <div className="max-h-[420px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <SortableTableHead sortKey="source" sort={costsSort} onSort={toggleCostsSort}>{t("costs.source")}</SortableTableHead>
                        <SortableTableHead sortKey="label" sort={costsSort} onSort={toggleCostsSort}>{t("costs.label")}</SortableTableHead>
                        <SortableTableHead sortKey="category" sort={costsSort} onSort={toggleCostsSort}>{t("costs.category")}</SortableTableHead>
                        <SortableTableHead sortKey="nature" sort={costsSort} onSort={toggleCostsSort}>{t("costs.nature")}</SortableTableHead>
                        <SortableTableHead sortKey="recovery" sort={costsSort} onSort={toggleCostsSort}>{t("units.recovery")}</SortableTableHead>
                        <SortableTableHead sortKey="period" sort={costsSort} onSort={toggleCostsSort}>{t("costs.period")}</SortableTableHead>
                        <SortableTableHead sortKey="method" sort={costsSort} onSort={toggleCostsSort}>{t("costs.allocationMethod")}</SortableTableHead>
                        <TableHead className="text-right">{t("costs.totalCost")}</TableHead>
                        <TableHead className="text-right">{t("costs.allocatedAmount")}</TableHead>
                        <TableHead className="text-right">{t("costs.ownerBorne")}</TableHead>
                        <TableHead className="text-right">{t("costs.recoverable")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map(row => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/costs/entries?edit=${row.sourceEntryId}`)}
                        >
                          <TableCell>
                            <Badge variant={row.source === "direct" ? "secondary" : "outline"} className="text-xs font-normal">
                              {t(row.source === "direct" ? "costs.sourceDirect" : "costs.sourceAllocated")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              {row.label}
                              <ArrowUpRight className="h-3.5 w-3.5 opacity-50" aria-label={t("costs.openRecord")} />
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.category}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t(`costs.nature.${row.nature}` as TranslationKey)}</TableCell>
                          <TableCell><StatusBadge status={row.recovery} /></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{periodCell(row)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.method ? t(`costs.methodOpt.${row.method}` as TranslationKey) : "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatRowAmount(row, row.totalCost)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
                                  {formatRowAmount(row, row.amount)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-sm p-3 text-xs space-y-2">
                                <div className="text-sm border-b pb-1.5">{row.label}</div>
                                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                                  <span className="text-muted-foreground">{t("reconciliation.overview.tip.fullCost")}</span>
                                  <span className="text-right tabular-nums">{formatRowAmount(row, row.totalCost)}</span>
                                  {row.allocationBaseAmount !== undefined && row.allocationBaseAmount !== row.totalCost && (
                                    <>
                                      <span className="text-muted-foreground">{t("costs.allocationBase")}</span>
                                      <span className="text-right tabular-nums">{formatRowAmount(row, row.allocationBaseAmount)}</span>
                                    </>
                                  )}
                                  {row.ownedShares !== undefined && row.milliemeBase !== undefined && (
                                    <>
                                      <span className="text-muted-foreground">{t("properties.ownedShare")}</span>
                                      <span className="text-right tabular-nums">{row.ownedShares} / {row.milliemeBase}</span>
                                    </>
                                  )}
                                  <span className="text-muted-foreground">{t("costs.unitShare")} ({unit.unitCode})</span>
                                  <span className="text-right tabular-nums">
                                    {(row.allocationBaseAmount ?? row.totalCost) > 0 ? `${((row.amount / (row.allocationBaseAmount ?? row.totalCost)) * 100).toFixed(1)}%` : "—"}
                                  </span>
                                </div>
                                {typeof row.milliemeShare === "number" && typeof row.milliemeTotalShares === "number" && (
                                  <div className="grid grid-cols-[1fr_auto] gap-x-3">
                                    <span className="text-muted-foreground">{t("costs.methodOpt.millieme")}</span>
                                    <span className="text-right tabular-nums">
                                      {t("costs.milliemeFormula")
                                        .replace("{share}", String(row.milliemeShare))
                                        .replace("{totalShares}", String(row.milliemeAllocationMode === "absolute" ? row.milliemeBase ?? row.milliemeTotalShares : row.milliemeTotalShares))
                                        .replace("{amount}", formatRowAmount(row, row.milliemeAllocationMode === "absolute" ? row.totalCost : row.allocationBaseAmount ?? row.totalCost))
                                        .replace("{allocated}", formatRowAmount(row, row.amount))}
                                    </span>
                                  </div>
                                )}
                                <div className="grid grid-cols-[1fr_auto] gap-x-3 border-t pt-1.5">
                                  <span className="font-medium">{t("costs.allocatedAmount")}</span>
                                  <span className="text-right font-semibold tabular-nums">{formatRowAmount(row, row.amount)}</span>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatRowAmount(row, row.ownerBorne)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatRowAmount(row, row.recoverable)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 border-t font-semibold hover:bg-muted/30">
                        <TableCell className="text-sm" colSpan={7}>{t("common.total")}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{display(totalInvoices)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{display(summary?.total)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{display(summary?.ownerBorne)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{display(summary?.recoverable)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  </div>
                  </div>
                );
              })()}
            </CardContent>
            </CollapsibleContent>
          </Card>
          </Collapsible>
        );
      })()}

      {/* Notes */}
      <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex-1 justify-start">{t("common.notes")}</CardTitle>
            <div className="flex items-center gap-2">
              {canWrite && <Button variant="outline" size="sm" className="h-8 gap-1" onClick={(e) => { e.stopPropagation(); openEdit("notes"); }}><Pencil className="h-3.5 w-3.5" />{t("action.edit")}</Button>}
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", notesOpen && "rotate-180")} />
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{unit.notes || "—"}</p></CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      {/* Operational Return */}
      <UnitProfitabilitySection unitId={unit.id} />

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("table.created")}: {formatDate(unit.createdAt, property.locale)}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("table.updated")}: {formatDate(unit.updatedAt, property.locale)}</span>
      </div>

      {/* Edit Dialog */}
      <Dialog open={canWrite && editSection !== null} onOpenChange={(v) => { if (!v) closeEdit(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editSection === "info" && t("detail.unitInformation")}
              {editSection === "financials" && t("detail.financialDefaults")}
              {editSection === "notes" && t("common.notes")}
            </DialogTitle>
          </DialogHeader>
          {form && editSection === "info" && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t("units.unitCode")} *</Label><Input value={form.unitCode} aria-invalid={infoSaveAttempted && !!infoErrors.unitCode} onChange={e => setForm(f => f && ({ ...f, unitCode: e.target.value }))} />{infoSaveAttempted && infoErrors.unitCode && <p className="text-xs text-destructive">{infoErrors.unitCode}</p>}</div>
                <div><Label>{t("units.label")} *</Label><Input value={form.unitLabel} aria-invalid={infoSaveAttempted && !!infoErrors.unitLabel} onChange={e => setForm(f => f && ({ ...f, unitLabel: e.target.value }))} />{infoSaveAttempted && infoErrors.unitLabel && <p className="text-xs text-destructive">{infoErrors.unitLabel}</p>}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t("units.type")} *</Label>
                  <Select value={form.unitType} onValueChange={v => setForm(f => f && ({ ...f, unitType: v as UnitType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{UNIT_TYPES.map(ut => <SelectItem key={ut.value} value={ut.value}>{t(ut.labelKey)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>{t("units.status")} *</Label>
                  <Select
                    value={form.currentStatus}
                    onValueChange={v => setForm(f => f && ({ ...f, currentStatus: v as UnitStatus }))}
                    disabled={!!activeLease}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(activeLease ? UNIT_STATUSES : UNIT_STATUSES_NO_LEASE).map(s => (
                        <SelectItem key={s.value} value={s.value}>{t(s.labelKey)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeLease ? t("occupancy.statusLockedByLease") : t("occupancy.statusNoOccupiedWithoutLease")}
                  </p>
                  <StatusTransitionAlert validation={statusValidation} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>{t("units.floor")}</Label><Input type="number" value={form.floor ?? ""} onChange={e => setForm(f => f && ({ ...f, floor: e.target.value ? Number(e.target.value) : null }))} /></div>
                <div><Label>{t("units.surface")} ({property.measurementSystem === "imperial" ? "sq ft" : "m²"})</Label><Input type="number" value={form.surfaceArea ?? ""} aria-invalid={infoSaveAttempted && !!infoErrors.surfaceArea} onChange={e => setForm(f => f && ({ ...f, surfaceArea: e.target.value ? Number(e.target.value) : null }))} />{infoSaveAttempted && infoErrors.surfaceArea && <p className="text-xs text-destructive">{infoErrors.surfaceArea}</p>}</div>
                <div><Label>{t("units.bedrooms")}</Label><Input type="number" min={0} value={form.bedrooms} aria-invalid={infoSaveAttempted && !!infoErrors.bedrooms} onChange={e => setForm(f => f && ({ ...f, bedrooms: Number(e.target.value) }))} />{infoSaveAttempted && infoErrors.bedrooms && <p className="text-xs text-destructive">{infoErrors.bedrooms}</p>}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t("units.bathrooms")}</Label><Input type="number" min={0} value={form.bathrooms} aria-invalid={infoSaveAttempted && !!infoErrors.bathrooms} onChange={e => setForm(f => f && ({ ...f, bathrooms: Number(e.target.value) }))} />{infoSaveAttempted && infoErrors.bathrooms && <p className="text-xs text-destructive">{infoErrors.bathrooms}</p>}</div>
                <div><Label>{t("units.availableFrom")}</Label><DateInput value={form.availableFrom ?? ""} onChange={value => setForm(f => f && ({ ...f, availableFrom: value || null }))} /></div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.furnished} onCheckedChange={v => setForm(f => f && ({ ...f, furnished: v }))} />
                <Label>{t("units.furnished")}</Label>
              </div>
              <div className="space-y-2 border-t pt-3">
                <Label className="text-sm font-medium">{t("units.milliemeShares")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("units.milliemeHelp").replace(
                    "{base}",
                    formatMilliemeBase(property.milliemeBase ?? unit.milliemeBase ?? 1000, property.locale),
                  )}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {((property.milliemeKeys?.length ? property.milliemeKeys : [DEFAULT_MILLIEME_KEY])).map(k => {
                    const capacity = getMilliemeCapacityForUnit(property, units, property.id, unit.id, k);
                    const violation = milliemeViolations.find(item => item.key === k);
                    const invalidDraft = !parseMilliemeShareInput(milliemeDrafts[k] ?? "").valid;
                    return (
                      <div key={k} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs flex-1 capitalize">{k}</Label>
                          <Input
                            type="text" inputMode="decimal" className="w-28 h-8 text-right"
                            aria-invalid={invalidDraft || !!violation}
                            placeholder={`/ ${capacity.base}`}
                            value={milliemeDrafts[k] ?? ""}
                            onChange={e => {
                              const raw = e.target.value;
                              setMilliemeDrafts(previous => ({ ...previous, [k]: raw }));
                              const parsed = parseMilliemeShareInput(raw);
                              if (!parsed.valid) return;
                              const next = { ...(form.milliemeShares ?? {}) };
                              if (parsed.value === null) delete next[k];
                              else next[k] = parsed.value;
                              setForm(f => f && ({ ...f, milliemeShares: next }));
                            }}
                          />
                        </div>
                        {invalidDraft && <p className="text-xs text-destructive">{t("units.milliemeInvalid")}</p>}
                        {!invalidDraft && violation && <p className="text-xs text-destructive">{t("units.milliemeCapacityExceeded")
                          .replace("{key}", k)
                          .replace("{max}", String(violation.maxForUnit))
                          .replace("{base}", String(violation.base))}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>{t("common.description")}</Label>
                <Textarea
                  value={form.description ?? ""}
                  onChange={e => setForm(f => f && ({ ...f, description: e.target.value }))}
                  rows={4}
                />
              </div>
            </div>
          )}
          {form && editSection === "financials" && (
            <div className="space-y-4 mt-4">
              <div>
                <Label>{t("units.rentTiers")}</Label>
                <p className="text-xs text-muted-foreground mb-2">{t("units.rentTiersHelp")}</p>
                <RentTiersEditor
                  baseRent={form.baseRent}
                  rentTiers={form.rentTiers}
                  currencyCode={property.currencyCode}
                  locale={property.locale}
                  onChange={(baseRent, rentTiers) => setForm(f => f && ({ ...f, baseRent, rentTiers }))}
                />
              </div>
              <div>
                <Label>{t("units.charges")} ({property.currencyCode})</Label>
                <Input type="number" value={form.baseCharges ?? ""} onChange={e => setForm(f => f && ({ ...f, baseCharges: e.target.value ? Number(e.target.value) : null }))} />
              </div>
            </div>
          )}
          {form && editSection === "notes" && (
            <div className="space-y-4 mt-4">
              <div><Label>{t("common.notes")}</Label><Textarea value={form.notes} onChange={e => setForm(f => f && ({ ...f, notes: e.target.value }))} rows={5} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{t("action.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingOverride && (
        <OverrideConfirmDialog
          open={canWrite && overrideOpen}
          onOpenChange={(v) => { setOverrideOpen(v); if (!v) setPendingOverride(null); }}
          validation={pendingOverride}
          actionLabel="Override and Save"
          onOverride={handleOverrideConfirm}
        />
      )}

      {vacateValidation && (
        <OverrideConfirmDialog
          open={canWrite && vacateOverrideOpen}
          onOpenChange={(v) => { setVacateOverrideOpen(v); if (!v) setVacateValidation(null); }}
          validation={vacateValidation}
          actionLabel="Override and Vacate"
          onOverride={handleVacateOverride}
        />
      )}

      {archiveValidation && (
        <OverrideConfirmDialog
          open={canWrite && archiveOverrideOpen}
          onOpenChange={(v) => { setArchiveOverrideOpen(v); if (!v) setArchiveValidation(null); }}
          validation={archiveValidation}
          actionLabel="Override and Archive"
          onOverride={handleArchiveOverride}
        />
      )}

      <Dialog open={canWrite && vacateEndDialogOpen} onOpenChange={setVacateEndDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("unit.vacateLeaseEndTitle")}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">{t("unit.vacateLeaseEndDescription")}</p>
          <div className="space-y-3 mt-3">
            <div><Label>{t("lease.endDialog.endDate")}</Label><DateInput value={vacateEndDate} onChange={setVacateEndDate} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVacateEndDialogOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={confirmVacateWithLeaseEnd} disabled={!vacateEndDate}>{t("occupancy.makeVacantAction")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LeaseAddDialog
        open={canWrite && addLeaseOpen}
        onOpenChange={setAddLeaseOpen}
        onCreated={(lease) => navigate(`/leases/${lease.id}`)}
        prefillPropertyId={unit.propertyId}
        prefillUnitId={unit.id}
      />
      <MaintenanceTicketDialog
        open={canWrite && addTicketOpen}
        onOpenChange={setAddTicketOpen}
        prefillPropertyId={unit.propertyId}
        prefillUnitId={unit.id}
        lockUnit
      />
      <CostEntryDialog
        open={canWrite && addCostOpen}
        onOpenChange={setAddCostOpen}
        prefillPropertyId={unit.propertyId}
        prefillUnitId={unit.id}
        lockPropertyAndUnit
      />
    </div>
  );
}
