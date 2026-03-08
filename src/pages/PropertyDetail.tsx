import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Ban, TrendingUp, DoorOpen, Plus, Eye, Pencil, Trash2 } from "lucide-react";
import { formatCurrency, formatArea, formatDate, getCountryName, getPropertyTypeLabel, getUnitTypeLabel } from "@/lib/formatters";
import { Unit, UnitType, UnitStatus, getTenantFullName } from "@/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

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

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const { properties, units, getPropertyStats, addUnit, updateUnit, deleteUnit, getActiveLease, tenants } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();

  const property = properties.find(p => p.id === id);
  const propertyUnits = units.filter(u => u.propertyId === id);
  const stats = id ? getPropertyStats(id) : null;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const emptyUnitForm: UnitFormData = {
    propertyId: id ?? "", unitCode: "", unitLabel: "", unitType: "apartment",
    floor: null, surfaceArea: null, bedrooms: 0, bathrooms: 0, furnished: false,
    currentStatus: "vacant", baseRent: null, baseCharges: null, availableFrom: null, notes: "",
  };
  const [unitForm, setUnitForm] = useState<UnitFormData>({ ...emptyUnitForm });

  const openAddUnit = () => { setEditingUnit(null); setUnitForm({ ...emptyUnitForm }); setSheetOpen(true); };
  const openEditUnit = (u: Unit) => {
    setEditingUnit(u);
    const { id: _, createdAt, updatedAt, ...rest } = u;
    setUnitForm(rest);
    setSheetOpen(true);
  };
  const handleSaveUnit = () => {
    if (!unitForm.unitCode.trim() || !unitForm.unitLabel.trim()) {
      toast({ title: "Validation Error", description: "Unit code and label are required.", variant: "destructive" });
      return;
    }
    if (editingUnit) {
      updateUnit({ ...editingUnit, ...unitForm });
      toast({ title: "Unit updated" });
    } else {
      addUnit(unitForm);
      toast({ title: "Unit added" });
    }
    setSheetOpen(false);
  };
  const handleDeleteUnit = (unitId: string) => {
    deleteUnit(unitId);
    toast({ title: "Unit deleted" });
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
    { label: "Total", value: stats?.total ?? 0, icon: DoorOpen, color: "text-foreground" },
    { label: "Occupied", value: stats?.occupied ?? 0, icon: CheckCircle2, color: "text-success" },
    { label: "Vacant", value: stats?.vacant ?? 0, icon: XCircle, color: "text-warning" },
    { label: "Reserved", value: stats?.reserved ?? 0, icon: Clock, color: "text-primary" },
    { label: "Unavailable", value: stats?.unavailable ?? 0, icon: Ban, color: "text-muted-foreground" },
    { label: "Occupancy", value: `${stats?.occupancyRate ?? 0}%`, icon: TrendingUp, color: "text-success" },
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
            <p className="text-sm text-muted-foreground mt-1 font-mono">{property.referenceCode}</p>
            <div className="flex gap-2 mt-2">
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{getPropertyTypeLabel(property.propertyType)}</span>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{property.currencyCode}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Overview & Local Settings */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("detail.overview")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Address</span><span className="text-sm font-medium text-foreground text-right max-w-[60%]">{fullAddress}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Owner</span><span className="text-sm font-medium text-foreground">{property.ownerName || "—"}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Country</span><span className="text-sm font-medium text-foreground">{getCountryName(property.countryCode)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Type</span><span className="text-sm font-medium text-foreground">{getPropertyTypeLabel(property.propertyType)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Status</span><StatusBadge status={property.status} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Local Settings</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Locale</span><span className="text-sm font-medium text-foreground font-mono">{property.locale}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Currency</span><span className="text-sm font-medium text-foreground">{property.currencyCode}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Measurement</span><span className="text-sm font-medium text-foreground capitalize">{property.measurementSystem}</span></div>
          </CardContent>
        </Card>
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
      {property.description && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Description</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{property.description}</p></CardContent>
        </Card>
      )}

      {/* Units */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">Units</h2>
          <Button size="sm" onClick={openAddUnit}><Plus className="h-4 w-4 mr-1.5" />Add Unit</Button>
        </div>
        {propertyUnits.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No units in this property yet.</p>
              <Button variant="link" className="mt-2" onClick={openAddUnit}>Add your first unit</Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Floor</TableHead>
                  <TableHead className="text-right">Surface</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead className="text-right">Charges</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Lease</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propertyUnits.map(u => {
                  const activeLease = getActiveLease(u.id);
                  const tenant = activeLease ? tenants.find(t => t.id === activeLease.primaryTenantId) : null;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs font-medium text-foreground">
                        <Link to={`/units/${u.id}`} className="hover:underline">{u.unitCode}</Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.unitLabel}</TableCell>
                      <TableCell className="text-muted-foreground">{getUnitTypeLabel(u.unitType)}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{u.floor != null ? u.floor : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{u.surfaceArea != null ? formatArea(u.surfaceArea, property.measurementSystem) : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{u.baseRent != null ? formatCurrency(u.baseRent, property.currencyCode, property.locale) : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{u.baseCharges != null ? formatCurrency(u.baseCharges, property.currencyCode, property.locale) : "—"}</TableCell>
                      <TableCell><StatusBadge status={u.currentStatus} /></TableCell>
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
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete unit?</AlertDialogTitle>
                                <AlertDialogDescription>This will permanently delete "{u.unitCode}".</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteUnit(u.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Unit Form Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingUnit ? "Edit Unit" : "Add Unit"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Unit Code *</Label>
                <Input value={unitForm.unitCode} onChange={e => setUnitForm(f => ({ ...f, unitCode: e.target.value }))} placeholder="e.g. PAR-A01" />
              </div>
              <div>
                <Label>Unit Label *</Label>
                <Input value={unitForm.unitLabel} onChange={e => setUnitForm(f => ({ ...f, unitLabel: e.target.value }))} placeholder="e.g. Appt 1er gauche" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Unit Type *</Label>
                <Select value={unitForm.unitType} onValueChange={v => setUnitForm(f => ({ ...f, unitType: v as UnitType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status *</Label>
                <Select value={unitForm.currentStatus} onValueChange={v => setUnitForm(f => ({ ...f, currentStatus: v as UnitStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Floor</Label><Input type="number" value={unitForm.floor ?? ""} onChange={e => setUnitForm(f => ({ ...f, floor: e.target.value ? Number(e.target.value) : null }))} /></div>
              <div><Label>Surface ({property.measurementSystem === "metric" ? "m²" : "sq ft"})</Label><Input type="number" value={unitForm.surfaceArea ?? ""} onChange={e => setUnitForm(f => ({ ...f, surfaceArea: e.target.value ? Number(e.target.value) : null }))} /></div>
              <div><Label>Available From</Label><Input type="date" value={unitForm.availableFrom ?? ""} onChange={e => setUnitForm(f => ({ ...f, availableFrom: e.target.value || null }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Bedrooms</Label><Input type="number" min={0} value={unitForm.bedrooms} onChange={e => setUnitForm(f => ({ ...f, bedrooms: Number(e.target.value) || 0 }))} /></div>
              <div><Label>Bathrooms</Label><Input type="number" min={0} value={unitForm.bathrooms} onChange={e => setUnitForm(f => ({ ...f, bathrooms: Number(e.target.value) || 0 }))} /></div>
              <div className="flex items-end gap-2 pb-1"><Switch checked={unitForm.furnished} onCheckedChange={v => setUnitForm(f => ({ ...f, furnished: v }))} id="prop-furnished" /><Label htmlFor="prop-furnished">Furnished</Label></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Base Rent</Label><Input type="number" min={0} value={unitForm.baseRent ?? ""} onChange={e => setUnitForm(f => ({ ...f, baseRent: e.target.value ? Number(e.target.value) : null }))} /></div>
              <div><Label>Base Charges</Label><Input type="number" min={0} value={unitForm.baseCharges ?? ""} onChange={e => setUnitForm(f => ({ ...f, baseCharges: e.target.value ? Number(e.target.value) : null }))} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={unitForm.notes} onChange={e => setUnitForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveUnit}>{editingUnit ? "Save Changes" : "Add Unit"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
