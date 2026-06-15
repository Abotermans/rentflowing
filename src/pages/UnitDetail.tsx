import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityLabel } from "@/components/shared/PriorityLabel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, Home, Ruler, BedDouble, Bath, Sofa, CalendarClock, Clock, Building2, Globe, Pencil, AlertTriangle, Bell, Truck, Banknote, Plus, Trash2, DoorOpen, MoreVertical, Archive, ArchiveRestore, ArrowUpRight, Tag, ChevronDown, FileText } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { formatCurrency, formatArea, formatDate, UNIT_TYPE_KEYS, getCountryName } from "@/lib/formatters";
import { getTenantFullName, getLeaseStatus, getMoveInStatus, getMoveOutStatus } from "@/types";
import { MAINTENANCE_CATEGORY_LABELS } from "@/types/maintenance";
import { getDerivedOccupancy } from "@/lib/occupancy";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { canChangeUnitStatus } from "@/lib/integrity/unitIntegrity";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  const { id } = useParams<{ id: string }>();
  const { units, properties, leases, leaseUnitAssignments, updateUnit, deleteUnit, getActiveLease, tenants, getLeaseOutstanding, getReceivableItemsByLease, getTenantUnappliedCredit, getTicketsByUnit, getCostEntriesByUnit, getAllocationResultsByUnit, getCostCategoryById, getAllocationRuleById, costEntries, confirmMoveOut } = useAppData();
  const { t } = useSettings();
  const { toast } = useToast();
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();
  const navigate = useNavigate();

  // Sort state for the unified Costs & Taxes table (direct + allocated).
  type CostRowKey = "source" | "label" | "category" | "nature" | "recovery" | "period" | "method" | "total" | "amount" | "ownerBorne" | "recoverable";
  const { sort: costsSort, toggle: toggleCostsSort } = useTableSort<CostRowKey>();

  // Sort state for the per-unit leases table inside the Occupancy section.
  type UnitLeaseRowKey = "reference" | "tenant" | "role" | "start" | "end" | "rent" | "status";
  const { sort: unitLeasesSort, toggle: toggleUnitLeasesSort } = useTableSort<UnitLeaseRowKey>("start", "desc");

  const unit = units.find(u => u.id === id);
  const property = unit ? properties.find(p => p.id === unit.propertyId) : null;

  const [editSection, setEditSection] = useState<EditSection>(null);
  const [form, setForm] = useState<UnitFormData | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [pendingOverride, setPendingOverride] = useState<ValidationResult | null>(null);
  const [vacateValidation, setVacateValidation] = useState<ValidationResult | null>(null);
  const [vacateOverrideOpen, setVacateOverrideOpen] = useState(false);
  const [archiveValidation, setArchiveValidation] = useState<ValidationResult | null>(null);
  const [archiveOverrideOpen, setArchiveOverrideOpen] = useState(false);
  const [vacateEndDialogOpen, setVacateEndDialogOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  const [financialsOpen, setFinancialsOpen] = useState(true);
  const [occupancyOpen, setOccupancyOpen] = useState(true);
  const [maintenanceOpen, setMaintenanceOpen] = useState(true);
  const [costsOpen, setCostsOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const [vacateEndDate, setVacateEndDate] = useState("");

  const openEdit = (section: Exclude<EditSection, null>) => {
    if (!unit) return;
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = unit;
    setForm(rest);
    setEditSection(section);
  };
  const closeEdit = () => { setEditSection(null); setForm(null); };

  const statusValidation = (() => {
    if (!unit || !form || form.currentStatus === unit.currentStatus) return null;
    return canChangeUnitStatus(unit.id, form.currentStatus, integrityState);
  })();

  const persist = (patch: Partial<UnitFormData>) => {
    if (!unit) return;
    updateUnit({ ...unit, ...patch });
    toast({ title: t("units.toastUpdated") });
    closeEdit();
  };

  const handleSave = () => {
    if (!unit || !form) return;
    if (editSection === "info") {
      if (!form.unitCode.trim() || !form.unitLabel.trim()) {
        toast({ title: t("common.validationError"), description: t("units.requiredCodeLabel"), variant: "destructive" });
        return;
      }
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

  const handleOverrideConfirm = (reason: string) => {
    if (!unit || !form || !pendingOverride) return;
    addOverride({
      entityType: "unit", entityId: unit.id,
      action: `status_change:${form.currentStatus}`,
      blockerCodes: pendingOverride.blockers.map(b => b.code),
      reason,
    });
    updateUnit({
      ...unit,
      unitCode: form.unitCode, unitLabel: form.unitLabel, unitType: form.unitType,
      floor: form.floor, surfaceArea: form.surfaceArea, bedrooms: form.bedrooms, bathrooms: form.bathrooms,
      furnished: form.furnished, availableFrom: form.availableFrom, currentStatus: form.currentStatus,
    });
    toast({ title: t("units.updatedOverridden"), description: t("units.overrideReason").replace("{reason}", reason) });
    setPendingOverride(null);
    setOverrideOpen(false);
    closeEdit();
  };

  const handleMakeVacant = () => {
    if (!unit) return;
    const v = canChangeUnitStatus(unit.id, "vacant", integrityState);
    if (v.allowed) {
      updateUnit({ ...unit, currentStatus: "vacant" });
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

  const handleVacateOverride = (reason: string) => {
    if (!unit || !vacateValidation) return;
    addOverride({
      entityType: "unit", entityId: unit.id,
      action: "status_change:vacant",
      blockerCodes: vacateValidation.blockers.map(b => b.code),
      reason,
    });
    updateUnit({ ...unit, currentStatus: "vacant" });
    toast({ title: t("units.updatedOverridden"), description: t("units.overrideReason").replace("{reason}", reason) });
    setVacateValidation(null);
    setVacateOverrideOpen(false);
  };

  const handleDeleteUnit = (uid: string) => {
    deleteUnit(uid);
    toast({ title: t("units.toastDeleted") || "Unit deleted" });
    navigate("/units");
  };

  const handleArchive = () => {
    if (!unit) return;
    const v = canChangeUnitStatus(unit.id, "archived", integrityState);
    if (v.allowed) {
      updateUnit({ ...unit, currentStatus: "archived" });
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

  const handleArchiveOverride = (reason: string) => {
    if (!unit || !archiveValidation) return;
    addOverride({
      entityType: "unit", entityId: unit.id,
      action: "status_change:archived",
      blockerCodes: archiveValidation.blockers.map(b => b.code),
      reason,
    });
    updateUnit({ ...unit, currentStatus: "archived" });
    toast({ title: t("units.updatedOverridden"), description: t("units.overrideReason").replace("{reason}", reason) });
    setArchiveValidation(null);
    setArchiveOverrideOpen(false);
  };

  const handleUnarchive = () => {
    if (!unit) return;
    updateUnit({ ...unit, currentStatus: "vacant" });
    toast({ title: t("units.toastUnarchived") });
  };

  const openVacateWithLeaseEnd = () => {
    setVacateEndDate(new Date().toISOString().split("T")[0]);
    setVacateEndDialogOpen(true);
  };

  const confirmVacateWithLeaseEnd = () => {
    if (!unit) return;
    const lease = getActiveLease(unit.id);
    if (!lease) {
      setVacateEndDialogOpen(false);
      return;
    }
    const ed = vacateEndDate || new Date().toISOString().split("T")[0];
    confirmMoveOut({
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
  };

  if (!unit || !property) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("detail.unitNotFound")}</p>
        <Button variant="link" asChild className="mt-2"><Link to="/units">← {t("nav.units")}</Link></Button>
      </div>
    );
  }

  const activeLease = getActiveLease(unit.id);
  const occupancy = getDerivedOccupancy(unit.id, unit.currentStatus, leases, leaseUnitAssignments);
  const tenant = activeLease ? tenants.find(tn => tn.id === activeLease.primaryTenantId) : null;
  const lifecycle = activeLease ? getLeaseStatus(activeLease) : null;
  const moveIn = activeLease ? getMoveInStatus(activeLease) : null;
  const moveOut = activeLease ? getMoveOutStatus(activeLease) : null;

  const leaseFinancials = activeLease ? getLeaseOutstanding(activeLease.id) : null;
  const receivables = activeLease ? getReceivableItemsByLease(activeLease.id) : [];
  const unappliedCredit = tenant ? getTenantUnappliedCredit(tenant.id) : 0;
  const today = new Date().toISOString().split("T")[0];
  const nextDueItem = receivables.filter(ri => ri.outstandingAmount > 0 && ri.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  // Every lease ever assigned to this unit (active + historical), one row per assignment.
  const unitLeaseRows = leaseUnitAssignments
    .filter(a => a.unitId === unit.id)
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
      case "role": return row.assignment.assignmentType === "primary" ? 0 : 1;
      case "start": return row.lease.startDate;
      case "end": return row.lease.endDate;
      case "rent": return row.lease.monthlyRent + row.lease.monthlyCharges;
      case "status": return getLeaseStatus(row.lease);
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
              <StatusBadge status={unit.currentStatus} />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {unit.currentStatus !== "archived" && !getActiveLease(unit.id) && (unit.currentStatus === "vacant" || unit.currentStatus === "reserved") && (
              <Button size="sm" asChild>
                <Link to={`/leases?new=1&unitId=${unit.id}`}><Plus className="h-4 w-4" />{t("occupancy.createLeaseAction")}</Link>
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
          </div>
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
            {occupancy.suggestedFix && (
              <div className="flex flex-wrap gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const target = occupancy.suggestedFix!.targetStatus;
                    const prev = unit.currentStatus;
                    updateUnit({ ...unit, currentStatus: target });
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
                  <Button size="sm" variant="default" asChild>
                    <Link to={`/leases?new=1&unitId=${unit.id}`}>{t("occupancy.createLeaseAction")}</Link>
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
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit("info"); }}><Pencil className="h-3.5 w-3.5" /></Button>
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
              {t("common.description")}
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{unit.description || "—"}</p>
          </div>
          <div className="pt-3 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />{t("detail.propertyContext")}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><p className="text-xs text-muted-foreground">{t("table.property")}</p><Link to={`/properties/${property.id}`} className="text-sm font-medium text-primary hover:underline">{property.name}</Link></div>
              <div><p className="text-xs text-muted-foreground">{t("properties.city")}</p><p className="text-sm font-medium text-foreground">{property.city}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("properties.country")}</p><p className="text-sm font-medium text-foreground">{getCountryName(property.countryCode)}</p></div>
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
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit("financials"); }}><Pencil className="h-3.5 w-3.5" /></Button>
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
            <div><p className="text-xs text-muted-foreground">{t("properties.currency")}</p><p className="text-sm font-semibold text-foreground">{property.currencyCode}</p></div>
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
            {unit.currentStatus !== "archived" && (
              <Button
                size="sm"
                asChild
                className="mr-2"
                onClick={(e) => e.stopPropagation()}
              >
                <Link to={`/leases?new=1&unitId=${unit.id}`}>
                  <Plus className="h-4 w-4" />{t("occupancy.createLeaseAction")}
                </Link>
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
                  <SortableTableHead sortKey="role" sort={unitLeasesSort} onSort={toggleUnitLeasesSort}>{t("leases.role.primary")}</SortableTableHead>
                  <SortableTableHead sortKey="start" sort={unitLeasesSort} onSort={toggleUnitLeasesSort}>{t("leases.startDate")}</SortableTableHead>
                  <SortableTableHead sortKey="end" sort={unitLeasesSort} onSort={toggleUnitLeasesSort}>{t("leases.endDate")}</SortableTableHead>
                  <SortableTableHead sortKey="rent" sort={unitLeasesSort} onSort={toggleUnitLeasesSort} align="right">{t("leases.monthlyRent")}</SortableTableHead>
                  <SortableTableHead sortKey="status" sort={unitLeasesSort} onSort={toggleUnitLeasesSort}>{t("table.status")}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUnitLeaseRows.map(({ assignment, lease, tenant: leaseTenant }) => {
                  const status = getLeaseStatus(lease);
                  return (
                    <TableRow key={assignment.id}>
                      <TableCell>
                        <Link to={`/leases/${lease.id}`} className="text-sm font-medium text-primary hover:underline">{lease.leaseReference}</Link>
                      </TableCell>
                      <TableCell>
                        {leaseTenant ? (
                          <Link to={`/tenants/${leaseTenant.id}`} className="text-sm text-primary hover:underline">{getTenantFullName(leaseTenant)}</Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {assignment.assignmentType === "primary" ? t("leases.role.primary") : t("leases.role.ancillary")}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(lease.startDate, property.locale)}</TableCell>
                      <TableCell className="text-sm">{formatDate(lease.endDate, property.locale)}</TableCell>
                      <TableCell className="text-sm text-right">{formatCurrency(lease.monthlyRent + lease.monthlyCharges, property.currencyCode, property.locale)}</TableCell>
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
                        <TableCell className="font-medium"><Link to={`/maintenance/${tk.id}`} className="hover:underline text-foreground">{tk.title}</Link></TableCell>
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
        const directEntries = getCostEntriesByUnit(unit.id);
        const allocResults = getAllocationResultsByUnit(unit.id);
        const directTotal = directEntries.reduce((s, e) => s + e.amount, 0);
        const allocTotal = allocResults.reduce((s, r) => s + r.allocatedAmount, 0);
        const totalBurden = directTotal + allocTotal;
        const ownerBorne = directEntries.filter(e => e.recoveryType === "owner-only").reduce((s, e) => s + e.amount, 0)
          + allocResults.reduce((s, r) => s + r.ownerBurdenAmount, 0);
        const recoverable = directEntries.filter(e => e.recoveryType === "tenant-recoverable").reduce((s, e) => s + e.amount, 0)
          + allocResults.reduce((s, r) => s + r.recoverableAmount, 0);

        if (totalBurden === 0) return null;

        return (
          <Collapsible open={costsOpen} onOpenChange={setCostsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
                <CardTitle className="text-base font-medium flex-1 justify-start">{t("units.costsTaxesBurden")}
                </CardTitle>
                <span className="inline-flex items-center justify-center h-7 w-7">
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", costsOpen && "rotate-180")} />
                </span>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-md bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">{t("units.ownerBorne")}</p>
                  <p className="text-lg font-bold text-destructive">{formatCurrency(ownerBorne, property.currencyCode, property.locale)}</p>
                </div>
                <div className="p-3 rounded-md bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">{t("units.recoverable")}</p>
                  <p className="text-lg font-bold text-success">{formatCurrency(recoverable, property.currencyCode, property.locale)}</p>
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
                };
                const splitRecovery = (amount: number, r: RecoveryType) => {
                  if (r === "owner-only") return { owner: amount, rec: 0 };
                  if (r === "tenant-recoverable") return { owner: 0, rec: amount };
                  if (r === "partially-recoverable") {
                    const half = Math.round((amount / 2) * 100) / 100;
                    return { owner: half, rec: Math.round((amount - half) * 100) / 100 };
                  }
                  return { owner: 0, rec: 0 };
                };
                const rows: Row[] = [];
                for (const e of directEntries) {
                  const s = splitRecovery(e.amount, e.recoveryType);
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
                    ownerBorne: s.owner,
                    recoverable: s.rec,
                  });
                }
                for (const r of allocResults) {
                  const parent = costEntries.find(e => e.id === r.costEntryId);
                  const rule = getAllocationRuleById(parent?.allocationRuleId ?? "");
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
                    case "total": return row.totalCost;
                    case "amount": return row.amount;
                    case "ownerBorne": return row.ownerBorne;
                    case "recoverable": return row.recoverable;
                  }
                });
                const periodCell = (row: Row) => {
                  if (row.periodStart && row.periodEnd) {
                    return `${formatDate(row.periodStart, property.locale)} → ${formatDate(row.periodEnd, property.locale)}`;
                  }
                  if (row.periodStart) return formatDate(row.periodStart, property.locale);
                  return row.frequency ? t(`costs.frequency.${row.frequency}` as TranslationKey) : "—";
                };
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
                        <SortableTableHead sortKey="total" sort={costsSort} onSort={toggleCostsSort} align="right">{t("costs.totalCost")}</SortableTableHead>
                        <SortableTableHead sortKey="amount" sort={costsSort} onSort={toggleCostsSort} align="right">{t("costs.allocatedAmount")}</SortableTableHead>
                        <SortableTableHead sortKey="ownerBorne" sort={costsSort} onSort={toggleCostsSort} align="right">{t("costs.ownerBorne")}</SortableTableHead>
                        <SortableTableHead sortKey="recoverable" sort={costsSort} onSort={toggleCostsSort} align="right">{t("costs.recoverable")}</SortableTableHead>
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
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(row.totalCost, property.currencyCode, property.locale)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
                                  {formatCurrency(row.amount, property.currencyCode, property.locale)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-sm p-3 text-xs space-y-2">
                                <div className="text-sm border-b pb-1.5">{row.label}</div>
                                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                                  <span className="text-muted-foreground">{t("reconciliation.overview.tip.fullCost")}</span>
                                  <span className="text-right tabular-nums">{formatCurrency(row.totalCost, property.currencyCode, property.locale)}</span>
                                  <span className="text-muted-foreground">{t("costs.unitShare")} ({unit.unitCode})</span>
                                  <span className="text-right tabular-nums">
                                    {row.totalCost > 0 ? `${((row.amount / row.totalCost) * 100).toFixed(1)}%` : "—"}
                                  </span>
                                </div>
                                <div className="grid grid-cols-[1fr_auto] gap-x-3 border-t pt-1.5">
                                  <span className="font-medium">{t("costs.allocatedAmount")}</span>
                                  <span className="text-right font-semibold tabular-nums">{formatCurrency(row.amount, property.currencyCode, property.locale)}</span>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(row.ownerBorne, property.currencyCode, property.locale)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(row.recoverable, property.currencyCode, property.locale)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 border-t font-semibold hover:bg-muted/30">
                        <TableCell className="text-sm" colSpan={7}>{t("common.total")}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(sorted.reduce((s, r) => s + r.totalCost, 0), property.currencyCode, property.locale)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(directTotal + allocTotal, property.currencyCode, property.locale)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(ownerBorne, property.currencyCode, property.locale)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(recoverable, property.currencyCode, property.locale)}</TableCell>
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
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit("notes"); }}><Pencil className="h-3.5 w-3.5" /></Button>
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

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("table.created")}: {formatDate(unit.createdAt, property.locale)}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("table.updated")}: {formatDate(unit.updatedAt, property.locale)}</span>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editSection !== null} onOpenChange={(v) => { if (!v) closeEdit(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                <div><Label>{t("units.unitCode")} *</Label><Input value={form.unitCode} onChange={e => setForm(f => f && ({ ...f, unitCode: e.target.value }))} /></div>
                <div><Label>{t("units.label")} *</Label><Input value={form.unitLabel} onChange={e => setForm(f => f && ({ ...f, unitLabel: e.target.value }))} /></div>
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
                <div><Label>{t("units.surface")} ({property.measurementSystem === "imperial" ? "sq ft" : "m²"})</Label><Input type="number" value={form.surfaceArea ?? ""} onChange={e => setForm(f => f && ({ ...f, surfaceArea: e.target.value ? Number(e.target.value) : null }))} /></div>
                <div><Label>{t("units.bedrooms")}</Label><Input type="number" min={0} value={form.bedrooms} onChange={e => setForm(f => f && ({ ...f, bedrooms: Number(e.target.value) }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t("units.bathrooms")}</Label><Input type="number" min={0} value={form.bathrooms} onChange={e => setForm(f => f && ({ ...f, bathrooms: Number(e.target.value) }))} /></div>
                <div><Label>{t("units.availableFrom")}</Label><Input type="date" value={form.availableFrom ?? ""} onChange={e => setForm(f => f && ({ ...f, availableFrom: e.target.value || null }))} /></div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.furnished} onCheckedChange={v => setForm(f => f && ({ ...f, furnished: v }))} />
                <Label>{t("units.furnished")}</Label>
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
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={closeEdit}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{t("action.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingOverride && (
        <OverrideConfirmDialog
          open={overrideOpen}
          onOpenChange={(v) => { setOverrideOpen(v); if (!v) setPendingOverride(null); }}
          validation={pendingOverride}
          actionLabel="Override and Save"
          onOverride={handleOverrideConfirm}
        />
      )}

      {vacateValidation && (
        <OverrideConfirmDialog
          open={vacateOverrideOpen}
          onOpenChange={(v) => { setVacateOverrideOpen(v); if (!v) setVacateValidation(null); }}
          validation={vacateValidation}
          actionLabel="Override and Vacate"
          onOverride={handleVacateOverride}
        />
      )}

      {archiveValidation && (
        <OverrideConfirmDialog
          open={archiveOverrideOpen}
          onOpenChange={(v) => { setArchiveOverrideOpen(v); if (!v) setArchiveValidation(null); }}
          validation={archiveValidation}
          actionLabel="Override and Archive"
          onOverride={handleArchiveOverride}
        />
      )}

      <Dialog open={vacateEndDialogOpen} onOpenChange={setVacateEndDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("unit.vacateLeaseEndTitle")}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">{t("unit.vacateLeaseEndDescription")}</p>
          <div className="space-y-3 mt-3">
            <div><Label>{t("lease.endDialog.endDate")}</Label><Input type="date" value={vacateEndDate} onChange={e => setVacateEndDate(e.target.value)} /></div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setVacateEndDialogOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={confirmVacateWithLeaseEnd} disabled={!vacateEndDate}>{t("occupancy.makeVacantAction")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
