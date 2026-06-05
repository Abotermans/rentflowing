import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { validateAmendment } from "@/lib/integrity/amendmentIntegrity";
import { getCurrentLeaseTerms } from "@/lib/amendments";
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
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Plus, Minus, X, ChevronDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Lease, LeaseUnitAssignmentType } from "@/types";
import { ASSIGNMENT_TYPE_LABELS } from "@/types";
import type { TranslationKey } from "@/i18n/translations";

type ChangeDraft = Omit<LeaseAmendmentChange, "id" | "amendmentId" | "createdAt" | "updatedAt">;

const ANC_ROLES: LeaseUnitAssignmentType[] = ["parking", "cellar", "storage", "office-secondary", "commercial-addon", "ancillary", "other"];

function deriveAmendmentType(changes: ChangeDraft[], lease: Lease): AmendmentType {
  const cats = new Set<AmendmentType>();
  for (const c of changes) {
    switch (c.fieldName) {
      case "baseMonthlyRentTotal":
      case "unitRentShare": cats.add("rent-change"); break;
      case "baseMonthlyChargesTotal":
      case "unitChargesShare": cats.add("charges-change"); break;
      case "leaseEndDate":
        cats.add(String(c.newValue) > lease.endDate ? "term-extension" : "term-shortening"); break;
      case "depositAmount": cats.add("deposit-change"); break;
      case "noticePeriodText": cats.add("notice-change"); break;
      case "clauseSummary": cats.add("clause-change"); break;
      case "unitAssignments":
        if (c.changeType === "add") cats.add("unit-addition");
        else if (c.changeType === "remove") cats.add("unit-removal");
        break;
      case "coTenantIds":
        if (c.changeType === "add") cats.add("tenant-addition");
        else if (c.changeType === "remove") cats.add("tenant-removal");
        break;
      default: break;
    }
  }
  if (cats.size === 0) return "rent-change";
  if (cats.size === 1) return [...cats][0];
  return "mixed";
}

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
    addAmendment, updateAmendment, activateAmendment, updateUnit,
    getAmendmentChanges,
  } = useAppData();
  const integrityState = useIntegrityState();

  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [signedDate, setSignedDate] = useState("");

  // Per-type fields
  const [newEndDate, setNewEndDate] = useState("");
  const [newDeposit, setNewDeposit] = useState("");
  const [newNotice, setNewNotice] = useState("");
  const [clauseSummary, setClauseSummary] = useState("");
  // Unit-change drafts (multi-row, intuitive add/remove UX)
  type AddDraft = { unitId: string; assignmentType: LeaseUnitAssignmentType; rentShare: string; chargesShare: string };
  const [unitsToAdd, setUnitsToAdd] = useState<AddDraft[]>([]);
  const [unitsToRemove, setUnitsToRemove] = useState<string[]>([]);
  const [editedShares, setEditedShares] = useState<Record<string, { rentShare?: string; chargesShare?: string }>>({});
  const [tenantsToAdd, setTenantsToAdd] = useState<string[]>([]);
  const [tenantsToRemove, setTenantsToRemove] = useState<string[]>([]);
  const [addTenantOpen, setAddTenantOpen] = useState(false);
  const [addUnitOpen, setAddUnitOpen] = useState(false);

  const currentUnits = useMemo(
    () => getLeaseAssignedUnits(lease.id, { activeOnly: true }),
    [getLeaseAssignedUnits, lease.id],
  );
  const propertyUnits = useMemo(
    () =>
      units.filter(
        u =>
          u.propertyId === lease.propertyId &&
          !currentUnits.find(r => r.unit.id === u.id) &&
          !unitsToAdd.find(a => a.unitId === u.id),
      ),
    [units, lease.propertyId, currentUnits, unitsToAdd],
  );

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setReason(existing.reason);
      setNotes(existing.notes);
      setEffectiveDate(existing.effectiveDate);
      setSignedDate(existing.signedDate ?? "");
      const chs = getAmendmentChanges(existing.id);
      const find = (f: AmendmentFieldName) => chs.find(c => c.fieldName === f);
      setNewEndDate(String(find("leaseEndDate")?.newValue ?? ""));
      setNewDeposit(String(find("depositAmount")?.newValue ?? ""));
      setNewNotice(String(find("noticePeriodText")?.newValue ?? ""));
      setClauseSummary(String(find("clauseSummary")?.newValue ?? ""));
      const edits: Record<string, { rentShare?: string; chargesShare?: string }> = {};
      for (const c of chs) {
        const uid = c.metadata?.unitId;
        if (!uid) continue;
        if (c.fieldName === "unitRentShare") edits[uid] = { ...edits[uid], rentShare: String(c.newValue ?? "") };
        if (c.fieldName === "unitChargesShare") edits[uid] = { ...edits[uid], chargesShare: String(c.newValue ?? "") };
      }
      setEditedShares(edits);
      const addChs = chs.filter(c => c.fieldName === "unitAssignments" && c.changeType === "add");
      setUnitsToAdd(addChs.map(c => {
        const nv = (c.newValue ?? {}) as { rentShare?: number; chargesShare?: number };
        return {
          unitId: c.metadata?.unitId ?? "",
          assignmentType: c.metadata?.assignmentType ?? "parking",
          rentShare: String(nv.rentShare ?? ""),
          chargesShare: String(nv.chargesShare ?? "0"),
        };
      }));
      const remChs = chs.filter(c => c.fieldName === "unitAssignments" && c.changeType === "remove");
      setUnitsToRemove(remChs.map(c => c.metadata?.unitId ?? "").filter(Boolean));
      const addTen = chs.filter(c => c.fieldName === "coTenantIds" && c.changeType === "add");
      setTenantsToAdd(addTen.map(c => c.metadata?.tenantId ?? "").filter(Boolean));
      const remTen = chs.filter(c => c.fieldName === "coTenantIds" && c.changeType === "remove");
      setTenantsToRemove(remTen.map(c => c.metadata?.tenantId ?? "").filter(Boolean));
    } else {
      setTitle(""); setReason(""); setNotes("");
      setEffectiveDate(""); setSignedDate("");
      setNewEndDate(lease.endDate);
      setNewDeposit(String(lease.depositOrGuaranteeAmount ?? ""));
      setNewNotice(lease.noticePeriodText);
      setClauseSummary(""); setUnitsToAdd([]); setUnitsToRemove([]); setEditedShares({});
      setTenantsToAdd([]); setTenantsToRemove([]);
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

    if (newEndDate && newEndDate !== lease.endDate) {
      push("leaseEndDate", "set", lease.endDate, newEndDate);
    }
    if (newDeposit && Number(newDeposit) !== (lease.depositOrGuaranteeAmount ?? 0)) {
      push("depositAmount", "set", lease.depositOrGuaranteeAmount, Number(newDeposit));
    }
    if (newNotice && newNotice !== lease.noticePeriodText) {
      push("noticePeriodText", "set", lease.noticePeriodText, newNotice);
    }
    if (clauseSummary) {
      push("clauseSummary", "set", "", clauseSummary);
    }
    for (const r of currentUnits) {
      if (unitsToRemove.includes(r.unit.id)) continue;
      const e = editedShares[r.unit.id];
      if (!e) continue;
      const oldRent = r.assignment.rentShare ?? 0;
      const oldCh = r.assignment.chargesShare ?? 0;
      if (e.rentShare !== undefined && e.rentShare !== "" && Number(e.rentShare) !== oldRent) {
        push("unitRentShare", "set", oldRent, Number(e.rentShare), { unitId: r.unit.id });
      }
      if (e.chargesShare !== undefined && e.chargesShare !== "" && Number(e.chargesShare) !== oldCh) {
        push("unitChargesShare", "set", oldCh, Number(e.chargesShare), { unitId: r.unit.id });
      }
    }
    for (const a of unitsToAdd) {
      if (!a.unitId) continue;
      push("unitAssignments", "add", null,
        { rentShare: Number(a.rentShare || 0), chargesShare: Number(a.chargesShare || 0) },
        { unitId: a.unitId, assignmentType: a.assignmentType, startDate: effectiveDate });
    }
    for (const uid of unitsToRemove) {
      push("unitAssignments", "remove", { unitId: uid }, null,
        { unitId: uid, startDate: effectiveDate });
    }
    for (const tid of tenantsToAdd) {
      push("coTenantIds", "add", lease.coTenantIds, [...lease.coTenantIds, tid], { tenantId: tid });
    }
    for (const tid of tenantsToRemove) {
      push("coTenantIds", "remove", lease.coTenantIds, lease.coTenantIds.filter(x => x !== tid), { tenantId: tid });
    }
    return out;
  }, [newEndDate, newDeposit, newNotice, clauseSummary,
      unitsToAdd, unitsToRemove, editedShares, currentUnits, tenantsToAdd, tenantsToRemove,
      lease, effectiveDate]);

  const derivedType = useMemo(() => deriveAmendmentType(changesDraft, lease), [changesDraft, lease]);
  const derivedCategories = useMemo(() => {
    const cats = new Set<AmendmentType>();
    for (const c of changesDraft) {
      switch (c.fieldName) {
        case "baseMonthlyRentTotal":
        case "unitRentShare": cats.add("rent-change"); break;
        case "baseMonthlyChargesTotal":
        case "unitChargesShare": cats.add("charges-change"); break;
        case "leaseEndDate":
          cats.add(String(c.newValue) > lease.endDate ? "term-extension" : "term-shortening"); break;
        case "depositAmount": cats.add("deposit-change"); break;
        case "noticePeriodText": cats.add("notice-change"); break;
        case "clauseSummary": cats.add("clause-change"); break;
        case "unitAssignments":
          cats.add(c.changeType === "add" ? "unit-addition" : "unit-removal"); break;
        case "coTenantIds":
          cats.add(c.changeType === "add" ? "tenant-addition" : "tenant-removal"); break;
      }
    }
    return [...cats];
  }, [changesDraft, lease]);

  // Live validation (uses a temp amendment record so validateAmendment can run).
  const liveValidation = useMemo(() => {
    if (!effectiveDate) return null;
    const tempAm: LeaseAmendment = {
      id: existing?.id ?? "preview",
      leaseId: lease.id,
      amendmentNumber: existing?.amendmentNumber ?? 0,
      amendmentType: derivedType,
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
  }, [effectiveDate, derivedType, title, reason, notes, signedDate, changesDraft, integrityState, lease.id, existing]);

  const canSubmit = title.trim().length > 0 && effectiveDate;
  const canActivate = canSubmit && liveValidation?.allowed === true;

  const coverageGap = useMemo(() => {
    if (!effectiveDate) return false;
    const currentTerms = getCurrentLeaseTerms(lease.id, integrityState);
    const coverageEnd = currentTerms?.endDate ?? lease.endDate;
    if (!coverageEnd) return false;
    if (effectiveDate <= coverageEnd) return false;
    if (newEndDate && newEndDate >= effectiveDate) return false;
    return true;
  }, [effectiveDate, newEndDate, lease, integrityState]);

  const save = (status: AmendmentStatus) => {
    if (!canSubmit) return;
    // Sync edited per-unit rent back to the Unit record on activation
    // (charges live on assignments, not units, so only rent is mirrored).
    if (status === "active") {
      for (const r of currentUnits) {
        if (unitsToRemove.includes(r.unit.id)) continue;
        const e = editedShares[r.unit.id];
        if (e?.rentShare !== undefined && e.rentShare !== "" && Number(e.rentShare) !== (r.assignment.rentShare ?? 0)) {
          updateUnit({ ...r.unit, baseRent: Number(e.rentShare) });
        }
      }
      for (const a of unitsToAdd) {
        const u = units.find(x => x.id === a.unitId);
        if (u && a.rentShare !== "" && Number(a.rentShare) !== (u.baseRent ?? 0)) {
          updateUnit({ ...u, baseRent: Number(a.rentShare) });
        }
      }
    }
    if (existing) {
      updateAmendment({
        ...existing,
        amendmentType: derivedType, title, reason, notes,
        effectiveDate, signedDate: signedDate || null,
        status,
      }, changesDraft);
      if (status === "active" && existing.status !== "active") {
        activateAmendment(existing.id);
      }
    } else {
      const created = addAmendment({
        leaseId: lease.id,
        amendmentType: derivedType, title, reason, notes,
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? t("amendments.edit") : t("amendments.add")}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>{t("amendments.type")}</Label>
            <div className="rounded border bg-muted/30 px-2 py-1.5 min-h-8 flex flex-wrap items-center gap-1.5">
              {derivedCategories.length === 0 ? (
                <span className="text-xs text-muted-foreground">{t("amendments.noChangesYet")}</span>
              ) : (
                <>
                  {derivedCategories.map(c => (
                    <Badge key={c} variant="secondary" className="text-[10px]">
                      {t(`amendments.type.${c}` as any)}
                    </Badge>
                  ))}
                  {derivedCategories.length > 1 && (
                    <span className="text-[11px] text-muted-foreground ml-1">{t("amendments.mixedHint")}</span>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="col-span-2">
            <Label>{t("amendments.titleField")}</Label>
            <Input className="h-8" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="col-span-2 grid grid-cols-3 gap-3">
            <div>
              <Label>{t("amendments.effectiveDate")}</Label>
              <Input className="h-8" type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
            </div>
            <div>
              <Label>{t("amendments.signedDate")}</Label>
              <Input className="h-8" type="date" value={signedDate} onChange={e => setSignedDate(e.target.value)} />
            </div>
            <div>
              <Label>{t("amendments.newEndDate")}</Label>
              <Input className="h-8" type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} />
            </div>
          </div>
          <div className="col-span-2">
            <Label>{t("amendments.reason")}</Label>
            <Input className="h-8" value={reason} onChange={e => setReason(e.target.value)} />
          </div>

          <div>
              <Label>{t("amendments.newDeposit")}</Label>
              <Input className="h-8" type="number" value={newDeposit} onChange={e => setNewDeposit(e.target.value)} />
          </div>
          <div>
              <Label>{t("leases.noticePeriod")}</Label>
              <Input className="h-8" value={newNotice} onChange={e => setNewNotice(e.target.value)} />
          </div>
          <div className="col-span-2">
              <Label>{t("amendments.clauseSummary")}</Label>
              <Textarea value={clauseSummary} onChange={e => setClauseSummary(e.target.value)} />
          </div>

          <div className="col-span-2 border rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium">{t("amendments.unitChanges")}</div>
                <Popover open={addUnitOpen} onOpenChange={setAddUnitOpen}>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                      <Plus className="h-3.5 w-3.5" />
                      {t("amendments.addUnit")}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="end">
                    {propertyUnits.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-2 text-center">{t("amendments.noUnitsAvailable")}</div>
                    ) : (
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {propertyUnits.map(u => (
                          <button
                            key={u.id}
                            className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between"
                            onClick={() => {
                              setUnitsToAdd(arr => [...arr, { unitId: u.id, assignmentType: "parking", rentShare: "", chargesShare: "0" }]);
                              setAddUnitOpen(false);
                            }}
                          >
                            <span>{u.unitCode} — {u.unitLabel}</span>
                            <Plus className="h-3 w-3 text-success" />
                          </button>
                        ))}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
              {(() => {
                let totalRent = 0;
                let totalCharges = 0;
                for (const r of currentUnits) {
                  if (unitsToRemove.includes(r.unit.id)) continue;
                  const e = editedShares[r.unit.id];
                  totalRent += e?.rentShare !== undefined && e.rentShare !== "" ? Number(e.rentShare) : (r.assignment.rentShare ?? 0);
                  totalCharges += e?.chargesShare !== undefined && e.chargesShare !== "" ? Number(e.chargesShare) : (r.assignment.chargesShare ?? 0);
                }
                for (const a of unitsToAdd) {
                  totalRent += Number(a.rentShare || 0);
                  totalCharges += Number(a.chargesShare || 0);
                }
                return (
                  <div className="flex gap-4 text-xs bg-muted/30 rounded px-2 py-1.5">
                    <div><span className="text-muted-foreground">{t("amendments.totalRent")}: </span><span className="font-medium tabular-nums">{totalRent.toFixed(2)}</span></div>
                    <div><span className="text-muted-foreground">{t("amendments.totalCharges")}: </span><span className="font-medium tabular-nums">{totalCharges.toFixed(2)}</span></div>
                  </div>
                );
              })()}
              <div className="rounded border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="h-8">
                      <TableHead className="h-8 text-xs">{t("amendments.unitName")}</TableHead>
                      <TableHead className="h-8 text-xs">{t("amendments.role")}</TableHead>
                      <TableHead className="h-8 text-xs text-right">{t("amendments.rentShare")}</TableHead>
                      <TableHead className="h-8 text-xs text-right">{t("amendments.chargesShare")}</TableHead>
                      <TableHead className="h-8 text-xs">{t("amendments.status")}</TableHead>
                      <TableHead className="h-8 text-xs text-right w-12">{t("amendments.action")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentUnits.map(r => {
                      const marked = unitsToRemove.includes(r.unit.id);
                      const canRemove = !r.assignment.isPrimary;
                      const ed = editedShares[r.unit.id] ?? {};
                      const rentVal = ed.rentShare !== undefined ? ed.rentShare : String(r.assignment.rentShare ?? "");
                      const chargesVal = ed.chargesShare !== undefined ? ed.chargesShare : String(r.assignment.chargesShare ?? "");
                      return (
                        <TableRow key={r.unit.id} className={`h-9 ${marked ? "bg-destructive/5" : ""}`}>
                          <TableCell className={`py-1 text-xs ${marked ? "line-through text-muted-foreground" : ""}`}>
                            {r.unit.unitCode} — {r.unit.unitLabel}
                          </TableCell>
                          <TableCell className="py-1 text-xs text-muted-foreground">
                            {r.assignment.isPrimary ? "primary" : ASSIGNMENT_TYPE_LABELS[r.assignment.assignmentType as LeaseUnitAssignmentType] ?? "—"}
                          </TableCell>
                          <TableCell className="py-1">
                            <Input className="h-7 text-xs text-right tabular-nums" type="number" disabled={marked}
                              value={rentVal}
                              onChange={(e) => setEditedShares(m => ({ ...m, [r.unit.id]: { ...m[r.unit.id], rentShare: e.target.value } }))} />
                          </TableCell>
                          <TableCell className="py-1">
                            <Input className="h-7 text-xs text-right tabular-nums" type="number" disabled={marked}
                              value={chargesVal}
                              onChange={(e) => setEditedShares(m => ({ ...m, [r.unit.id]: { ...m[r.unit.id], chargesShare: e.target.value } }))} />
                          </TableCell>
                          <TableCell className="py-1 text-xs">
                            {marked
                              ? <Badge variant="destructive" className="text-[10px]">{t("amendments.toRemove")}</Badge>
                              : <Badge variant="secondary" className="text-[10px]">{t("amendments.statusCurrent")}</Badge>}
                          </TableCell>
                          <TableCell className="py-1 text-right">
                            {canRemove && (marked ? (
                              <Button size="icon" variant="ghost" className="h-7 w-7"
                                onClick={() => setUnitsToRemove(arr => arr.filter(x => x !== r.unit.id))}
                                aria-label="undo">
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                                onClick={() => setUnitsToRemove(arr => [...arr, r.unit.id])}
                                aria-label="remove">
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                            ))}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {unitsToAdd.map((a, idx) => {
                      const u = units.find(x => x.id === a.unitId);
                      return (
                        <TableRow key={`add-${a.unitId}-${idx}`} className="h-9 bg-success/5">
                          <TableCell className="py-1 text-xs font-medium">
                            {u ? `${u.unitCode} — ${u.unitLabel}` : a.unitId}
                          </TableCell>
                          <TableCell className="py-1">
                            <Select value={a.assignmentType}
                              onValueChange={(v) => setUnitsToAdd(arr => arr.map((x, i) => i === idx ? { ...x, assignmentType: v as LeaseUnitAssignmentType } : x))}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {ANC_ROLES.map(r => <SelectItem key={r} value={r}>{ASSIGNMENT_TYPE_LABELS[r]}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-1">
                            <Input className="h-7 text-xs text-right tabular-nums" type="number"
                              value={a.rentShare}
                              onChange={(e) => setUnitsToAdd(arr => arr.map((x, i) => i === idx ? { ...x, rentShare: e.target.value } : x))} />
                          </TableCell>
                          <TableCell className="py-1">
                            <Input className="h-7 text-xs text-right tabular-nums" type="number"
                              value={a.chargesShare}
                              onChange={(e) => setUnitsToAdd(arr => arr.map((x, i) => i === idx ? { ...x, chargesShare: e.target.value } : x))} />
                          </TableCell>
                          <TableCell className="py-1 text-xs">
                            <Badge className="text-[10px] bg-success text-success-foreground hover:bg-success">{t("amendments.toAdd")}</Badge>
                          </TableCell>
                          <TableCell className="py-1 text-right">
                            <Button size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => setUnitsToAdd(arr => arr.filter((_, i) => i !== idx))}
                              aria-label="undo">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {currentUnits.length === 0 && unitsToAdd.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="py-3 text-center text-xs text-muted-foreground">{t("amendments.noUnitsAvailable")}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="text-xs text-muted-foreground">
                {t("amendments.unitChangesSummary")
                  .replace("{add}", String(unitsToAdd.length))
                  .replace("{remove}", String(unitsToRemove.length))}
              </div>
          </div>

          <div className="col-span-2 border rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium">{t("amendments.coTenants")}</div>
              <Popover open={addTenantOpen} onOpenChange={setAddTenantOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    {t("amendments.addCoTenant")}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="end">
                  {(() => {
                    const available = tenants.filter(tn =>
                      tn.id !== lease.primaryTenantId &&
                      !lease.coTenantIds.includes(tn.id) &&
                      !tenantsToAdd.includes(tn.id));
                    if (available.length === 0) {
                      return <div className="text-xs text-muted-foreground py-2 text-center">{t("amendments.noTenantsAvailable")}</div>;
                    }
                    return (
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {available.map(tn => (
                          <button
                            key={tn.id}
                            className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between"
                            onClick={() => {
                              setTenantsToAdd(arr => [...arr, tn.id]);
                              setAddTenantOpen(false);
                            }}
                          >
                            <span>{tn.firstName} {tn.lastName}</span>
                            <Plus className="h-3 w-3 text-success" />
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </PopoverContent>
              </Popover>
            </div>
            <div className="rounded border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="h-8 text-xs">{t("amendments.tenantName")}</TableHead>
                    <TableHead className="h-8 text-xs">{t("amendments.tenantEmail")}</TableHead>
                    <TableHead className="h-8 text-xs">{t("amendments.tenantPhone")}</TableHead>
                    <TableHead className="h-8 text-xs">{t("amendments.status")}</TableHead>
                    <TableHead className="h-8 text-xs text-right w-12">{t("amendments.action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lease.coTenantIds.map(tid => {
                    const tn = tenants.find(x => x.id === tid);
                    const marked = tenantsToRemove.includes(tid);
                    return (
                      <TableRow key={tid} className={`h-9 ${marked ? "bg-destructive/5" : ""}`}>
                        <TableCell className={`py-1 text-xs ${marked ? "line-through text-muted-foreground" : ""}`}>
                          {tn ? `${tn.firstName} ${tn.lastName}` : tid}
                        </TableCell>
                        <TableCell className="py-1 text-xs text-muted-foreground">{tn?.email ?? "—"}</TableCell>
                        <TableCell className="py-1 text-xs text-muted-foreground">{tn?.phone ?? "—"}</TableCell>
                        <TableCell className="py-1 text-xs">
                          {marked
                            ? <Badge variant="destructive" className="text-[10px]">{t("amendments.toRemove")}</Badge>
                            : <Badge variant="secondary" className="text-[10px]">{t("amendments.statusCurrent")}</Badge>}
                        </TableCell>
                        <TableCell className="py-1 text-right">
                          {marked ? (
                            <Button size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => setTenantsToRemove(arr => arr.filter(x => x !== tid))}
                              aria-label="undo">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                              onClick={() => setTenantsToRemove(arr => [...arr, tid])}
                              aria-label="remove">
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {tenantsToAdd.map((tid, idx) => {
                    const tn = tenants.find(x => x.id === tid);
                    return (
                      <TableRow key={`add-${tid}-${idx}`} className="h-9 bg-success/5">
                        <TableCell className="py-1 text-xs font-medium">
                          {tn ? `${tn.firstName} ${tn.lastName}` : tid}
                        </TableCell>
                        <TableCell className="py-1 text-xs text-muted-foreground">{tn?.email ?? "—"}</TableCell>
                        <TableCell className="py-1 text-xs text-muted-foreground">{tn?.phone ?? "—"}</TableCell>
                        <TableCell className="py-1 text-xs">
                          <Badge className="text-[10px] bg-success text-success-foreground hover:bg-success">{t("amendments.toAdd")}</Badge>
                        </TableCell>
                        <TableCell className="py-1 text-right">
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => setTenantsToAdd(arr => arr.filter((_, i) => i !== idx))}
                            aria-label="undo">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {lease.coTenantIds.length === 0 && tenantsToAdd.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="py-3 text-center text-xs text-muted-foreground">{t("amendments.noCoTenants")}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="col-span-2">
            <Label>{t("amendments.notes")}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        {((liveValidation && (liveValidation.blockers.length > 0 || liveValidation.warnings.length > 0)) || coverageGap) && (
          <Alert variant={liveValidation?.blockers.length ? "destructive" : "default"}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <ul className="list-disc ml-4 text-xs">
                {liveValidation?.blockers.map(b => {
                  const k = `amendments.error.${b.code}` as TranslationKey;
                  const tr = (t as (key: TranslationKey) => string)(k);
                  return <li key={b.code}>{tr && tr !== k ? tr : b.message}</li>;
                })}
                {liveValidation?.warnings.map(w => {
                  const k = `amendments.error.${w.code}` as TranslationKey;
                  const tr = (t as (key: TranslationKey) => string)(k);
                  return <li key={w.code} className="text-warning">{tr && tr !== k ? tr : w.message}</li>;
                })}
                {coverageGap && (
                  <li className="text-warning">{t("amendments.gapWarning")}</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("action.cancel")}</Button>
          <Button variant="outline" disabled={!canSubmit} onClick={() => save("draft")}>{t("amendments.saveDraft")}</Button>
          <Button variant="outline" disabled={!canSubmit} onClick={() => save("scheduled")}>{t("amendments.schedule")}</Button>
          <Button disabled={!canActivate} onClick={() => save("active")}>{t("amendments.activate")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}