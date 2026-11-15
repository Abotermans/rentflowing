import { useEffect, useMemo, useState } from "react";
import { localTodayISO } from "@/lib/calendarToday";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import { DateInput } from "@/components/shared/DateInput";
import { getTenantFullName } from "@/types";
import { getSourceTypeLabel } from "@/types/receivables";
import type { CashReceiptSourceType } from "@/types/receivables";
import { parsePositiveMoney, positiveMoneyIssue } from "@/lib/validation";
import { toast as sonnerToast } from "sonner";

interface QuickPayReceivableDialogProps {
  receivableItemId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function QuickPayReceivableDialog({ receivableItemId, onOpenChange }: QuickPayReceivableDialogProps) {
  const { t } = useSettings();
  const { receivableItems, tenants, leases, properties, units, quickPayReceivable } = useAppData();

  const ri = receivableItemId ? receivableItems.find(r => r.id === receivableItemId) ?? null : null;
  const open = !!ri;

  const tenant = ri?.tenantId ? tenants.find(x => x.id === ri.tenantId) : undefined;
  const lease = ri?.leaseId ? leases.find(l => l.id === ri.leaseId) : undefined;
  const prop = ri?.propertyId
    ? properties.find(p => p.id === ri.propertyId)
    : lease ? properties.find(p => p.id === lease.propertyId) : undefined;
  const unit = ri?.unitId
    ? units.find(u => u.id === ri.unitId)
    : lease?.unitId ? units.find(u => u.id === lease.unitId) : undefined;

  const isOrphan = !ri?.leaseId && !ri?.tenantId;

  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [date, setDate] = useState(localTodayISO());
  const [sourceType, setSourceType] = useState<CashReceiptSourceType>("bank-transfer");
  const [payerName, setPayerName] = useState("");
  const [reference, setReference] = useState("");
  const [pickedTenantId, setPickedTenantId] = useState("");
  const [pickedLeaseId, setPickedLeaseId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ri) return;
    setAmount(ri.outstandingAmount.toFixed(2));
    setAmountTouched(false);
    setDate(localTodayISO());
    setSourceType("bank-transfer");
    setPayerName(tenant ? getTenantFullName(tenant) : "");
    setReference("");
    setPickedTenantId("");
    setPickedLeaseId("");
    setSaving(false);
  }, [ri?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const orphanTenantLeases = useMemo(() => {
    if (!isOrphan || !pickedTenantId) return [];
    return leases.filter(l => l.primaryTenantId === pickedTenantId || l.coTenantIds.includes(pickedTenantId));
  }, [isOrphan, pickedTenantId, leases]);

  if (!ri) return null;

  const amt = parsePositiveMoney(amount);
  const amountIssue = positiveMoneyIssue(amount);
  const amountError = amountTouched && amountIssue
    ? t(amountIssue === "required" ? "common.mandatoryField"
      : amountIssue === "positive" ? "common.positiveAmount" : "payments.dialog.invalidAmount")
    : null;
  const outstanding = ri.outstandingAmount;
  const currency = ri.currencyCode;
  const locale = prop?.locale;

  const hint =
    amt === null ? null :
    amt < outstanding ? t("payments.quickPay.hintPartial") :
    amt > outstanding ? t("payments.quickPay.hintSurplus") :
    t("payments.quickPay.hintFull");

  const canSave = amt !== null && !!date && (!isOrphan || !!pickedTenantId) && !saving;

  const handleConfirm = async () => {
    if (!canSave || amt === null) return;
    setSaving(true);
    try {
      await quickPayReceivable({
        receivableItemId: ri.id,
        amountReceived: amt,
        paymentDate: date,
        sourceType,
        payerName: payerName || null,
        reference: reference || null,
        tenantIdOverride: isOrphan ? pickedTenantId : null,
        leaseIdOverride: isOrphan ? (pickedLeaseId || null) : null,
      });
      sonnerToast.success(t("payments.quickPay.toastSuccess"));
      onOpenChange(false);
    } catch (error) {
      sonnerToast.error(t("settings.saveFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("payments.quickPay.title")}</DialogTitle></DialogHeader>

        <div className="mt-4 space-y-4">

          {isOrphan && (
            <>
              <div>
                <Label>{t("payments.quickPay.tenantRequired")}</Label>
                <Select value={pickedTenantId || "__none__"} onValueChange={v => { const nv = v === "__none__" ? "" : v; setPickedTenantId(nv); setPickedLeaseId(""); }}>
                  <SelectTrigger><SelectValue placeholder={t("payments.dialog.selectTenant")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("payments.dialog.none")}</SelectItem>
                    {tenants.filter(tn => tn.status === "active").map(tn => (
                      <SelectItem key={tn.id} value={tn.id}>{getTenantFullName(tn)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {pickedTenantId && orphanTenantLeases.length > 0 && (
                <div>
                  <Label>{t("payments.quickPay.leaseOptional")}</Label>
                  <Select value={pickedLeaseId || "__none__"} onValueChange={v => setPickedLeaseId(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder={t("payments.dialog.selectLease")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("payments.dialog.none")}</SelectItem>
                      {orphanTenantLeases.map(l => (
                        <SelectItem key={l.id} value={l.id}>{l.leaseReference}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          <div>
            <Label htmlFor="quick-pay-amount">{t("payments.quickPay.amount")} ({currency}) *</Label>
            <Input id="quick-pay-amount" type="text" inputMode="decimal" value={amount}
              onChange={e => { setAmount(e.target.value); setAmountTouched(true); }}
              aria-invalid={!!amountError} aria-describedby={amountError ? "quick-pay-amount-error" : undefined}
              className={amountError ? "border-destructive" : undefined} />
            {amountError && <p id="quick-pay-amount-error" className="text-xs text-destructive mt-1">{amountError}</p>}
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>

          <div>
            <Label>{t("payments.quickPay.paymentDate")}</Label>
            <DateInput value={date} onChange={setDate} />
          </div>

          <div>
            <Label>{t("payments.quickPay.sourceType")}</Label>
            <Select value={sourceType} onValueChange={v => setSourceType(v as CashReceiptSourceType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["bank-transfer","instant-transfer","direct-debit","card","cash","cheque","manual"] as CashReceiptSourceType[]).map(k => (
                  <SelectItem key={k} value={k}>{getSourceTypeLabel(t, k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("payments.quickPay.payerName")}</Label>
            <Input value={payerName} onChange={e => setPayerName(e.target.value)} />
          </div>

          <div>
            <Label>{t("payments.quickPay.reference")}</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder={t("payments.dialog.referencePh")} />
          </div>

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("action.cancel")}</Button>
          <Button onClick={handleConfirm} disabled={!canSave}>
            {t("payments.quickPay.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
