import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { PROPERTY_ICON, COST_NATURE_ICONS, COST_ENTRY_STATUS_ICONS, RECOVERY_TYPE_ICONS } from "@/lib/filterIcons";
import { Tag, CircleDot, Shield } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Receipt, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import {
  CostEntry, CostEntryStatus, CostFrequency, CostNature, RecoveryType,
  COST_ENTRY_STATUS_LABELS, COST_FREQUENCY_LABELS, COST_NATURE_LABELS, RECOVERY_TYPE_LABELS,
} from "@/types/costs";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";
import type { TranslationKey } from "@/i18n/translations";

type FormData = Omit<CostEntry, "id" | "createdAt" | "updatedAt">;

const emptyForm: FormData = {
  categoryId: "", propertyId: "", unitId: null, label: "", description: "",
  frequency: "monthly", startDate: "", endDate: null, amount: 0, currencyCode: "EUR",
  isTax: false, recoveryType: "owner-only", allocationRuleId: null,
  vendorName: "", invoiceReference: "", status: "draft", notes: "",
};

export default function CostEntries() {
  const {
    costEntries, costCategories, properties, units, allocationRules,
    addCostEntry, updateCostEntry, deleteCostEntry,
    getPropertyById, getUnitById, getCostCategoryById, getAllocationRuleById,
  } = useAppData();
  const { t } = useSettings();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const natureLabel = (n: CostNature) => t(`costs.nature.${n}` as TranslationKey);
  const recoveryLabel = (r: RecoveryType) => t(`costs.recovery.${r}` as TranslationKey);
  const frequencyLabel = (f: CostFrequency) => t(`costs.frequency.${f}` as TranslationKey);
  const statusLabel = (s: CostEntryStatus) => t(`costs.entryStatus.${s}` as TranslationKey);

  const [search, setSearch] = useState("");
  const [filterProperty, setFilterProperty] = useState<string[]>([]);
  const [filterNature, setFilterNature] = useState<string[]>([]);
  const [filterRecovery, setFilterRecovery] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CostEntry | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });

  type ESortKey = "label" | "category" | "nature" | "property" | "unit" | "frequency" | "amount" | "recovery" | "status";
  const { sort, toggle } = useTableSort<ESortKey>();

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm }); setSheetOpen(true); };
  const openEdit = (e: CostEntry) => {
    setEditing(e);
    const { id, createdAt, updatedAt, ...rest } = e;
    setForm(rest);
    setSheetOpen(true);
  };

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId) {
      const entry = costEntries.find(e => e.id === editId);
      if (entry) openEdit(entry);
      searchParams.delete("edit");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = () => {
    if (!form.label.trim() || !form.propertyId || !form.categoryId || form.amount <= 0) {
      toast({ title: t("common.validationError"), description: t("costs.validation.entryRequired"), variant: "destructive" });
      return;
    }
    const category = getCostCategoryById(form.categoryId);
    const entry = { ...form, isTax: category?.nature === "tax" };
    if (editing) {
      updateCostEntry({ ...editing, ...entry });
      toast({ title: t("common.updated"), description: form.label });
    } else {
      addCostEntry(entry);
      toast({ title: t("common.added"), description: form.label });
    }
    setSheetOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteCostEntry(id);
    toast({ title: t("common.deleted") });
  };

  // Derived property units for the form
  const propertyUnits = useMemo(() => {
    if (!form.propertyId) return [];
    return units.filter(u => u.propertyId === form.propertyId);
  }, [form.propertyId, units]);

  const propertyRules = useMemo(() => {
    if (!form.propertyId) return [];
    return allocationRules.filter(r => r.propertyId === form.propertyId);
  }, [form.propertyId, allocationRules]);

  const filtered = costEntries.filter(e => {
    if (search) {
      const s = search.toLowerCase();
      if (!e.label.toLowerCase().includes(s) && !e.vendorName.toLowerCase().includes(s)) return false;
    }
    if (filterProperty.length > 0 && !filterProperty.includes(e.propertyId)) return false;
    if (filterNature.length > 0) {
      const cat = getCostCategoryById(e.categoryId);
      if (!cat || !filterNature.includes(cat.nature)) return false;
    }
    if (filterRecovery.length > 0 && !filterRecovery.includes(e.recoveryType)) return false;
    if (filterStatus.length > 0 && !filterStatus.includes(e.status)) return false;
    return true;
  });

  const sorted = sortRows(filtered, sort, (e, key) => {
    const cat = getCostCategoryById(e.categoryId);
    const prop = getPropertyById(e.propertyId);
    const unit = e.unitId ? getUnitById(e.unitId) : null;
    switch (key) {
      case "label": return e.label;
      case "category": return cat?.name ?? "";
      case "nature": return e.isTax ? "tax" : "charge";
      case "property": return prop?.name ?? "";
      case "unit": return unit?.unitLabel ?? "";
      case "frequency": return frequencyLabel(e.frequency);
      case "amount": return e.amount;
      case "recovery": return recoveryLabel(e.recoveryType);
      case "status": return e.status;
    }
  });

  const { pageItems, page, pageSize, setPage, setPageSize, total, totalPages, from, to } = usePagination(sorted);

  const statusMap: Record<CostEntryStatus, string> = {
    draft: "draft", active: "active", cancelled: "cancelled", closed: "closed",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("costs.entries")}</h1>
          <p className="text-sm text-muted-foreground">{t("costs.entriesSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative inline-flex">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("action.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 min-w-[180px] max-w-[400px] [field-sizing:content]" />
          </div>
          <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" />{t("costs.addEntry")}</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <MultiSelectFilter
          label={t("filter.property")}
          icon={PROPERTY_ICON}
          values={filterProperty}
          onChange={setFilterProperty}
          options={properties.map(p => ({ value: p.id, label: p.name, icon: PROPERTY_ICON }))}
        />
        <MultiSelectFilter
          label={t("costs.nature")}
          icon={Tag}
          values={filterNature}
          onChange={setFilterNature}
          options={(Object.keys(COST_NATURE_LABELS) as CostNature[]).map(n => ({
            value: n, label: natureLabel(n), icon: COST_NATURE_ICONS[n],
          }))}
        />
        <MultiSelectFilter
          label={t("costs.recoveryType")}
          icon={Shield}
          values={filterRecovery}
          onChange={setFilterRecovery}
          options={(Object.keys(RECOVERY_TYPE_LABELS) as RecoveryType[]).map(r => ({
            value: r, label: recoveryLabel(r), icon: RECOVERY_TYPE_ICONS[r],
          }))}
        />
        <MultiSelectFilter
          label={t("filter.status")}
          icon={CircleDot}
          values={filterStatus}
          onChange={setFilterStatus}
          options={(Object.keys(COST_ENTRY_STATUS_LABELS) as CostEntryStatus[]).map(s => ({
            value: s, label: statusLabel(s), icon: COST_ENTRY_STATUS_ICONS[s],
          }))}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState icon={Receipt} title={t("costs.noEntries")} description={t("costs.noEntriesDesc")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="label" sort={sort} onSort={toggle}>{t("costs.label")}</SortableTableHead>
                  <SortableTableHead sortKey="category" sort={sort} onSort={toggle}>{t("table.category")}</SortableTableHead>
                  <SortableTableHead sortKey="nature" sort={sort} onSort={toggle}>{t("costs.nature")}</SortableTableHead>
                  <SortableTableHead sortKey="property" sort={sort} onSort={toggle}>{t("table.property")}</SortableTableHead>
                  <SortableTableHead sortKey="unit" sort={sort} onSort={toggle}>{t("table.unit")}</SortableTableHead>
                  <SortableTableHead sortKey="frequency" sort={sort} onSort={toggle}>{t("costs.frequency")}</SortableTableHead>
                  <SortableTableHead sortKey="amount" sort={sort} onSort={toggle} align="right">{t("costs.amount")}</SortableTableHead>
                  <SortableTableHead sortKey="recovery" sort={sort} onSort={toggle}>{t("costs.recoveryType")}</SortableTableHead>
                  <SortableTableHead sortKey="status" sort={sort} onSort={toggle}>{t("filter.status")}</SortableTableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map(e => {
                  const cat = getCostCategoryById(e.categoryId);
                  const prop = getPropertyById(e.propertyId);
                  const unit = e.unitId ? getUnitById(e.unitId) : null;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm text-muted-foreground">{e.label}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{cat?.name ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={e.isTax ? "high" : "medium"} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{unit ? unit.unitLabel : t("costs.propertyLevel")}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{frequencyLabel(e.frequency)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(e.amount, e.currencyCode)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{recoveryLabel(e.recoveryType)}</TableCell>
                      <TableCell><StatusBadge status={statusMap[e.status] as any} /></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(e)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <DeleteDialog
                            entityType="cost-entry"
                            entityId={e.id}
                            entityLabel={e.label}
                            onDelete={handleDelete}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {filtered.length > 0 && (
            <TablePagination page={page} pageSize={pageSize} total={total} totalPages={totalPages} from={from} to={to} onPageChange={setPage} onPageSizeChange={setPageSize} />
          )}
        </CardContent>
      </Card>

      {/* Sheet */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t("costs.editEntry") : t("costs.addEntry")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Category */}
            <div className="space-y-2">
              <Label>{t("table.category")} *</Label>
              <Select value={form.categoryId} onValueChange={v => {
                const cat = costCategories.find(c => c.id === v);
                setForm({ ...form, categoryId: v, isTax: cat?.nature === "tax", recoveryType: cat?.recoveryTypeDefault ?? form.recoveryType });
              }}>
                <SelectTrigger><SelectValue placeholder={t("costs.selectCategory")} /></SelectTrigger>
                <SelectContent>
                  {costCategories.filter(c => c.isActive).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({natureLabel(c.nature)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Property */}
            <div className="space-y-2">
              <Label>{t("table.property")} *</Label>
              <Select value={form.propertyId} onValueChange={v => {
                const prop = properties.find(p => p.id === v);
                setForm({ ...form, propertyId: v, unitId: null, allocationRuleId: null, currencyCode: prop?.currencyCode ?? "EUR" });
              }}>
                <SelectTrigger><SelectValue placeholder={t("costs.selectProperty")} /></SelectTrigger>
                <SelectContent>
                  {properties.filter(p => p.status === "active").map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Unit (optional) */}
            <div className="space-y-2">
              <Label>{t("table.unit")} ({t("common.optional")})</Label>
              <Select value={form.unitId ?? "__none__"} onValueChange={v => setForm({ ...form, unitId: v === "__none__" ? null : v, allocationRuleId: v === "__none__" ? form.allocationRuleId : null })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("costs.propertyLevel")}</SelectItem>
                  {propertyUnits.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.unitLabel} ({u.unitCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Label */}
            <div className="space-y-2">
              <Label>{t("costs.label")} *</Label>
              <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
            </div>
            {/* Description */}
            <div className="space-y-2">
              <Label>{t("common.description")}</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            {/* Frequency */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("costs.frequency")}</Label>
                <Select value={form.frequency} onValueChange={v => setForm({ ...form, frequency: v as CostFrequency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(COST_FREQUENCY_LABELS) as CostFrequency[]).map(f => (
                      <SelectItem key={f} value={f}>{frequencyLabel(f)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("costs.amount")} *</Label>
                <Input type="number" min={0} step={0.01} value={form.amount || ""} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("costs.startDate")}</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("costs.endDate")}</Label>
                <Input type="date" value={form.endDate ?? ""} onChange={e => setForm({ ...form, endDate: e.target.value || null })} />
              </div>
            </div>
            {/* Recovery Type */}
            <div className="space-y-2">
              <Label>{t("costs.recoveryType")}</Label>
              <Select value={form.recoveryType} onValueChange={v => setForm({ ...form, recoveryType: v as RecoveryType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(RECOVERY_TYPE_LABELS) as RecoveryType[]).map(r => (
                    <SelectItem key={r} value={r}>{recoveryLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Allocation Rule (only for property-level) */}
            {!form.unitId && form.propertyId && (
              <div className="space-y-2">
                <Label>{t("costs.allocationRule")}</Label>
                <Select value={form.allocationRuleId ?? "__none__"} onValueChange={v => setForm({ ...form, allocationRuleId: v === "__none__" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("common.none")}</SelectItem>
                    {propertyRules.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Vendor & Invoice */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("costs.vendorName")}</Label>
                <Input value={form.vendorName} onChange={e => setForm({ ...form, vendorName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("costs.invoiceReference")}</Label>
                <Input value={form.invoiceReference} onChange={e => setForm({ ...form, invoiceReference: e.target.value })} />
              </div>
            </div>
            {/* Status */}
            <div className="space-y-2">
              <Label>{t("filter.status")}</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as CostEntryStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(COST_ENTRY_STATUS_LABELS) as CostEntryStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Notes */}
            <div className="space-y-2">
              <Label>{t("common.notes")}</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{editing ? t("action.saveChanges") : t("action.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
