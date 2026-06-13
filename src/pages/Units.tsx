import { useState, useEffect } from "react";
import { useAppData } from "@/context/AppContext";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DoorOpen, Plus, Search, Pencil, AlertTriangle, HelpCircle } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Link } from "react-router-dom";
import { formatCurrency, formatArea, formatDate, UNIT_TYPE_KEYS } from "@/lib/formatters";
import { useSettings } from "@/context/SettingsContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { UNIT_TYPE_ICONS, UNIT_OCCUPANCY_ICONS, PROPERTY_ICON } from "@/lib/filterIcons";
import { Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Unit, UnitType, UnitStatus } from "@/types";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { canChangeUnitStatus } from "@/lib/integrity/unitIntegrity";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";
import { getDerivedOccupancy, type DerivedOccupancy } from "@/lib/occupancy";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { OverrideConfirmDialog } from "@/components/shared/OverrideConfirmDialog";
import { useOverrideHistory } from "@/context/OverrideContext";
import type { ValidationResult } from "@/lib/integrity/types";
import { RentTiersEditor } from "@/components/shared/RentTiersEditor";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";

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
const UNIT_STATUSES_NO_LEASE: { value: UnitStatus; labelKey: TranslationKey }[] = [
  { value: "vacant", labelKey: "status.vacant" },
  { value: "reserved", labelKey: "status.reserved" },
  { value: "unavailable", labelKey: "status.unavailable" },
  { value: "archived", labelKey: "status.archived" },
];

const OCCUPANCY_FILTERS: { value: DerivedOccupancy | "all"; labelKey: TranslationKey }[] = [
  { value: "all", labelKey: "units.allOccupancy" },
  { value: "vacant", labelKey: "status.vacant" },
  { value: "occupied", labelKey: "status.occupied" },
  { value: "under-notice", labelKey: "status.underNotice" },
  { value: "move-in-pending", labelKey: "status.moveInPending" },
  { value: "move-out-scheduled", labelKey: "status.moveOutScheduled" },
];

type UnitFormData = Omit<Unit, "id" | "createdAt" | "updatedAt">;

export default function Units() {
  const { properties, units, leases, leaseUnitAssignments, addUnit, updateUnit, deleteUnit } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverrideValidation, setPendingOverrideValidation] = useState<ValidationResult | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterProperty, setFilterProperty] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string[]>([]);
  const [filterOccupancy, setFilterOccupancy] = useState<DerivedOccupancy[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

  type USortKey = "code" | "label" | "property" | "type" | "floor" | "surface" | "rent" | "charges" | "occupancy" | "availableFrom";
  const { sort, toggle } = useTableSort<USortKey>();

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId) {
      const unitToEdit = units.find(u => u.id === editId);
      if (unitToEdit) openEdit(unitToEdit);
      searchParams.delete("edit");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  const emptyForm: UnitFormData = {
    propertyId: properties[0]?.id ?? "", unitCode: "", unitLabel: "", unitType: "apartment",
    floor: null, surfaceArea: null, bedrooms: 0, bathrooms: 0, furnished: false,
    currentStatus: "vacant", baseRent: null, rentTiers: [], baseCharges: null, availableFrom: null, notes: "",
  };
  const [form, setForm] = useState<UnitFormData>({ ...emptyForm });

  const openAdd = () => { setEditingUnit(null); setForm({ ...emptyForm }); setSheetOpen(true); };
  const openEdit = (u: Unit) => {
    setEditingUnit(u);
    const { id, createdAt, updatedAt, ...rest } = u;
    setForm(rest);
    setSheetOpen(true);
  };

  const unitStatusValidation = (() => {
    if (!editingUnit || form.currentStatus === editingUnit.currentStatus) return null;
    return canChangeUnitStatus(editingUnit.id, form.currentStatus, integrityState);
  })();

  const executeSave = () => {
    if (editingUnit) {
      updateUnit({ ...editingUnit, ...form });
      toast({ title: t("units.toastUpdated") });
    } else {
      addUnit(form);
      toast({ title: t("units.toastAdded") });
    }
    setSheetOpen(false);
  };

  const handleSave = () => {
    if (!form.unitCode.trim() || !form.unitLabel.trim() || !form.propertyId) {
      toast({ title: t("common.validationError"), description: t("units.requiredFields"), variant: "destructive" });
      return;
    }
    if (editingUnit && form.currentStatus !== editingUnit.currentStatus) {
      const validation = canChangeUnitStatus(editingUnit.id, form.currentStatus, integrityState);
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
    executeSave();
  };

  const handleOverrideConfirm = (reason: string) => {
    if (!editingUnit || !pendingOverrideValidation) return;
    addOverride({
      entityType: "unit",
      entityId: editingUnit.id,
      action: `status_change:${form.currentStatus}`,
      blockerCodes: pendingOverrideValidation.blockers.map(b => b.code),
      reason,
    });
    updateUnit({ ...editingUnit, ...form });
    setSheetOpen(false);
    toast({ title: t("units.updatedOverridden"), description: t("units.overrideReason").replace("{reason}", reason) });
    setPendingOverrideValidation(null);
  };

  const handleDelete = (uid: string) => {
    deleteUnit(uid);
    toast({ title: t("units.toastDeleted") });
  };

  // Compute derived occupancy for each unit
  const unitsWithOccupancy = units.map(u => ({
    unit: u,
    occupancy: getDerivedOccupancy(u.id, u.currentStatus, leases, leaseUnitAssignments),
  }));

  const filtered = unitsWithOccupancy.filter(({ unit: u, occupancy }) => {
    const prop = properties.find(p => p.id === u.propertyId);
    const q = search.toLowerCase();
    const matchSearch = !q || u.unitCode.toLowerCase().includes(q) || u.unitLabel.toLowerCase().includes(q) || (prop?.name.toLowerCase().includes(q) ?? false);
    const matchProp = filterProperty.length === 0 || filterProperty.includes(u.propertyId);
    const matchType = filterType.length === 0 || filterType.includes(u.unitType);
    // Stored-status filters match unit.currentStatus (what's displayed); lifecycle-nuance filters match derived.
    const storedStatusFilters: DerivedOccupancy[] = ["vacant", "occupied", "reserved", "unavailable"];
    const matchOccupancy =
      filterOccupancy.length === 0 ||
      filterOccupancy.some(f =>
        storedStatusFilters.includes(f) ? u.currentStatus === f : occupancy.derived === f,
      );
    return matchSearch && matchProp && matchType && matchOccupancy;
  });

  const sorted = sortRows(filtered, sort, (row, key) => {
    const u = row.unit;
    const occ = row.occupancy;
    const prop = properties.find(p => p.id === u.propertyId);
    switch (key) {
      case "code": return u.unitCode;
      case "label": return u.unitLabel;
      case "property": return prop?.name ?? "";
      case "type": return t(UNIT_TYPE_KEYS[u.unitType]);
      case "floor": return u.floor;
      case "surface": return u.surfaceArea;
      case "rent": return u.baseRent;
      case "charges": return u.baseCharges;
      case "occupancy": return occ.derived;
      case "availableFrom": return occ.availableFromDate ?? u.availableFrom ?? null;
    }
  });

  const { pageItems, page, pageSize, setPage, setPageSize, total, totalPages, from, to } = usePagination(sorted);

  const selectedProperty = form.propertyId ? properties.find(p => p.id === form.propertyId) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("units.title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative inline-flex">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("action.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 min-w-[180px] max-w-[400px] [field-sizing:content]" />
          </div>
          <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-2" />{t("units.add")}</Button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <MultiSelectFilter
            label={t("filter.property")}
            icon={PROPERTY_ICON}
            values={filterProperty}
            onChange={setFilterProperty}
            options={properties.map(p => ({ value: p.id, label: p.name, icon: PROPERTY_ICON }))}
          />
          <MultiSelectFilter
            label={t("filter.type")}
            icon={Tag}
            values={filterType}
            onChange={setFilterType}
            options={UNIT_TYPES.map(ut => ({ value: ut.value, label: t(ut.labelKey), icon: UNIT_TYPE_ICONS[ut.value] }))}
          />
          <MultiSelectFilter
            label={t("occupancy.statusFilterLabel")}
            icon={UNIT_OCCUPANCY_ICONS.occupied}
            values={filterOccupancy}
            onChange={(v) => setFilterOccupancy(v as DerivedOccupancy[])}
            options={OCCUPANCY_FILTERS.filter(o => o.value !== "all").map(o => ({
              value: o.value as string,
              label: t(o.labelKey),
              icon: UNIT_OCCUPANCY_ICONS[o.value as string],
            }))}
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap mt-1.5">
          {filtered.length} {t("units.title").toLowerCase()}
        </span>
      </div>

      {units.length === 0 ? (
        <EmptyState icon={DoorOpen} title={t("units.empty")} description={t("units.emptyDesc")} actionLabel={t("units.add")} onAction={openAdd} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title={t("filter.noResults")} description={t("filter.noResultsDesc")} />
      ) : (
        <TooltipProvider>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="code" sort={sort} onSort={toggle}>{t("units.code")}</SortableTableHead>
                  <SortableTableHead sortKey="label" sort={sort} onSort={toggle}>{t("units.label")}</SortableTableHead>
                  <SortableTableHead sortKey="property" sort={sort} onSort={toggle}>{t("units.property")}</SortableTableHead>
                  <SortableTableHead sortKey="type" sort={sort} onSort={toggle}>{t("units.type")}</SortableTableHead>
                  <SortableTableHead sortKey="floor" sort={sort} onSort={toggle} align="center">{t("units.floor")}</SortableTableHead>
                  <SortableTableHead sortKey="surface" sort={sort} onSort={toggle} align="right">{t("units.surface")}</SortableTableHead>
                  <SortableTableHead sortKey="rent" sort={sort} onSort={toggle} align="right">{t("units.rent")}</SortableTableHead>
                  <SortableTableHead sortKey="charges" sort={sort} onSort={toggle} align="right">{t("units.charges")}</SortableTableHead>
                  <SortableTableHead sortKey="occupancy" sort={sort} onSort={toggle}>{t("occupancy.derivedLabel")}</SortableTableHead>
                  <SortableTableHead sortKey="availableFrom" sort={sort} onSort={toggle}>{t("units.availableFrom")}</SortableTableHead>
                  <TableHead className="text-right">{t("units.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map(({ unit: u, occupancy }) => {
                  const prop = properties.find(p => p.id === u.propertyId);
                  return (
                    <TableRow key={u.id} className="cursor-pointer" onClick={() => navigate(`/units/${u.id}`)}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{u.unitCode}</TableCell>
                      <TableCell className="text-muted-foreground">{u.unitLabel}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {prop ? <Link to={`/properties/${prop.id}`} className="hover:underline" onClick={e => e.stopPropagation()}>{prop.name}</Link> : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{t(UNIT_TYPE_KEYS[u.unitType])}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{u.floor != null ? u.floor : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{u.surfaceArea != null && prop ? formatArea(u.surfaceArea, prop.measurementSystem) : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{u.baseRent != null && prop ? formatCurrency(u.baseRent, prop.currencyCode, prop.locale) : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{u.baseCharges != null && prop ? formatCurrency(u.baseCharges, prop.currencyCode, prop.locale) : "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={u.currentStatus} />
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
                      <TableCell className="text-muted-foreground text-xs">
                        {occupancy.availableFromDate
                          ? formatDate(occupancy.availableFromDate, prop?.locale)
                          : u.availableFrom
                            ? formatDate(u.availableFrom, prop?.locale)
                            : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <DeleteDialog entityType="unit" entityId={u.id} entityLabel="unit" onDelete={handleDelete} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <TablePagination page={page} pageSize={pageSize} total={total} totalPages={totalPages} from={from} to={to} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </Card>
        </TooltipProvider>
      )}

      {/* Unit Form Sheet */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
           <DialogHeader><DialogTitle>{editingUnit ? t("units.edit") : t("units.add")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-6">
            <div>
              <Label>{t("units.property")} *</Label>
              <Select value={form.propertyId} onValueChange={v => setForm(f => ({ ...f, propertyId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("units.selectProperty")} /></SelectTrigger>
                <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("units.unitCode")} *</Label><Input value={form.unitCode} onChange={e => setForm(f => ({ ...f, unitCode: e.target.value }))} placeholder="e.g. PAR-A01" /></div>
              <div><Label>{t("units.label")} *</Label><Input value={form.unitLabel} onChange={e => setForm(f => ({ ...f, unitLabel: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("units.type")} *</Label>
                <Select value={form.unitType} onValueChange={v => setForm(f => ({ ...f, unitType: v as UnitType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{UNIT_TYPES.map(ut => <SelectItem key={ut.value} value={ut.value}>{t(ut.labelKey)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <Label>{t("units.status")} *</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[250px]">
                      <p className="text-xs">
                        {editingUnit && leases.some(l => l.unitId === editingUnit.id && l.lifecycleStage === "active")
                          ? t("occupancy.statusLockedByLease")
                          : t("occupancy.statusNoOccupiedWithoutLease")}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={form.currentStatus}
                  onValueChange={v => setForm(f => ({ ...f, currentStatus: v as UnitStatus }))}
                  disabled={!!(editingUnit && leases.some(l => l.unitId === editingUnit.id && l.lifecycleStage === "active"))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(editingUnit && leases.some(l => l.unitId === editingUnit.id && l.lifecycleStage === "active")
                      ? UNIT_STATUSES
                      : UNIT_STATUSES_NO_LEASE
                      ).map(s => <SelectItem key={s.value} value={s.value}>{t(s.labelKey)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <StatusTransitionAlert validation={unitStatusValidation} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>{t("units.floor")}</Label><Input type="number" value={form.floor ?? ""} onChange={e => setForm(f => ({ ...f, floor: e.target.value ? Number(e.target.value) : null }))} /></div>
              <div><Label>{t("units.surface")} ({selectedProperty?.measurementSystem === "imperial" ? "sq ft" : "m²"})</Label><Input type="number" value={form.surfaceArea ?? ""} onChange={e => setForm(f => ({ ...f, surfaceArea: e.target.value ? Number(e.target.value) : null }))} /></div>
              <div><Label>{t("units.bedrooms")}</Label><Input type="number" min={0} value={form.bedrooms} onChange={e => setForm(f => ({ ...f, bedrooms: Number(e.target.value) }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>{t("units.bathrooms")}</Label><Input type="number" min={0} value={form.bathrooms} onChange={e => setForm(f => ({ ...f, bathrooms: Number(e.target.value) }))} /></div>
              <div><Label>{t("units.rent")} ({selectedProperty?.currencyCode ?? "EUR"})</Label><Input type="number" value={form.baseRent ?? ""} onChange={e => setForm(f => ({ ...f, baseRent: e.target.value ? Number(e.target.value) : null }))} /></div>
              <div><Label>{t("units.charges")} ({selectedProperty?.currencyCode ?? "EUR"})</Label><Input type="number" value={form.baseCharges ?? ""} onChange={e => setForm(f => ({ ...f, baseCharges: e.target.value ? Number(e.target.value) : null }))} /></div>
            </div>
            <div>
              <Label>{t("units.rentTiers")}</Label>
              <p className="text-xs text-muted-foreground mb-2">{t("units.rentTiersHelp")}</p>
              <RentTiersEditor
                baseRent={form.baseRent}
                rentTiers={form.rentTiers}
                currencyCode={selectedProperty?.currencyCode ?? "EUR"}
                locale={selectedProperty?.locale}
                onChange={(baseRent, rentTiers) => setForm(f => ({ ...f, baseRent, rentTiers }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.furnished} onCheckedChange={v => setForm(f => ({ ...f, furnished: v }))} />
              <Label>{t("units.furnished")}</Label>
            </div>
            <div><Label>{t("units.availableFrom")}</Label><Input type="date" value={form.availableFrom ?? ""} onChange={e => setForm(f => ({ ...f, availableFrom: e.target.value || null }))} /></div>
            <div><Label>{t("units.notes")}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{editingUnit ? t("action.save") : t("units.add")}</Button>
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
          onOverride={handleOverrideConfirm}
        />
      )}
    </div>
  );
}
