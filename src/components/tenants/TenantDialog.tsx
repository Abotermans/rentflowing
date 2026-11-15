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
import { FormField } from "@/components/shared/FormField";
import { DateInput } from "@/components/shared/DateInput";
import {
  Dialog, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tenant, TenantStatus, TenantKind } from "@/types";
import { canChangeTenantStatus } from "@/lib/integrity/tenantIntegrity";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";
import { OverrideConfirmDialog } from "@/components/shared/OverrideConfirmDialog";
import type { ValidationResult } from "@/lib/integrity/types";
import { isValidEmail } from "@/lib/validation";
import { deriveTenantStatusFromLeases } from "@/lib/tenantStatus";

type TenantFormData = Omit<Tenant, "id" | "createdAt" | "updatedAt">;
type TenantErrorKey =
  | "firstName"
  | "lastName"
  | "companyName"
  | "contactFirstName"
  | "contactLastName"
  | "email";

const TENANT_STATUSES: { value: TenantStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "former", label: "Former" },
  { value: "applicant", label: "Applicant" },
];

const emptyForm: TenantFormData = {
  kind: "individual",
  firstName: "", lastName: "", email: "", phone: "",
  dateOfBirth: null, identificationNumber: null, currentAddress: null,
  status: "applicant", notes: "",
  companyName: null, legalForm: null, registrationNumber: null, vatNumber: null,
  contactFirstName: null, contactLastName: null, contactRole: null,
};

interface TenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTenant?: Tenant | null;
}

export function TenantDialog({ open, onOpenChange, editingTenant = null }: TenantDialogProps) {
  const { addTenantPersisted, updateTenantPersisted } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();

  const [form, setForm] = useState<TenantFormData>({ ...emptyForm });
  const [errors, setErrors] = useState<Partial<Record<TenantErrorKey, string>>>({});
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverrideValidation, setPendingOverrideValidation] = useState<ValidationResult | null>(null);
  const linkedStatus = editingTenant
    ? deriveTenantStatusFromLeases(integrityState.leases.filter(lease =>
      lease.primaryTenantId === editingTenant.id || lease.coTenantIds.includes(editingTenant.id)))
    : null;

  useEffect(() => {
    if (!open) return;
    if (editingTenant) {
      const { id, createdAt, updatedAt, ...rest } = editingTenant;
      setForm({ ...rest, status: linkedStatus ?? rest.status });
    } else {
      setForm({ ...emptyForm });
    }
    setErrors({});
  }, [open, editingTenant, linkedStatus]);

  const tenantStatusValidation = (() => {
    if (!editingTenant || form.status === editingTenant.status) return null;
    return canChangeTenantStatus(editingTenant.id, form.status, integrityState);
  })();

  const executeSave = async () => {
    try {
      if (editingTenant) {
        await updateTenantPersisted({ ...editingTenant, ...form });
        toast({ title: "Tenant updated" });
      } else {
        await addTenantPersisted(form);
        toast({ title: "Tenant added" });
      }
    } catch (err) {
      toast({
        title: "Validation Error",
        description: err instanceof Error ? err.message : "Tenant could not be saved.",
        variant: "destructive",
      });
      return;
    }
    onOpenChange(false);
  };

  const handleSave = async () => {
    const nextErrors: Partial<Record<TenantErrorKey, string>> = {};
    if (!form.email.trim()) {
      nextErrors.email = t("common.mandatoryField");
    } else if (!isValidEmail(form.email)) {
      nextErrors.email = t("common.invalidEmail");
    }
    if (form.kind === "individual") {
      if (!form.firstName.trim()) nextErrors.firstName = t("common.mandatoryField");
      if (!form.lastName.trim()) nextErrors.lastName = t("common.mandatoryField");
    } else {
      if (!(form.companyName ?? "").trim()) nextErrors.companyName = t("common.mandatoryField");
      if (!(form.contactFirstName ?? "").trim()) nextErrors.contactFirstName = t("common.mandatoryField");
      if (!(form.contactLastName ?? "").trim()) nextErrors.contactLastName = t("common.mandatoryField");
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast({ title: "Validation Error", description: t("common.fixHighlightedFields"), variant: "destructive" });
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
    await executeSave();
  };

  const handleOverrideConfirm = async (reason: string) => {
    if (!editingTenant || !pendingOverrideValidation) return;
    try {
      await updateTenantPersisted({ ...editingTenant, ...form });
    } catch (err) {
      toast({ title: "Validation Error", description: err instanceof Error ? err.message : "Tenant could not be saved.", variant: "destructive" });
      return;
    }
    addOverride({
      entityType: "tenant",
      entityId: editingTenant.id,
      action: `status_change:${form.status}`,
      blockerCodes: pendingOverrideValidation.blockers.map(b => b.code),
      reason,
    });
    onOpenChange(false);
    toast({ title: "Tenant updated (overridden)", description: `Override reason: ${reason}` });
    setPendingOverrideValidation(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTenant ? t("tenants.edit") : t("tenants.add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-6">
            <div>
              <Label>{t("tenants.kind")} *</Label>
              <Select
                value={form.kind}
                onValueChange={v => setForm(f => ({ ...f, kind: v as TenantKind }))}
                disabled={!!editingTenant}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">{t("tenants.kind.individual")}</SelectItem>
                  <SelectItem value="corporation">{t("tenants.kind.corporation")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.kind === "individual" ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label={t("tenants.firstName")} required error={errors.firstName}>
                    <Input value={form.firstName} aria-invalid={!!errors.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
                  </FormField>
                  <FormField label={t("tenants.lastName")} required error={errors.lastName}>
                    <Input value={form.lastName} aria-invalid={!!errors.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
                  </FormField>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label={t("tenants.companyName")} required error={errors.companyName}>
                    <Input value={form.companyName ?? ""} aria-invalid={!!errors.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value || null }))} />
                  </FormField>
                  <div><Label>{t("tenants.legalForm")}</Label><Input value={form.legalForm ?? ""} placeholder="SARL, SAS, SCI…" onChange={e => setForm(f => ({ ...f, legalForm: e.target.value || null }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>{t("tenants.registrationNumber")}</Label><Input value={form.registrationNumber ?? ""} onChange={e => setForm(f => ({ ...f, registrationNumber: e.target.value || null }))} /></div>
                  <div><Label>{t("tenants.vatNumber")}</Label><Input value={form.vatNumber ?? ""} onChange={e => setForm(f => ({ ...f, vatNumber: e.target.value || null }))} /></div>
                </div>
              </>
            )}

            <FormField label={t("tenants.email")} required error={errors.email}>
              <Input type="email" value={form.email} aria-invalid={!!errors.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </FormField>
            <div><Label>{t("tenants.phone")}</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>

            <div className="grid grid-cols-2 gap-4">
              {form.kind === "individual" ? (
                <div><Label>{t("tenants.dateOfBirth")}</Label><DateInput value={form.dateOfBirth ?? ""} onChange={value => setForm(f => ({ ...f, dateOfBirth: value || null }))} /></div>
              ) : <div />}
              <div title={linkedStatus ? t("tenants.statusLinkedLeases") : undefined}><Label>{t("filter.status")} *</Label>
                <Select value={form.status} disabled={!!linkedStatus} onValueChange={v => setForm(f => ({ ...f, status: v as TenantStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TENANT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}><StatusBadge status={s.value} /></SelectItem>)}</SelectContent>
                </Select>
                <StatusTransitionAlert validation={tenantStatusValidation} />
              </div>
            </div>

            {form.kind === "individual" && (
              <div><Label>{t("tenants.identificationNumber")}</Label><Input value={form.identificationNumber ?? ""} onChange={e => setForm(f => ({ ...f, identificationNumber: e.target.value || null }))} /></div>
            )}
            <div>
              <Label>{form.kind === "corporation" ? t("tenants.registeredAddress") : t("tenants.currentAddress")}</Label>
              <Textarea value={form.currentAddress ?? ""} onChange={e => setForm(f => ({ ...f, currentAddress: e.target.value || null }))} rows={2} />
            </div>

            {form.kind === "corporation" && (
              <div className="space-y-3 pt-2 border-t">
                <p className="text-sm font-medium text-foreground">{t("tenants.mainContact")}</p>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label={t("tenants.firstName")} required error={errors.contactFirstName}>
                    <Input value={form.contactFirstName ?? ""} aria-invalid={!!errors.contactFirstName} onChange={e => setForm(f => ({ ...f, contactFirstName: e.target.value || null }))} />
                  </FormField>
                  <FormField label={t("tenants.lastName")} required error={errors.contactLastName}>
                    <Input value={form.contactLastName ?? ""} aria-invalid={!!errors.contactLastName} onChange={e => setForm(f => ({ ...f, contactLastName: e.target.value || null }))} />
                  </FormField>
                </div>
                <div><Label>{t("tenants.contactRole")}</Label><Input value={form.contactRole ?? ""} placeholder="CEO, Property manager…" onChange={e => setForm(f => ({ ...f, contactRole: e.target.value || null }))} /></div>
              </div>
            )}

            <div><Label>{t("common.notes")}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter>
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
