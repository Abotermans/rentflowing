import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getTenantFullName } from "@/types";
import { getSourceTypeLabel } from "@/types/receivables";
import type { CashReceiptSourceType } from "@/types/receivables";
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
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [sourceType, setSourceType] = useState<CashReceiptSourceType>("bank-transfer");
  const [payerName, setPayerName] = useState("");
  const [reference, setReference] = useState("");
  const [pickedTenantId, setPickedTenantId] = useState("");
  const [pickedLeaseId, setPickedLeaseId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ri) return;
    setAmount(ri.outstandingAmount.toFixed(2));
    setDate(new Date().toISOString().split("T")[0]);
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

  const amt = parseFloat(amount || "0");
  const outstanding = ri.outstandingAmount;
  const currency = ri.currencyCode;
  const locale = prop?.locale;

  const hint =
    amt <= 0 ? null :
    amt < outstanding ? t("payments.quickPay.hintPartial") :
    amt > outstanding ? t("payments.quickPay.hintSurplus") :
    t("payments.quickPay.hintFull");

  const canSave = amt > 0 && !!date && (!isOrphan || !!pickedTenantId) && !saving;

  const handleConfirm = () => {
    if (!canSave) return;
    setSaving(true);
    try {
      quickPayReceivable({
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
    } catch (e) {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
            <Label>{t("payments.quickPay.amount")} ({currency})</Label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>

          <div>
            <Label>{t("payments.quickPay.paymentDate")}</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
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

          <Button onClick={handleConfirm} disabled={!canSave} className="w-full">
            {t("payments.quickPay.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}