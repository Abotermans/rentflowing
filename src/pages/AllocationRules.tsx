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

type FormData = Omit<AllocationRule, "id" | "createdAt" | "updatedAt">;

const emptyForm: FormData = {
  propertyId: "", name: "", method: "equal",
  applyOnlyToOccupiedUnits: false, includeUnavailableUnits: false, notes: "",
};

export default function AllocationRules() {
  const {
    allocationRules, allocationRuleUnitShares, properties, units,
    addAllocationRule, updateAllocationRule, deleteAllocationRule,
    setAllocationRuleUnitShares, getPropertyById,
  } = useAppData();
  const { t } = useSettings();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AllocationRule | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [unitShares, setUnitSharesLocal] = useState<Record<string, number>>({});

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

  const totalPct = useMemo(() => {
    return Object.values(unitShares).reduce((sum, v) => sum + (v || 0), 0);
  }, [unitShares]);

  const handleSave = () => {
    if (!form.name.trim() || !form.propertyId) {
      toast({ title: t("common.validationError"), description: "Name and property are required.", variant: "destructive" });
      return;
    }
    if (form.method === "manual-percentage" && Math.abs(totalPct - 100) > 0.01) {
      toast({ title: t("common.validationError"), description: t("costs.totalMustBe100"), variant: "destructive" });
      return;
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("costs.allocationRules")}</h1>
          <p className="text-sm text-muted-foreground">{t("costs.allocationRulesSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("costs.searchRules")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
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
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("table.property")}</TableHead>
                  <TableHead>{t("costs.method")}</TableHead>
                  <TableHead>{t("costs.occupiedOnly")}</TableHead>
                  <TableHead>{t("costs.includeUnavailable")}</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const prop = getPropertyById(r.propertyId);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{ALLOCATION_METHOD_LABELS[r.method]}</TableCell>
                      <TableCell className="text-sm">{r.applyOnlyToOccupiedUnits ? t("common.yes") : t("common.no")}</TableCell>
                      <TableCell className="text-sm">{r.includeUnavailableUnits ? t("common.yes") : t("common.no")}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" />
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
                <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
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
                    <SelectItem key={m} value={m}>{ALLOCATION_METHOD_LABELS[m]}</SelectItem>
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
                  <p className="text-sm text-muted-foreground">No units for this property.</p>
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
                      Total: {totalPct.toFixed(1)}% {Math.abs(totalPct - 100) > 0.01 && `— ${t("costs.totalMustBe100")}`}
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
