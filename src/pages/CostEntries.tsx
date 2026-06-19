import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { PROPERTY_ICON, COST_NATURE_ICONS, RECOVERY_TYPE_ICONS } from "@/lib/filterIcons";
import { Tag, Shield } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { Receipt, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  CostEntry, CostEntryStatus, CostFrequency, CostNature, RecoveryType,
  COST_NATURE_LABELS, COST_ENTRY_STATUS_LABELS, RECOVERY_TYPE_LABELS,
} from "@/types/costs";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";
import type { TranslationKey } from "@/i18n/translations";
import { CostEntryDialog } from "@/components/costs/CostEntryDialog";

export default function CostEntries() {
  const {
    costEntries, properties, deleteCostEntry,
    getPropertyById, getUnitById, getCostCategoryById, getAllocationRuleById,
  } = useAppData();
  const { t } = useSettings();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const natureLabel = (n: CostNature) => t(`costs.nature.${n}` as TranslationKey);
  const recoveryLabel = (r: RecoveryType) => t(`costs.recovery.${r}` as TranslationKey);
  const frequencyLabel = (f: CostFrequency) => t(`costs.frequency.${f}` as TranslationKey);

  const [search, setSearch] = useState("");
  const [filterProperty, setFilterProperty] = useState<string[]>([]);
  const [filterNature, setFilterNature] = useState<string[]>([]);
  const [filterRecovery, setFilterRecovery] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CostEntry | null>(null);

  type ESortKey = "label" | "category" | "nature" | "property" | "unit" | "frequency" | "amount" | "recovery" | "period";
  const { sort, toggle } = useTableSort<ESortKey>();

  const openAdd = () => { setEditing(null); setSheetOpen(true); };
  const openEdit = (e: CostEntry) => { setEditing(e); setSheetOpen(true); };

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

  const handleDelete = (id: string) => {
    deleteCostEntry(id);
    toast({ title: t("common.deleted") });
  };

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
      case "period": return e.startDate;
    }
  });

  const { pageItems, page, pageSize, setPage, setPageSize, total, totalPages, from, to } = usePagination(sorted);

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
                  <SortableTableHead sortKey="period" sort={sort} onSort={toggle}>{t("costs.period")}</SortableTableHead>
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
                      <TableCell className="text-muted-foreground">{e.label}</TableCell>
                      <TableCell className="text-muted-foreground">{cat?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{natureLabel(e.isTax ? "tax" : "charge")}</TableCell>
                      <TableCell className="text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{unit ? unit.unitLabel : t("costs.propertyLevel")}</TableCell>
                      <TableCell className="text-muted-foreground">{frequencyLabel(e.frequency)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCurrency(e.amount, e.currencyCode)}</TableCell>
                      <TableCell className="text-muted-foreground">{recoveryLabel(e.recoveryType)}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatDate(e.startDate)} – {e.endDate ? formatDate(e.endDate) : "—"}
                      </TableCell>
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

      <CostEntryDialog open={sheetOpen} onOpenChange={setSheetOpen} editing={editing} />
    </div>
  );
}
