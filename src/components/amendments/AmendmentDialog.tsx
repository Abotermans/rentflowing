import { useEffect, useMemo, useState } from "react";
import { propertyBusinessDateISO } from "@/lib/businessTimeZone";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { validateAmendment } from "@/lib/integrity/amendmentIntegrity";
import { getCurrentLeaseTerms, isAmendmentEditable, canSchedule, canActivate } from "@/lib/amendments";
import { AmendmentConfirmDialog } from "./AmendmentConfirmDialog";
import type {
  AmendmentStatus,
  LeaseAmendment,
  LeaseAmendmentChange,
  AmendmentFieldName,
  AmendmentChangeType,
  AmendmentChangeMetadata,
} from "@/types/amendments";
import { Dialog, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Plus, Minus, X, ChevronDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/shared/DateInput";
import type { Lease, RentFormula } from "@/types";
import type { TranslationKey } from "@/i18n/translations";
import { parseNoticeText, serializeNotice, type NoticeUnit } from "@/lib/noticePeriod";
import { formatCurrency } from "@/lib/formatters";
import { getAllRentTiers, getMonthlyRentForMonths } from "@/lib/rentTiers";
import { useToast } from "@/hooks/use-toast";
import { usePortfolioWriteAccess } from "@/hooks/use-portfolio-write-access";
import { Info } from "lucide-react";

type ChangeDraft = Omit<LeaseAmendmentChange, "id" | "amendmentId" | "createdAt" | "updatedAt">;
type IndexationDraft = {
  enabled: boolean;
  baseDate: string;
  baseIndex: string;
  currentIndex: string;
  capPercent: string;
  roundingMode: NonNullable<Lease["indexationRoundingMode"]>;
  notes: string;
};

const buildIndexationDraft = (lease: Lease): IndexationDraft => ({
  enabled: !!lease.indexationEnabled,
  baseDate: lease.indexationBaseDate ?? lease.startDate ?? "",
  baseIndex: lease.indexationBaseIndex == null ? "" : String(lease.indexationBaseIndex),
  currentIndex: lease.indexationCurrentIndex == null ? "" : String(lease.indexationCurrentIndex),
  capPercent: lease.indexationCapPercent == null ? "" : String(lease.indexationCapPercent),
  roundingMode: lease.indexationRoundingMode ?? "nearest-cent",
  notes: lease.indexationNotes ?? "",
});

const serializeIndexationDraft = (draft: IndexationDraft) => ({
  indexationEnabled: draft.enabled,
  indexationFrequency: "yearly" as const,
  indexationBaseDate: draft.enabled ? (draft.baseDate || null) : null,
  indexationBaseIndex: draft.enabled && draft.baseIndex !== "" ? Number(draft.baseIndex) : null,
  indexationCurrentIndex: draft.enabled && draft.currentIndex !== "" ? Number(draft.currentIndex) : null,
  indexationCapPercent: draft.enabled && draft.capPercent !== "" ? Number(draft.capPercent) : null,
  indexationRoundingMode: draft.roundingMode,
  indexationNotes: draft.notes,
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lease: Lease;
  existing?: LeaseAmendment | null;
}

export function AmendmentDialog({ open, onOpenChange, lease, existing }: Props) {
  const { t } = useSettings();
  const { toast } = useToast();
  const canWrite = usePortfolioWriteAccess();
  const {
    properties, units, tenants, getLeaseAssignedUnits,
    addAmendment, updateAmendment, activateAmendment, scheduleAmendment, updateUnitPersisted,
    getAmendmentChanges,
  } = useAppData();
  const integrityState = useIntegrityState();
  const property = properties.find(candidate => candidate.id === lease.propertyId);
  const currency = property?.currencyCode ?? "EUR";
  const editable = canWrite && isAmendmentEditable(existing);
  const [confirmAction, setConfirmAction] = useState<"schedule" | "activate" | null>(null);

  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [signedDate, setSignedDate] = useState("");

  // Per-type fields
  const [newDeposit, setNewDeposit] = useState("");
  const [noticeValue, setNoticeValue] = useState("");
  const [noticeUnit, setNoticeUnit] = useState<"days" | "weeks" | "months" | "years">("months");
  const [clauseSummary, setClauseSummary] = useState("");
  const [amendmentRentFormula, setAmendmentRentFormula] = useState<RentFormula>(lease.rentFormula || 1);
  const [indexationDraft, setIndexationDraft] = useState<IndexationDraft>(() => buildIndexationDraft(lease));
  const [formulaDraftOpen, setFormulaDraftOpen] = useState(false);
  const [formulaDraft, setFormulaDraft] = useState({ durationMonths: "", monthlyRent: "" });
  // Unit-change drafts (multi-row, intuitive add/remove UX)
  type AddDraft = { unitId: string; rentShare: string; chargesShare: string; endDate: string };
  const [unitsToAdd, setUnitsToAdd] = useState<AddDraft[]>([]);
  const [unitsToRemove, setUnitsToRemove] = useState<string[]>([]);
  const [editedShares, setEditedShares] = useState<Record<string, { rentShare?: string; chargesShare?: string }>>({});
  const [editedEndDates, setEditedEndDates] = useState<Record<string, string>>({});
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

  const formulaUnits = useMemo(() => {
    const active = currentUnits
      .filter(r => !unitsToRemove.includes(r.unit.id))
      .map(r => r.unit);
    const added = unitsToAdd
      .map(row => units.find(unit => unit.id === row.unitId))
      .filter((unit): unit is NonNullable<typeof unit> => !!unit);
    return [...active, ...added];
  }, [currentUnits, unitsToRemove, unitsToAdd, units]);

  const commonRentFormulas = useMemo(() => {
    if (formulaUnits.length === 0) return [];
    const perUnit = formulaUnits.map(unit => new Map(getAllRentTiers(unit).map(tier => [tier.durationMonths, tier.monthlyRent])));
    const [first, ...rest] = perUnit;
    return [...first.entries()]
      .filter(([months]) => rest.every(map => map.has(months)))
      .map(([durationMonths]) => ({ durationMonths }))
      .sort((a, b) => a.durationMonths - b.durationMonths);
  }, [formulaUnits]);

  const formulaCreationUnit = formulaUnits.length === 1 ? formulaUnits[0] : null;
  const formulaDraftMonths = Number(formulaDraft.durationMonths);
  const formulaDraftRent = Number(formulaDraft.monthlyRent);
  const formulaDraftTotal = Number.isFinite(formulaDraftMonths) && Number.isFinite(formulaDraftRent) && formulaDraftMonths > 0 && formulaDraftRent >= 0
    ? formulaDraftMonths * formulaDraftRent
    : null;
  const rentFormulaChanged = amendmentRentFormula !== (lease.rentFormula || 1);
  const indexationChanged = JSON.stringify(serializeIndexationDraft(indexationDraft)) !== JSON.stringify(serializeIndexationDraft(buildIndexationDraft(lease)));

  const applyRentFormula = (months: RentFormula) => {
    setAmendmentRentFormula(months);
    setEditedShares(prev => {
      const next = { ...prev };
      for (const r of currentUnits) {
        if (unitsToRemove.includes(r.unit.id)) continue;
        const rent = getMonthlyRentForMonths(r.unit, months);
        if (rent != null) next[r.unit.id] = { ...next[r.unit.id], rentShare: String(rent) };
      }
      return next;
    });
    setUnitsToAdd(prev => prev.map(row => {
      const unit = units.find(u => u.id === row.unitId);
      const rent = unit ? getMonthlyRentForMonths(unit, months) : null;
      return rent == null ? row : { ...row, rentShare: String(rent) };
    }));
  };

  const openFormulaDraft = () => {
    if (!formulaCreationUnit) return;
    const currentRent = getMonthlyRentForMonths(formulaCreationUnit, amendmentRentFormula) ?? formulaCreationUnit.baseRent ?? 0;
    setFormulaDraft({ durationMonths: "", monthlyRent: currentRent ? String(currentRent) : "" });
    setFormulaDraftOpen(true);
  };

  const saveFormulaDraft = async () => {
    if (!canWrite) return;
    if (!formulaCreationUnit) {
      toast({ title: "Validation Error", description: t("leases.formula.selectSingleUnit"), variant: "destructive" });
      return;
    }
    const durationMonths = Math.floor(Number(formulaDraft.durationMonths));
    const monthlyRent = Number(formulaDraft.monthlyRent);
    if (!Number.isInteger(durationMonths) || durationMonths < 1) {
      toast({ title: "Validation Error", description: "Enter a period of at least 1 month.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(monthlyRent) || monthlyRent < 0) {
      toast({ title: "Validation Error", description: "Enter a valid monthly rent.", variant: "destructive" });
      return;
    }
    const nextUnit = durationMonths === 1
      ? { ...formulaCreationUnit, baseRent: monthlyRent }
      : {
          ...formulaCreationUnit,
          rentTiers: [
            ...(formulaCreationUnit.rentTiers ?? []).filter(tier => tier.durationMonths !== durationMonths),
            { durationMonths, monthlyRent },
          ].sort((a, b) => a.durationMonths - b.durationMonths),
        };
    try {
      await updateUnitPersisted(nextUnit);
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      return;
    }
    applyRentFormula(durationMonths as RentFormula);
    setEditedShares(prev => ({
      ...prev,
      [formulaCreationUnit.id]: { ...prev[formulaCreationUnit.id], rentShare: String(monthlyRent) },
    }));
    setUnitsToAdd(prev => prev.map(row => (
      row.unitId === formulaCreationUnit.id ? { ...row, rentShare: String(monthlyRent) } : row
    )));
    setFormulaDraftOpen(false);
    setFormulaDraft({ durationMonths: "", monthlyRent: "" });
    toast({ title: t("leases.formula.saved"), description: formulaCreationUnit.unitCode });
  };

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setReason(existing.reason);
      setNotes(existing.notes);
      setEffectiveDate(existing.effectiveDate);
      setSignedDate(existing.signedDate ?? "");
      const chs = getAmendmentChanges(existing.id);
      const find = (f: AmendmentFieldName) => chs.find(c => c.fieldName === f);
      setNewDeposit(String(find("depositAmount")?.newValue ?? ""));
      {
        const parsed = parseNoticeText(String(find("noticePeriodText")?.newValue ?? ""));
        setNoticeValue(parsed.value);
        setNoticeUnit(parsed.unit);
      }
      setClauseSummary(String(find("clauseSummary")?.newValue ?? ""));
      setAmendmentRentFormula(Math.max(1, Number(find("rentFormula")?.newValue ?? lease.rentFormula ?? 1)) as RentFormula);
      {
        const stored = find("indexationSettings")?.newValue as Partial<Lease> | undefined;
        setIndexationDraft(stored ? buildIndexationDraft({ ...lease, ...stored }) : buildIndexationDraft(lease));
      }
      setFormulaDraftOpen(false);
      setFormulaDraft({ durationMonths: "", monthlyRent: "" });
      const edits: Record<string, { rentShare?: string; chargesShare?: string }> = {};
      for (const c of chs) {
        const uid = c.metadata?.unitId;
        if (!uid) continue;
        if (c.fieldName === "unitRentShare") edits[uid] = { ...edits[uid], rentShare: String(c.newValue ?? "") };
        if (c.fieldName === "unitChargesShare") edits[uid] = { ...edits[uid], chargesShare: String(c.newValue ?? "") };
      }
      setEditedShares(edits);
      const endEdits: Record<string, string> = {};
      for (const c of chs) {
        if (c.fieldName === "unitEndDate" && c.metadata?.unitId) {
          endEdits[c.metadata.unitId] = String(c.newValue ?? "");
        }
      }
      setEditedEndDates(endEdits);
      const addChs = chs.filter(c => c.fieldName === "unitAssignments" && c.changeType === "add");
      setUnitsToAdd(addChs.map(c => {
        const nv = (c.newValue ?? {}) as { rentShare?: number; chargesShare?: number };
        return {
          unitId: c.metadata?.unitId ?? "",
          rentShare: String(nv.rentShare ?? ""),
          chargesShare: String(nv.chargesShare ?? "0"),
          endDate: c.metadata?.endDate ?? "",
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
      setNewDeposit(String(lease.depositOrGuaranteeAmount ?? ""));
      {
        const parsed = parseNoticeText(lease.noticePeriodText);
        setNoticeValue(parsed.value);
        setNoticeUnit(parsed.unit);
      }
      setClauseSummary(""); setAmendmentRentFormula(lease.rentFormula || 1); setIndexationDraft(buildIndexationDraft(lease)); setFormulaDraftOpen(false); setFormulaDraft({ durationMonths: "", monthlyRent: "" }); setUnitsToAdd([]); setUnitsToRemove([]); setEditedShares({}); setEditedEndDates({});
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

    if (newDeposit && Number(newDeposit) !== (lease.depositOrGuaranteeAmount ?? 0)) {
      push("depositAmount", "set", lease.depositOrGuaranteeAmount, Number(newDeposit));
    }
    const noticeSerialized = serializeNotice(noticeValue, noticeUnit);
    if (noticeSerialized && noticeSerialized !== lease.noticePeriodText) {
      push("noticePeriodText", "set", lease.noticePeriodText, noticeSerialized);
    }
    if (amendmentRentFormula !== (lease.rentFormula || 1)) {
      push("rentFormula", "set", lease.rentFormula || 1, amendmentRentFormula);
    }
    if (indexationChanged) {
      push("indexationSettings", "set", serializeIndexationDraft(buildIndexationDraft(lease)), serializeIndexationDraft(indexationDraft));
    }
    if (clauseSummary) {
      push("clauseSummary", "set", "", clauseSummary);
    }
    for (const r of currentUnits) {
      if (unitsToRemove.includes(r.unit.id)) continue;
      const e = editedShares[r.unit.id];
      const oldRent = r.assignment.rentShare ?? 0;
      const oldCh = r.assignment.chargesShare ?? 0;
      if (e) {
        if (e.rentShare !== undefined && e.rentShare !== "" && Number(e.rentShare) !== oldRent) {
          push("unitRentShare", "set", oldRent, Number(e.rentShare), { unitId: r.unit.id });
        }
        if (e.chargesShare !== undefined && e.chargesShare !== "" && Number(e.chargesShare) !== oldCh) {
          push("unitChargesShare", "set", oldCh, Number(e.chargesShare), { unitId: r.unit.id });
        }
      }
      const oldEnd = r.assignment.endDate ?? lease.endDate;
      const newEnd = editedEndDates[r.unit.id];
      if (newEnd !== undefined && newEnd !== "" && newEnd !== oldEnd) {
        push("unitEndDate", "set", oldEnd, newEnd, { unitId: r.unit.id, originalLeaseEndDate: lease.endDate });
      }
    }
    for (const a of unitsToAdd) {
      if (!a.unitId) continue;
      push("unitAssignments", "add", null,
        { rentShare: Number(a.rentShare || 0), chargesShare: Number(a.chargesShare || 0) },
        { unitId: a.unitId, endDate: a.endDate || lease.endDate, originalLeaseEndDate: lease.endDate });
    }
    for (const uid of unitsToRemove) {
      push("unitAssignments", "remove", { unitId: uid }, null,
        { unitId: uid, originalLeaseEndDate: lease.endDate });
    }
    for (const tid of tenantsToAdd) {
      push("coTenantIds", "add", lease.coTenantIds, [...lease.coTenantIds, tid], { tenantId: tid });
    }
    for (const tid of tenantsToRemove) {
      push("coTenantIds", "remove", lease.coTenantIds, lease.coTenantIds.filter(x => x !== tid), { tenantId: tid });
    }
    return out;
  }, [newDeposit, noticeValue, noticeUnit, clauseSummary,
      unitsToAdd, unitsToRemove, editedShares, editedEndDates, currentUnits, tenantsToAdd, tenantsToRemove,
      lease, amendmentRentFormula, indexationChanged, indexationDraft]);

  const { totalRent, totalCharges } = useMemo(() => {
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
    return { totalRent, totalCharges };
  }, [currentUnits, unitsToRemove, editedShares, unitsToAdd]);

  // Live validation (uses a temp amendment record so validateAmendment can run).
  const liveValidation = useMemo(() => {
    if (!effectiveDate) return null;
    const tempAm: LeaseAmendment = {
      id: existing?.id ?? "preview",
      leaseId: lease.id,
      amendmentNumber: existing?.amendmentNumber ?? 0,
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
  }, [effectiveDate, title, reason, notes, signedDate, changesDraft, integrityState, lease.id, existing]);

  const todayISO = propertyBusinessDateISO(property);
  const draftLike = useMemo(() => ({
    id: existing?.id ?? "preview",
    leaseId: lease.id,
    amendmentNumber: existing?.amendmentNumber ?? 0,
    title, reason, notes,
    effectiveDate,
    signedDate: signedDate || null,
    status: (existing?.status ?? "draft") as AmendmentStatus,
    supersedesAmendmentId: existing?.supersedesAmendmentId ?? null,
  }), [existing, lease.id, title, reason, notes, effectiveDate, signedDate]);
  const fullChanges = useMemo(() => changesDraft.map((c, i) => ({
    ...c, id: `p${i}`, amendmentId: draftLike.id, createdAt: "", updatedAt: "",
  })), [changesDraft, draftLike.id]);
  const scheduleGate = useMemo(() => canSchedule(draftLike, fullChanges, integrityState),
    [draftLike, fullChanges, integrityState]);
  const activateGate = useMemo(() => canActivate(draftLike, fullChanges, integrityState, todayISO),
    [draftLike, fullChanges, integrityState, todayISO]);
  const canSubmit = title.trim().length > 0 && !!effectiveDate;
  const isActive = existing?.status === "active";

  const coverageGap = useMemo(() => {
    if (!effectiveDate) return false;
    const currentTerms = getCurrentLeaseTerms(lease.id, integrityState);
    const coverageEnd = currentTerms?.endDate ?? lease.endDate;
    if (!coverageEnd) return false;
    if (effectiveDate <= coverageEnd) return false;
    // If any per-unit end date edit extends past the effective date, gap is bridged.
    const maxNewEnd = Object.values(editedEndDates).reduce((m, d) => (d && d > m ? d : m), "");
    if (maxNewEnd && maxNewEnd >= effectiveDate) return false;
    return true;
  }, [effectiveDate, editedEndDates, lease, integrityState]);

  const save = async (status: AmendmentStatus) => {
    if (!canWrite || !canSubmit) return;
    // Date-driven: never persist active when date is future; never persist scheduled when date is past.
    if (status === "active" && effectiveDate > todayISO) status = "scheduled";
    if (status === "scheduled" && effectiveDate <= todayISO) status = "active";
    try {
    let activation: { ok: boolean; reason?: string } | null = null;
    if (existing) {
      const patched = {
        ...existing,
        title, reason, notes,
        effectiveDate, signedDate: signedDate || null,
        status: status === "active" ? "draft" : status,
      };
      const persisted = await updateAmendment(patched, changesDraft);
      if (status === "active" && existing.status !== "active") {
        activation = await activateAmendment(existing.id, persisted);
      }
    } else {
      const created = await addAmendment({
        leaseId: lease.id,
        title, reason, notes,
        effectiveDate, signedDate: signedDate || null,
        supersedesAmendmentId: null,
        status: status === "active" ? "draft" : status,
      }, changesDraft);
      if (status === "active") activation = await activateAmendment(created.amendment.id, created);
    }
    if (activation && !activation.ok) throw new Error(activation.reason || "Amendment activation failed");
    // Sync edited per-unit rent back to the Unit record on activation only for
    // monthly formulas. Advance formulas store their rent in unit rent tiers.
    if (status === "active" && amendmentRentFormula === 1) {
      for (const r of currentUnits) {
        if (unitsToRemove.includes(r.unit.id)) continue;
        const e = editedShares[r.unit.id];
        if (e?.rentShare !== undefined && e.rentShare !== "" && Number(e.rentShare) !== (r.assignment.rentShare ?? 0)) {
          await updateUnitPersisted({ ...r.unit, baseRent: Number(e.rentShare) });
        }
      }
      for (const a of unitsToAdd) {
        const u = units.find(x => x.id === a.unitId);
        if (u && a.rentShare !== "" && Number(a.rentShare) !== (u.baseRent ?? 0)) {
          await updateUnitPersisted({ ...u, baseRent: Number(a.rentShare) });
        }
      }
    }
    onOpenChange(false);
    } catch (error) {
      toast({ variant: "destructive", title: "Amendment could not be saved", description: error instanceof Error ? error.message : String(error) });
    }
  };

  const requestSchedule = () => { if (scheduleGate.ok) setConfirmAction("schedule"); };
  const requestActivate = () => { if (activateGate.ok) setConfirmAction("activate"); };
  const handleConfirm = () => {
    if (confirmAction === "activate") save("active");
    else if (confirmAction === "schedule") save("scheduled");
    setConfirmAction(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="large">
        <DialogHeader>
          <DialogTitle>{existing ? t("amendments.edit") : t("amendments.add")}</DialogTitle>
        </DialogHeader>

        {!editable && (
          <Alert className="border-primary/30 bg-primary/5">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">{canWrite ? t("amendments.readOnlyNotice") : t("amendments.viewerReadOnlyNotice")}</AlertDescription>
          </Alert>
        )}

        <fieldset disabled={!editable} className="grid grid-cols-2 gap-3 disabled:opacity-70">
          <div className="col-span-2">
            <Label>{t("amendments.titleField")} *</Label>
            <Input className="h-8" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div className="space-y-1">
              <div className="flex h-5 items-center gap-1.5">
                <Label>{t("amendments.effectiveDate")} *</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center" sideOffset={6} collisionPadding={24} avoidCollisions className="max-w-[260px]">
                    <p className="text-xs">{t("amendments.effectiveDateUnitStartHelp")}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-2">
                <DateInput className="h-8" value={effectiveDate} onChange={setEffectiveDate} />
                {(() => {
                  if (!effectiveDate || effectiveDate >= todayISO) return null;
                  return (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertTriangle className="h-4 w-4 text-warning shrink-0 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs max-w-[280px]">{t("amendments.error.AMD_EFFECTIVE_IN_PAST")}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })()}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex h-5 items-center">
                <Label>{t("amendments.signedDate")}</Label>
              </div>
              <DateInput className="h-8" value={signedDate} onChange={setSignedDate} />
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
              <div className="flex gap-2">
                <Input className="h-8 w-24" type="number" min="0" value={noticeValue}
                  onChange={e => setNoticeValue(e.target.value)} />
                <Select value={noticeUnit} onValueChange={(v) => setNoticeUnit(v as NoticeUnit)}>
                  <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">{t("amendments.noticeUnit.days")}</SelectItem>
                    <SelectItem value="weeks">{t("amendments.noticeUnit.weeks")}</SelectItem>
                    <SelectItem value="months">{t("amendments.noticeUnit.months")}</SelectItem>
                    <SelectItem value="years">{t("amendments.noticeUnit.years")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
          </div>
          <div className="col-span-2 space-y-2 rounded-md border p-3">
            <div className={rentFormulaChanged ? "grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" : "grid grid-cols-1 gap-3"}>
              <div>
                <Label className="mb-1 flex h-5 items-center">{t("leases.formula")} *</Label>
                <Select
                  value={String(amendmentRentFormula)}
                  disabled={commonRentFormulas.length === 0 && !formulaCreationUnit}
                  onValueChange={(raw) => {
                    if (raw === "__new_formula__") {
                      openFormulaDraft();
                      return;
                    }
                    applyRentFormula(Number(raw) as RentFormula);
                  }}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {commonRentFormulas.length === 0 && (
                      <SelectItem value="1" disabled>{t("leases.formula.notAvailable")}</SelectItem>
                    )}
                    {commonRentFormulas.map(tier => (
                      <SelectItem key={tier.durationMonths} value={String(tier.durationMonths)}>
                        {tier.durationMonths === 1 ? t("leases.formula.monthly") : `${tier.durationMonths} ${t("rentPrepayment.monthsSuffix")}`}
                      </SelectItem>
                    ))}
                    <SelectSeparator />
                    <SelectItem value="__new_formula__" disabled={!formulaCreationUnit}>
                      <span className="flex items-center gap-2">
                        <Plus className="h-3.5 w-3.5" />
                        {t("leases.formula.new")}
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {commonRentFormulas.length === 0 && !formulaCreationUnit && (
                  <p className="mt-1 text-xs text-muted-foreground">{t("leases.formula.requiresCommonTiers")}</p>
                )}
              </div>
              {rentFormulaChanged && (
                <Alert className="border-warning/40 bg-warning/10 text-warning [&>svg]:text-warning">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {t("amendments.rentFormulaEffectiveDateWarning")}
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <div className="space-y-3 rounded-md border bg-background/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm font-medium">{t("leaseDetail.rentIndexation")}</Label>
                  <p className="mt-1 text-xs text-muted-foreground">{t("leaseIndexation.amendmentHelp")}</p>
                </div>
                <Switch
                  checked={indexationDraft.enabled}
                  onCheckedChange={checked => setIndexationDraft(draft => ({ ...draft, enabled: checked, baseDate: checked ? (draft.baseDate || effectiveDate || lease.startDate) : draft.baseDate }))}
                />
              </div>
              {indexationDraft.enabled && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <Label>{t("leaseIndexation.baseDate")}</Label>
                    <DateInput value={indexationDraft.baseDate} onChange={value => setIndexationDraft(draft => ({ ...draft, baseDate: value }))} />
                  </div>
                  <div>
                    <Label>{t("leaseIndexation.baseIndex")}</Label>
                    <Input className="h-8" type="number" min={0} step="0.0001" value={indexationDraft.baseIndex} onChange={e => setIndexationDraft(draft => ({ ...draft, baseIndex: e.target.value }))} />
                  </div>
                  <div>
                    <Label>{t("leaseIndexation.currentIndex")}</Label>
                    <Input className="h-8" type="number" min={0} step="0.0001" value={indexationDraft.currentIndex} onChange={e => setIndexationDraft(draft => ({ ...draft, currentIndex: e.target.value }))} />
                  </div>
                  <div>
                    <Label>{t("leaseIndexation.cap")}</Label>
                    <Input className="h-8" type="number" min={0} step="0.01" value={indexationDraft.capPercent} onChange={e => setIndexationDraft(draft => ({ ...draft, capPercent: e.target.value }))} />
                  </div>
                  <div>
                    <Label>{t("leaseIndexation.rounding")}</Label>
                    <Select value={indexationDraft.roundingMode} onValueChange={value => setIndexationDraft(draft => ({ ...draft, roundingMode: value as IndexationDraft["roundingMode"] }))}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nearest-cent">{t("leaseIndexation.nearestCent")}</SelectItem>
                        <SelectItem value="nearest-euro">{t("leaseIndexation.nearestEuro")}</SelectItem>
                        <SelectItem value="none">{t("leaseIndexation.noMonthlyRounding")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-3">
                    <Label>{t("leaseIndexation.regulatoryNotes")}</Label>
                    <Textarea value={indexationDraft.notes} onChange={e => setIndexationDraft(draft => ({ ...draft, notes: e.target.value }))} rows={2} />
                  </div>
                </div>
              )}
              {indexationChanged && (
                <Alert className="border-warning/40 bg-warning/10 text-warning [&>svg]:text-warning">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    When this amendment becomes active, future unpaid rent receivables due on or after the effective date will be recalculated using the updated indexation settings. Allocated future receivables are kept for manual review.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {formulaDraftOpen && (
              <div className="rounded-md border bg-background/70 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[140px_minmax(0,1fr)_160px_auto]">
                  <div>
                    <Label className="text-xs">{t("units.rentTiers.period")}</Label>
                    <Input
                      className="h-8"
                      type="number"
                      min={1}
                      value={formulaDraft.durationMonths}
                      onChange={event => setFormulaDraft(draft => ({ ...draft, durationMonths: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("units.rentTiers.monthlyRent")}</Label>
                    <Input
                      className="h-8"
                      type="number"
                      min={0}
                      value={formulaDraft.monthlyRent}
                      onChange={event => setFormulaDraft(draft => ({ ...draft, monthlyRent: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("units.rentTiers.total")}</Label>
                    <div className="flex h-8 items-center rounded-md border bg-muted/30 px-3 text-sm font-medium">
                      {formulaDraftTotal == null ? "—" : formatCurrency(formulaDraftTotal, currency, property?.locale)}
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setFormulaDraftOpen(false)}>
                      {t("action.cancel")}
                    </Button>
                    <Button type="button" size="sm" className="h-8" onClick={saveFormulaDraft}>
                      {t("documents.save")}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="col-span-2">
              <Label>{t("amendments.clauseSummary")}</Label>
              <Textarea value={clauseSummary} onChange={e => setClauseSummary(e.target.value)} />
          </div>

          <div className="col-span-2 border rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{t("amendments.unitChanges")}</div>
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
                              setUnitsToAdd(arr => [...arr, {
                                unitId: u.id,
                                rentShare: "",
                                chargesShare: "0",
                                endDate: lease.endDate,
                              }]);
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
              <div className="rounded overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="h-8">
                      <TableHead className="h-8 text-xs">{t("amendments.unitName")}</TableHead>
                      <TableHead className="h-8 text-xs text-right">{t("amendments.rentShare")}</TableHead>
                      <TableHead className="h-8 text-xs text-right">{t("amendments.chargesShare")}</TableHead>
                      <TableHead className="h-8 text-xs">
                        <span className="inline-flex items-center gap-1">
                          {t("amendments.unitEndDate")}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs max-w-[260px]">{t("amendments.unitEndDateTooltip")}</p>
                            </TooltipContent>
                          </Tooltip>
                        </span>
                      </TableHead>
                      <TableHead className="h-8 text-xs">{t("amendments.status")}</TableHead>
                      <TableHead className="h-8 text-xs text-right w-12">{t("amendments.action")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentUnits.map(r => {
                      const marked = unitsToRemove.includes(r.unit.id);
                      const remainingCount = currentUnits.length - unitsToRemove.length + unitsToAdd.length;
                      const canRemove = marked || remainingCount > 1;
                      const ed = editedShares[r.unit.id] ?? {};
                      const rentVal = ed.rentShare !== undefined ? ed.rentShare : String(r.assignment.rentShare ?? "");
                      const chargesVal = ed.chargesShare !== undefined ? ed.chargesShare : String(r.assignment.chargesShare ?? "");
                      const endVal = editedEndDates[r.unit.id] !== undefined
                        ? editedEndDates[r.unit.id]
                        : (r.assignment.endDate ?? lease.endDate);
                      return (
                        <TableRow key={r.unit.id} className={`h-9 ${marked ? "bg-destructive/5" : ""}`}>
                          <TableCell className={`py-1 text-xs ${marked ? "line-through text-muted-foreground" : ""}`}>
                            {r.unit.unitCode} — {r.unit.unitLabel}
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
                          <TableCell className="py-1">
                            <DateInput className="h-7 text-xs" disabled={marked}
                              value={endVal}
                              onChange={(value) => setEditedEndDates(m => ({ ...m, [r.unit.id]: value }))} />
                          </TableCell>
                          <TableCell className="py-1 text-xs">
                            {marked
                              ? <Badge variant="destructive" className="text-xs">{t("amendments.toRemove")}</Badge>
                              : <Badge variant="secondary" className="text-xs">{t("amendments.statusCurrent")}</Badge>}
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
                            <Input className="h-7 text-xs text-right tabular-nums" type="number"
                              value={a.rentShare}
                              onChange={(e) => setUnitsToAdd(arr => arr.map((x, i) => i === idx ? { ...x, rentShare: e.target.value } : x))} />
                          </TableCell>
                          <TableCell className="py-1">
                            <Input className="h-7 text-xs text-right tabular-nums" type="number"
                              value={a.chargesShare}
                              onChange={(e) => setUnitsToAdd(arr => arr.map((x, i) => i === idx ? { ...x, chargesShare: e.target.value } : x))} />
                          </TableCell>
                          <TableCell className="py-1">
                            <DateInput className="h-7 text-xs"
                              value={a.endDate}
                              onChange={(value) => setUnitsToAdd(arr => arr.map((x, i) => i === idx ? { ...x, endDate: value } : x))} />
                          </TableCell>
                          <TableCell className="py-1 text-xs">
                            <Badge className="text-xs bg-success text-success-foreground hover:bg-success">{t("amendments.toAdd")}</Badge>
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
                    {(currentUnits.length > 0 || unitsToAdd.length > 0) && (
                      <TableRow className="h-9 border-t-2 border-t-border font-medium bg-muted/30">
                        <TableCell className="py-1 text-xs">{t("common.total")}</TableCell>
                        <TableCell className="py-1 text-xs text-right tabular-nums">{formatCurrency(totalRent, currency, property?.locale)}</TableCell>
                        <TableCell className="py-1 text-xs text-right tabular-nums">{formatCurrency(totalCharges, currency, property?.locale)}</TableCell>
                        <TableCell className="py-1" />
                        <TableCell className="py-1" />
                        <TableCell className="py-1" />
                      </TableRow>
                    )}
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
              <div className="text-sm font-medium">{t("amendments.coTenants")}</div>
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
            <div className="rounded overflow-hidden">
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
                            ? <Badge variant="destructive" className="text-xs">{t("amendments.toRemove")}</Badge>
                            : <Badge variant="secondary" className="text-xs">{t("amendments.statusCurrent")}</Badge>}
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
                          <Badge className="text-xs bg-success text-success-foreground hover:bg-success">{t("amendments.toAdd")}</Badge>
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
        </fieldset>

        {(() => {
          const blockers = liveValidation?.blockers ?? [];
          // Past-date warning is already surfaced inline next to the effective date field.
          const warnings = (liveValidation?.warnings ?? []).filter(w => w.code !== "AMD_EFFECTIVE_IN_PAST");
          if (blockers.length === 0 && warnings.length === 0 && !coverageGap) return null;
          const isDestructive = blockers.length > 0;
          return (
            <Alert
              variant={isDestructive ? "destructive" : "default"}
              className={isDestructive ? "" : "border-warning/40 bg-warning/10 text-warning [&>svg]:text-warning"}
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc ml-4 text-xs space-y-0.5">
                  {blockers.map(b => {
                    const k = `amendments.error.${b.code}` as TranslationKey;
                    const tr = (t as (key: TranslationKey) => string)(k);
                    return <li key={b.code}>{tr && tr !== k ? tr : b.message}</li>;
                  })}
                  {warnings.map(w => {
                    const k = `amendments.error.${w.code}` as TranslationKey;
                    const tr = (t as (key: TranslationKey) => string)(k);
                    return <li key={w.code}>{tr && tr !== k ? tr : w.message}</li>;
                  })}
                  {coverageGap && <li>{t("amendments.gapWarning")}</li>}
                </ul>
              </AlertDescription>
            </Alert>
          );
        })()}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {editable ? t("action.cancel") : t("action.close")}
          </Button>
          {editable && !isActive && (
            <div className="flex gap-2">
              <Button variant="outline" disabled={!canSubmit} onClick={() => save("draft")}>{t("amendments.saveDraft")}</Button>
              <Button variant="outline" disabled={!scheduleGate.ok} onClick={requestSchedule}>{t("amendments.schedule")}</Button>
              <Button disabled={!activateGate.ok} onClick={requestActivate}>{t("amendments.activate")}</Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
      {confirmAction && (
        <AmendmentConfirmDialog
          open={!!confirmAction}
          onOpenChange={(o) => { if (!o) setConfirmAction(null); }}
          lease={lease}
          effectiveDate={effectiveDate}
          changes={changesDraft}
          action={confirmAction}
          onConfirm={handleConfirm}
        />
      )}
    </Dialog>
  );
}
