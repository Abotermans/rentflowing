import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  CostEntry, CostEntryStatus, CostFrequency, CostNature, RecoveryType,
  COST_ENTRY_STATUS_LABELS, COST_FREQUENCY_LABELS, RECOVERY_TYPE_LABELS,
} from "@/types/costs";
import type { TranslationKey } from "@/i18n/translations";
import { validateDateOrder } from "@/lib/dateValidation";

type FormData = Omit<CostEntry, "id" | "createdAt" | "updatedAt">;

const buildEmpty = (prefillPropertyId?: string, prefillUnitId?: string | null): FormData => ({
  categoryId: "",
  propertyId: prefillPropertyId ?? "",
  unitId: prefillUnitId ?? null,
  label: "",
  description: "",
  frequency: "monthly",
  startDate: "",
  endDate: null,
  amount: 0,
  currencyCode: "EUR",
  isTax: false,
  recoveryType: "owner-only",
  allocationRuleId: null,
  vendorName: "",
  invoiceReference: "",
  status: "draft",
  notes: "",
});

interface CostEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: CostEntry | null;
  prefillPropertyId?: string;
  prefillUnitId?: string | null;
  lockPropertyAndUnit?: boolean;
}

export function CostEntryDialog({
  open, onOpenChange, editing = null,
  prefillPropertyId, prefillUnitId, lockPropertyAndUnit = false,
}: CostEntryDialogProps) {
  const {
    costCategories, properties, units, allocationRules,
    addCostEntry, updateCostEntry, getCostCategoryById,
  } = useAppData();
  const { t } = useSettings();
  const { toast } = useToast();

  const natureLabel = (n: CostNature) => t(`costs.nature.${n}` as TranslationKey);
  const recoveryLabel = (r: RecoveryType) => t(`costs.recovery.${r}` as TranslationKey);
  const frequencyLabel = (f: CostFrequency) => t(`costs.frequency.${f}` as TranslationKey);
  const statusLabel = (s: CostEntryStatus) => t(`costs.entryStatus.${s}` as TranslationKey);

  const [form, setForm] = useState<FormData>(() => buildEmpty(prefillPropertyId, prefillUnitId));

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const { id, createdAt, updatedAt, ...rest } = editing;
      setForm(rest);
    } else {
      const initial = buildEmpty(prefillPropertyId, prefillUnitId);
      const prop = prefillPropertyId ? properties.find(p => p.id === prefillPropertyId) : undefined;
      if (prop) initial.currencyCode = prop.currencyCode;
      setForm(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, prefillPropertyId, prefillUnitId]);

  const propertyUnits = useMemo(() => {
    if (!form.propertyId) return [];
    return units.filter(u => u.propertyId === form.propertyId);
  }, [form.propertyId, units]);

  const propertyRules = useMemo(() => {
    if (!form.propertyId) return [];
    return allocationRules.filter(r => r.propertyId === form.propertyId);
  }, [form.propertyId, allocationRules]);

  const handleSave = () => {
    if (!form.label.trim() || !form.propertyId || !form.categoryId || form.amount <= 0) {
      toast({ title: t("common.validationError"), description: t("costs.validation.entryRequired"), variant: "destructive" });
      return;
    }
    if (!form.startDate) {
      toast({ title: t("common.validationError"), description: t("validation.dates.startDateRequired"), variant: "destructive" });
      return;
    }
    const dateErrors = validateDateOrder([
      { earlier: form.startDate, later: form.endDate, message: t("validation.dates.endBeforeStart") },
    ]);
    if (dateErrors.length > 0) {
      toast({ title: t("validation.dates.title"), description: dateErrors.join(" "), variant: "destructive" });
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
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? t("costs.editEntry") : t("costs.addEntry")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
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
          <div className="space-y-2">
            <Label>{t("table.property")} *</Label>
            <Select
              value={form.propertyId}
              onValueChange={v => {
                const prop = properties.find(p => p.id === v);
                setForm({ ...form, propertyId: v, unitId: null, allocationRuleId: null, currencyCode: prop?.currencyCode ?? "EUR" });
              }}
              disabled={lockPropertyAndUnit}
            >
              <SelectTrigger><SelectValue placeholder={t("costs.selectProperty")} /></SelectTrigger>
              <SelectContent>
                {properties.filter(p => p.status === "active").map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("table.unit")} ({t("common.optional")})</Label>
            <Select
              value={form.unitId ?? "__none__"}
              onValueChange={v => setForm({ ...form, unitId: v === "__none__" ? null : v, allocationRuleId: v === "__none__" ? form.allocationRuleId : null })}
              disabled={lockPropertyAndUnit}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("costs.propertyLevel")}</SelectItem>
                {propertyUnits.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.unitLabel} ({u.unitCode})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("costs.label")} *</Label>
            <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t("common.description")}</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("costs.startDate")} *</Label>
              <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("costs.endDate")}</Label>
              <Input type="date" value={form.endDate ?? ""} onChange={e => setForm({ ...form, endDate: e.target.value || null })} />
            </div>
          </div>
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
          <div className="space-y-2">
            <Label>{t("common.notes")}</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("action.cancel")}</Button>
          <Button onClick={handleSave}>{editing ? t("action.saveChanges") : t("action.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}