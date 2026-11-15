import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/FormField";
import { DateInput } from "@/components/shared/DateInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import {
  CostEntry, CostEntryStatus, CostFrequency, CostNature, RecoveryType, CostRecognitionMode,
  COST_ENTRY_STATUS_LABELS, COST_FREQUENCY_LABELS, RECOVERY_TYPE_LABELS, COST_RECOGNITION_MODE_LABELS,
} from "@/types/costs";
import type { TranslationKey } from "@/i18n/translations";
import { validateDateOrder } from "@/lib/dateValidation";
import { positiveNumber } from "@/lib/validation";
import { getManagedOwnershipShare } from "@/lib/propertyOwnership";
import { validRecoverablePercentage } from "@/lib/costRecovery";

type FormData = Omit<CostEntry, "id" | "createdAt" | "updatedAt">;
type CostEntryErrorKey = "categoryId" | "propertyId" | "label" | "amount" | "startDate" | "amortizationStartDate" | "amortizationEndDate" | "recoverablePercentage";

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
  recognitionMode: "immediate",
  amortizationStartDate: null,
  amortizationEndDate: null,
  isTax: false,
  recoveryType: "owner-only",
  recoverablePercentage: null,
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
    addCostEntryPersisted, updateCostEntry, getCostCategoryById,
  } = useAppData();
  const { t } = useSettings();
  const { toast } = useToast();

  const natureLabel = (n: CostNature) => t(`costs.nature.${n}` as TranslationKey);
  const recoveryLabel = (r: RecoveryType) => t(`costs.recovery.${r}` as TranslationKey);
  const frequencyLabel = (f: CostFrequency) => t(`costs.frequency.${f}` as TranslationKey);
  const statusLabel = (s: CostEntryStatus) => t(`costs.entryStatus.${s}` as TranslationKey);
  const recognitionLabel = (m: CostRecognitionMode) => COST_RECOGNITION_MODE_LABELS[m];

  const [form, setForm] = useState<FormData>(() => buildEmpty(prefillPropertyId, prefillUnitId));
  const [errors, setErrors] = useState<Partial<Record<CostEntryErrorKey, string>>>({});

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const { id, createdAt, updatedAt, ...rest } = editing;
      setForm({
        ...rest,
        recoverablePercentage: editing.recoveryType === "partially-recoverable"
          ? editing.recoverablePercentage ?? 50
          : null,
      });
    } else {
      const initial = buildEmpty(prefillPropertyId, prefillUnitId);
      const prop = prefillPropertyId ? properties.find(p => p.id === prefillPropertyId) : undefined;
      if (prop) initial.currencyCode = prop.currencyCode;
      setForm(initial);
    }
    setErrors({});
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
  const selectedProperty = useMemo(
    () => properties.find(p => p.id === form.propertyId),
    [form.propertyId, properties],
  );
  const ownershipPreview = useMemo(() => {
    if (!selectedProperty) return null;
    return getManagedOwnershipShare(selectedProperty, units, selectedProperty.id);
  }, [selectedProperty, units]);
  const amountValid = positiveNumber(form.amount);
  const handleSave = async () => {
    const nextErrors: Partial<Record<CostEntryErrorKey, string>> = {};
    if (!form.categoryId) nextErrors.categoryId = t("common.mandatoryField");
    if (!form.propertyId) nextErrors.propertyId = t("common.mandatoryField");
    if (!form.label.trim()) nextErrors.label = t("common.mandatoryField");
    if (!amountValid) nextErrors.amount = t("common.positiveAmount");
    if (!form.startDate) nextErrors.startDate = t("common.mandatoryField");
    if (form.recoveryType === "partially-recoverable" && form.recoverablePercentage == null) {
      nextErrors.recoverablePercentage = t("common.mandatoryField");
    } else if (!validRecoverablePercentage(form.recoveryType, form.recoverablePercentage)) {
      nextErrors.recoverablePercentage = t("costs.recoverablePercentageInvalid");
    }
    if (form.recognitionMode === "amortized") {
      if (!form.amortizationStartDate) nextErrors.amortizationStartDate = t("common.mandatoryField");
      if (!form.amortizationEndDate) nextErrors.amortizationEndDate = t("common.mandatoryField");
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast({ title: t("common.validationError"), description: t("common.fixHighlightedFields"), variant: "destructive" });
      return;
    }
    const dateErrors = validateDateOrder([
      { earlier: form.startDate, later: form.endDate, message: t("validation.dates.endBeforeStart") },
      { earlier: form.amortizationStartDate, later: form.amortizationEndDate, message: "Amortization end date cannot be before amortization start date." },
    ]);
    if (dateErrors.length > 0) {
      toast({ title: t("validation.dates.title"), description: dateErrors.join(" "), variant: "destructive" });
      return;
    }
    const category = getCostCategoryById(form.categoryId);
    const entry = {
      ...form,
      isTax: category?.nature === "tax",
      recoverablePercentage: form.recoveryType === "partially-recoverable"
        ? form.recoverablePercentage
        : editing?.recoveryType === "partially-recoverable" ? null : undefined,
      amortizationStartDate: form.recognitionMode === "amortized" ? form.amortizationStartDate : null,
      amortizationEndDate: form.recognitionMode === "amortized" ? form.amortizationEndDate : null,
    };
    try {
      if (editing) {
        await updateCostEntry({ ...editing, ...entry });
        toast({ title: t("common.updated"), description: form.label });
      } else {
        await addCostEntryPersisted(entry);
        toast({ title: t("common.added"), description: form.label });
      }
    } catch (err) {
      toast({ title: t("common.validationError"), description: err instanceof Error ? err.message : "Cost entry could not be saved.", variant: "destructive" });
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t("costs.editEntry") : t("costs.addEntry")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <FormField label={t("table.category")} required error={errors.categoryId}>
            <Select value={form.categoryId} onValueChange={v => {
              const cat = costCategories.find(c => c.id === v);
              const recoveryType = cat?.recoveryTypeDefault ?? form.recoveryType;
              setForm({
                ...form,
                categoryId: v,
                isTax: cat?.nature === "tax",
                recoveryType,
                recoverablePercentage: recoveryType === "partially-recoverable" && form.recoveryType === "partially-recoverable"
                  ? form.recoverablePercentage : null,
                recognitionMode: cat?.recognitionModeDefault ?? form.recognitionMode ?? "immediate",
              });
            }}>
              <SelectTrigger aria-invalid={!!errors.categoryId}><SelectValue placeholder={t("costs.selectCategory")} /></SelectTrigger>
              <SelectContent>
                {costCategories.filter(c => c.isActive).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({natureLabel(c.nature)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("table.property")} required error={errors.propertyId}>
            <Select
              value={form.propertyId}
              onValueChange={v => {
                const prop = properties.find(p => p.id === v);
                setForm({ ...form, propertyId: v, unitId: null, allocationRuleId: null, currencyCode: prop?.currencyCode ?? "EUR" });
              }}
              disabled={lockPropertyAndUnit}
            >
              <SelectTrigger aria-invalid={!!errors.propertyId}><SelectValue placeholder={t("costs.selectProperty")} /></SelectTrigger>
              <SelectContent>
                {properties.filter(p => p.status === "active").map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
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
          <FormField label={t("costs.label")} required error={errors.label}>
            <Input value={form.label} aria-invalid={!!errors.label} onChange={e => setForm({ ...form, label: e.target.value })} />
          </FormField>
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
            <FormField label={t("costs.amount")} required error={errors.amount}>
              <Input type="number" min={0} step={0.01} value={form.amount || ""} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} aria-invalid={!!errors.amount} />
            </FormField>
          </div>
          <div className="space-y-2">
            <Label>Recognition</Label>
            <Select value={form.recognitionMode ?? "immediate"} onValueChange={v => setForm({ ...form, recognitionMode: v as CostRecognitionMode })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(COST_RECOGNITION_MODE_LABELS) as CostRecognitionMode[]).map(mode => (
                  <SelectItem key={mode} value={mode}>{recognitionLabel(mode)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">The full invoice amount is recorded, but the cost is spread over the selected period when calculating profitability.</p>
          </div>
          {(form.recognitionMode ?? "immediate") === "amortized" && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Amortization start" required error={errors.amortizationStartDate}>
                <DateInput value={form.amortizationStartDate ?? ""} aria-invalid={!!errors.amortizationStartDate} onChange={value => setForm({ ...form, amortizationStartDate: value || null })} />
              </FormField>
              <FormField label="Amortization end" required error={errors.amortizationEndDate}>
                <DateInput value={form.amortizationEndDate ?? ""} aria-invalid={!!errors.amortizationEndDate} onChange={value => setForm({ ...form, amortizationEndDate: value || null })} />
              </FormField>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("costs.startDate")} required error={errors.startDate}>
              <DateInput value={form.startDate} aria-invalid={!!errors.startDate} onChange={value => setForm({ ...form, startDate: value })} />
            </FormField>
            <div className="space-y-2">
              <Label>{t("costs.endDate")}</Label>
              <DateInput value={form.endDate ?? ""} onChange={value => setForm({ ...form, endDate: value || null })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("costs.recoveryType")}</Label>
            <Select value={form.recoveryType} onValueChange={v => setForm({ ...form, recoveryType: v as RecoveryType, recoverablePercentage: v === "partially-recoverable" ? form.recoverablePercentage : null })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(RECOVERY_TYPE_LABELS) as RecoveryType[]).map(r => (
                  <SelectItem key={r} value={r}>{recoveryLabel(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.recoveryType === "partially-recoverable" && (
            <FormField label={t("costs.recoverablePercentage")} required error={errors.recoverablePercentage}>
              <Input
                type="number"
                min="0.01"
                max="99.99"
                step="0.01"
                value={form.recoverablePercentage ?? ""}
                onChange={event => setForm({ ...form, recoverablePercentage: event.target.value === "" ? null : Number(event.target.value) })}
                aria-invalid={!!errors.recoverablePercentage}
              />
            </FormField>
          )}
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
          {!form.unitId && selectedProperty?.isPartiallyOwned && ownershipPreview && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              {t("costs.partialOwnershipInvoiceNote")
                .replace("{shares}", String(ownershipPreview.ownedShares))
                .replace("{base}", String(ownershipPreview.base))
                .replace("{percent}", (ownershipPreview.ratio * 100).toFixed(2))}
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
