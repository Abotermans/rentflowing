import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { useOverrideHistory } from "@/context/OverrideContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tenant, TenantStatus } from "@/types";
import { canChangeTenantStatus } from "@/lib/integrity/tenantIntegrity";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";
import { OverrideConfirmDialog } from "@/components/shared/OverrideConfirmDialog";
import type { ValidationResult } from "@/lib/integrity/types";

type TenantFormData = Omit<Tenant, "id" | "createdAt" | "updatedAt">;

const TENANT_STATUSES: { value: TenantStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "former", label: "Former" },
  { value: "applicant", label: "Applicant" },
];

const emptyForm: TenantFormData = {
  firstName: "", lastName: "", email: "", phone: "",
  dateOfBirth: null, identificationNumber: null, currentAddress: null,
  status: "active", notes: "",
};

interface TenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTenant?: Tenant | null;
}

export function TenantDialog({ open, onOpenChange, editingTenant = null }: TenantDialogProps) {
  const { addTenant, updateTenant } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();

  const [form, setForm] = useState<TenantFormData>({ ...emptyForm });
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverrideValidation, setPendingOverrideValidation] = useState<ValidationResult | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editingTenant) {
      const { id, createdAt, updatedAt, ...rest } = editingTenant;
      setForm(rest);
    } else {
      setForm({ ...emptyForm });
    }
  }, [open, editingTenant]);

  const tenantStatusValidation = (() => {
    if (!editingTenant || form.status === editingTenant.status) return null;
    return canChangeTenantStatus(editingTenant.id, form.status, integrityState);
  })();

  const executeSave = () => {
    if (editingTenant) {
      updateTenant({ ...editingTenant, ...form });
      toast({ title: "Tenant updated" });
    } else {
      addTenant(form);
      toast({ title: "Tenant added" });
    }
    onOpenChange(false);
  };

  const handleSave = () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      toast({ title: "Validation Error", description: "First name, last name, and email are required.", variant: "destructive" });
      return;
    }
    if (editingTenant && form.status !== editingTenant.status) {
      const validation = canChangeTenantStatus(editingTenant.id, form.status, integrityState);
      if (!validation.allowed) {
        if (validation.overrideAllowed) {
          setPendingOverrideValidation(validation);
          setOverrideDialogOpen(true);
          return;
        }
        toast({ title: "Status change blocked", description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
        return;
      }
    }
    executeSave();
  };

  const handleOverrideConfirm = (reason: string) => {
    if (!editingTenant || !pendingOverrideValidation) return;
    addOverride({
      entityType: "tenant",
      entityId: editingTenant.id,
      action: `status_change:${form.status}`,
      blockerCodes: pendingOverrideValidation.blockers.map(b => b.code),
      reason,
    });
    updateTenant({ ...editingTenant, ...form });
    onOpenChange(false);
    toast({ title: "Tenant updated (overridden)", description: `Override reason: ${reason}` });
    setPendingOverrideValidation(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTenant ? t("tenants.edit") : t("tenants.add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-6">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("tenants.firstName")} *</Label><Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
              <div><Label>{t("tenants.lastName")} *</Label><Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            </div>
            <div><Label>{t("tenants.email")} *</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>{t("tenants.phone")}</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("tenants.dateOfBirth")}</Label><Input type="date" value={form.dateOfBirth ?? ""} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value || null }))} /></div>
              <div><Label>{t("filter.status")} *</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as TenantStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TENANT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
                <StatusTransitionAlert validation={tenantStatusValidation} />
              </div>
            </div>
            <div><Label>{t("tenants.identificationNumber")}</Label><Input value={form.identificationNumber ?? ""} onChange={e => setForm(f => ({ ...f, identificationNumber: e.target.value || null }))} /></div>
            <div><Label>{t("tenants.currentAddress")}</Label><Textarea value={form.currentAddress ?? ""} onChange={e => setForm(f => ({ ...f, currentAddress: e.target.value || null }))} rows={2} /></div>
            <div><Label>{t("common.notes")}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{editingTenant ? t("action.save") : t("tenants.add")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingOverrideValidation && (
        <OverrideConfirmDialog
          open={overrideDialogOpen}
          onOpenChange={(v) => { setOverrideDialogOpen(v); if (!v) setPendingOverrideValidation(null); }}
          validation={pendingOverrideValidation}
          actionLabel="Override and Save"
          onOverride={handleOverrideConfirm}
        />
      )}
    </>
  );
}
