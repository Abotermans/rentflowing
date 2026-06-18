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
import { Tag, CircleCheck, User, Building2 } from "lucide-react";
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
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";
import { PropertyOwnersPicker } from "@/components/properties/PropertyOwnersPicker";

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
  milliemeBase: 1000, milliemeKeys: ["general"],
};

export default function Properties() {
  const {
    properties, units, leases, addProperty, updateProperty, deleteProperty, getPropertyStats,
    propertyOwners, getOwnersForProperty, setPropertyOwners,
  } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const navigate = useNavigate();
  const integrityState = useIntegrityState();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [form, setForm] = useState<PropertyFormData>({ ...emptyForm });
  const [formOwnerIds, setFormOwnerIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterCountry, setFilterCountry] = useState<string[]>([]);
  const [filterOwner, setFilterOwner] = useState<string[]>([]);

  type PSortKey = "reference" | "name" | "city" | "country" | "type" | "owner" | "units" | "occupancy" | "status";
  const { sort, toggle } = useTableSort<PSortKey>();

  const propertyStatusValidation = (() => {
    if (!editing) return null;
    if (form.status === "inactive" && editing.status === "active") {
      return canArchiveProperty(editing.id, integrityState);
    }
    return null;
  })();

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm }); setFormOwnerIds([]); setOpen(true); };
  const openEdit = (p: Property) => {
    setEditing(p);
    const { id, createdAt, updatedAt, ...rest } = p;
    setForm(rest);
    setFormOwnerIds(getOwnersForProperty(p.id).map(o => o.id));
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
      setPropertyOwners(editing.id, formOwnerIds);
      toast({ title: `${t("properties.title")} ${t("common.updated").toLowerCase()}` });
    } else {
      const created = addProperty(form);
      setPropertyOwners(created.id, formOwnerIds);
      toast({ title: `${t("properties.title")} ${t("common.added").toLowerCase()}` });
    }
    setOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteProperty(id);
    toast({ title: `${t("properties.title")} ${t("common.deleted").toLowerCase()}` });
  };

  const ownerNamesByProperty = (pid: string) => getOwnersForProperty(pid).map(o => o.name);
  const filtered = properties.filter(p => {
    const q = search.toLowerCase();
    const ownerNames = ownerNamesByProperty(p.id);
    const matchesSearch = !q
      || p.name.toLowerCase().includes(q)
      || p.referenceCode.toLowerCase().includes(q)
      || p.city.toLowerCase().includes(q)
      || (p.ownerName || "").toLowerCase().includes(q)
      || ownerNames.some(n => n.toLowerCase().includes(q));
    const matchesType = filterType.length === 0 || filterType.includes(p.propertyType);
    const matchesStatus = filterStatus.length === 0 || filterStatus.includes(p.status);
    const matchesCountry = filterCountry.length === 0 || filterCountry.includes(p.countryCode);
    const ownerIds = getOwnersForProperty(p.id).map(o => o.id);
    const matchesOwner = filterOwner.length === 0 || ownerIds.some(id => filterOwner.includes(id));
    return matchesSearch && matchesType && matchesStatus && matchesCountry && matchesOwner;
  });

  const sorted = sortRows(filtered, sort, (p, key) => {
    switch (key) {
      case "reference": return p.referenceCode;
      case "name": return p.name;
      case "city": return p.city;
      case "country": return getCountryName(p.countryCode);
      case "type": return getPropertyTypeLabel(p.propertyType);
      case "owner": return ownerNamesByProperty(p.id).join(", ") || p.ownerName || "";
      case "units": return getPropertyStats(p.id).total;
      case "occupancy": return getPropertyStats(p.id).occupancyRate;
      case "status": return p.status;
    }
  });

  const { pageItems, page, pageSize, setPage, setPageSize, total, totalPages, from, to } = usePagination(sorted);

  // Get unique countries from existing properties for filter
  const usedCountries = [...new Set(properties.map(p => p.countryCode))].sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("properties.title")}</h1>
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
      <div className="flex items-start justify-between gap-4">
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
          <MultiSelectFilter
            label={t("propertyOwners.filterLabel")}
            icon={User}
            values={filterOwner}
            onChange={setFilterOwner}
            options={propertyOwners.map(o => ({ value: o.id, label: o.name, icon: User }))}
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap mt-1.5">
          {filtered.length} {t("properties.title").toLowerCase()}
        </span>
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
                <SortableTableHead sortKey="reference" sort={sort} onSort={toggle}>{t("properties.reference")}</SortableTableHead>
                <SortableTableHead sortKey="name" sort={sort} onSort={toggle}>{t("properties.name")}</SortableTableHead>
                <SortableTableHead sortKey="city" sort={sort} onSort={toggle}>{t("properties.city")}</SortableTableHead>
                <SortableTableHead sortKey="country" sort={sort} onSort={toggle}>{t("properties.country")}</SortableTableHead>
                <SortableTableHead sortKey="type" sort={sort} onSort={toggle}>{t("properties.type")}</SortableTableHead>
                <SortableTableHead sortKey="owner" sort={sort} onSort={toggle}>{t("properties.owner")}</SortableTableHead>
                <SortableTableHead sortKey="units" sort={sort} onSort={toggle} align="center">{t("properties.units")}</SortableTableHead>
                <SortableTableHead sortKey="occupancy" sort={sort} onSort={toggle} align="center">{t("properties.occupancy")}</SortableTableHead>
                <SortableTableHead sortKey="status" sort={sort} onSort={toggle}>{t("filter.status")}</SortableTableHead>
                <TableHead className="text-right">{t("properties.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map(p => {
                const stats = getPropertyStats(p.id);
                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/properties/${p.id}`)}>
                    <TableCell className="text-muted-foreground font-mono text-xs">{p.referenceCode}</TableCell>
                    <TableCell className="text-muted-foreground">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.city}</TableCell>
                    <TableCell className="text-muted-foreground">{getCountryName(p.countryCode)}</TableCell>
                    <TableCell className="text-muted-foreground">{getPropertyTypeLabel(p.propertyType)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {(() => {
                        const names = ownerNamesByProperty(p.id);
                        if (names.length === 0) return p.ownerName || "—";
                        if (names.length <= 2) return names.join(", ");
                        return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
                      })()}
                    </TableCell>
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
          <TablePagination page={page} pageSize={pageSize} total={total} totalPages={totalPages} from={from} to={to} onPageChange={setPage} onPageSizeChange={setPageSize} />
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
              <Label>{t("properties.owners")}</Label>
              <PropertyOwnersPicker selectedIds={formOwnerIds} onChange={setFormOwnerIds} />
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
                    <SelectItem value="active"><StatusBadge status="active" /></SelectItem>
                    <SelectItem value="inactive"><StatusBadge status="inactive" /></SelectItem>
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

            <div className="space-y-2 border-t pt-3">
              <Label className="text-sm font-medium">{t("properties.millieme")}</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">{t("properties.milliemeBase")}</Label>
                  <Input
                    type="number" min={1}
                    value={form.milliemeBase ?? 1000}
                    onChange={e => setForm(f => ({ ...f, milliemeBase: Math.max(1, Number(e.target.value) || 1000) }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("properties.milliemeKeys")}</Label>
                  <Input
                    value={(form.milliemeKeys ?? ["general"]).join(", ")}
                    onChange={e => {
                      const parts = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
                      const keys = parts.includes("general") ? parts : ["general", ...parts];
                      setForm(f => ({ ...f, milliemeKeys: keys }));
                    }}
                    placeholder="general, lift, heating"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("properties.milliemeKeysHelp")}</p>
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
