import { useState, useEffect } from "react";
import { useAppData } from "@/context/AppContext";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DoorOpen, Plus, Search, Eye, Pencil, AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Link } from "react-router-dom";
import { formatCurrency, formatArea, formatDate, getUnitTypeLabel } from "@/lib/formatters";
import { useSettings } from "@/context/SettingsContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
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

const UNIT_TYPES: { value: UnitType; label: string }[] = [
  { value: "apartment", label: "Apartment" }, { value: "studio", label: "Studio" },
  { value: "office", label: "Office" }, { value: "parking", label: "Parking" },
  { value: "storage", label: "Storage" }, { value: "house", label: "House" },
  { value: "commercial-unit", label: "Commercial Unit" },
];
const UNIT_STATUSES: { value: UnitStatus; label: string }[] = [
  { value: "vacant", label: "Vacant" }, { value: "occupied", label: "Occupied" },
  { value: "reserved", label: "Reserved" }, { value: "unavailable", label: "Unavailable" },
];

const OCCUPANCY_FILTERS: { value: DerivedOccupancy | "all"; label: string }[] = [
  { value: "all", label: "All Occupancy" },
  { value: "vacant", label: "Vacant" },
  { value: "occupied", label: "Occupied" },
  { value: "under-notice", label: "Under Notice" },
  { value: "move-in-pending", label: "Move-In Pending" },
  { value: "move-out-scheduled", label: "Move-Out Scheduled" },
];

type UnitFormData = Omit<Unit, "id" | "createdAt" | "updatedAt">;

export default function Units() {
  const { properties, units, leases, addUnit, updateUnit, deleteUnit } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverrideValidation, setPendingOverrideValidation] = useState<ValidationResult | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filterProperty, setFilterProperty] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterOccupancy, setFilterOccupancy] = useState<DerivedOccupancy | "all">("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

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
    currentStatus: "vacant", baseRent: null, baseCharges: null, availableFrom: null, notes: "",
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
      toast({ title: "Unit updated" });
    } else {
      addUnit(form);
      toast({ title: "Unit added" });
    }
    setSheetOpen(false);
  };

  const handleSave = () => {
    if (!form.unitCode.trim() || !form.unitLabel.trim() || !form.propertyId) {
      toast({ title: "Validation Error", description: "Property, unit code, and label are required.", variant: "destructive" });
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
        toast({ title: "Status change blocked", description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
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
    executeSave();
    toast({ title: "Unit updated (overridden)", description: `Override reason: ${reason}` });
    setPendingOverrideValidation(null);
  };

  const handleDelete = (uid: string) => {
    deleteUnit(uid);
    toast({ title: "Unit deleted" });
  };

  // Compute derived occupancy for each unit
  const unitsWithOccupancy = units.map(u => ({
    unit: u,
    occupancy: getDerivedOccupancy(u.id, u.currentStatus, leases),
  }));

  const filtered = unitsWithOccupancy.filter(({ unit: u, occupancy }) => {
    const prop = properties.find(p => p.id === u.propertyId);
    const q = search.toLowerCase();
    const matchSearch = !q || u.unitCode.toLowerCase().includes(q) || u.unitLabel.toLowerCase().includes(q) || (prop?.name.toLowerCase().includes(q) ?? false);
    const matchProp = filterProperty === "all" || u.propertyId === filterProperty;
    const matchType = filterType === "all" || u.unitType === filterType;
    const matchOccupancy = filterOccupancy === "all" || occupancy.derived === filterOccupancy;
    return matchSearch && matchProp && matchType && matchOccupancy;
  });

  const selectedProperty = form.propertyId ? properties.find(p => p.id === form.propertyId) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("units.title")}</h1>
          <p className="text-sm text-muted-foreground">{units.length} {t("units.title").toLowerCase()}</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />{t("units.add")}</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("units.searchPlaceholder")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterProperty} onValueChange={setFilterProperty}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder={t("filter.property")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allProperties")}</SelectItem>
            {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder={t("filter.type")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allTypes")}</SelectItem>
            {UNIT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterOccupancy} onValueChange={v => setFilterOccupancy(v as DerivedOccupancy | "all")}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder={t("occupancy.derivedLabel")} /></SelectTrigger>
          <SelectContent>
            {OCCUPANCY_FILTERS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
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
                  <TableHead>{t("units.code")}</TableHead>
                  <TableHead>{t("units.label")}</TableHead>
                  <TableHead>{t("units.property")}</TableHead>
                  <TableHead>{t("units.type")}</TableHead>
                  <TableHead className="text-center">{t("units.floor")}</TableHead>
                  <TableHead className="text-right">{t("units.surface")}</TableHead>
                  <TableHead className="text-right">{t("units.rent")}</TableHead>
                  <TableHead className="text-right">{t("units.charges")}</TableHead>
                  <TableHead>{t("occupancy.derivedLabel")}</TableHead>
                  <TableHead>{t("units.availableFrom")}</TableHead>
                  <TableHead className="text-right">{t("units.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(({ unit: u, occupancy }) => {
                  const prop = properties.find(p => p.id === u.propertyId);
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs font-medium">
                        <Link to={`/units/${u.id}`} className="hover:underline text-foreground">{u.unitCode}</Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.unitLabel}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {prop ? <Link to={`/properties/${prop.id}`} className="hover:underline">{prop.name}</Link> : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{getUnitTypeLabel(u.unitType)}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{u.floor != null ? u.floor : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{u.surfaceArea != null && prop ? formatArea(u.surfaceArea, prop.measurementSystem) : "—"}</TableCell>
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
                                <p className="text-xs">{occupancy.inconsistencyMessage}</p>
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
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild><Link to={`/units/${u.id}`}><Eye className="h-3.5 w-3.5" /></Link></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <DeleteDialog entityType="unit" entityId={u.id} entityLabel="unit" onDelete={handleDelete} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TooltipProvider>
      )}

      {/* Unit Form Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
           <SheetHeader><SheetTitle>{editingUnit ? t("units.edit") : t("units.add")}</SheetTitle></SheetHeader>
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
                  <SelectContent>{UNIT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("units.status")} *</Label>
                <Select value={form.currentStatus} onValueChange={v => setForm(f => ({ ...f, currentStatus: v as UnitStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
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
            <div className="flex items-center gap-3">
              <Switch checked={form.furnished} onCheckedChange={v => setForm(f => ({ ...f, furnished: v }))} />
              <Label>{t("units.furnished")}</Label>
            </div>
            <div><Label>{t("units.availableFrom")}</Label><Input type="date" value={form.availableFrom ?? ""} onChange={e => setForm(f => ({ ...f, availableFrom: e.target.value || null }))} /></div>
            <div><Label>{t("units.notes")}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{editingUnit ? t("action.save") : t("units.add")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Override Confirm Dialog */}
      {pendingOverrideValidation && (
        <OverrideConfirmDialog
          open={overrideDialogOpen}
          onOpenChange={(v) => { setOverrideDialogOpen(v); if (!v) setPendingOverrideValidation(null); }}
          validation={pendingOverrideValidation}
          actionLabel="Override and Save"
          onOverride={handleOverrideConfirm}
        />
      )}
    </div>
  );
}
