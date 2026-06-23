import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Coins, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { COST_NATURE_ICONS, COST_SCOPE_ICONS } from "@/lib/filterIcons";
import { Tag, Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/context/SettingsContext";
import { CostCategory, CostNature, CostScope, RecoveryType, COST_NATURE_LABELS, COST_SCOPE_LABELS, RECOVERY_TYPE_LABELS } from "@/types/costs";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";
import type { TranslationKey } from "@/i18n/translations";
import { normalizedCode } from "@/lib/validation";

type FormData = Omit<CostCategory, "id" | "createdAt" | "updatedAt">;

export default function CostCategories() {
  const { costCategories, addCostCategoryPersisted, updateCostCategory, deleteCostCategory } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const natureLabel = (n: CostNature) => t(`costs.nature.${n}` as TranslationKey);
  const scopeLabel = (s: CostScope) => t(`costs.scope.${s}` as TranslationKey);
  const recoveryLabel = (r: RecoveryType) => t(`costs.recovery.${r}` as TranslationKey);
  const [search, setSearch] = useState("");
  const [filterNature, setFilterNature] = useState<string[]>([]);
  const [filterScope, setFilterScope] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CostCategory | null>(null);

  type CSortKey = "code" | "name" | "nature" | "scope" | "recovery" | "status";
  const { sort, toggle } = useTableSort<CSortKey>();

  const emptyForm: FormData = {
    code: "", name: "", nature: "charge", scope: "property",
    recoveryTypeDefault: "owner-only", description: "", isActive: true,
  };
  const [form, setForm] = useState<FormData>({ ...emptyForm });

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm }); setSheetOpen(true); };
  const openEdit = (c: CostCategory) => {
    setEditing(c);
    const { id, createdAt, updatedAt, ...rest } = c;
    setForm(rest);
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: t("common.validationError"), description: t("costs.validation.categoryRequired"), variant: "destructive" });
      return;
    }
    const duplicateCode = costCategories.some(c =>
      c.id !== editing?.id &&
      normalizedCode(c.code) === normalizedCode(form.code),
    );
    if (duplicateCode) {
      toast({ title: t("common.validationError"), description: "Cost category codes must be unique.", variant: "destructive" });
      return;
    }
    const payload = { ...form, code: form.code.trim(), name: form.name.trim() };
    if (editing) {
      updateCostCategory({ ...editing, ...payload });
      toast({ title: t("common.updated"), description: payload.name });
    } else {
      try {
        await addCostCategoryPersisted(payload);
        toast({ title: t("common.added"), description: payload.name });
      } catch (err) {
        toast({
          title: t("common.validationError"),
          description: err instanceof Error ? err.message : "Cost category could not be saved.",
          variant: "destructive",
        });
        return;
      }
    }
    setSheetOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteCostCategory(id);
    toast({ title: t("common.deleted") });
  };

  const filtered = costCategories.filter(c => {
    if (search) {
      const s = search.toLowerCase();
      if (!c.code.toLowerCase().includes(s) && !c.name.toLowerCase().includes(s)) return false;
    }
    if (filterNature.length > 0 && !filterNature.includes(c.nature)) return false;
    if (filterScope.length > 0 && !filterScope.includes(c.scope)) return false;
    return true;
  });

  const sorted = sortRows(filtered, sort, (c, key) => {
    switch (key) {
      case "code": return c.code;
      case "name": return c.name;
      case "nature": return c.nature;
      case "scope": return scopeLabel(c.scope);
      case "recovery": return recoveryLabel(c.recoveryTypeDefault);
      case "status": return c.isActive ? 1 : 0;
    }
  });

  const { pageItems, page, pageSize, setPage, setPageSize, total, totalPages, from, to } = usePagination(sorted);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("costs.categories")}</h1>
          <p className="text-sm text-muted-foreground">{t("costs.categoriesSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative inline-flex">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("action.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 min-w-[180px] max-w-[400px] [field-sizing:content]" />
          </div>
          <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" />{t("costs.addCategory")}</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
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
          label={t("costs.scope")}
          icon={Building2}
          values={filterScope}
          onChange={setFilterScope}
          options={(Object.keys(COST_SCOPE_LABELS) as CostScope[]).map(s => ({
            value: s, label: scopeLabel(s), icon: COST_SCOPE_ICONS[s],
          }))}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState icon={Coins} title={t("costs.noCategories")} description={t("costs.noCategoriesDesc")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="code" sort={sort} onSort={toggle}>{t("costs.code")}</SortableTableHead>
                  <SortableTableHead sortKey="name" sort={sort} onSort={toggle}>{t("common.name")}</SortableTableHead>
                  <SortableTableHead sortKey="nature" sort={sort} onSort={toggle}>{t("costs.nature")}</SortableTableHead>
                  <SortableTableHead sortKey="scope" sort={sort} onSort={toggle}>{t("costs.scope")}</SortableTableHead>
                  <SortableTableHead sortKey="recovery" sort={sort} onSort={toggle}>{t("costs.defaultRecovery")}</SortableTableHead>
                  <SortableTableHead sortKey="status" sort={sort} onSort={toggle}>{t("filter.status")}</SortableTableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.code}</TableCell>
                    <TableCell className="text-muted-foreground">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{natureLabel(c.nature)}</TableCell>
                    <TableCell className="text-muted-foreground">{scopeLabel(c.scope)}</TableCell>
                    <TableCell className="text-muted-foreground">{recoveryLabel(c.recoveryTypeDefault)}</TableCell>
                    <TableCell><StatusBadge status={c.isActive ? "active" : "inactive"} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${c.name}`} title={`Edit ${c.name}`} onClick={() => openEdit(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <DeleteDialog
                          entityType="cost-category"
                          entityId={c.id}
                          entityLabel={c.name}
                          onDelete={handleDelete}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t("costs.editCategory") : t("costs.addCategory")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("costs.code")} *</Label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. PTAX" />
            </div>
            <div className="space-y-2">
              <Label>{t("common.name")} *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Property Tax" />
            </div>
            <div className="space-y-2">
              <Label>{t("costs.nature")}</Label>
              <Select value={form.nature} onValueChange={v => setForm({ ...form, nature: v as CostNature })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(COST_NATURE_LABELS) as CostNature[]).map(n => (
                    <SelectItem key={n} value={n}>{natureLabel(n)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("costs.scope")}</Label>
              <Select value={form.scope} onValueChange={v => setForm({ ...form, scope: v as CostScope })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(COST_SCOPE_LABELS) as CostScope[]).map(s => (
                    <SelectItem key={s} value={s}>{scopeLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("costs.defaultRecovery")}</Label>
              <Select value={form.recoveryTypeDefault} onValueChange={v => setForm({ ...form, recoveryTypeDefault: v as RecoveryType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(RECOVERY_TYPE_LABELS) as RecoveryType[]).map(r => (
                    <SelectItem key={r} value={r}>{recoveryLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("common.description")}</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} />
              <Label>{t("status.active")}</Label>
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
