import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Home, Ruler, BedDouble, Bath, Sofa, CalendarClock, StickyNote, Clock, Building2, Globe, Pencil, AlertTriangle, Bell, Truck, Wrench, Banknote, Plus, Trash2, DoorOpen, MoreVertical, Archive, ArchiveRestore } from "lucide-react";
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

type EditSection = "info" | "financials" | "property" | "notes" | null;
type UnitFormData = Omit<Unit, "id" | "createdAt" | "updatedAt">;

export default function UnitDetail() {
  const { id } = useParams<{ id: string }>();
  const { units, properties, leases, leaseUnitAssignments, updateUnit, deleteUnit, getActiveLease, tenants, getLeaseOutstanding, getReceivableItemsByLease, getTenantUnappliedCredit, getTicketsByUnit, getCostEntriesByUnit, getAllocationResultsByUnit, confirmMoveOut } = useAppData();
  const { t } = useSettings();
  const { toast } = useToast();
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();
  const navigate = useNavigate();

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
      });
    } else if (editSection === "financials") {
      persist({
        baseRent: form.baseRent,
        rentTiers: [...form.rentTiers].sort((a, b) => a.durationMonths - b.durationMonths),
        baseCharges: form.baseCharges,
      });
    } else if (editSection === "property") {
      if (!form.propertyId) {
        toast({ title: t("common.validationError"), description: t("units.requiredProperty"), variant: "destructive" });
        return;
      }
      persist({ propertyId: form.propertyId });
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

  const infoItems = [
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
            <p className="text-sm text-muted-foreground mt-1">{unit.unitLabel}</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("table.property")}: <Link to={`/properties/${property.id}`} className="hover:underline text-primary">{property.name}</Link>
              <span className="mx-1 text-muted-foreground">·</span>
              <span className="font-mono text-xs">{property.referenceCode}</span>
              <span className="mx-1 text-muted-foreground">·</span>
              {property.city}, {getCountryName(property.countryCode)}
            </p>
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
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium">{t("detail.unitInformation")}</CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit("info")}><Pencil className="h-3.5 w-3.5" /></Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {infoItems.map(item => (
              <div key={item.label} className="flex items-start gap-2">
                <item.icon className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div><p className="text-xs text-muted-foreground">{item.label}</p><p className="text-sm font-medium text-foreground">{item.value}</p></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Financial Defaults */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium">{t("detail.financialDefaults")}</CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit("financials")}><Pencil className="h-3.5 w-3.5" /></Button>
        </CardHeader>
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
      </Card>

      {/* Occupancy */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("detail.occupancySection")}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <StatusBadge status={unit.currentStatus} />
            {occupancy.occupancyRole === "ancillary" && (
              <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {t("leases.role.ancillary")}
              </span>
            )}
            {occupancy.occupancyRole === "primary" && occupancy.activeAssignment && (
              <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {t("leases.role.primary")}
              </span>
            )}
            {lifecycle && lifecycle !== "active" && lifecycle !== "draft" && lifecycle !== occupancy.derived && <StatusBadge status={lifecycle} />}
            {activeLease && moveIn === "scheduled" && occupancy.derived !== "move-in-pending" && <StatusBadge status="scheduled" />}
            {activeLease && activeLease.returnStatus && activeLease.returnStatus !== "completed" && <StatusBadge status={activeLease.returnStatus} />}
          </div>
          {activeLease && tenant ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><p className="text-xs text-muted-foreground">{t("table.tenant")}</p><Link to={`/tenants/${tenant.id}`} className="text-sm font-medium text-primary hover:underline">{getTenantFullName(tenant)}</Link></div>
              <div><p className="text-xs text-muted-foreground">{t("leases.reference")}</p><Link to={`/leases/${activeLease.id}`} className="text-sm font-medium text-primary hover:underline">{activeLease.leaseReference}</Link></div>
              <div><p className="text-xs text-muted-foreground">{t("leases.period")}</p><p className="text-sm font-medium text-foreground">{formatDate(activeLease.startDate, property.locale)} — {formatDate(activeLease.endDate, property.locale)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("leases.monthlyRent")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(activeLease.monthlyRent, property.currencyCode, property.locale)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("leases.monthlyCharges")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(activeLease.monthlyCharges, property.currencyCode, property.locale)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("detail.totalMonthly")}</p><p className="text-sm font-bold text-primary">{formatCurrency(activeLease.monthlyRent + activeLease.monthlyCharges, property.currencyCode, property.locale)}</p></div>

              {activeLease.moveInActualDate && (
                <div><p className="text-xs text-muted-foreground">{t("detail.movedIn")}</p><p className="text-sm font-medium text-foreground">{formatDate(activeLease.moveInActualDate, property.locale)}</p></div>
              )}
              {activeLease.moveOutScheduledDate && !activeLease.moveOutActualDate && (
                <div><p className="text-xs text-muted-foreground">{t("detail.moveOutPlanned")}</p><p className="text-sm font-medium text-warning">{formatDate(activeLease.moveOutScheduledDate, property.locale)}</p></div>
              )}

              {activeLease.noticeGiven && (
                <div className="col-span-full">
                  <div className="flex items-center gap-2 p-3 rounded-md bg-warning/10 border border-warning/30">
                    <Bell className="h-4 w-4 text-warning" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{t("detail.underNoticeLabel")}</p>
                      {activeLease.intendedMoveOutDate && (
                        <p className="text-xs text-muted-foreground">{t("detail.intendedMoveOutLabel")}: {formatDate(activeLease.intendedMoveOutDate, property.locale)} — {t("detail.availableFromLabel")} {formatDate(activeLease.intendedMoveOutDate, property.locale)}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!activeLease.noticeGiven && activeLease.moveOutScheduledDate && !activeLease.moveOutActualDate && (
                <div className="col-span-full">
                  <div className="flex items-center gap-2 p-3 rounded-md bg-primary/10 border border-primary/30">
                    <Truck className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{t("detail.moveOutScheduledLabel")}</p>
                      <p className="text-xs text-muted-foreground">{t("detail.availableFromLabel")} {formatDate(activeLease.moveOutScheduledDate, property.locale)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Financial balance */}
              {leaseFinancials && leaseFinancials.outstanding > 0 && (
                <>
                  <div><p className="text-xs text-muted-foreground">{t("detail.outstandingBalance")}</p><p className="text-sm font-bold text-foreground">{formatCurrency(leaseFinancials.outstanding, property.currencyCode, property.locale)}</p></div>
                  {leaseFinancials.overdue > 0 && (
                    <div><p className="text-xs text-muted-foreground">{t("table.overdue")}</p><p className="text-sm font-bold text-destructive"><AlertTriangle className="h-3.5 w-3.5 inline mr-1" />{formatCurrency(leaseFinancials.overdue, property.currencyCode, property.locale)}</p></div>
                  )}
                </>
              )}
              {unappliedCredit > 0 && (
                <div><p className="text-xs text-muted-foreground">{t("units.unappliedCredit")}</p><p className="text-sm font-bold text-primary"><Banknote className="h-3.5 w-3.5 inline mr-1" />{formatCurrency(unappliedCredit, property.currencyCode, property.locale)}</p></div>
              )}
              {nextDueItem && (
                <div><p className="text-xs text-muted-foreground">{t("detail.nextDue")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(nextDueItem.outstandingAmount, property.currencyCode, property.locale)} — {formatDate(nextDueItem.dueDate, property.locale)}</p></div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("detail.noActiveLeaseDesc")}</p>
          )}
        </CardContent>
      </Card>

      {/* Property Context */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5"><Building2 className="h-4 w-4" />{t("detail.propertyContext")}</CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit("property")}><Pencil className="h-3.5 w-3.5" /></Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className="text-xs text-muted-foreground">{t("table.property")}</p><Link to={`/properties/${property.id}`} className="text-sm font-medium text-primary hover:underline">{property.name}</Link></div>
            <div><p className="text-xs text-muted-foreground">{t("properties.city")}</p><p className="text-sm font-medium text-foreground">{property.city}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("properties.country")}</p><p className="text-sm font-medium text-foreground">{getCountryName(property.countryCode)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("properties.locale")}</p><p className="text-sm font-medium text-foreground font-mono">{property.locale}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("properties.measurement")}</p><p className="text-sm font-medium text-foreground capitalize">{property.measurementSystem}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance */}
      {(() => {
        const unitTickets = getTicketsByUnit(unit.id);
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Wrench className="h-4 w-4" />{t("detail.maintenanceCount").replace("{count}", String(unitTickets.length))}
              </CardTitle>
            </CardHeader>
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
                        <TableCell><StatusBadge status={tk.priority} /></TableCell>
                        <TableCell><StatusBadge status={tk.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(tk.createdDate, property.locale)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
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
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Banknote className="h-4 w-4" />{t("units.costsTaxesBurden")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><p className="text-xs text-muted-foreground">{t("units.totalBurden")}</p><p className="text-lg font-bold text-foreground">{formatCurrency(totalBurden, property.currencyCode, property.locale)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("units.directCosts")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(directTotal, property.currencyCode, property.locale)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("units.allocated")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(allocTotal, property.currencyCode, property.locale)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("units.entries")}</p><p className="text-sm font-medium text-foreground">{t("units.entriesBreakdown").replace("{direct}", String(directEntries.length)).replace("{alloc}", String(allocResults.length))}</p></div>
              </div>
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
              {directEntries.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{t("units.directEntries")}</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{t("costs.label")}</TableHead>
                        <TableHead className="text-xs">{t("units.recovery")}</TableHead>
                        <TableHead className="text-xs text-right">{t("units.amount")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {directEntries.map(e => (
                        <TableRow key={e.id}>
                          <TableCell className="text-sm text-foreground">{e.label}</TableCell>
                          <TableCell><StatusBadge status={e.recoveryType} /></TableCell>
                          <TableCell className="text-right text-sm font-medium text-foreground">{formatCurrency(e.amount, property.currencyCode, property.locale)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Notes */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5"><StickyNote className="h-4 w-4" />{t("common.notes")}</CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit("notes")}><Pencil className="h-3.5 w-3.5" /></Button>
        </CardHeader>
        <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{unit.notes || "—"}</p></CardContent>
      </Card>

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
              {editSection === "property" && t("detail.propertyContext")}
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
          {form && editSection === "property" && (
            <div className="space-y-4 mt-4">
              <Alert><AlertDescription className="text-xs">{t("units.changePropertyWarning")}</AlertDescription></Alert>
              <div>
                <Label>{t("table.property")} *</Label>
                <Select value={form.propertyId} onValueChange={v => setForm(f => f && ({ ...f, propertyId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
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
