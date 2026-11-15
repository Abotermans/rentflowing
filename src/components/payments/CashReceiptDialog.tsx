import { useEffect, useState } from "react";
import { localTodayISO } from "@/lib/calendarToday";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import { DateInput } from "@/components/shared/DateInput";
import { getTenantFullName } from "@/types";
import { getSourceTypeLabel } from "@/types/receivables";
import type { CashReceiptSourceType } from "@/types/receivables";
import { parsePositiveMoney, positiveMoneyIssue } from "@/lib/validation";
import { receiptCurrencyChoices } from "@/lib/currencies";
import { leaseIncludesTenant } from "@/lib/reconciliation";
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
  const { tenants, leases, properties, createCashReceiptPersisted } = useAppData();

  const [sourceType, setSourceType] = useState<CashReceiptSourceType>("bank-transfer");
  const [date, setDate] = useState(localTodayISO());
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currencyCode, setCurrencyCode] = useState("");
  const [currencyError, setCurrencyError] = useState(false);
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
      setDate(localTodayISO());
      setAmount("");
      setAmountTouched(false);
      setSaving(false);
      setCurrencyCode("");
      setCurrencyError(false);
      setTenantId(prefillTenantId ?? "");
      setLeaseId(prefillLeaseId ?? "");
      setReference(""); setRemittance(""); setPayerName(""); setPayerIban(""); setNotes("");
      setAutoAllocate(true);
    }
  }, [open, prefillTenantId, prefillLeaseId]);

  const tenantLeases = tenantId
    ? leases.filter(l => leaseIncludesTenant(l, tenantId))
    : leases;

  const selectedLease = leaseId ? leases.find(l => l.id === leaseId) : undefined;
  const selectedProp = selectedLease ? properties.find(p => p.id === selectedLease.propertyId) : undefined;
  const { options: currencyOptions, defaultCurrency } = receiptCurrencyChoices(properties);
  const currency = currencyCode || selectedProp?.currencyCode || defaultCurrency;
  const amountIssue = positiveMoneyIssue(amount);
  const amountError = amountTouched && amountIssue
    ? t(amountIssue === "required" ? "common.mandatoryField"
      : amountIssue === "positive" ? "common.positiveAmount" : "payments.dialog.invalidAmount")
    : null;

  const handleSave = async () => {
    if (saving) return;
    setAmountTouched(true);
    const amt = parsePositiveMoney(amount);
    if (amt === null) return;
    if (!date) {
      sonnerToast.error(t("validation.dates.title"), { description: t("validation.dates.paymentDateRequired") });
      return;
    }
    if (!currency) {
      setCurrencyError(true);
      sonnerToast.error(t("common.validationError"), { description: t("payments.dialog.currencyRequired") });
      return;
    }
    setSaving(true);
    try {
      await createCashReceiptPersisted({
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
    } catch (err) {
      sonnerToast.error(t("common.validationError"), {
        description: err instanceof Error ? err.message : "Cash receipt could not be saved.",
      });
      return;
    } finally {
      setSaving(false);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
            <DateInput value={date} onChange={setDate} />
          </div>
          <div>
            <Label htmlFor="receipt-amount">{t("payments.dialog.amountReceived")}{currency ? ` (${currency})` : ""} *</Label>
            <Input id="receipt-amount" type="text" inputMode="decimal" value={amount}
              onChange={e => setAmount(e.target.value)} onBlur={() => setAmountTouched(true)}
              aria-invalid={!!amountError} aria-describedby={amountError ? "receipt-amount-error" : undefined}
              className={amountError ? "border-destructive" : undefined} placeholder="0.00" />
            {amountError && <p id="receipt-amount-error" className="text-xs text-destructive mt-1">{amountError}</p>}
          </div>
            <div>
              <Label>{t("properties.currency")} *</Label>
              <Select value={currency} onValueChange={value => { setCurrencyCode(value); setCurrencyError(false); }}>
                <SelectTrigger className={currencyError ? "border-destructive" : undefined}><SelectValue placeholder={t("payments.dialog.selectCurrency")} /></SelectTrigger>
                <SelectContent>
                  {currencyOptions.map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                </SelectContent>
              </Select>
              {currencyError && <p className="text-xs text-destructive mt-1">{t("payments.dialog.currencyRequired")}</p>}
              {selectedProp && currency && currency !== selectedProp.currencyCode && (
                <p className="text-xs text-warning mt-1">{t("payments.dialog.currencyMismatchWarning")}</p>
              )}
            </div>
          {!lockTenant && (
            <div>
              <Label>{t("payments.dialog.tenantOptional")}</Label>
              <Select value={tenantId || "__none__"} onValueChange={v => { const nv = v === "__none__" ? "" : v; setTenantId(nv); setLeaseId(""); setCurrencyCode(""); }}>
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
            <Select value={leaseId || "__none__"} onValueChange={v => { setLeaseId(v === "__none__" ? "" : v); setCurrencyCode(""); }}>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("action.cancel")}</Button>
          <Button onClick={handleSave} disabled={saving}>{t("payments.recordCashReceipt")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
