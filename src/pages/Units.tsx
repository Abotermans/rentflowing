import { useState, useEffect, useMemo, useCallback } from "react";
import { propertyBusinessDateISO } from "@/lib/businessTimeZone";
import { useBusinessNow } from "@/hooks/use-business-now";
import { useAppData } from "@/context/AppContext";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DoorOpen, Plus, Search, Pencil, AlertTriangle, HelpCircle } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { DateInput } from "@/components/shared/DateInput";
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
import { Dialog, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import { useToast } from "@/hooks/use-toast";
import { Unit, UnitType, UnitStatus, DEFAULT_MILLIEME_KEY, getUnitMillieme } from "@/types";
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
import { nonNegativeNumber, normalizedCode, positiveNumber } from "@/lib/validation";
import { displayMilliemeMaxPerUnit, formatMilliemeBase, getMilliemeCapacityForUnit, getUnitMilliemeCapacityViolations, multiplyMilliemeShare, parseMilliemeShareInput } from "@/lib/propertyOwnership";
import { FormField } from "@/components/shared/FormField";
import { usePortfolioWriteAccess } from "@/hooks/use-portfolio-write-access";
import { usePortfolio } from "@/context/PortfolioContext";

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
  { value: "reserved", labelKey: "status.reserved" },
  { value: "unavailable", labelKey: "status.unavailable" },
  { value: "under-notice", labelKey: "status.underNotice" },
  { value: "move-in-pending", labelKey: "status.moveInPending" },
  { value: "move-out-scheduled", labelKey: "status.moveOutScheduled" },
];

type UnitFormData = Omit<Unit, "id" | "createdAt" | "updatedAt">;
type UnitErrorKey =
  | "propertyId"
  | "unitCode"
  | "unitLabel"
  | "bedrooms"
  | "bathrooms"
  | "surfaceArea"
  | "baseRent"
  | "baseCharges";

export default function Units() {
  const businessNow = useBusinessNow();
  const { properties, units, leases, leaseUnitAssignments, addUnitPersisted, addUnitsPersisted, updateUnitPersisted, deleteUnitPersisted } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const canWrite = usePortfolioWriteAccess();
  const { loading: portfolioLoading } = usePortfolio();
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
  const [errors, setErrors] = useState<Partial<Record<UnitErrorKey, string>>>({});
  const clearFieldError = (key: UnitErrorKey) => {
    setErrors(previous => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };
  const [milliemeDrafts, setMilliemeDrafts] = useState<Record<string, string>>({});
  const [milliemeFieldErrors, setMilliemeFieldErrors] = useState<Record<string, string>>({});
  const [bulkEnabled, setBulkEnabled] = useState(false);
  const [bulkCount, setBulkCount] = useState(5);
  const [bulkStart, setBulkStart] = useState(1);
  const [bulkPadding, setBulkPadding] = useState(2);

  type USortKey = "code" | "label" | "property" | "type" | "floor" | "surface" | "millieme" | "rent" | "charges" | "occupancy" | "availableFrom";
  const { sort, toggle } = useTableSort<USortKey>();

  const emptyForm: UnitFormData = {
    propertyId: properties[0]?.id ?? "", unitCode: "", unitLabel: "", unitType: "apartment",
    floor: null, surfaceArea: null, bedrooms: 0, bathrooms: 0, furnished: false,
    currentStatus: "vacant", baseRent: null, rentTiers: [], baseCharges: null, availableFrom: null, notes: "",
    milliemeShares: {}, milliemeBase: 1000,
  };
  const [form, setForm] = useState<UnitFormData>({ ...emptyForm });

  const openAdd = () => {
    if (!canWrite) return;
    if (properties.length === 0) {
      toast({ title: t("common.validationError"), description: "Create a property before adding units.", variant: "destructive" });
      navigate("/properties");
      return;
    }
    setEditingUnit(null);
    setForm({ ...emptyForm });
    setErrors({});
    setMilliemeDrafts({});
    setMilliemeFieldErrors({});
    setBulkEnabled(false);
    setBulkCount(5);
    setBulkStart(1);
    setBulkPadding(2);
    setSheetOpen(true);
  };
  const openEdit = useCallback((u: Unit) => {
    if (!canWrite) return;
    setEditingUnit(u);
    const { id, createdAt, updatedAt, ...rest } = u;
    setForm(rest);
    setErrors({});
    setMilliemeDrafts(Object.fromEntries(Object.entries(rest.milliemeShares ?? {}).map(([key, value]) => [key, String(value)])));
    setMilliemeFieldErrors({});
    setBulkEnabled(false);
    setSheetOpen(true);
  }, [canWrite]);

  const editId = searchParams.get("edit");
  useEffect(() => {
    if (!editId || portfolioLoading) return;
    const unitToEdit = units.find(u => u.id === editId);
    if (!unitToEdit && canWrite) return;
    if (unitToEdit && canWrite) openEdit(unitToEdit);
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete("edit");
      return next;
    }, { replace: true });
  }, [canWrite, editId, openEdit, portfolioLoading, setSearchParams, units]);

  const bulkUnitCount = !editingUnit && bulkEnabled
    ? Math.max(1, Math.min(200, Math.floor(Number(bulkCount) || 1)))
    : 1;
  const bulkStartNumber = Math.max(0, Math.floor(Number(bulkStart) || 0));
  const bulkPaddingNumber = Math.max(0, Math.min(6, Math.floor(Number(bulkPadding) || 0)));
  const generatedUnitCodes = useMemo(() => {
    if (!bulkEnabled || editingUnit || !form.unitCode.trim()) return [form.unitCode.trim()];
    return Array.from({ length: bulkUnitCount }, (_, index) =>
      `${form.unitCode.trim()}${String(bulkStartNumber + index).padStart(bulkPaddingNumber, "0")}`,
    );
  }, [bulkEnabled, editingUnit, form.unitCode, bulkUnitCount, bulkStartNumber, bulkPaddingNumber]);

  const unitStatusValidation = (() => {
    if (!editingUnit || form.currentStatus === editingUnit.currentStatus) return null;
    return canChangeUnitStatus(editingUnit.id, form.currentStatus, integrityState);
  })();
  const executeSave = async () => {
    if (!canWrite) return;
    try {
      if (editingUnit) {
        await updateUnitPersisted({ ...editingUnit, ...form });
        toast({ title: t("units.toastUpdated") });
      } else {
        if (bulkUnitCount > 1) {
          await addUnitsPersisted(generatedUnitCodes.map(unitCode => ({ ...form, unitCode })));
          toast({ title: t("units.bulkAdded").replace("{count}", String(bulkUnitCount)) });
        } else {
          await addUnitPersisted(form);
          toast({ title: t("units.toastAdded") });
        }
      }
    } catch (err) {
      toast({
        title: t("common.validationError"),
        description: err instanceof Error ? err.message : t("units.couldNotSave"),
        variant: "destructive",
      });
      return;
    }
    setSheetOpen(false);
  };

  const handleSave = async () => {
    if (!canWrite) return;
    const invalidMilliemeKey = Object.entries(milliemeDrafts).find(([, raw]) => !parseMilliemeShareInput(raw).valid)?.[0];
    if (invalidMilliemeKey) {
      setMilliemeFieldErrors({ [invalidMilliemeKey]: t("units.milliemeInvalid") });
      toast({ title: t("common.validationError"), description: t("units.milliemeInvalid"), variant: "destructive" });
      return;
    }
    const nextErrors: Partial<Record<UnitErrorKey, string>> = {};
    if (!form.propertyId) nextErrors.propertyId = t("common.mandatoryField");
    if (!form.unitCode.trim()) nextErrors.unitCode = t("common.mandatoryField");
    if (!form.unitLabel.trim()) nextErrors.unitLabel = t("common.mandatoryField");
    if (!nonNegativeNumber(form.bedrooms)) nextErrors.bedrooms = t("units.nonNegative");
    if (!nonNegativeNumber(form.bathrooms)) nextErrors.bathrooms = t("units.nonNegative");
    if (form.surfaceArea !== null && form.surfaceArea !== undefined && !positiveNumber(form.surfaceArea)) {
      nextErrors.surfaceArea = t("units.positive");
    }
    if (form.baseRent !== null && form.baseRent !== undefined && !positiveNumber(form.baseRent)) {
      nextErrors.baseRent = t("units.positive");
    }
    if (form.baseCharges !== null && form.baseCharges !== undefined && !positiveNumber(form.baseCharges)) {
      nextErrors.baseCharges = t("units.positive");
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast({ title: t("common.validationError"), description: t("units.requiredFields"), variant: "destructive" });
      return;
    }
    const normalizedGeneratedCodes = generatedUnitCodes.map(code => normalizedCode(code));
    const duplicateGeneratedCode = normalizedGeneratedCodes.find((code, index) => normalizedGeneratedCodes.indexOf(code) !== index);
    if (duplicateGeneratedCode) {
      setErrors({ unitCode: t("units.generatedCodesUnique") });
      toast({ title: t("common.validationError"), description: t("units.generatedCodesUnique"), variant: "destructive" });
      return;
    }
    const duplicateCode = units.some(u =>
      u.id !== editingUnit?.id &&
      u.propertyId === form.propertyId &&
      normalizedGeneratedCodes.includes(normalizedCode(u.unitCode)),
    );
    if (duplicateCode) {
      setErrors({ unitCode: t("units.codesUniqueWithinProperty") });
      toast({ title: t("common.validationError"), description: t("units.codesUniqueWithinProperty"), variant: "destructive" });
      return;
    }
    const property = properties.find(p => p.id === form.propertyId);
    const unitForCapacity = bulkUnitCount > 1
      ? {
          ...form,
          milliemeShares: Object.fromEntries(
            Object.entries(form.milliemeShares ?? {}).map(([key, value]) => [key, multiplyMilliemeShare(Number(value), bulkUnitCount)]),
          ),
        }
      : form;
    const milliemeViolations = getUnitMilliemeCapacityViolations(unitForCapacity, property, units, editingUnit?.id);
    if (milliemeViolations.length > 0) {
      const first = milliemeViolations[0];
      const maxPerUnit = displayMilliemeMaxPerUnit(first.maxForUnit, bulkUnitCount);
      const message = t("units.milliemeCapacityExceeded")
        .replace("{key}", first.key)
        .replace("{max}", String(maxPerUnit))
        .replace("{base}", String(first.base));
      setMilliemeFieldErrors({ [first.key]: message });
      toast({
        title: t("common.validationError"),
        description: message,
        variant: "destructive",
      });
      return;
    }
    setErrors({});
    setMilliemeFieldErrors({});
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
    await executeSave();
  };

  const handleOverrideConfirm = async (reason: string) => {
    if (!canWrite) return;
    if (!editingUnit || !pendingOverrideValidation) return;
    try {
      await updateUnitPersisted({ ...editingUnit, ...form });
    } catch (err) {
      toast({ title: t("common.validationError"), description: err instanceof Error ? err.message : t("units.couldNotSave"), variant: "destructive" });
      return;
    }
    addOverride({
      entityType: "unit",
      entityId: editingUnit.id,
      action: `status_change:${form.currentStatus}`,
      blockerCodes: pendingOverrideValidation.blockers.map(b => b.code),
      reason,
    });
    setSheetOpen(false);
    toast({ title: t("units.updatedOverridden"), description: t("units.overrideReason").replace("{reason}", reason) });
    setPendingOverrideValidation(null);
  };

  const handleDelete = async (uid: string) => {
    if (!canWrite) return;
    try {
      await deleteUnitPersisted(uid);
      toast({ title: t("units.toastDeleted") });
    } catch (err) {
      toast({ title: t("common.validationError"), description: err instanceof Error ? err.message : t("units.couldNotSave"), variant: "destructive" });
      throw err;
    }
  };

  // Compute derived occupancy for each unit
  const unitsWithOccupancy = units.map(u => ({
    unit: u,
    occupancy: getDerivedOccupancy(
      u.id, u.currentStatus, leases, leaseUnitAssignments, u,
      propertyBusinessDateISO(properties.find(property => property.id === u.propertyId), businessNow),
    ),
  }));

  const filtered = unitsWithOccupancy.filter(({ unit: u, occupancy }) => {
    const prop = properties.find(p => p.id === u.propertyId);
    const q = search.toLowerCase();
    const matchSearch = !q || u.unitCode.toLowerCase().includes(q) || u.unitLabel.toLowerCase().includes(q) || (prop?.name.toLowerCase().includes(q) ?? false);
    const matchProp = filterProperty.length === 0 || filterProperty.includes(u.propertyId);
    const matchType = filterType.length === 0 || filterType.includes(u.unitType);
    // Stored operational filters match unit.currentStatus; occupancy filters match derived lease reality.
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
      case "millieme": return getUnitMillieme(u);
      case "rent": return u.baseRent;
      case "charges": return u.baseCharges;
      case "occupancy": return occ.derived;
      case "availableFrom": return occ.availableFromDate ?? u.availableFrom ?? null;
    }
  });

  const { pageItems, page, pageSize, setPage, setPageSize, total, totalPages, from, to } = usePagination(sorted);

  const selectedProperty = form.propertyId ? properties.find(p => p.id === form.propertyId) : null;

  return (
    <div className="page-shell">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">{t("units.title")}</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative flex min-w-0 flex-1 sm:inline-flex sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("action.search")} value={search} onChange={e => setSearch(e.target.value)} className="h-9 min-w-[180px] max-w-[400px] pl-9 sm:w-auto" />
          </div>
          {canWrite && <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-2" />{t("units.add")}</Button>}
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
        <EmptyState icon={DoorOpen} title={t("units.empty")} description={t("units.emptyDesc")} actionLabel={canWrite ? t("units.add") : undefined} onAction={canWrite ? openAdd : undefined} />
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
                  <SortableTableHead sortKey="millieme" sort={sort} onSort={toggle} align="right">{t("units.millieme")}</SortableTableHead>
                  <SortableTableHead sortKey="rent" sort={sort} onSort={toggle} align="right">{t("units.rent")}</SortableTableHead>
                  <SortableTableHead sortKey="charges" sort={sort} onSort={toggle} align="right">{t("units.charges")}</SortableTableHead>
                  <SortableTableHead sortKey="occupancy" sort={sort} onSort={toggle}>{t("occupancy.derivedLabel")}</SortableTableHead>
                  <SortableTableHead sortKey="availableFrom" sort={sort} onSort={toggle}>{t("units.availableFrom")}</SortableTableHead>
                  {canWrite && <TableHead className="text-right">{t("units.actions")}</TableHead>}
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
                      <TableCell className="text-right text-muted-foreground">
                        {(() => {
                          const v = getUnitMillieme(u);
                          const base = prop?.milliemeBase ?? u.milliemeBase ?? 1000;
                          return v > 0 ? `${v} / ${base}` : "—";
                        })()}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{u.baseRent != null && prop ? formatCurrency(u.baseRent, prop.currencyCode, prop.locale) : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{u.baseCharges != null && prop ? formatCurrency(u.baseCharges, prop.currencyCode, prop.locale) : "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={occupancy.derived} />
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
                      <TableCell className="text-muted-foreground">
                        {occupancy.availableFromDate
                          ? formatDate(occupancy.availableFromDate, prop?.locale)
                          : u.availableFrom
                            ? formatDate(u.availableFrom, prop?.locale)
                            : "—"}
                      </TableCell>
                      {canWrite && <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${u.unitCode}`} title={`Edit ${u.unitCode}`} onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <DeleteDialog entityType="unit" entityId={u.id} entityLabel="unit" onDelete={handleDelete} />
                        </div>
                      </TableCell>}
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
      <Dialog open={canWrite && sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingUnit ? t("units.edit") : t("units.add")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-6">
            <FormField label={t("units.property")} required error={errors.propertyId}>
              <Select value={form.propertyId} onValueChange={v => {
                if (v === form.propertyId) return;
                setForm(f => ({ ...f, propertyId: v, milliemeShares: {} }));
                if (v) clearFieldError("propertyId");
                setMilliemeDrafts({});
                setMilliemeFieldErrors({});
              }}>
                <SelectTrigger aria-invalid={!!errors.propertyId}><SelectValue placeholder={t("units.selectProperty")} /></SelectTrigger>
                <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>

            {!editingUnit && (
              <div className="space-y-3 border-t pt-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <Label>{t("units.bulkCreate")}</Label>
                    <p className="text-xs text-muted-foreground">{t("units.bulkCreateDescription")}</p>
                  </div>
                  <Switch checked={bulkEnabled} onCheckedChange={setBulkEnabled} />
                </div>
                {bulkEnabled && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">{t("units.quantity")}</Label>
                      <Input type="number" min={1} max={200} value={bulkCount} onChange={e => setBulkCount(Number(e.target.value))} />
                    </div>
                    <div>
                      <Label className="text-xs">{t("units.startNumber")}</Label>
                      <Input type="number" min={0} value={bulkStart} onChange={e => setBulkStart(Number(e.target.value))} />
                    </div>
                    <div>
                      <Label className="text-xs">{t("units.digits")}</Label>
                      <Input type="number" min={0} max={6} value={bulkPadding} onChange={e => setBulkPadding(Number(e.target.value))} />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <FormField label={bulkEnabled && !editingUnit ? t("units.unitCodePrefix") : t("units.unitCode")} required error={errors.unitCode}>
                <Input value={form.unitCode} aria-invalid={!!errors.unitCode} onChange={e => { setForm(f => ({ ...f, unitCode: e.target.value })); if (e.target.value.trim()) clearFieldError("unitCode"); }} placeholder={bulkEnabled && !editingUnit ? "e.g. PARK-" : "e.g. PAR-A01"} />
                {bulkEnabled && !editingUnit && generatedUnitCodes.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("units.preview")}: {generatedUnitCodes.slice(0, 3).join(", ")}{generatedUnitCodes.length > 3 ? ` ... ${generatedUnitCodes[generatedUnitCodes.length - 1]}` : ""}
                  </p>
                )}
              </FormField>
              <FormField label={t("units.label")} required error={errors.unitLabel}>
                <Input value={form.unitLabel} aria-invalid={!!errors.unitLabel} onChange={e => { setForm(f => ({ ...f, unitLabel: e.target.value })); if (e.target.value.trim()) clearFieldError("unitLabel"); }} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>{t("units.type")} *</Label>
                  <span className="h-3.5 w-3.5" />
                </div>
                <Select value={form.unitType} onValueChange={v => setForm(f => ({ ...f, unitType: v as UnitType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIT_TYPES.map(ut => <SelectItem key={ut.value} value={ut.value}>{t(ut.labelKey)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>{t("units.status")} *</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[250px]">
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
                  <SelectTrigger>
                    <SelectValue>
                      <StatusBadge status={form.currentStatus} />
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(editingUnit && leases.some(l => l.unitId === editingUnit.id && l.lifecycleStage === "active")
                      ? UNIT_STATUSES
                      : UNIT_STATUSES_NO_LEASE
                      ).map(s => <SelectItem key={s.value} value={s.value}><StatusBadge status={s.value} /></SelectItem>)}
                  </SelectContent>
                </Select>
                <StatusTransitionAlert validation={unitStatusValidation} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>{t("units.floor")}</Label><Input type="number" value={form.floor ?? ""} onChange={e => setForm(f => ({ ...f, floor: e.target.value ? Number(e.target.value) : null }))} /></div>
              <FormField label={`${t("units.surface")} (${selectedProperty?.measurementSystem === "imperial" ? "sq ft" : "m²"})`} error={errors.surfaceArea}>
                <Input type="number" value={form.surfaceArea ?? ""} aria-invalid={!!errors.surfaceArea} onChange={e => { const value = e.target.value ? Number(e.target.value) : null; setForm(f => ({ ...f, surfaceArea: value })); if (value === null || positiveNumber(value)) clearFieldError("surfaceArea"); }} />
              </FormField>
              <FormField label={t("units.bedrooms")} error={errors.bedrooms}>
                <Input type="number" min={0} value={form.bedrooms} aria-invalid={!!errors.bedrooms} onChange={e => { const value = Number(e.target.value); setForm(f => ({ ...f, bedrooms: value })); if (nonNegativeNumber(value)) clearFieldError("bedrooms"); }} />
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField label={t("units.bathrooms")} error={errors.bathrooms}>
                <Input type="number" min={0} value={form.bathrooms} aria-invalid={!!errors.bathrooms} onChange={e => { const value = Number(e.target.value); setForm(f => ({ ...f, bathrooms: value })); if (nonNegativeNumber(value)) clearFieldError("bathrooms"); }} />
              </FormField>
              <FormField label={`${t("units.rent")} (${selectedProperty?.currencyCode ?? "EUR"})`} error={errors.baseRent}>
                <Input type="number" value={form.baseRent ?? ""} aria-invalid={!!errors.baseRent} onChange={e => { const value = e.target.value ? Number(e.target.value) : null; setForm(f => ({ ...f, baseRent: value })); if (value === null || positiveNumber(value)) clearFieldError("baseRent"); }} />
              </FormField>
              <FormField label={`${t("units.charges")} (${selectedProperty?.currencyCode ?? "EUR"})`} error={errors.baseCharges}>
                <Input type="number" value={form.baseCharges ?? ""} aria-invalid={!!errors.baseCharges} onChange={e => { const value = e.target.value ? Number(e.target.value) : null; setForm(f => ({ ...f, baseCharges: value })); if (value === null || positiveNumber(value)) clearFieldError("baseCharges"); }} />
              </FormField>
            </div>

            {/* Millième shares */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-sm font-medium">{t("units.milliemeShares")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("units.milliemeHelp").replace(
                  "{base}",
                  formatMilliemeBase(selectedProperty?.milliemeBase ?? 1000, selectedProperty?.locale),
                )}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {((selectedProperty?.milliemeKeys?.length ? selectedProperty.milliemeKeys : [DEFAULT_MILLIEME_KEY])).map(k => {
                  const capacity = getMilliemeCapacityForUnit(selectedProperty, units, form.propertyId, editingUnit?.id, k);
                  const maxPerUnit = displayMilliemeMaxPerUnit(capacity.maxForUnit, bulkUnitCount);
                  return (
                    <div key={k} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`millieme-${k}`} className="text-xs flex-1 capitalize">{k}</Label>
                        <Input
                          id={`millieme-${k}`}
                          type="text" inputMode="decimal" className="w-28 h-8 text-right"
                          placeholder={`≤ ${maxPerUnit}`}
                          value={milliemeDrafts[k] ?? ""}
                          aria-invalid={!!milliemeFieldErrors[k]}
                          onChange={e => {
                            const raw = e.target.value;
                            setMilliemeDrafts(previous => ({ ...previous, [k]: raw }));
                            setMilliemeFieldErrors(previous => {
                              const next = { ...previous };
                              delete next[k];
                              return next;
                            });
                            const parsed = parseMilliemeShareInput(raw);
                            if (!parsed.valid) return;
                            setForm(previous => {
                              const shares = { ...(previous.milliemeShares ?? {}) };
                              if (parsed.value === null) delete shares[k];
                              else shares[k] = parsed.value;
                              return { ...previous, milliemeShares: shares };
                            });
                          }}
                        />
                      </div>
                      {milliemeFieldErrors[k] && <p className="text-xs font-medium text-destructive">{milliemeFieldErrors[k]}</p>}
                    </div>
                  );
                })}
              </div>
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
            <div><Label>{t("units.availableFrom")}</Label><DateInput value={form.availableFrom ?? ""} onChange={value => setForm(f => ({ ...f, availableFrom: value || null }))} /></div>
            <div><Label>{t("units.notes")}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{editingUnit ? t("action.save") : bulkUnitCount > 1 ? t("units.bulkAdd").replace("{count}", String(bulkUnitCount)) : t("units.add")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override Confirm Dialog */}
      {pendingOverrideValidation && (
        <OverrideConfirmDialog
          open={canWrite && overrideDialogOpen}
          onOpenChange={(v) => { setOverrideDialogOpen(v); if (!v) setPendingOverrideValidation(null); }}
          validation={pendingOverrideValidation}
          actionLabel={t("units.overrideAndSave")}
          onOverride={handleOverrideConfirm}
        />
      )}
    </div>
  );
}
