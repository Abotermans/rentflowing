import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { validateAmendment } from "@/lib/integrity/amendmentIntegrity";
import type {
  AmendmentType,
  AmendmentStatus,
  LeaseAmendment,
  LeaseAmendmentChange,
  AmendmentFieldName,
  AmendmentChangeType,
  AmendmentChangeMetadata,
} from "@/types/amendments";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import type { Lease, LeaseUnitAssignmentType } from "@/types";
import { ASSIGNMENT_TYPE_LABELS } from "@/types";

type ChangeDraft = Omit<LeaseAmendmentChange, "id" | "amendmentId" | "createdAt" | "updatedAt">;

const TYPES: AmendmentType[] = [
  "rent-change", "charges-change", "term-extension", "term-shortening",
  "unit-addition", "unit-removal", "tenant-addition", "tenant-removal",
  "deposit-change", "notice-change", "clause-change", "mixed",
];

const ANC_ROLES: LeaseUnitAssignmentType[] = ["parking", "cellar", "storage", "office-secondary", "commercial-addon", "ancillary", "other"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lease: Lease;
  existing?: LeaseAmendment | null;
}

export function AmendmentDialog({ open, onOpenChange, lease, existing }: Props) {
  const { t } = useSettings();
  const {
    units, tenants, getLeaseAssignedUnits,
    addAmendment, updateAmendment, activateAmendment,
    getAmendmentChanges,
  } = useAppData();
  const integrityState = useIntegrityState();

  const [type, setType] = useState<AmendmentType>("rent-change");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [signedDate, setSignedDate] = useState("");

  // Per-type fields
  const [newRent, setNewRent] = useState("");
  const [newCharges, setNewCharges] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newDeposit, setNewDeposit] = useState("");
  const [newNotice, setNewNotice] = useState("");
  const [clauseSummary, setClauseSummary] = useState("");
  const [addUnitId, setAddUnitId] = useState("");
  const [addRole, setAddRole] = useState<LeaseUnitAssignmentType>("parking");
  const [addRent, setAddRent] = useState("");
  const [addCharges, setAddCharges] = useState("0");
  const [removeUnitId, setRemoveUnitId] = useState("");
  const [addTenantId, setAddTenantId] = useState("");
  const [removeTenantId, setRemoveTenantId] = useState("");

  const currentUnits = useMemo(
    () => getLeaseAssignedUnits(lease.id, { activeOnly: true }),
    [getLeaseAssignedUnits, lease.id],
  );
  const propertyUnits = useMemo(
    () => units.filter(u => u.propertyId === lease.propertyId && !currentUnits.find(r => r.unit.id === u.id)),
    [units, lease.propertyId, currentUnits],
  );

  // Hydrate when editing
  useEffect(() => {
    if (existing) {
      setType(existing.amendmentType);
      setTitle(existing.title);
      setReason(existing.reason);
      setNotes(existing.notes);
      setEffectiveDate(existing.effectiveDate);
      setSignedDate(existing.signedDate ?? "");
      const chs = getAmendmentChanges(existing.id);
      const find = (f: AmendmentFieldName) => chs.find(c => c.fieldName === f);
      setNewRent(String(find("baseMonthlyRentTotal")?.newValue ?? ""));
      setNewCharges(String(find("baseMonthlyChargesTotal")?.newValue ?? ""));
      setNewEndDate(String(find("leaseEndDate")?.newValue ?? ""));
      setNewDeposit(String(find("depositAmount")?.newValue ?? ""));
      setNewNotice(String(find("noticePeriodText")?.newValue ?? ""));
      setClauseSummary(String(find("clauseSummary")?.newValue ?? ""));
      const addCh = chs.find(c => c.fieldName === "unitAssignments" && c.changeType === "add");
      if (addCh) {
        setAddUnitId(addCh.metadata?.unitId ?? "");
        setAddRole(addCh.metadata?.assignmentType ?? "parking");
        const nv = (addCh.newValue ?? {}) as { rentShare?: number; chargesShare?: number };
        setAddRent(String(nv.rentShare ?? ""));
        setAddCharges(String(nv.chargesShare ?? "0"));
      }
      const remCh = chs.find(c => c.fieldName === "unitAssignments" && c.changeType === "remove");
      if (remCh) setRemoveUnitId(remCh.metadata?.unitId ?? "");
    } else {
      setType("rent-change");
      setTitle(""); setReason(""); setNotes("");
      setEffectiveDate(""); setSignedDate("");
      setNewRent(String(lease.monthlyRent));
      setNewCharges(String(lease.monthlyCharges));
      setNewEndDate(lease.endDate);
      setNewDeposit(String(lease.depositOrGuaranteeAmount ?? ""));
      setNewNotice(lease.noticePeriodText);
      setClauseSummary(""); setAddUnitId(""); setAddRole("parking");
      setAddRent(""); setAddCharges("0"); setRemoveUnitId("");
      setAddTenantId(""); setRemoveTenantId("");
    }
  }, [existing, open, lease, getAmendmentChanges]);

  const changesDraft = useMemo<ChangeDraft[]>(() => {
    const out: ChangeDraft[] = [];
    const push = (
      fieldName: AmendmentFieldName,
      changeType: AmendmentChangeType,
      oldValue: unknown,
      newValue: unknown,
      metadata?: AmendmentChangeMetadata,
    ) => out.push({ fieldName, changeType, oldValue, newValue, metadata });

    const applies = (k: AmendmentType[]) => k.includes(type) || type === "mixed";

    if (applies(["rent-change"]) && newRent && Number(newRent) !== lease.monthlyRent) {
      push("baseMonthlyRentTotal", "set", lease.monthlyRent, Number(newRent));
    }
    if (applies(["charges-change"]) && newCharges && Number(newCharges) !== lease.monthlyCharges) {
      push("baseMonthlyChargesTotal", "set", lease.monthlyCharges, Number(newCharges));
    }
    if (applies(["term-extension", "term-shortening"]) && newEndDate && newEndDate !== lease.endDate) {
      push("leaseEndDate", "set", lease.endDate, newEndDate);
    }
    if (applies(["deposit-change"]) && newDeposit && Number(newDeposit) !== (lease.depositOrGuaranteeAmount ?? 0)) {
      push("depositAmount", "set", lease.depositOrGuaranteeAmount, Number(newDeposit));
    }
    if (applies(["notice-change"]) && newNotice && newNotice !== lease.noticePeriodText) {
      push("noticePeriodText", "set", lease.noticePeriodText, newNotice);
    }
    if (applies(["clause-change"]) && clauseSummary) {
      push("clauseSummary", "set", "", clauseSummary);
    }
    if (applies(["unit-addition"]) && addUnitId) {
      push("unitAssignments", "add", null,
        { rentShare: Number(addRent || 0), chargesShare: Number(addCharges || 0) },
        { unitId: addUnitId, assignmentType: addRole, startDate: effectiveDate });
    }
    if (applies(["unit-removal"]) && removeUnitId) {
      push("unitAssignments", "remove", { unitId: removeUnitId }, null,
        { unitId: removeUnitId, startDate: effectiveDate });
    }
    if (applies(["tenant-addition"]) && addTenantId) {
      push("coTenantIds", "add", lease.coTenantIds, [...lease.coTenantIds, addTenantId],
        { tenantId: addTenantId });
    }
    if (applies(["tenant-removal"]) && removeTenantId) {
      push("coTenantIds", "remove", lease.coTenantIds, lease.coTenantIds.filter(x => x !== removeTenantId),
        { tenantId: removeTenantId });
    }
    return out;
  }, [type, newRent, newCharges, newEndDate, newDeposit, newNotice, clauseSummary,
      addUnitId, addRole, addRent, addCharges, removeUnitId, addTenantId, removeTenantId,
      lease, effectiveDate]);

  // Live validation (uses a temp amendment record so validateAmendment can run).
  const liveValidation = useMemo(() => {
    if (!effectiveDate) return null;
    const tempAm: LeaseAmendment = {
      id: existing?.id ?? "preview",
      leaseId: lease.id,
      amendmentNumber: existing?.amendmentNumber ?? 0,
      amendmentType: type,
      title, reason, notes,
      effectiveDate,
      signedDate: signedDate || null,
      status: "draft",
      supersedesAmendmentId: null,
      createdAt: "", updatedAt: "",
    };
    return validateAmendment(tempAm, changesDraft.map((c, i) => ({
      ...c, id: `p${i}`, amendmentId: tempAm.id, createdAt: "", updatedAt: "",
    })), integrityState);
  }, [effectiveDate, type, title, reason, notes, signedDate, changesDraft, integrityState, lease.id, existing]);

  const canSubmit = title.trim().length > 0 && effectiveDate;
  const canActivate = canSubmit && liveValidation?.allowed === true;

  const save = (status: AmendmentStatus) => {
    if (!canSubmit) return;
    if (existing) {
      updateAmendment({
        ...existing,
        amendmentType: type, title, reason, notes,
        effectiveDate, signedDate: signedDate || null,
        status,
      }, changesDraft);
      if (status === "active" && existing.status !== "active") {
        activateAmendment(existing.id);
      }
    } else {
      const created = addAmendment({
        leaseId: lease.id,
        amendmentType: type, title, reason, notes,
        effectiveDate, signedDate: signedDate || null,
        supersedesAmendmentId: null,
        status,
      }, changesDraft);
      if (status === "active") activateAmendment(created.id);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? t("amendments.edit") : t("amendments.add")}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>{t("amendments.type")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as AmendmentType)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map(ty => (
                  <SelectItem key={ty} value={ty}>{t(`amendments.type.${ty}` as any)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Title</Label>
            <Input className="h-8" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>{t("amendments.effectiveDate")}</Label>
            <Input className="h-8" type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
          </div>
          <div>
            <Label>{t("amendments.signedDate")}</Label>
            <Input className="h-8" type="date" value={signedDate} onChange={e => setSignedDate(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>{t("amendments.reason")}</Label>
            <Input className="h-8" value={reason} onChange={e => setReason(e.target.value)} />
          </div>

          {(type === "rent-change" || type === "mixed") && (
            <div>
              <Label>{t("amendments.newRent")}</Label>
              <Input className="h-8" type="number" value={newRent} onChange={e => setNewRent(e.target.value)} />
            </div>
          )}
          {(type === "charges-change" || type === "mixed") && (
            <div>
              <Label>{t("amendments.newCharges")}</Label>
              <Input className="h-8" type="number" value={newCharges} onChange={e => setNewCharges(e.target.value)} />
            </div>
          )}
          {(type === "term-extension" || type === "term-shortening" || type === "mixed") && (
            <div>
              <Label>{t("amendments.newEndDate")}</Label>
              <Input className="h-8" type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} />
            </div>
          )}
          {(type === "deposit-change" || type === "mixed") && (
            <div>
              <Label>{t("amendments.newDeposit")}</Label>
              <Input className="h-8" type="number" value={newDeposit} onChange={e => setNewDeposit(e.target.value)} />
            </div>
          )}
          {(type === "notice-change" || type === "mixed") && (
            <div className="col-span-2">
              <Label>Notice period</Label>
              <Input className="h-8" value={newNotice} onChange={e => setNewNotice(e.target.value)} />
            </div>
          )}
          {(type === "clause-change" || type === "mixed") && (
            <div className="col-span-2">
              <Label>Clause summary</Label>
              <Textarea value={clauseSummary} onChange={e => setClauseSummary(e.target.value)} />
            </div>
          )}

          {(type === "unit-addition" || type === "mixed") && (
            <div className="col-span-2 border rounded p-3 space-y-2">
              <div className="text-xs font-medium">{t("amendments.unitToAdd")}</div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={addUnitId} onValueChange={setAddUnitId}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Unit" /></SelectTrigger>
                  <SelectContent>
                    {propertyUnits.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.unitCode} — {u.unitLabel}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={addRole} onValueChange={(v) => setAddRole(v as LeaseUnitAssignmentType)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ANC_ROLES.map(r => (
                      <SelectItem key={r} value={r}>{ASSIGNMENT_TYPE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input className="h-8" type="number" placeholder={t("amendments.rentShare")} value={addRent} onChange={e => setAddRent(e.target.value)} />
                <Input className="h-8" type="number" placeholder={t("amendments.chargesShare")} value={addCharges} onChange={e => setAddCharges(e.target.value)} />
              </div>
            </div>
          )}

          {(type === "unit-removal" || type === "mixed") && (
            <div className="col-span-2 border rounded p-3 space-y-2">
              <div className="text-xs font-medium">{t("amendments.unitToRemove")}</div>
              <Select value={removeUnitId} onValueChange={setRemoveUnitId}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Unit" /></SelectTrigger>
                <SelectContent>
                  {currentUnits.filter(r => !r.assignment.isPrimary).map(r => (
                    <SelectItem key={r.unit.id} value={r.unit.id}>{r.unit.unitCode} — {r.unit.unitLabel}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(type === "tenant-addition" || type === "tenant-removal") && (
            <div className="col-span-2">
              <Label>Tenant</Label>
              <Select
                value={type === "tenant-addition" ? addTenantId : removeTenantId}
                onValueChange={(v) => type === "tenant-addition" ? setAddTenantId(v) : setRemoveTenantId(v)}
              >
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(type === "tenant-addition"
                    ? tenants.filter(tn => tn.id !== lease.primaryTenantId && !lease.coTenantIds.includes(tn.id))
                    : tenants.filter(tn => lease.coTenantIds.includes(tn.id))
                  ).map(tn => (
                    <SelectItem key={tn.id} value={tn.id}>{tn.firstName} {tn.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="col-span-2">
            <Label>{t("amendments.notes")}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        {liveValidation && (liveValidation.blockers.length > 0 || liveValidation.warnings.length > 0) && (
          <Alert variant={liveValidation.blockers.length > 0 ? "destructive" : "default"}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <ul className="list-disc ml-4 text-xs">
                {liveValidation.blockers.map(b => <li key={b.code}><strong>{b.code}</strong>: {b.message}</li>)}
                {liveValidation.warnings.map(w => <li key={w.code} className="text-warning">{w.message}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("action.cancel")}</Button>
          <Button variant="outline" disabled={!canSubmit} onClick={() => save("draft")}>{t("amendments.saveDraft")}</Button>
          <Button variant="outline" disabled={!canSubmit} onClick={() => save("pending-signature")}>{t("amendments.markPending")}</Button>
          <Button disabled={!canActivate} onClick={() => save("active")}>{t("amendments.activate")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}