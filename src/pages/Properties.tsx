import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { PROPERTY_TYPE_ICONS, PROPERTY_STATUS_ICONS, COUNTRY_ICON } from "@/lib/filterIcons";
import { Tag, CircleCheck } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Plus, Pencil, Search } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useNavigate } from "react-router-dom";
import { Property } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { getCountryName, getPropertyTypeLabel } from "@/lib/formatters";
import { useSettings } from "@/context/SettingsContext";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { canArchiveProperty } from "@/lib/integrity/propertyIntegrity";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";

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
  const { properties, units, leases, addProperty, updateProperty, deleteProperty, getPropertyStats } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const navigate = useNavigate();
  const integrityState = useIntegrityState();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [form, setForm] = useState<PropertyFormData>({ ...emptyForm });
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterCountry, setFilterCountry] = useState<string[]>([]);

  const propertyStatusValidation = (() => {
    if (!editing) return null;
    if (form.status === "inactive" && editing.status === "active") {
      return canArchiveProperty(editing.id, integrityState);
    }
    return null;
  })();

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
      toast({ title: t("common.validationError"), description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    if (editing) {
      updateProperty({ ...editing, ...form });
      toast({ title: `${t("properties.title")} ${t("common.updated").toLowerCase()}` });
    } else {
      addProperty(form);
      toast({ title: `${t("properties.title")} ${t("common.added").toLowerCase()}` });
    }
    setOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteProperty(id);
    toast({ title: `${t("properties.title")} ${t("common.deleted").toLowerCase()}` });
  };

  const filtered = properties.filter(p => {
    const q = search.toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.referenceCode.toLowerCase().includes(q) || p.city.toLowerCase().includes(q) || p.ownerName.toLowerCase().includes(q);
    const matchesType = filterType.length === 0 || filterType.includes(p.propertyType);
    const matchesStatus = filterStatus.length === 0 || filterStatus.includes(p.status);
    const matchesCountry = filterCountry.length === 0 || filterCountry.includes(p.countryCode);
    return matchesSearch && matchesType && matchesStatus && matchesCountry;
  });

  // Get unique countries from existing properties for filter
  const usedCountries = [...new Set(properties.map(p => p.countryCode))].sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("properties.title")}</h1>
          <p className="text-sm text-muted-foreground">{properties.length} {t("properties.title").toLowerCase()}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative inline-flex">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("action.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 min-w-[180px] max-w-[400px] [field-sizing:content]" />
          </div>
          <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-2" />{t("properties.add")}</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <MultiSelectFilter
          label={t("properties.country")}
          icon={COUNTRY_ICON}
          values={filterCountry}
          onChange={setFilterCountry}
          options={usedCountries.map(code => ({ value: code, label: getCountryName(code), icon: COUNTRY_ICON }))}
        />
        <MultiSelectFilter
          label={t("filter.type")}
          icon={Tag}
          values={filterType}
          onChange={setFilterType}
          options={[
            { value: "residential", label: t("properties.residential"), icon: PROPERTY_TYPE_ICONS.residential },
            { value: "commercial", label: t("properties.commercial"), icon: PROPERTY_TYPE_ICONS.commercial },
            { value: "mixed-use", label: t("properties.mixedUse"), icon: PROPERTY_TYPE_ICONS["mixed-use"] },
          ]}
        />
        <MultiSelectFilter
          label={t("filter.status")}
          icon={CircleCheck}
          values={filterStatus}
          onChange={setFilterStatus}
          options={[
            { value: "active", label: t("properties.active"), icon: PROPERTY_STATUS_ICONS.active },
            { value: "inactive", label: t("properties.inactive"), icon: PROPERTY_STATUS_ICONS.inactive },
          ]}
        />
      </div>

      {properties.length === 0 ? (
        <EmptyState icon={Building2} title={t("properties.empty")} description={t("properties.emptyDesc")} actionLabel={t("properties.add")} onAction={openAdd} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title={t("filter.noResults")} description={t("filter.noResultsDesc")} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("properties.reference")}</TableHead>
                <TableHead>{t("properties.name")}</TableHead>
                <TableHead>{t("properties.city")}</TableHead>
                <TableHead>{t("properties.country")}</TableHead>
                <TableHead>{t("properties.type")}</TableHead>
                <TableHead>{t("properties.owner")}</TableHead>
                <TableHead className="text-center">{t("properties.units")}</TableHead>
                <TableHead className="text-center">{t("properties.occupancy")}</TableHead>
                <TableHead>{t("filter.status")}</TableHead>
                <TableHead className="text-right">{t("properties.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => {
                const stats = getPropertyStats(p.id);
                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/properties/${p.id}`)}>
                    <TableCell className="text-muted-foreground font-mono text-xs">{p.referenceCode}</TableCell>
                    <TableCell className="text-muted-foreground">{p.name}</TableCell>
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
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <DeleteDialog entityType="property" entityId={p.id} entityLabel="property" onDelete={handleDelete} />
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
            <DialogTitle>{editing ? t("properties.edit") : t("properties.add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">{t("properties.name")} *</Label>
                <Input id="name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Property name" />
              </div>
              <div>
                <Label htmlFor="ref">{t("properties.reference")} *</Label>
                <Input id="ref" value={form.referenceCode} onChange={e => setForm(f => ({ ...f, referenceCode: e.target.value }))} placeholder="e.g. PAR-001" />
              </div>
            </div>
            <div>
              <Label htmlFor="owner">{t("properties.ownerName")}</Label>
              <Input id="owner" value={form.ownerName} onChange={e => setForm(f => ({ ...f, ownerName: e.target.value }))} placeholder="e.g. SCI Rivoli Patrimoine" />
            </div>
            <div>
              <Label htmlFor="addr1">{t("properties.addressLine1")} *</Label>
              <Input id="addr1" value={form.address1} onChange={e => setForm(f => ({ ...f, address1: e.target.value }))} placeholder="Street address" />
            </div>
            <div>
              <Label htmlFor="addr2">{t("properties.addressLine2")}</Label>
              <Input id="addr2" value={form.address2} onChange={e => setForm(f => ({ ...f, address2: e.target.value }))} placeholder="Building, floor, etc." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">{t("properties.city")} *</Label>
                <Input id="city" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="City" />
              </div>
              <div>
                <Label htmlFor="postal">{t("properties.postalCode")}</Label>
                <Input id="postal" value={form.postalCode} onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))} placeholder="Postal code" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="region">{t("properties.region")}</Label>
                <Input id="region" value={form.regionOrState} onChange={e => setForm(f => ({ ...f, regionOrState: e.target.value }))} />
              </div>
              <div>
                <Label>{t("properties.country")} *</Label>
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
                <Label>{t("properties.propertyType")} *</Label>
                <Select value={form.propertyType} onValueChange={v => setForm(f => ({ ...f, propertyType: v as Property["propertyType"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential">{t("properties.residential")}</SelectItem>
                    <SelectItem value="commercial">{t("properties.commercial")}</SelectItem>
                    <SelectItem value="mixed-use">{t("properties.mixedUse")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("filter.status")}</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as "active" | "inactive" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("properties.active")}</SelectItem>
                    <SelectItem value="inactive">{t("properties.inactive")}</SelectItem>
                  </SelectContent>
                </Select>
                <StatusTransitionAlert validation={propertyStatusValidation} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>{t("properties.currency")} *</Label>
                <Select value={form.currencyCode} onValueChange={v => setForm(f => ({ ...f, currencyCode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("properties.locale")}</Label>
                <Input value={form.locale} onChange={e => setForm(f => ({ ...f, locale: e.target.value }))} placeholder="e.g. fr-FR" />
              </div>
              <div>
                <Label>{t("properties.measurement")}</Label>
                <Select value={form.measurementSystem} onValueChange={v => setForm(f => ({ ...f, measurementSystem: v as "metric" | "imperial" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="metric">{t("properties.metric")}</SelectItem>
                    <SelectItem value="imperial">{t("properties.imperial")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="desc">{t("properties.description")}</Label>
              <Textarea id="desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{editing ? t("action.saveChanges") : t("properties.add")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
