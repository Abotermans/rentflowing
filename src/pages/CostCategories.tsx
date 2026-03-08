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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/context/SettingsContext";
import { CostCategory, CostNature, CostScope, RecoveryType, COST_NATURE_LABELS, COST_SCOPE_LABELS, RECOVERY_TYPE_LABELS } from "@/types/costs";

type FormData = Omit<CostCategory, "id" | "createdAt" | "updatedAt">;

export default function CostCategories() {
  const { costCategories, addCostCategory, updateCostCategory, deleteCostCategory } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const [search, setSearch] = useState("");
  const [filterNature, setFilterNature] = useState("all");
  const [filterScope, setFilterScope] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CostCategory | null>(null);

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

  const handleSave = () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: t("common.validationError"), description: "Code and name are required.", variant: "destructive" });
      return;
    }
    if (editing) {
      updateCostCategory({ ...editing, ...form });
      toast({ title: t("common.updated"), description: form.name });
    } else {
      addCostCategory(form);
      toast({ title: t("common.added"), description: form.name });
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
    if (filterNature !== "all" && c.nature !== filterNature) return false;
    if (filterScope !== "all" && c.scope !== filterScope) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("costs.categories")}</h1>
          <p className="text-sm text-muted-foreground">{t("costs.categoriesSubtitle")}</p>
        </div>
        <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" />{t("costs.addCategory")}</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("costs.searchCategories")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterNature} onValueChange={setFilterNature}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("costs.allNatures")}</SelectItem>
            {(Object.keys(COST_NATURE_LABELS) as CostNature[]).map(n => (
              <SelectItem key={n} value={n}>{COST_NATURE_LABELS[n]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterScope} onValueChange={setFilterScope}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("costs.allScopes")}</SelectItem>
            {(Object.keys(COST_SCOPE_LABELS) as CostScope[]).map(s => (
              <SelectItem key={s} value={s}>{COST_SCOPE_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                  <TableHead>{t("costs.code")}</TableHead>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("costs.nature")}</TableHead>
                  <TableHead>{t("costs.scope")}</TableHead>
                  <TableHead>{t("costs.defaultRecovery")}</TableHead>
                  <TableHead>{t("filter.status")}</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell><StatusBadge status={c.nature === "tax" ? "high" : "medium"} /></TableCell>
                    <TableCell className="text-sm">{COST_SCOPE_LABELS[c.scope]}</TableCell>
                    <TableCell className="text-sm">{RECOVERY_TYPE_LABELS[c.recoveryTypeDefault]}</TableCell>
                    <TableCell><StatusBadge status={c.isActive ? "active" : "inactive"} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("costs.deleteCategory")}?</AlertDialogTitle>
                              <AlertDialogDescription>{t("costs.deleteCategoryDesc")}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(c.id)}>{t("action.delete")}</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? t("costs.editCategory") : t("costs.addCategory")}</SheetTitle>
          </SheetHeader>
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
                    <SelectItem key={n} value={n}>{COST_NATURE_LABELS[n]}</SelectItem>
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
                    <SelectItem key={s} value={s}>{COST_SCOPE_LABELS[s]}</SelectItem>
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
                    <SelectItem key={r} value={r}>{RECOVERY_TYPE_LABELS[r]}</SelectItem>
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
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{editing ? t("action.saveChanges") : t("action.create")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
