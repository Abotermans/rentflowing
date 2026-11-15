import { useEffect, useState } from "react";
import { localTodayISO } from "@/lib/calendarToday";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/FormField";
import { PriorityLabel } from "@/components/shared/PriorityLabel";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DateInput } from "@/components/shared/DateInput";
import {
  Dialog, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getTenantFullName } from "@/types";
import { validateDateOrder } from "@/lib/dateValidation";
import {
  MaintenanceTicket, MaintenanceCategory, MaintenancePriority, MaintenanceStatus,
  MAINTENANCE_CATEGORY_KEYS, MAINTENANCE_PRIORITY_KEYS, MAINTENANCE_STATUS_KEYS,
} from "@/types/maintenance";

type TicketFormData = Omit<MaintenanceTicket, "id">;
type TicketErrorKey = "title" | "propertyId" | "unitId";

interface MaintenanceTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: MaintenanceTicket | null;
  prefillPropertyId?: string;
  prefillUnitId?: string;
  lockUnit?: boolean;
}

export function MaintenanceTicketDialog({
  open, onOpenChange, editing = null, prefillPropertyId, prefillUnitId, lockUnit = false,
}: MaintenanceTicketDialogProps) {
  const { properties, units, tenants, vendors, addTicketPersisted, updateTicket } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();

  const buildEmpty = (): TicketFormData => ({
    title: "",
    description: "",
    propertyId: prefillPropertyId ?? properties[0]?.id ?? "",
    unitId: prefillUnitId ?? "",
    tenantId: null,
    category: "general",
    priority: "medium",
    status: "open",
    createdDate: localTodayISO(),
    scheduledDate: null,
    completedDate: null,
    assignedVendorId: null,
    internalNotes: "",
    residentVisibleNotes: "",
  });

  const [form, setForm] = useState<TicketFormData>(buildEmpty());
  const [errors, setErrors] = useState<Partial<Record<TicketErrorKey, string>>>({});

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const { id, ...rest } = editing;
      setForm(rest);
    } else {
      setForm(buildEmpty());
    }
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, prefillPropertyId, prefillUnitId]);

  const formUnits = units.filter(u => u.propertyId === form.propertyId);
  const handleSave = async () => {
    if (properties.length === 0) {
      toast({ title: t("common.validationError"), description: "Create a property before opening a maintenance ticket.", variant: "destructive" });
      return;
    }
    if (formUnits.length === 0) {
      toast({ title: t("common.validationError"), description: "Create a unit for this property before opening a maintenance ticket.", variant: "destructive" });
      return;
    }
    const nextErrors: Partial<Record<TicketErrorKey, string>> = {};
    if (!form.title.trim()) nextErrors.title = t("common.mandatoryField");
    if (!form.propertyId) nextErrors.propertyId = t("common.mandatoryField");
    if (!form.unitId) nextErrors.unitId = t("common.mandatoryField");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast({ title: t("common.validationError"), description: t("common.fixHighlightedFields"), variant: "destructive" });
      return;
    }
    const dateErrors = validateDateOrder([
      { earlier: form.createdDate, later: form.scheduledDate, message: t("validation.dates.scheduledBeforeCreated") },
      { earlier: form.createdDate, later: form.completedDate, message: t("validation.dates.completedBeforeCreated") },
      { earlier: form.scheduledDate, later: form.completedDate, message: t("validation.dates.completedBeforeScheduled") },
    ]);
    if (dateErrors.length > 0) {
      toast({ title: t("validation.dates.title"), description: dateErrors.join(" "), variant: "destructive" });
      return;
    }
    try {
      if (editing) {
        await updateTicket({ ...editing, ...form });
        toast({ title: t("maintenance.toastUpdated") });
      } else {
        await addTicketPersisted(form);
        toast({ title: t("maintenance.toastCreated") });
      }
    } catch (err) {
      toast({ title: t("common.validationError"), description: err instanceof Error ? err.message : "Maintenance ticket could not be saved.", variant: "destructive" });
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? t("maintenance.edit") : t("maintenance.newTicket")}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-6">
          <FormField label={t("maintenance.titleField")} required error={errors.title}>
            <Input value={form.title} aria-invalid={!!errors.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={t("maintenance.briefPlaceholder")} />
          </FormField>
          <div><Label>{t("common.description")}</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t("maintenance.property")} required error={errors.propertyId}>
              <Select value={form.propertyId} onValueChange={v => setForm(f => ({ ...f, propertyId: v, unitId: "" }))} disabled={lockUnit}>
                <SelectTrigger aria-invalid={!!errors.propertyId}><SelectValue placeholder={t("maintenance.selectProperty")} /></SelectTrigger>
                <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t("maintenance.unit")} required error={errors.unitId}>
              <Select value={form.unitId} onValueChange={v => setForm(f => ({ ...f, unitId: v }))} disabled={lockUnit}>
                <SelectTrigger aria-invalid={!!errors.unitId}><SelectValue placeholder={t("maintenance.selectUnit")} /></SelectTrigger>
                <SelectContent>{formUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.unitCode} — {u.unitLabel}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
          </div>
          <div><Label>{t("maintenance.tenantOptional")}</Label>
            <Select value={form.tenantId ?? "none"} onValueChange={v => setForm(f => ({ ...f, tenantId: v === "none" ? null : v }))}>
              <SelectTrigger><SelectValue placeholder={t("maintenance.selectTenant")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("common.none")}</SelectItem>
                {tenants.map(tn => <SelectItem key={tn.id} value={tn.id}>{getTenantFullName(tn)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>{t("maintenance.category")}</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as MaintenanceCategory }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(MAINTENANCE_CATEGORY_KEYS) as MaintenanceCategory[]).map(c => <SelectItem key={c} value={c}>{t(MAINTENANCE_CATEGORY_KEYS[c])}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>{t("maintenance.priority")}</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as MaintenancePriority }))}>
                <SelectTrigger><PriorityLabel priority={form.priority} /></SelectTrigger>
                <SelectContent>{(Object.keys(MAINTENANCE_PRIORITY_KEYS) as MaintenancePriority[]).map(p => <SelectItem key={p} value={p} textValue={t(MAINTENANCE_PRIORITY_KEYS[p])}><PriorityLabel priority={p} /></SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>{t("maintenance.status")}</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as MaintenanceStatus }))}>
                <SelectTrigger><StatusBadge status={form.status} /></SelectTrigger>
                <SelectContent>{(Object.keys(MAINTENANCE_STATUS_KEYS) as MaintenanceStatus[]).map(s => <SelectItem key={s} value={s} textValue={t(MAINTENANCE_STATUS_KEYS[s])}><StatusBadge status={s} /></SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>{t("maintenance.assignedVendor")}</Label>
              <Select value={form.assignedVendorId ?? "none"} onValueChange={v => setForm(f => ({ ...f, assignedVendorId: v === "none" ? null : v }))}>
                <SelectTrigger><SelectValue placeholder={t("maintenance.selectVendor")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("maintenance.unassigned")}</SelectItem>
                  {vendors.filter(v => v.status === "active").map(v => <SelectItem key={v.id} value={v.id}>{v.vendorName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>{t("maintenance.scheduledDate")}</Label><DateInput value={form.scheduledDate ?? ""} onChange={value => setForm(f => ({ ...f, scheduledDate: value || null }))} /></div>
            <div><Label>{t("maintenance.completedDate")}</Label><DateInput value={form.completedDate ?? ""} onChange={value => setForm(f => ({ ...f, completedDate: value || null }))} /></div>
          </div>
          <div><Label>{t("maintenance.internalNotes")}</Label><Textarea value={form.internalNotes} onChange={e => setForm(f => ({ ...f, internalNotes: e.target.value }))} rows={3} /></div>
          <div><Label>{t("maintenance.residentNotes")}</Label><Textarea value={form.residentVisibleNotes} onChange={e => setForm(f => ({ ...f, residentVisibleNotes: e.target.value }))} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("action.cancel")}</Button>
          <Button onClick={handleSave}>{editing ? t("action.save") : t("maintenance.createTicket")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
