import { useState, useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { Scale, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { AllocationRule, AllocationMethod, ALLOCATION_METHOD_LABELS, AllocationRuleUnitShare } from "@/types/costs";
import { DEFAULT_MILLIEME_KEY, getUnitMillieme } from "@/types";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";
import type { TranslationKey } from "@/i18n/translations";

type FormData = Omit<AllocationRule, "id" | "createdAt" | "updatedAt">;

const emptyForm: FormData = {
  propertyId: "", name: "", method: "equal",
  applyOnlyToOccupiedUnits: false, includeUnavailableUnits: false, notes: "",
  shareKey: null,
};

export default function AllocationRules() {
  const {
    allocationRules, allocationRuleUnitShares, properties, units,
    addAllocationRule, updateAllocationRule, deleteAllocationRule,
    setAllocationRuleUnitShares, getPropertyById,
  } = useAppData();
  const { t } = useSettings();
  const { toast } = useToast();
  const methodLabel = (m: AllocationMethod) => t(`costs.methodOpt.${m}` as TranslationKey);

  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AllocationRule | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [unitShares, setUnitSharesLocal] = useState<Record<string, number>>({});

  type RSortKey = "name" | "property" | "method" | "occupied" | "unavailable";
  const { sort, toggle } = useTableSort<RSortKey>();

  const openAdd = () => {
    setEditing(null); setForm({ ...emptyForm }); setUnitSharesLocal({}); setSheetOpen(true);
  };
  const openEdit = (r: AllocationRule) => {
    setEditing(r);
    const { id, createdAt, updatedAt, ...rest } = r;
    setForm(rest);
    // Load existing shares
    const shares: Record<string, number> = {};
    allocationRuleUnitShares.filter(s => s.allocationRuleId === r.id).forEach(s => {
      shares[s.unitId] = s.percentageShare ?? 0;
    });
    setUnitSharesLocal(shares);
    setSheetOpen(true);
  };

  const propertyUnits = useMemo(() => {
    if (!form.propertyId) return [];
    return units.filter(u => u.propertyId === form.propertyId);
  }, [form.propertyId, units]);

  const selectedProperty = useMemo(
    () => properties.find(p => p.id === form.propertyId),
    [properties, form.propertyId],
  );
  const propertyKeys = selectedProperty?.milliemeKeys?.length
    ? selectedProperty.milliemeKeys
    : [DEFAULT_MILLIEME_KEY];
  const milliemeBase = selectedProperty?.milliemeBase ?? 1000;

  const milliemePreview = useMemo(() => {
    if (form.method !== "millieme" || !form.propertyId) return null;
    const key = form.shareKey || DEFAULT_MILLIEME_KEY;
    let pool = propertyUnits;
    if (form.applyOnlyToOccupiedUnits) pool = pool.filter(u => u.currentStatus === "occupied");
    if (!form.includeUnavailableUnits) pool = pool.filter(u => u.currentStatus !== "unavailable");
    const rows = pool.map(u => ({ unit: u, share: getUnitMillieme(u, key) }));
    const includedSum = rows.filter(r => r.share > 0).reduce((s, r) => s + r.share, 0);
    const allUnitsSum = propertyUnits.reduce((s, u) => s + getUnitMillieme(u, key), 0);
    const zeroCount = rows.filter(r => r.share === 0).length;
    const excludedShares = allUnitsSum - includedSum;
    return { key, rows, includedSum, allUnitsSum, zeroCount, excludedShares };
  }, [form.method, form.propertyId, form.shareKey, form.applyOnlyToOccupiedUnits, form.includeUnavailableUnits, propertyUnits]);

  const totalPct = useMemo(() => {
    return Object.values(unitShares).reduce((sum, v) => sum + (v || 0), 0);
  }, [unitShares]);

  const handleSave = () => {
    if (!form.name.trim() || !form.propertyId) {
      toast({ title: t("common.validationError"), description: t("costs.validation.ruleRequired"), variant: "destructive" });
      return;
    }
    if (form.method === "manual-percentage" && Math.abs(totalPct - 100) > 0.01) {
      toast({ title: t("common.validationError"), description: t("costs.totalMustBe100"), variant: "destructive" });
      return;
    }
    if (form.method === "millieme") {
      const key = form.shareKey || DEFAULT_MILLIEME_KEY;
      if (!propertyKeys.includes(key)) {
        toast({ title: t("common.validationError"), description: t("costs.milliemeKeyMissing"), variant: "destructive" });
        return;
      }
      if (!milliemePreview || milliemePreview.includedSum <= 0) {
        toast({ title: t("common.validationError"), description: t("costs.milliemeNoShares"), variant: "destructive" });
        return;
      }
    }

    if (editing) {
      updateAllocationRule({ ...editing, ...form });
      if (form.method === "manual-percentage") {
        const shares: Omit<AllocationRuleUnitShare, "id">[] = Object.entries(unitShares).map(([unitId, pct]) => ({
          allocationRuleId: editing.id, unitId, percentageShare: pct, fixedAmountShare: null, coefficient: null,
        }));
        setAllocationRuleUnitShares(editing.id, shares);
      }
      toast({ title: t("common.updated"), description: form.name });
    } else {
      // We need the new rule ID for shares; addAllocationRule doesn't return it.
      // For now, add rule then set shares after (context generates ID internally).
      addAllocationRule(form);
      toast({ title: t("common.added"), description: form.name });
    }
    setSheetOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteAllocationRule(id);
    toast({ title: t("common.deleted") });
  };

  const filtered = allocationRules.filter(r => {
    if (search) {
      const s = search.toLowerCase();
      if (!r.name.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const sorted = sortRows(filtered, sort, (r, key) => {
    const prop = getPropertyById(r.propertyId);
    switch (key) {
      case "name": return r.name;
      case "property": return prop?.name ?? "";
      case "method": return methodLabel(r.method);
      case "occupied": return r.applyOnlyToOccupiedUnits ? 1 : 0;
      case "unavailable": return r.includeUnavailableUnits ? 1 : 0;
    }
  });

  const { pageItems, page, pageSize, setPage, setPageSize, total, totalPages, from, to } = usePagination(sorted);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("costs.allocationRules")}</h1>
          <p className="text-sm text-muted-foreground">{t("costs.allocationRulesSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative inline-flex">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("action.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 min-w-[180px] max-w-[400px] [field-sizing:content]" />
          </div>
          <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" />{t("costs.addRule")}</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState icon={Scale} title={t("costs.noRules")} description={t("costs.noRulesDesc")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="name" sort={sort} onSort={toggle}>{t("common.name")}</SortableTableHead>
                  <SortableTableHead sortKey="property" sort={sort} onSort={toggle}>{t("table.property")}</SortableTableHead>
                  <SortableTableHead sortKey="method" sort={sort} onSort={toggle}>{t("costs.method")}</SortableTableHead>
                  <SortableTableHead sortKey="occupied" sort={sort} onSort={toggle}>{t("costs.occupiedOnly")}</SortableTableHead>
                  <SortableTableHead sortKey="unavailable" sort={sort} onSort={toggle}>{t("costs.includeUnavailable")}</SortableTableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map(r => {
                  const prop = getPropertyById(r.propertyId);
                  return (
                    <TableRow key={r.id}>
                     <TableCell className="text-muted-foreground">{r.name}</TableCell>
                     <TableCell className="text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                     <TableCell className="text-muted-foreground">{methodLabel(r.method)}</TableCell>
                     <TableCell className="text-muted-foreground">{r.applyOnlyToOccupiedUnits ? t("common.yes") : t("common.no")}</TableCell>
                     <TableCell className="text-muted-foreground">{r.includeUnavailableUnits ? t("common.yes") : t("common.no")}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <DeleteDialog
                            entityType="allocation-rule"
                            entityId={r.id}
                            entityLabel={r.name}
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
            <DialogTitle>{editing ? t("costs.editRule") : t("costs.addRule")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("table.property")} *</Label>
              <Select value={form.propertyId} onValueChange={v => { setForm({ ...form, propertyId: v }); setUnitSharesLocal({}); }}>
                <SelectTrigger><SelectValue placeholder={t("costs.selectProperty")} /></SelectTrigger>
                <SelectContent>
                  {properties.filter(p => p.status === "active").map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("common.name")} *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("costs.method")}</Label>
              <Select value={form.method} onValueChange={v => setForm({ ...form, method: v as AllocationMethod })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ALLOCATION_METHOD_LABELS) as AllocationMethod[]).map(m => (
                    <SelectItem key={m} value={m}>{methodLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.applyOnlyToOccupiedUnits} onCheckedChange={v => setForm({ ...form, applyOnlyToOccupiedUnits: v })} />
              <Label>{t("costs.occupiedOnly")}</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.includeUnavailableUnits} onCheckedChange={v => setForm({ ...form, includeUnavailableUnits: v })} />
              <Label>{t("costs.includeUnavailable")}</Label>
            </div>
            <div className="space-y-2">
              <Label>{t("common.notes")}</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>

            {/* Manual percentage shares */}
            {form.method === "manual-percentage" && form.propertyId && (
              <div className="space-y-3 border-t border-border pt-4">
                <Label className="text-base font-semibold">{t("costs.unitShares")}</Label>
                {propertyUnits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("costs.noUnitsForProperty")}</p>
                ) : (
                  <>
                    {propertyUnits.map(u => (
                      <div key={u.id} className="flex items-center gap-3">
                        <span className="text-sm flex-1 truncate">{u.unitLabel} ({u.unitCode})</span>
                        <Input
                          type="number" min={0} max={100} step={0.01}
                          className="w-24 h-8 text-right"
                          value={unitShares[u.id] ?? ""}
                          onChange={e => setUnitSharesLocal({ ...unitShares, [u.id]: parseFloat(e.target.value) || 0 })}
                          placeholder="%"
                        />
                        <span className="text-xs text-muted-foreground w-4">%</span>
                      </div>
                    ))}
                    <div className={`text-sm font-medium ${Math.abs(totalPct - 100) > 0.01 ? "text-destructive" : "text-success"}`}>
                      {t("common.total")}: {totalPct.toFixed(1)}% {Math.abs(totalPct - 100) > 0.01 && `— ${t("costs.totalMustBe100")}`}
                    </div>
                  </>
                )}
              </div>
            )}
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
