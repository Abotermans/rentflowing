import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Plus, Pencil, Trash2, Search, Eye } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Link } from "react-router-dom";
import { Property } from "@/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getCountryName, getPropertyTypeLabel } from "@/lib/formatters";

const EUROPEAN_COUNTRIES = [
  { code: "FR", label: "France" }, { code: "BE", label: "Belgium" }, { code: "NL", label: "Netherlands" },
  { code: "DE", label: "Germany" }, { code: "GB", label: "United Kingdom" }, { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" }, { code: "PT", label: "Portugal" }, { code: "CH", label: "Switzerland" },
  { code: "AT", label: "Austria" }, { code: "LU", label: "Luxembourg" }, { code: "IE", label: "Ireland" },
  { code: "SE", label: "Sweden" }, { code: "DK", label: "Denmark" }, { code: "NO", label: "Norway" },
  { code: "FI", label: "Finland" }, { code: "PL", label: "Poland" }, { code: "CZ", label: "Czech Republic" },
];

const CURRENCIES = ["EUR", "GBP", "CHF", "SEK", "DKK", "NOK", "PLN", "CZK"];

const LOCALE_MAP: Record<string, string> = {
  FR: "fr-FR", BE: "fr-BE", NL: "nl-NL", DE: "de-DE", GB: "en-GB", ES: "es-ES",
  IT: "it-IT", PT: "pt-PT", CH: "de-CH", AT: "de-AT", LU: "fr-LU", IE: "en-IE",
  SE: "sv-SE", DK: "da-DK", NO: "nb-NO", FI: "fi-FI", PL: "pl-PL", CZ: "cs-CZ",
};

const CURRENCY_MAP: Record<string, string> = {
  FR: "EUR", BE: "EUR", NL: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", PT: "EUR",
  AT: "EUR", LU: "EUR", FI: "EUR", IE: "EUR", GB: "GBP", CH: "CHF",
  SE: "SEK", DK: "DKK", NO: "NOK", PL: "PLN", CZ: "CZK",
};

type PropertyFormData = Omit<Property, "id" | "createdAt" | "updatedAt">;

const emptyForm: PropertyFormData = {
  name: "", referenceCode: "", address1: "", address2: "", city: "", postalCode: "",
  regionOrState: "", countryCode: "FR", locale: "fr-FR", currencyCode: "EUR", measurementSystem: "metric",
  propertyType: "residential", ownerName: "", description: "", status: "active",
};

export default function Properties() {
  const { properties, units, addProperty, updateProperty, deleteProperty, getPropertyStats } = useAppData();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [form, setForm] = useState<PropertyFormData>({ ...emptyForm });
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCountry, setFilterCountry] = useState<string>("all");

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (p: Property) => {
    setEditing(p);
    const { id, createdAt, updatedAt, ...rest } = p;
    setForm(rest);
    setOpen(true);
  };

  const handleCountryChange = (code: string) => {
    setForm(f => ({
      ...f,
      countryCode: code,
      locale: LOCALE_MAP[code] ?? f.locale,
      currencyCode: CURRENCY_MAP[code] ?? f.currencyCode,
    }));
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.referenceCode.trim() || !form.address1.trim() || !form.city.trim() || !form.countryCode) {
      toast({ title: "Validation Error", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    if (editing) {
      updateProperty({ ...editing, ...form });
      toast({ title: "Property updated" });
    } else {
      addProperty(form);
      toast({ title: "Property added" });
    }
    setOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteProperty(id);
    toast({ title: "Property deleted" });
  };

  const filtered = properties.filter(p => {
    const q = search.toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.referenceCode.toLowerCase().includes(q) || p.city.toLowerCase().includes(q) || p.ownerName.toLowerCase().includes(q);
    const matchesType = filterType === "all" || p.propertyType === filterType;
    const matchesStatus = filterStatus === "all" || p.status === filterStatus;
    const matchesCountry = filterCountry === "all" || p.countryCode === filterCountry;
    return matchesSearch && matchesType && matchesStatus && matchesCountry;
  });

  // Get unique countries from existing properties for filter
  const usedCountries = [...new Set(properties.map(p => p.countryCode))].sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Properties</h1>
          <p className="text-sm text-muted-foreground">{properties.length} properties in portfolio</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Property</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, reference, city, owner…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterCountry} onValueChange={setFilterCountry}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Country" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Countries</SelectItem>
            {usedCountries.map(code => (
              <SelectItem key={code} value={code}>{getCountryName(code)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="residential">Residential</SelectItem>
            <SelectItem value="commercial">Commercial</SelectItem>
            <SelectItem value="mixed-use">Mixed Use</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {properties.length === 0 ? (
        <EmptyState icon={Building2} title="No properties yet" description="Add your first property to get started." actionLabel="Add Property" onAction={openAdd} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No results found" description="Try adjusting your filters or search terms." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-center">Units</TableHead>
                <TableHead className="text-center">Occupancy</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => {
                const stats = getPropertyStats(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link to={`/properties/${p.id}`} className="hover:underline text-foreground">{p.name}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{p.referenceCode}</TableCell>
                    <TableCell className="text-muted-foreground">{p.city}</TableCell>
                    <TableCell className="text-muted-foreground">{getCountryName(p.countryCode)}</TableCell>
                    <TableCell className="text-muted-foreground">{getPropertyTypeLabel(p.propertyType)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{p.ownerName || "—"}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{stats.total}</TableCell>
                    <TableCell className="text-center">
                      <span className="font-medium text-foreground">{stats.occupied}/{stats.total}</span>
                      <span className="text-muted-foreground text-xs ml-1">({stats.occupancyRate}%)</span>
                    </TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link to={`/properties/${p.id}`}><Eye className="h-3.5 w-3.5" /></Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete property?</AlertDialogTitle>
                              <AlertDialogDescription>This will permanently delete "{p.name}" and all its units.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(p.id)}>Delete</AlertDialogAction>
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

      {/* Property Form Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Property" : "Add Property"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input id="name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Property name" />
              </div>
              <div>
                <Label htmlFor="ref">Reference Code *</Label>
                <Input id="ref" value={form.referenceCode} onChange={e => setForm(f => ({ ...f, referenceCode: e.target.value }))} placeholder="e.g. PAR-001" />
              </div>
            </div>
            <div>
              <Label htmlFor="owner">Owner Name</Label>
              <Input id="owner" value={form.ownerName} onChange={e => setForm(f => ({ ...f, ownerName: e.target.value }))} placeholder="e.g. SCI Rivoli Patrimoine" />
            </div>
            <div>
              <Label htmlFor="addr1">Address Line 1 *</Label>
              <Input id="addr1" value={form.address1} onChange={e => setForm(f => ({ ...f, address1: e.target.value }))} placeholder="Street address" />
            </div>
            <div>
              <Label htmlFor="addr2">Address Line 2</Label>
              <Input id="addr2" value={form.address2} onChange={e => setForm(f => ({ ...f, address2: e.target.value }))} placeholder="Building, floor, etc." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">City *</Label>
                <Input id="city" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="City" />
              </div>
              <div>
                <Label htmlFor="postal">Postal Code</Label>
                <Input id="postal" value={form.postalCode} onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))} placeholder="Postal code" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="region">Region / State</Label>
                <Input id="region" value={form.regionOrState} onChange={e => setForm(f => ({ ...f, regionOrState: e.target.value }))} placeholder="e.g. Île-de-France" />
              </div>
              <div>
                <Label>Country *</Label>
                <Select value={form.countryCode} onValueChange={handleCountryChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EUROPEAN_COUNTRIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Property Type *</Label>
                <Select value={form.propertyType} onValueChange={v => setForm(f => ({ ...f, propertyType: v as Property["propertyType"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="mixed-use">Mixed Use</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as "active" | "inactive" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Currency *</Label>
                <Select value={form.currencyCode} onValueChange={v => setForm(f => ({ ...f, currencyCode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Locale</Label>
                <Input value={form.locale} onChange={e => setForm(f => ({ ...f, locale: e.target.value }))} placeholder="e.g. fr-FR" />
              </div>
              <div>
                <Label>Measurement</Label>
                <Select value={form.measurementSystem} onValueChange={v => setForm(f => ({ ...f, measurementSystem: v as "metric" | "imperial" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="metric">Metric (m²)</SelectItem>
                    <SelectItem value="imperial">Imperial (sq ft)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Property description…" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? "Save Changes" : "Add Property"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
