import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Ban, TrendingUp, DoorOpen, Plus, Eye, Pencil, Trash2, Banknote, AlertTriangle, MoreVertical } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { formatCurrency, formatArea, formatDate, getCountryName, UNIT_TYPE_KEYS } from "@/lib/formatters";
import { Unit, UnitType, UnitStatus, Property, getTenantFullName } from "@/types";
import type { TranslationKey } from "@/i18n/translations";
import { useToast } from "@/hooks/use-toast";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { canChangeUnitStatus } from "@/lib/integrity/unitIntegrity";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";
import { getDerivedOccupancy } from "@/lib/occupancy";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { OverrideConfirmDialog } from "@/components/shared/OverrideConfirmDialog";
import { useOverrideHistory } from "@/context/OverrideContext";
import type { ValidationResult } from "@/lib/integrity/types";
import { RentTiersEditor } from "@/components/shared/RentTiersEditor";

const UNIT_TYPE_VALUES: UnitType[] = ["apartment", "studio", "office", "parking", "storage", "house", "commercial-unit"];
const UNIT_STATUS_VALUES: UnitStatus[] = ["vacant", "occupied", "reserved", "unavailable", "archived"];
const PROPERTY_TYPE_KEYS: Record<string, TranslationKey> = {
  residential: "properties.residential",
  commercial: "properties.commercial",
  "mixed-use": "properties.mixedUse",
};
const EUROPEAN_COUNTRIES = [
  { code: "FR", label: "France" }, { code: "BE", label: "Belgium" }, { code: "NL", label: "Netherlands" },
  { code: "DE", label: "Germany" }, { code: "GB", label: "United Kingdom" }, { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" }, { code: "PT", label: "Portugal" }, { code: "CH", label: "Switzerland" },
  { code: "AT", label: "Austria" }, { code: "LU", label: "Luxembourg" }, { code: "IE", label: "Ireland" },
  { code: "SE", label: "Sweden" }, { code: "DK", label: "Denmark" }, { code: "NO", label: "Norway" },
  { code: "FI", label: "Finland" }, { code: "PL", label: "Poland" }, { code: "CZ", label: "Czech Republic" },
];
const CURRENCIES = ["EUR", "GBP", "CHF", "SEK", "DKK", "NOK", "PLN", "CZK"];
type PropertyEditData = Omit<Property, "id" | "createdAt" | "updatedAt">;
const UNIT_STATUS_LABEL_KEYS: Record<UnitStatus, TranslationKey> = {
  vacant: "status.vacant",
  occupied: "status.occupied",
  reserved: "status.reserved",
  unavailable: "status.unavailable",
  archived: "status.archived",
};

type UnitFormData = Omit<Unit, "id" | "createdAt" | "updatedAt">;

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const { properties, units, leases, leaseUnitAssignments, getPropertyStats, addUnit, updateUnit, deleteUnit, updateProperty, deleteProperty, getActiveLease, tenants, getCostEntriesByProperty, getAllocationResultsByProperty } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const navigate = useNavigate();
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverrideValidation, setPendingOverrideValidation] = useState<ValidationResult | null>(null);

  const property = properties.find(p => p.id === id);
  const propertyUnits = units.filter(u => u.propertyId === id);
  const stats = id ? getPropertyStats(id) : null;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const emptyUnitForm: UnitFormData = {
    propertyId: id ?? "", unitCode: "", unitLabel: "", unitType: "apartment",
    floor: null, surfaceArea: null, bedrooms: 0, bathrooms: 0, furnished: false,
    currentStatus: "vacant", baseRent: null, rentTiers: [], baseCharges: null, availableFrom: null, notes: "",
  };
  const [unitForm, setUnitForm] = useState<UnitFormData>({ ...emptyUnitForm });

  const [propertyEditOpen, setPropertyEditOpen] = useState(false);
  const [propertyForm, setPropertyForm] = useState<PropertyEditData | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(true);
  const [localSettingsOpen, setLocalSettingsOpen] = useState(true);
  const [descriptionOpen, setDescriptionOpen] = useState(true);
  const [unitsOpen, setUnitsOpen] = useState(true);
  const [costsOpen, setCostsOpen] = useState(true);
  const openEditProperty = () => {
    if (!property) return;
    const { id: _id, createdAt, updatedAt, ...rest } = property;
    setPropertyForm(rest);
    setPropertyEditOpen(true);
  };
  const handleSaveProperty = () => {
    if (!property || !propertyForm) return;
    if (!propertyForm.name.trim() || !propertyForm.referenceCode.trim() || !propertyForm.address1.trim() || !propertyForm.city.trim() || !propertyForm.countryCode) {
      toast({ title: t("common.validationError"), description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    updateProperty({ ...property, ...propertyForm });
    toast({ title: `${t("properties.title")} ${t("common.updated").toLowerCase()}` });
    setPropertyEditOpen(false);
  };

  const openAddUnit = () => { setEditingUnit(null); setUnitForm({ ...emptyUnitForm }); setSheetOpen(true); };
  const openEditUnit = (u: Unit) => {
    setEditingUnit(u);
    const { id: _, createdAt, updatedAt, ...rest } = u;
    setUnitForm(rest);
    setSheetOpen(true);
  };
  const unitStatusValidation = (() => {
    if (!editingUnit || unitForm.currentStatus === editingUnit.currentStatus) return null;
    return canChangeUnitStatus(editingUnit.id, unitForm.currentStatus, integrityState);
  })();

  const executeUnitSave = () => {
    if (editingUnit) {
      updateUnit({ ...editingUnit, ...unitForm });
      toast({ title: t("units.toastUpdated") });
    } else {
      addUnit(unitForm);
      toast({ title: t("units.toastAdded") });
    }
    setSheetOpen(false);
  };

  const handleSaveUnit = () => {
    if (!unitForm.unitCode.trim() || !unitForm.unitLabel.trim()) {
      toast({ title: t("common.validationError"), description: t("units.requiredCodeLabel"), variant: "destructive" });
      return;
    }
    if (editingUnit && unitForm.currentStatus !== editingUnit.currentStatus) {
      const validation = canChangeUnitStatus(editingUnit.id, unitForm.currentStatus, integrityState);
      if (!validation.allowed) {
        if (validation.overrideAllowed) {
          setPendingOverrideValidation(validation);
          setOverrideDialogOpen(true);
          return;
        }
        toast({ title: t("units.statusChangeBlocked"), description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
        return;
      }
    }
    executeUnitSave();
  };

  const handleUnitOverrideConfirm = (reason: string) => {
    if (!editingUnit || !pendingOverrideValidation) return;
    addOverride({
      entityType: "unit",
      entityId: editingUnit.id,
      action: `status_change:${unitForm.currentStatus}`,
      blockerCodes: pendingOverrideValidation.blockers.map(b => b.code),
      reason,
    });
    updateUnit({ ...editingUnit, ...unitForm });
    setSheetOpen(false);
    toast({ title: t("units.updatedOverridden"), description: t("units.overrideReason").replace("{reason}", reason) });
    setPendingOverrideValidation(null);
  };

  const handleDeleteUnit = (unitId: string) => {
    deleteUnit(unitId);
    toast({ title: t("units.toastDeleted") });
  };

  const handleDeleteProperty = (propertyId: string) => {
    deleteProperty(propertyId);
    toast({ title: t("propertyDetail.toastDeleted") });
    navigate("/properties");
  };

  if (!property) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("detail.propertyNotFound")}</p>
        <Button variant="link" asChild className="mt-2"><Link to="/properties">← {t("nav.properties")}</Link></Button>
      </div>
    );
  }

  const kpis = [
    { label: t("common.total"), value: stats?.total ?? 0, icon: DoorOpen, color: "text-foreground" },
    { label: t("dashboard.occupied"), value: stats?.occupied ?? 0, icon: CheckCircle2, color: "text-success" },
    { label: t("dashboard.vacantUnits"), value: stats?.vacant ?? 0, icon: XCircle, color: "text-warning" },
    { label: t("dashboard.reservedUnits"), value: stats?.reserved ?? 0, icon: Clock, color: "text-primary" },
    { label: t("dashboard.unavailableUnits"), value: stats?.unavailable ?? 0, icon: Ban, color: "text-muted-foreground" },
    { label: t("properties.occupancy"), value: `${stats?.occupancyRate ?? 0}%`, icon: TrendingUp, color: "text-success" },
  ];

  const fullAddress = [
    property.address1, property.address2,
    [property.postalCode, property.city].filter(Boolean).join(" "),
    property.regionOrState, getCountryName(property.countryCode),
  ].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link to="/properties"><ArrowLeft className="h-4 w-4 mr-1" />{t("nav.properties")}</Link>
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{property.name}</h1>
              <StatusBadge status={property.status} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("propertyDetail.moreActions")}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DeleteDialog
                  entityType="property"
                  entityId={property.id}
                  entityLabel={property.name}
                  onDelete={handleDeleteProperty}
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

      {/* Overview & Local Settings */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Collapsible open={overviewOpen} onOpenChange={setOverviewOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
              <CardTitle className="text-base font-medium flex-1 justify-start">{t("detail.overview")}</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEditProperty(); }} aria-label={t("action.edit") ?? "Edit"}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <span className="inline-flex items-center justify-center h-7 w-7">
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", overviewOpen && "rotate-180")} />
                </span>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">{t("properties.reference")}</span><span className="text-sm font-medium text-foreground font-mono">{property.referenceCode}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">{t("properties.address")}</span><span className="text-sm font-medium text-foreground text-right max-w-[60%]">{fullAddress}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">{t("properties.owner")}</span><span className="text-sm font-medium text-foreground">{property.ownerName || "—"}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">{t("properties.country")}</span><span className="text-sm font-medium text-foreground">{getCountryName(property.countryCode)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">{t("properties.type")}</span><span className="text-sm font-medium text-foreground">{t(PROPERTY_TYPE_KEYS[property.propertyType])}</span></div>
          </CardContent>
          </CollapsibleContent>
        </Card>
        </Collapsible>
        <Collapsible open={localSettingsOpen} onOpenChange={setLocalSettingsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
              <CardTitle className="text-base font-medium flex-1 justify-start">{t("detail.localSettings")}</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEditProperty(); }} aria-label={t("action.edit") ?? "Edit"}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <span className="inline-flex items-center justify-center h-7 w-7">
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", localSettingsOpen && "rotate-180")} />
                </span>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">{t("properties.locale")}</span><span className="text-sm font-medium text-foreground font-mono">{property.locale}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">{t("properties.currency")}</span><span className="text-sm font-medium text-foreground">{property.currencyCode}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">{t("properties.measurement")}</span><span className="text-sm font-medium text-foreground capitalize">{property.measurementSystem}</span></div>
          </CardContent>
          </CollapsibleContent>
        </Card>
        </Collapsible>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</p>
                  <p className="text-xl font-bold text-foreground mt-0.5">{k.value}</p>
                </div>
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Description */}
      <Collapsible open={descriptionOpen} onOpenChange={setDescriptionOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex-1 justify-start">{t("common.description")}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEditProperty(); }} aria-label={t("action.edit") ?? "Edit"}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", descriptionOpen && "rotate-180")} />
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <p className="text-sm text-muted-foreground">{property.description || "—"}</p>
          </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      {/* Units */}
      <Collapsible open={unitsOpen} onOpenChange={setUnitsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex-1 justify-start">{t("nav.units")}</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={(e) => { e.stopPropagation(); openAddUnit(); }}>
                <Plus className="h-4 w-4 mr-1.5" />{t("units.add")}
              </Button>
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", unitsOpen && "rotate-180")} />
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {propertyUnits.length === 0 ? (
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">{t("detail.noUnitsInProperty")}</p>
              <Button variant="link" className="mt-2" onClick={openAddUnit}>{t("detail.addFirstUnit")}</Button>
            </CardContent>
          ) : (
            <TooltipProvider>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("units.code")}</TableHead>
                      <TableHead>{t("units.label")}</TableHead>
                      <TableHead>{t("units.type")}</TableHead>
                      <TableHead className="text-center">{t("units.floor")}</TableHead>
                      <TableHead className="text-right">{t("units.surface")}</TableHead>
                      <TableHead className="text-right">{t("units.rent")}</TableHead>
                      <TableHead className="text-right">{t("units.charges")}</TableHead>
                      <TableHead>{t("occupancy.derivedLabel")}</TableHead>
                      <TableHead>{t("propertyDetail.tenant")}</TableHead>
                      <TableHead>{t("propertyDetail.lease")}</TableHead>
                      <TableHead className="text-right">{t("units.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {propertyUnits.map(u => {
                      const activeLease = getActiveLease(u.id);
                      const tenant = activeLease ? tenants.find(tn => tn.id === activeLease.primaryTenantId) : null;
                      const occupancy = getDerivedOccupancy(u.id, u.currentStatus, leases, leaseUnitAssignments);
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="font-mono text-xs font-medium text-foreground">
                            <Link to={`/units/${u.id}`} className="hover:underline">{u.unitCode}</Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{u.unitLabel}</TableCell>
                          <TableCell className="text-muted-foreground">{t(UNIT_TYPE_KEYS[u.unitType])}</TableCell>
                          <TableCell className="text-center text-muted-foreground">{u.floor != null ? u.floor : "—"}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{u.surfaceArea != null ? formatArea(u.surfaceArea, property.measurementSystem) : "—"}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{u.baseRent != null ? formatCurrency(u.baseRent, property.currencyCode, property.locale) : "—"}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{u.baseCharges != null ? formatCurrency(u.baseCharges, property.currencyCode, property.locale) : "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={u.currentStatus} />
                              {occupancy.occupancyRole === "ancillary" && (
                                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {t("leases.role.ancillary")}
                                </span>
                              )}
                              {occupancy.inconsistent && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[250px]">
                                    <p className="text-xs">{occupancy.inconsistencyKey ? t(occupancy.inconsistencyKey) : ""}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {tenant ? <Link to={`/tenants/${tenant.id}`} className="hover:underline">{getTenantFullName(tenant)}</Link> : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {activeLease ? <Link to={`/leases/${activeLease.id}`} className="hover:underline">{activeLease.leaseReference}</Link> : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                <Link to={`/units/${u.id}`}><Eye className="h-3.5 w-3.5" /></Link>
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditUnit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                              <DeleteDialog entityType="unit" entityId={u.id} entityLabel="unit" onDelete={handleDeleteUnit} />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </TooltipProvider>
          )}
        </CollapsibleContent>
      </Card>
      </Collapsible>

      {/* Costs & Taxes */}
      {(() => {
        const propEntries = getCostEntriesByProperty(property.id);
        const propAllocResults = getAllocationResultsByProperty(property.id);
        const directEntries = propEntries.filter(e => e.unitId);
        const propertyLevelEntries = propEntries.filter(e => !e.unitId);

        const totalCharges = propEntries.filter(e => !e.isTax).reduce((s, e) => s + e.amount, 0);
        const totalTaxes = propEntries.filter(e => e.isTax).reduce((s, e) => s + e.amount, 0);
        const ownerBorne = propEntries.filter(e => e.recoveryType === "owner-only").reduce((s, e) => s + e.amount, 0)
          + propAllocResults.filter(r => r.recoveryType === "owner-only" || r.recoveryType === "partially-recoverable").reduce((s, r) => s + r.ownerBurdenAmount, 0)
          - propEntries.filter(e => !e.unitId && (e.recoveryType === "owner-only" || e.recoveryType === "partially-recoverable")).reduce((s, e) => s + e.amount, 0);
        const recoverable = propAllocResults.reduce((s, r) => s + r.recoverableAmount, 0)
          + directEntries.filter(e => e.recoveryType === "tenant-recoverable").reduce((s, e) => s + e.amount, 0);
        const totalCosts = totalCharges + totalTaxes;

        // Unit burden summary
        const unitBurden = propertyUnits.map(u => {
          const directCosts = propEntries.filter(e => e.unitId === u.id);
          const allocResults = propAllocResults.filter(r => r.unitId === u.id);
          const directTotal = directCosts.reduce((s, e) => s + e.amount, 0);
          const allocTotal = allocResults.reduce((s, r) => s + r.allocatedAmount, 0);
          return { unit: u, directTotal, allocTotal, total: directTotal + allocTotal };
        }).filter(x => x.total > 0);

        return (
          <Collapsible open={costsOpen} onOpenChange={setCostsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
                <CardTitle className="text-base font-medium flex items-center gap-1.5 flex-1 justify-start">
                  <Banknote className="h-4 w-4" />{t("costs.costsTaxes")}
                </CardTitle>
                <span className="inline-flex items-center justify-center h-7 w-7">
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", costsOpen && "rotate-180")} />
                </span>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><p className="text-xs text-muted-foreground">{t("propertyDetail.totalCosts")}</p><p className="text-lg font-bold text-foreground">{formatCurrency(totalCosts, property.currencyCode, property.locale)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("propertyDetail.charges")}</p><p className="text-lg font-bold text-foreground">{formatCurrency(totalCharges, property.currencyCode, property.locale)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("propertyDetail.taxes")}</p><p className="text-lg font-bold text-foreground">{formatCurrency(totalTaxes, property.currencyCode, property.locale)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("propertyDetail.entries")}</p><p className="text-lg font-bold text-foreground">{propEntries.length}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-md bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">{t("costs.ownerBorne")}</p>
                  <p className="text-lg font-bold text-destructive">{formatCurrency(ownerBorne, property.currencyCode, property.locale)}</p>
                </div>
                <div className="p-3 rounded-md bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">{t("costs.recoverable")}</p>
                  <p className="text-lg font-bold text-success">{formatCurrency(recoverable, property.currencyCode, property.locale)}</p>
                </div>
              </div>
              {unitBurden.length > 0 && (
                <>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-2">{t("propertyDetail.unitBurden")}</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{t("propertyDetail.unit")}</TableHead>
                        <TableHead className="text-xs text-right">{t("propertyDetail.direct")}</TableHead>
                        <TableHead className="text-xs text-right">{t("propertyDetail.allocated")}</TableHead>
                        <TableHead className="text-xs text-right">{t("propertyDetail.total")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unitBurden.map(({ unit: u, directTotal, allocTotal, total }) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium text-sm"><Link to={`/units/${u.id}`} className="hover:underline text-foreground">{u.unitCode}</Link></TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(directTotal, property.currencyCode, property.locale)}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(allocTotal, property.currencyCode, property.locale)}</TableCell>
                          <TableCell className="text-right text-sm font-bold text-foreground">{formatCurrency(total, property.currencyCode, property.locale)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
              {propEntries.length === 0 && <p className="text-sm text-muted-foreground">{t("propertyDetail.noCostEntries")}</p>}
              {propEntries.length > 0 && (
                <Button variant="link" size="sm" asChild className="p-0 h-auto">
                  <Link to="/costs/entries">{t("propertyDetail.viewAllCostEntries")}</Link>
                </Button>
              )}
            </CardContent>
            </CollapsibleContent>
          </Card>
          </Collapsible>
        );
      })()}

      {/* Unit Form Sheet */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUnit ? t("units.edit") : t("units.add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("units.code")} *</Label>
                <Input value={unitForm.unitCode} onChange={e => setUnitForm(f => ({ ...f, unitCode: e.target.value }))} placeholder="e.g. PAR-A01" />
              </div>
              <div>
                <Label>{t("units.label")} *</Label>
                <Input value={unitForm.unitLabel} onChange={e => setUnitForm(f => ({ ...f, unitLabel: e.target.value }))} placeholder="e.g. Appt 1er gauche" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("units.type")} *</Label>
                <Select value={unitForm.unitType} onValueChange={v => setUnitForm(f => ({ ...f, unitType: v as UnitType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIT_TYPE_VALUES.map(v => <SelectItem key={v} value={v}>{t(UNIT_TYPE_KEYS[v])}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("units.status")} *</Label>
                <Select value={unitForm.currentStatus} onValueChange={v => setUnitForm(f => ({ ...f, currentStatus: v as UnitStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIT_STATUS_VALUES.map(s => <SelectItem key={s} value={s}>{t(UNIT_STATUS_LABEL_KEYS[s])}</SelectItem>)}</SelectContent>
                </Select>
                <StatusTransitionAlert validation={unitStatusValidation} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>{t("units.floor")}</Label><Input type="number" value={unitForm.floor ?? ""} onChange={e => setUnitForm(f => ({ ...f, floor: e.target.value ? Number(e.target.value) : null }))} /></div>
              <div><Label>{t("propertyDetail.surfaceWithUnit").replace("{unit}", property.measurementSystem === "metric" ? "m²" : "sq ft")}</Label><Input type="number" value={unitForm.surfaceArea ?? ""} onChange={e => setUnitForm(f => ({ ...f, surfaceArea: e.target.value ? Number(e.target.value) : null }))} /></div>
              <div><Label>{t("units.availableFrom")}</Label><Input type="date" value={unitForm.availableFrom ?? ""} onChange={e => setUnitForm(f => ({ ...f, availableFrom: e.target.value || null }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>{t("units.bedrooms")}</Label><Input type="number" min={0} value={unitForm.bedrooms} onChange={e => setUnitForm(f => ({ ...f, bedrooms: Number(e.target.value) || 0 }))} /></div>
              <div><Label>{t("units.bathrooms")}</Label><Input type="number" min={0} value={unitForm.bathrooms} onChange={e => setUnitForm(f => ({ ...f, bathrooms: Number(e.target.value) || 0 }))} /></div>
              <div className="flex items-end gap-2 pb-1"><Switch checked={unitForm.furnished} onCheckedChange={v => setUnitForm(f => ({ ...f, furnished: v }))} id="prop-furnished" /><Label htmlFor="prop-furnished">{t("units.furnished")}</Label></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("units.rent")}</Label><Input type="number" min={0} value={unitForm.baseRent ?? ""} onChange={e => setUnitForm(f => ({ ...f, baseRent: e.target.value ? Number(e.target.value) : null }))} /></div>
              <div><Label>{t("units.charges")}</Label><Input type="number" min={0} value={unitForm.baseCharges ?? ""} onChange={e => setUnitForm(f => ({ ...f, baseCharges: e.target.value ? Number(e.target.value) : null }))} /></div>
            </div>
            <div>
              <Label>{t("units.rentTiers")}</Label>
              <p className="text-xs text-muted-foreground mb-2">{t("units.rentTiersHelp")}</p>
              <RentTiersEditor
                baseRent={unitForm.baseRent}
                rentTiers={unitForm.rentTiers}
                currencyCode={property.currencyCode}
                locale={property.locale}
                onChange={(baseRent, rentTiers) => setUnitForm(f => ({ ...f, baseRent, rentTiers }))}
              />
            </div>
            <div><Label>{t("units.notes")}</Label><Textarea value={unitForm.notes} onChange={e => setUnitForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSaveUnit}>{editingUnit ? t("action.saveChanges") : t("units.add")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override Confirm Dialog */}
      {pendingOverrideValidation && (
        <OverrideConfirmDialog
          open={overrideDialogOpen}
          onOpenChange={(v) => { setOverrideDialogOpen(v); if (!v) setPendingOverrideValidation(null); }}
          validation={pendingOverrideValidation}
          actionLabel={t("units.overrideAndSave")}
          onOverride={handleUnitOverrideConfirm}
        />
      )}

      {/* Property Edit Dialog */}
      <Dialog open={propertyEditOpen} onOpenChange={setPropertyEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("properties.edit")}</DialogTitle>
          </DialogHeader>
          {propertyForm && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("properties.name")} *</Label>
                  <Input value={propertyForm.name} onChange={e => setPropertyForm(f => f && ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <Label>{t("properties.reference")} *</Label>
                  <Input value={propertyForm.referenceCode} onChange={e => setPropertyForm(f => f && ({ ...f, referenceCode: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>{t("properties.ownerName")}</Label>
                <Input value={propertyForm.ownerName} onChange={e => setPropertyForm(f => f && ({ ...f, ownerName: e.target.value }))} />
              </div>
              <div>
                <Label>{t("properties.addressLine1")} *</Label>
                <Input value={propertyForm.address1} onChange={e => setPropertyForm(f => f && ({ ...f, address1: e.target.value }))} />
              </div>
              <div>
                <Label>{t("properties.addressLine2")}</Label>
                <Input value={propertyForm.address2} onChange={e => setPropertyForm(f => f && ({ ...f, address2: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("properties.city")} *</Label>
                  <Input value={propertyForm.city} onChange={e => setPropertyForm(f => f && ({ ...f, city: e.target.value }))} />
                </div>
                <div>
                  <Label>{t("properties.postalCode")}</Label>
                  <Input value={propertyForm.postalCode} onChange={e => setPropertyForm(f => f && ({ ...f, postalCode: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("properties.region")}</Label>
                  <Input value={propertyForm.regionOrState} onChange={e => setPropertyForm(f => f && ({ ...f, regionOrState: e.target.value }))} />
                </div>
                <div>
                  <Label>{t("properties.country")} *</Label>
                  <Select value={propertyForm.countryCode} onValueChange={v => setPropertyForm(f => f && ({ ...f, countryCode: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EUROPEAN_COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{t("properties.propertyType")} *</Label>
                <Select value={propertyForm.propertyType} onValueChange={v => setPropertyForm(f => f && ({ ...f, propertyType: v as Property["propertyType"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential">{t("properties.residential")}</SelectItem>
                    <SelectItem value="commercial">{t("properties.commercial")}</SelectItem>
                    <SelectItem value="mixed-use">{t("properties.mixedUse")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>{t("properties.currency")} *</Label>
                  <Select value={propertyForm.currencyCode} onValueChange={v => setPropertyForm(f => f && ({ ...f, currencyCode: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("properties.locale")}</Label>
                  <Input value={propertyForm.locale} onChange={e => setPropertyForm(f => f && ({ ...f, locale: e.target.value }))} />
                </div>
                <div>
                  <Label>{t("properties.measurement")}</Label>
                  <Select value={propertyForm.measurementSystem} onValueChange={v => setPropertyForm(f => f && ({ ...f, measurementSystem: v as "metric" | "imperial" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="metric">{t("properties.metric")}</SelectItem>
                      <SelectItem value="imperial">{t("properties.imperial")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{t("common.description")}</Label>
                <Textarea value={propertyForm.description} onChange={e => setPropertyForm(f => f && ({ ...f, description: e.target.value }))} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPropertyEditOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSaveProperty}>{t("action.saveChanges")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
