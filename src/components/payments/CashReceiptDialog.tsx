import { useEffect, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getTenantFullName } from "@/types";
import { getSourceTypeLabel } from "@/types/receivables";
import type { CashReceiptSourceType } from "@/types/receivables";
import { toast as sonnerToast } from "sonner";

interface CashReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillTenantId?: string;
  prefillLeaseId?: string;
  lockTenant?: boolean;
}

export function CashReceiptDialog({
  open, onOpenChange, prefillTenantId, prefillLeaseId, lockTenant = false,
}: CashReceiptDialogProps) {
  const { t } = useSettings();
  const { tenants, leases, properties, createCashReceipt } = useAppData();

  const [sourceType, setSourceType] = useState<CashReceiptSourceType>("bank-transfer");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [tenantId, setTenantId] = useState(prefillTenantId ?? "");
  const [leaseId, setLeaseId] = useState(prefillLeaseId ?? "");
  const [reference, setReference] = useState("");
  const [remittance, setRemittance] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerIban, setPayerIban] = useState("");
  const [notes, setNotes] = useState("");
  const [autoAllocate, setAutoAllocate] = useState(true);

  useEffect(() => {
    if (open) {
      setSourceType("bank-transfer");
      setDate(new Date().toISOString().split("T")[0]);
      setAmount("");
      setTenantId(prefillTenantId ?? "");
      setLeaseId(prefillLeaseId ?? "");
      setReference(""); setRemittance(""); setPayerName(""); setPayerIban(""); setNotes("");
      setAutoAllocate(true);
    }
  }, [open, prefillTenantId, prefillLeaseId]);

  const tenantLeases = tenantId
    ? leases.filter(l => l.primaryTenantId === tenantId || l.coTenantIds.includes(tenantId))
    : leases.filter(l => l.lifecycleStage === "active");

  const selectedLease = leaseId ? leases.find(l => l.id === leaseId) : undefined;
  const selectedProp = selectedLease ? properties.find(p => p.id === selectedLease.propertyId) : undefined;
  const currency = selectedProp?.currencyCode ?? "EUR";

  const handleSave = () => {
    if (!amount) return;
    if (!date) {
      sonnerToast.error(t("validation.dates.title"), { description: t("validation.dates.paymentDateRequired") });
      return;
    }
    const amt = parseFloat(amount);
    createCashReceipt({
      tenantId: tenantId || null,
      leaseId: leaseId || null,
      propertyId: selectedLease?.propertyId ?? null,
      unitId: selectedLease?.unitId ?? null,
      sourceType,
      paymentDate: date,
      bookingDate: null,
      valueDate: null,
      amountReceived: amt,
      currencyCode: currency,
      payerName: payerName || null,
      payerIban: payerIban || null,
      payerBic: null,
      reference: reference || null,
      remittanceInformation: remittance || null,
      endToEndReference: null,
      status: "unmatched",
      unmatchedAmount: amt,
      notes,
      importBatchId: null,
      rawBankTransactionId: null,
    }, autoAllocate);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("payments.dialog.recordTitle")}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <Label>{t("payments.dialog.sourceType")}</Label>
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
            <Label>{t("payments.dialog.paymentDate")}</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <Label>{t("payments.dialog.amountReceived")} ({currency})</Label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          {!lockTenant && (
            <div>
              <Label>{t("payments.dialog.tenantOptional")}</Label>
              <Select value={tenantId || "__none__"} onValueChange={v => { const nv = v === "__none__" ? "" : v; setTenantId(nv); setLeaseId(""); }}>
                <SelectTrigger><SelectValue placeholder={t("payments.dialog.selectTenant")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("payments.dialog.none")}</SelectItem>
                  {tenants.filter(tn => tn.status === "active").map(tn => (
                    <SelectItem key={tn.id} value={tn.id}>{getTenantFullName(tn)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>{t("payments.dialog.leaseOptional")}</Label>
            <Select value={leaseId || "__none__"} onValueChange={v => setLeaseId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t("payments.dialog.selectLease")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("payments.dialog.none")}</SelectItem>
                {tenantLeases.map(l => {
                  const tn = tenants.find(x => x.id === l.primaryTenantId);
                  return <SelectItem key={l.id} value={l.id}>{l.leaseReference}{tn ? ` — ${getTenantFullName(tn)}` : ""}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("payments.dialog.reference")}</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder={t("payments.dialog.referencePh")} />
          </div>
          <div>
            <Label>{t("payments.dialog.payerName")}</Label>
            <Input value={payerName} onChange={e => setPayerName(e.target.value)} />
          </div>
          <div>
            <Label>{t("payments.dialog.payerIban")}</Label>
            <Input value={payerIban} onChange={e => setPayerIban(e.target.value)} placeholder={t("payments.dialog.ibanPh")} />
          </div>
          <div>
            <Label>{t("payments.dialog.remittance")}</Label>
            <Input value={remittance} onChange={e => setRemittance(e.target.value)} />
          </div>
          <div>
            <Label>{t("payments.dialog.notes")}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex items-center justify-between">
            <Label>{t("payments.dialog.autoAllocate")}</Label>
            <Switch checked={autoAllocate} onCheckedChange={setAutoAllocate} />
          </div>
          <Button onClick={handleSave} disabled={!amount} className="w-full">{t("payments.recordCashReceipt")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}