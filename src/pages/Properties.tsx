import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { PROPERTY_TYPE_ICONS, PROPERTY_STATUS_ICONS, COUNTRY_ICON } from "@/lib/filterIcons";
import { Tag, CircleCheck, User } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Plus, Pencil, Search } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
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
import { normalizedCode } from "@/lib/validation";
import {
  formatMilliemeBase,
  getManagedOwnershipShare,
  getPropertyMilliemeBaseViolations,
  MILLIEME_BASE_OPTIONS,
} from "@/lib/propertyOwnership";
import { MilliemeKeysInput } from "@/components/properties/MilliemeKeysInput";
import { usePortfolioWriteAccess } from "@/hooks/use-portfolio-write-access";
import { businessTimeZoneChoices, defaultBusinessTimeZone, isValidBusinessTimeZone } from "@/lib/businessTimeZone";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";

const EUROPEAN_COUNTRIES = [
  { code: "FR", label: "France" }, { code: "BE", label: "Belgium" }, { code: "NL", label: "Netherlands" },
  { code: "DE", label: "Germany" }, { code: "GB", label: "United Kingdom" }, { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" }, { code: "PT", label: "Portugal" }, { code: "CH", label: "Switzerland" },
  { code: "AT", label: "Austria" }, { code: "LU", label: "Luxembourg" }, { code: "IE", label: "Ireland" },
  { code: "SE", label: "Sweden" }, { code: "DK", label: "Denmark" }, { code: "NO", label: "Norway" },
  { code: "FI", label: "Finland" }, { code: "PL", label: "Poland" }, { code: "CZ", label: "Czech Republic" },
].sort((a, b) => a.label.localeCompare(b.label));

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

const getMilliemeBaseChoices = (base: number | undefined) => {
  const current = base ?? 1000;
  return Array.from(new Set([...MILLIEME_BASE_OPTIONS, current])).sort((a, b) => a - b);
};

type PropertyFormData = Omit<Property, "id" | "createdAt" | "updatedAt">;

const emptyForm: PropertyFormData = {
  name: "", referenceCode: "", address1: "", address2: "", city: "", postalCode: "",
  regionOrState: "", countryCode: "FR", locale: "fr-FR", currencyCode: "EUR", measurementSystem: "metric",
  timeZone: defaultBusinessTimeZone("FR"),
  propertyType: "residential", ownerName: "", description: "", status: "active",
  milliemeBase: 1000, milliemeKeys: ["general"], isPartiallyOwned: false,
};

export default function Properties() {
  const {
    properties, units, leases, receivableItems, cashReceipts, costEntries,
    savePropertyWithOwnersPersisted, deleteProperty, getPropertyStats,
    propertyOwners, getOwnersForProperty,
  } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const canWrite = usePortfolioWriteAccess();
  const navigate = useNavigate();
  const integrityState = useIntegrityState();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [form, setForm] = useState<PropertyFormData>({ ...emptyForm });
  const [formOwnerIds, setFormOwnerIds] = useState<string[]>([]);
  const [saveAttempted, setSaveAttempted] = useState(false);
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
  const ownershipPreview = editing
    ? getManagedOwnershipShare({ milliemeBase: form.milliemeBase }, units, editing.id)
    : null;
  const currencyLocked = !!editing && (
    units.some(unit => unit.propertyId === editing.id)
    || leases.some(lease => lease.propertyId === editing.id)
    || receivableItems.some(item => item.propertyId === editing.id)
    || cashReceipts.some(receipt => receipt.propertyId === editing.id)
    || costEntries.some(entry => entry.propertyId === editing.id)
  );

  const requiredMissing = {
    name: !form.name.trim(),
    referenceCode: !form.referenceCode.trim(),
    address1: !form.address1.trim(),
    city: !form.city.trim(),
    countryCode: !form.countryCode,
    timeZone: !isValidBusinessTimeZone(form.timeZone),
  };
  const showRequired = (key: keyof typeof requiredMissing) => saveAttempted && requiredMissing[key];
  const requiredError = (key: keyof typeof requiredMissing) => showRequired(key)
    ? key === "timeZone" ? t("properties.invalidTimeZone") : t("common.mandatoryField")
    : undefined;

  const openAdd = () => { if (!canWrite) return; setEditing(null); setForm({ ...emptyForm }); setFormOwnerIds([]); setSaveAttempted(false); setOpen(true); };
  const openEdit = (p: Property) => {
    if (!canWrite) return;
    setEditing(p);
    const { id, createdAt, updatedAt, ...rest } = p;
    setForm({ ...rest, timeZone: rest.timeZone ?? defaultBusinessTimeZone(rest.countryCode) });
    setFormOwnerIds(getOwnersForProperty(p.id).map(o => o.id));
    setSaveAttempted(false);
    setOpen(true);
  };

  const handleCountryChange = (code: string) => {
    setForm(f => ({
      ...f,
      countryCode: code,
      locale: LOCALE_MAP[code] ?? f.locale,
      currencyCode: currencyLocked ? f.currencyCode : CURRENCY_MAP[code] ?? f.currencyCode,
      timeZone: !f.timeZone || f.timeZone === defaultBusinessTimeZone(f.countryCode)
        ? defaultBusinessTimeZone(code) : f.timeZone,
    }));
  };

  const handleSave = async () => {
    if (!canWrite) return;
    setSaveAttempted(true);
    if (Object.values(requiredMissing).some(Boolean)) {
      toast({ title: t("common.validationError"), description: t("common.fixHighlightedFields"), variant: "destructive" });
      return;
    }
    if (currencyLocked && form.currencyCode !== editing?.currencyCode) {
      toast({ title: t("common.validationError"), description: t("properties.currencyLocked"), variant: "destructive" });
      return;
    }
    const duplicateReference = properties.some(p =>
      p.id !== editing?.id &&
      normalizedCode(p.referenceCode) === normalizedCode(form.referenceCode),
    );
    if (duplicateReference) {
      toast({ title: t("common.validationError"), description: "Property reference codes must be unique.", variant: "destructive" });
      return;
    }
    if (editing && form.milliemeBase !== editing.milliemeBase) {
      const milliemeViolations = getPropertyMilliemeBaseViolations(form, units, editing.id);
      if (milliemeViolations.length > 0) {
        const first = milliemeViolations[0];
        toast({
          title: t("common.validationError"),
          description: t("properties.milliemeBaseCapacityExceeded")
            .replace("{key}", first.key)
            .replace("{total}", String(first.totalShares))
            .replace("{base}", String(first.base)),
          variant: "destructive",
        });
        return;
      }
    }
    const payload = {
      ...form,
      name: form.name.trim(),
      referenceCode: form.referenceCode.trim(),
      address1: form.address1.trim(),
      city: form.city.trim(),
    };
    try {
      if (editing) {
        await savePropertyWithOwnersPersisted({ ...editing, ...payload }, formOwnerIds);
        toast({ title: `${t("properties.title")} ${t("common.updated").toLowerCase()}` });
      } else {
        await savePropertyWithOwnersPersisted(payload, formOwnerIds);
        toast({ title: `${t("properties.title")} ${t("common.added").toLowerCase()}` });
      }
    } catch (err) {
      const description = err && typeof err === "object" && "message" in err && typeof err.message === "string"
        ? err.message
        : "Property could not be saved.";
      toast({ title: t("common.validationError"), description, variant: "destructive" });
      return;
    }
    setOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!canWrite) return;
    await deleteProperty(id);
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
  const usedCountries = [...new Set(properties.map(p => p.countryCode))]
    .sort((a, b) => getCountryName(a).localeCompare(getCountryName(b)));

  return (
    <div className="page-shell">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">{t("properties.title")}</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative flex min-w-0 flex-1 sm:inline-flex sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("action.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 min-w-[180px] max-w-[400px] w-full [field-sizing:content]" />
          </div>
          {canWrite && <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-2" />{t("properties.add")}</Button>}
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
            options={propertyOwners.map(o => ({ value: o.id, label: o.name, icon: o.type === "corporation" ? Building2 : User }))}
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap mt-1.5">
          {filtered.length} {t("properties.title").toLowerCase()}
        </span>
      </div>

      {properties.length === 0 ? (
        <EmptyState icon={Building2} title={t("properties.empty")} description={t("properties.emptyDesc")} actionLabel={canWrite ? t("properties.add") : undefined} onAction={canWrite ? openAdd : undefined} />
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
                {canWrite && <TableHead className="text-right">{t("properties.actions")}</TableHead>}
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
                      <span className="font-medium text-foreground">{stats.occupied + stats.ancillaryLeased}/{stats.total}</span>
                      <span className="text-muted-foreground text-xs ml-1">({stats.occupancyRate}%)</span>
                    </TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    {canWrite && <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${p.name}`} title={`Edit ${p.name}`} onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <DeleteDialog entityType="property" entityId={p.id} entityLabel="property" onDelete={handleDelete} />
                      </div>
                    </TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={pageSize} total={total} totalPages={totalPages} from={from} to={to} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </Card>
      )}

      {/* Property Form Dialog */}
      <Dialog open={canWrite && open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("properties.edit") : t("properties.add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField htmlFor="name" label={t("properties.name")} required error={requiredError("name")}>
                <Input id="name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Property name" aria-invalid={showRequired("name")} />
              </FormField>
              <FormField htmlFor="ref" label={t("properties.reference")} required error={requiredError("referenceCode")}>
                <Input id="ref" value={form.referenceCode} onChange={e => setForm(f => ({ ...f, referenceCode: e.target.value }))} placeholder="e.g. PAR-001" aria-invalid={showRequired("referenceCode")} />
              </FormField>
            </div>
            <div>
              <Label>{t("properties.owners")}</Label>
              <PropertyOwnersPicker selectedIds={formOwnerIds} onChange={setFormOwnerIds} />
            </div>
            <FormField htmlFor="addr1" label={t("properties.addressLine1")} required error={requiredError("address1")}>
              <Input id="addr1" value={form.address1} onChange={e => setForm(f => ({ ...f, address1: e.target.value }))} placeholder="Street address" aria-invalid={showRequired("address1")} />
            </FormField>
            <div>
              <Label htmlFor="addr2">{t("properties.addressLine2")}</Label>
              <Input id="addr2" value={form.address2} onChange={e => setForm(f => ({ ...f, address2: e.target.value }))} placeholder="Building, floor, etc." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField htmlFor="city" label={t("properties.city")} required error={requiredError("city")}>
                <Input id="city" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="City" aria-invalid={showRequired("city")} />
              </FormField>
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
              <FormField label={t("properties.country")} required error={requiredError("countryCode")}>
                <Select value={form.countryCode} onValueChange={handleCountryChange}>
                  <SelectTrigger aria-invalid={showRequired("countryCode")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EUROPEAN_COUNTRIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
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
                <Select value={form.currencyCode} disabled={currencyLocked} onValueChange={v => setForm(f => ({ ...f, currencyCode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                {currencyLocked && <p className="mt-1 text-xs text-muted-foreground">{t("properties.currencyLocked")}</p>}
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
            <FormField label={t("properties.timeZone")} required error={requiredError("timeZone")}>
              <Select value={form.timeZone} onValueChange={v => setForm(f => ({ ...f, timeZone: v }))}>
                <SelectTrigger aria-invalid={showRequired("timeZone")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {businessTimeZoneChoices(form.timeZone).map(zone =>
                    <SelectItem key={zone} value={zone}>{zone}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("properties.timeZoneDesc")}</p>
            </FormField>
            <div>
              <Label htmlFor="desc">{t("properties.description")}</Label>
              <Textarea id="desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label className="text-sm font-medium">{t("properties.millieme")}</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">{t("properties.milliemeBase")}</Label>
                  <Select
                    value={String(form.milliemeBase ?? 1000)}
                    onValueChange={v => setForm(f => ({ ...f, milliemeBase: Number(v) }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {getMilliemeBaseChoices(form.milliemeBase).map(base => (
                        <SelectItem key={base} value={String(base)}>
                          {MILLIEME_BASE_OPTIONS.includes(base as typeof MILLIEME_BASE_OPTIONS[number])
                            ? formatMilliemeBase(base, form.locale)
                            : t("properties.milliemeLegacyBase").replace("{base}", formatMilliemeBase(base, form.locale))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("properties.milliemeKeys")}</Label>
                  <MilliemeKeysInput
                    keys={form.milliemeKeys ?? ["general"]}
                    onChange={keys => setForm(f => ({ ...f, milliemeKeys: keys }))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("properties.milliemeKeysHelp")}</p>
              <div className="flex items-start justify-between gap-4 pt-1">
                <div className="min-w-0 space-y-1">
                  <Label>{t("properties.partialOwnership")}</Label>
                  <p className="text-xs text-muted-foreground">{t("properties.partialOwnershipHelp")}</p>
                  {form.isPartiallyOwned && ownershipPreview && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("properties.ownedSharePreview")
                        .replace("{shares}", String(ownershipPreview.ownedShares))
                        .replace("{base}", String(ownershipPreview.base))
                        .replace("{percent}", (ownershipPreview.ratio * 100).toFixed(2))}
                    </p>
                  )}
                </div>
                <Switch
                  checked={!!form.isPartiallyOwned}
                  onCheckedChange={v => setForm(f => ({ ...f, isPartiallyOwned: v }))}
                />
              </div>
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
