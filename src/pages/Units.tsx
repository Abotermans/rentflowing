import { useState, useEffect } from "react";
import { useAppData } from "@/context/AppContext";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DoorOpen, Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";
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

type UnitFormData = Omit<Unit, "id" | "createdAt" | "updatedAt">;

export default function Units() {
  const { properties, units, addUnit, updateUnit, deleteUnit, getActiveLease, tenants, leases } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filterProperty, setFilterProperty] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

  // Auto-open edit sheet from query param
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId) {
      const unitToEdit = units.find(u => u.id === editId);
      if (unitToEdit) {
        openEdit(unitToEdit);
      }
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

  const handleSave = () => {
    if (!form.unitCode.trim() || !form.unitLabel.trim() || !form.propertyId) {
      toast({ title: "Validation Error", description: "Property, unit code, and label are required.", variant: "destructive" });
      return;
    }
    if (editingUnit) {
      updateUnit({ ...editingUnit, ...form });
      toast({ title: "Unit updated" });
    } else {
      addUnit(form);
      toast({ title: "Unit added" });
    }
    setSheetOpen(false);
  };

  const handleDelete = (uid: string) => {
    deleteUnit(uid);
    toast({ title: "Unit deleted" });
  };

  const filtered = units.filter(u => {
    const prop = properties.find(p => p.id === u.propertyId);
    const q = search.toLowerCase();
    const matchSearch = !q || u.unitCode.toLowerCase().includes(q) || u.unitLabel.toLowerCase().includes(q) || (prop?.name.toLowerCase().includes(q) ?? false);
    const matchProp = filterProperty === "all" || u.propertyId === filterProperty;
    const matchType = filterType === "all" || u.unitType === filterType;
    const matchStatus = filterStatus === "all" || u.currentStatus === filterStatus;
    return matchSearch && matchProp && matchType && matchStatus;
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
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder={t("filter.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allStatuses")}</SelectItem>
            {UNIT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {units.length === 0 ? (
        <EmptyState icon={DoorOpen} title={t("units.empty")} description={t("units.emptyDesc")} actionLabel={t("units.add")} onAction={openAdd} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title={t("filter.noResults")} description={t("filter.noResultsDesc")} />
      ) : (
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
                <TableHead>{t("units.status")}</TableHead>
                <TableHead>{t("units.availableFrom")}</TableHead>
                <TableHead className="text-right">{t("units.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(u => {
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
                    <TableCell><StatusBadge status={u.currentStatus} /></TableCell>
                    <TableCell className="text-muted-foreground text-xs">{u.availableFrom ? formatDate(u.availableFrom, prop?.locale) : "—"}</TableCell>
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
    </div>
  );
}
