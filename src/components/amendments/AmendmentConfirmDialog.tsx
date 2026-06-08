import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/context/SettingsContext";
import { useAppData } from "@/context/AppContext";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { getEffectiveLeaseTerms } from "@/lib/amendments";
import type { Lease } from "@/types";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";

type ChangeDraft = Omit<LeaseAmendmentChange, "id" | "amendmentId" | "createdAt" | "updatedAt">;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lease: Lease;
  effectiveDate: string;
  changes: ChangeDraft[];
  action: "schedule" | "activate";
  onConfirm: () => void;
}

export function AmendmentConfirmDialog({ open, onOpenChange, lease, effectiveDate, changes, action, onConfirm }: Props) {
  const { t, locale } = useSettings();
  const { units, tenants, amendments } = useAppData();
  const s = useIntegrityState();
  const currency = "EUR";

  const before = useMemo(
    () => getEffectiveLeaseTerms(lease.id, effectiveDate || new Date().toISOString().slice(0, 10), s),
    [lease.id, effectiveDate, s],
  );

  const unitLabel = (id: string) => units.find(u => u.id === id)?.unitCode ?? id;
  const tenantLabel = (id: string) => {
    const tn = tenants.find(x => x.id === id);
    return tn ? `${tn.firstName} ${tn.lastName}` : id;
  };

  const previousActive = useMemo(
    () => amendments.find(a => a.leaseId === lease.id && a.status === "active") ?? null,
    [amendments, lease.id],
  );

  const rows = useMemo(() => {
    const out: { label: string; before: string; after: string }[] = [];
    const fmt = (n: number) => formatCurrency(n, currency, locale);
    for (const c of changes) {
      switch (c.fieldName) {
        case "leaseEndDate":
          out.push({ label: t("amendments.newEndDate"), before: formatDate(before?.endDate ?? lease.endDate, locale), after: formatDate(String(c.newValue), locale) });
          break;
        case "depositAmount":
          out.push({ label: t("amendments.newDeposit"), before: before?.depositAmount != null ? fmt(before.depositAmount) : "—", after: c.newValue == null ? "—" : fmt(Number(c.newValue)) });
          break;
        case "noticePeriodText":
          out.push({ label: t("leases.noticePeriod"), before: before?.noticePeriodText || "—", after: String(c.newValue || "—") });
          break;
        case "baseMonthlyRentTotal":
          out.push({ label: t("amendments.newRent"), before: fmt(before?.monthlyRent ?? 0), after: fmt(Number(c.newValue) || 0) });
          break;
        case "baseMonthlyChargesTotal":
          out.push({ label: t("amendments.newCharges"), before: fmt(before?.monthlyCharges ?? 0), after: fmt(Number(c.newValue) || 0) });
          break;
        case "unitRentShare": {
          const uid = c.metadata?.unitId ?? "";
          out.push({ label: `${t("amendments.rentShare")} · ${unitLabel(uid)}`, before: fmt(Number(c.oldValue) || 0), after: fmt(Number(c.newValue) || 0) });
          break;
        }
        case "unitChargesShare": {
          const uid = c.metadata?.unitId ?? "";
          out.push({ label: `${t("amendments.chargesShare")} · ${unitLabel(uid)}`, before: fmt(Number(c.oldValue) || 0), after: fmt(Number(c.newValue) || 0) });
          break;
        }
        case "unitAssignments": {
          const uid = c.metadata?.unitId ?? "";
          if (c.changeType === "add") out.push({ label: t("amendments.type.unit-addition"), before: "—", after: unitLabel(uid) });
          else out.push({ label: t("amendments.type.unit-removal"), before: unitLabel(uid), after: "—" });
          break;
        }
        case "coTenantIds": {
          const tid = c.metadata?.tenantId ?? "";
          if (c.changeType === "add") out.push({ label: t("amendments.type.tenant-addition"), before: "—", after: tenantLabel(tid) });
          else out.push({ label: t("amendments.type.tenant-removal"), before: tenantLabel(tid), after: "—" });
          break;
        }
        case "primaryTenantId":
          out.push({ label: t("leases.primaryTenant"), before: tenantLabel(before?.primaryTenantId ?? lease.primaryTenantId), after: tenantLabel(String(c.newValue)) });
          break;
        case "clauseSummary":
          out.push({ label: t("amendments.clauseSummary"), before: "—", after: String(c.newValue || "—") });
          break;
        default: break;
      }
    }
    return out;
  }, [changes, before, lease, locale, t, units, tenants]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {action === "activate" ? t("amendments.confirm.activateTitle") : t("amendments.confirm.scheduleTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("amendments.effectiveDate")}:</span>
            <Badge variant="secondary">{formatDate(effectiveDate, locale)}</Badge>
          </div>

          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">{t("amendments.noChangesYet")}</p>
          ) : (
            <div className="rounded border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">{t("amendments.summary")}</th>
                    <th className="text-left px-2 py-1.5 font-medium">{t("amendments.before")}</th>
                    <th className="text-left px-2 py-1.5 font-medium">{t("amendments.after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1.5">{r.label}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{r.before}</td>
                      <td className="px-2 py-1.5 font-medium">{r.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded border bg-warning/5 border-warning/30 p-3 space-y-1 text-xs">
            <p className="font-medium">{t("amendments.confirm.consequences")}</p>
            <ul className="list-disc ml-4 space-y-0.5">
              {previousActive && (
                <li>{t("amendments.confirm.willEndPrevious").replace("{n}", String(previousActive.amendmentNumber))}</li>
              )}
              {action === "activate" && (
                <>
                  <li>{t("amendments.confirm.willRegenReceivables")}</li>
                  <li>{t("amendments.confirm.willUpdateLease")}</li>
                </>
              )}
              {action === "schedule" && (
                <li>{t("amendments.confirm.willAutoActivateOnDate")}</li>
              )}
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("action.cancel")}</Button>
          <Button onClick={() => { onConfirm(); onOpenChange(false); }}>
            {action === "activate" ? t("amendments.activate") : t("amendments.schedule")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}