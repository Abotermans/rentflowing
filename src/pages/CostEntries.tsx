import { useState, useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { CostsNav } from "@/components/costs/CostsNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Receipt, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import {
  CostEntry, CostEntryStatus, CostFrequency, CostNature, RecoveryType,
  COST_ENTRY_STATUS_LABELS, COST_FREQUENCY_LABELS, COST_NATURE_LABELS, RECOVERY_TYPE_LABELS,
} from "@/types/costs";

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

  const [search, setSearch] = useState("");
  const [filterProperty, setFilterProperty] = useState("all");
  const [filterNature, setFilterNature] = useState("all");
  const [filterRecovery, setFilterRecovery] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CostEntry | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm }); setSheetOpen(true); };
  const openEdit = (e: CostEntry) => {
    setEditing(e);
    const { id, createdAt, updatedAt, ...rest } = e;
    setForm(rest);
    setSheetOpen(true);
  };

  const handleSave = () => {
    if (!form.label.trim() || !form.propertyId || !form.categoryId || form.amount <= 0) {
      toast({ title: t("common.validationError"), description: "Label, category, property and amount are required.", variant: "destructive" });
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
    if (filterProperty !== "all" && e.propertyId !== filterProperty) return false;
    if (filterNature !== "all") {
      const cat = getCostCategoryById(e.categoryId);
      if (cat && cat.nature !== filterNature) return false;
    }
    if (filterRecovery !== "all" && e.recoveryType !== filterRecovery) return false;
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    return true;
  });

  const statusMap: Record<CostEntryStatus, string> = {
    draft: "draft", active: "active", cancelled: "cancelled", closed: "closed",
  };

  return (
    <div className="space-y-6">
      <CostsNav />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("costs.entries")}</h1>
          <p className="text-sm text-muted-foreground">{t("costs.entriesSubtitle")}</p>
        </div>
        <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" />{t("costs.addEntry")}</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("costs.searchEntries")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterProperty} onValueChange={setFilterProperty}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allProperties")}</SelectItem>
            {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterNature} onValueChange={setFilterNature}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("costs.allNatures")}</SelectItem>
            {(Object.keys(COST_NATURE_LABELS) as CostNature[]).map(n => (
              <SelectItem key={n} value={n}>{COST_NATURE_LABELS[n]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterRecovery} onValueChange={setFilterRecovery}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("costs.allRecoveryTypes")}</SelectItem>
            {(Object.keys(RECOVERY_TYPE_LABELS) as RecoveryType[]).map(r => (
              <SelectItem key={r} value={r}>{RECOVERY_TYPE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allStatuses")}</SelectItem>
            {(Object.keys(COST_ENTRY_STATUS_LABELS) as CostEntryStatus[]).map(s => (
              <SelectItem key={s} value={s}>{COST_ENTRY_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                  <TableHead>{t("costs.label")}</TableHead>
                  <TableHead>{t("table.category")}</TableHead>
                  <TableHead>{t("costs.nature")}</TableHead>
                  <TableHead>{t("table.property")}</TableHead>
                  <TableHead>{t("table.unit")}</TableHead>
                  <TableHead>{t("costs.frequency")}</TableHead>
                  <TableHead className="text-right">{t("costs.amount")}</TableHead>
                  <TableHead>{t("costs.recoveryType")}</TableHead>
                  <TableHead>{t("filter.status")}</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(e => {
                  const cat = getCostCategoryById(e.categoryId);
                  const prop = getPropertyById(e.propertyId);
                  const unit = e.unitId ? getUnitById(e.unitId) : null;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.label}</TableCell>
                      <TableCell className="text-sm">{cat?.name ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={e.isTax ? "high" : "medium"} /></TableCell>
                      <TableCell className="text-sm">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{unit ? unit.unitLabel : t("costs.propertyLevel")}</TableCell>
                      <TableCell className="text-sm">{COST_FREQUENCY_LABELS[e.frequency]}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(e.amount, e.currencyCode)}</TableCell>
                      <TableCell className="text-sm">{RECOVERY_TYPE_LABELS[e.recoveryType]}</TableCell>
                      <TableCell><StatusBadge status={statusMap[e.status] as any} /></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(e)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("costs.deleteEntry")}?</AlertDialogTitle>
                                <AlertDialogDescription>{t("costs.deleteEntryDesc")}</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(e.id)}>{t("action.delete")}</AlertDialogAction>
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
          )}
        </CardContent>
      </Card>

      {/* Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? t("costs.editEntry") : t("costs.addEntry")}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            {/* Category */}
            <div className="space-y-2">
              <Label>{t("table.category")} *</Label>
              <Select value={form.categoryId} onValueChange={v => {
                const cat = costCategories.find(c => c.id === v);
                setForm({ ...form, categoryId: v, isTax: cat?.nature === "tax", recoveryType: cat?.recoveryTypeDefault ?? form.recoveryType });
              }}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {costCategories.filter(c => c.isActive).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({COST_NATURE_LABELS[c.nature]})</SelectItem>
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
                <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
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
                      <SelectItem key={f} value={f}>{COST_FREQUENCY_LABELS[f]}</SelectItem>
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
                    <SelectItem key={r} value={r}>{RECOVERY_TYPE_LABELS[r]}</SelectItem>
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
                    <SelectItem key={s} value={s}>{COST_ENTRY_STATUS_LABELS[s]}</SelectItem>
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
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{editing ? t("action.saveChanges") : t("action.create")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
