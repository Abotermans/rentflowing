import { useState } from "react";
import { cn } from "@/lib/utils";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Clock, Plus, AlertTriangle, Bell, CheckCircle2, XCircle, Banknote, ChevronDown, MoreVertical, Trash2, Undo2, Zap, Droplet, RefreshCw, Mail, Phone } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { computeAdvancePricing, ADVANCE_METHOD_LABELS, ADVANCE_APPLIED_LABELS } from "@/lib/advancePricing";
import { getTenantFullName, type GuaranteeType, type Guarantee, type ReturnStatus, type MoveInChecklist, type MoveOutChecklist, type LeaseEndReason, getLeaseStatus, getMoveInStatus, getMoveOutStatus, computeGuaranteeStatus, type GuaranteeStatus } from "@/types";
import { ASSIGNMENT_TYPE_LABELS, isAncillaryAssignmentType } from "@/types";
import { getItemTypeLabel, getSourceTypeLabel, getAllocationTypeLabel } from "@/types/receivables";
import type { CashReceiptSourceType } from "@/types/receivables";
import { formatDate, formatCurrency } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { canChangeLeaseStatus, canActivateLease, canRenewLease } from "@/lib/integrity/leaseIntegrity";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";
import { OverrideConfirmDialog } from "@/components/shared/OverrideConfirmDialog";
import { useOverrideHistory } from "@/context/OverrideContext";
import type { ValidationResult } from "@/lib/integrity/types";
import type { TranslationKey } from "@/i18n/translations";
import { AmendmentsSection } from "@/components/amendments/AmendmentsSection";
import { getEffectiveLeaseTerms, getLeaseAmendments } from "@/lib/amendments";

const GUARANTEE_TYPE_KEY: Record<GuaranteeType, TranslationKey> = {
  "cash-deposit": "guarantee.type.cashDeposit",
  "bank-guarantee": "guarantee.type.bankGuarantee",
  "insurance-guarantee": "guarantee.type.insuranceGuarantee",
  "corporate-guarantee": "guarantee.type.corporateGuarantee",
};
const MOVE_IN_CHECKLIST_KEY: Record<keyof MoveInChecklist, TranslationKey> = {
  leaseSigned: "checklist.moveIn.leaseSigned",
  firstPaymentReceived: "checklist.moveIn.firstPaymentReceived",
  guaranteeConfirmed: "checklist.moveIn.guaranteeConfirmed",
  keysHandedOver: "checklist.moveIn.keysHandedOver",
  meterReadingCaptured: "checklist.moveIn.meterReadingCaptured",
  tenantDocumentsComplete: "checklist.moveIn.tenantDocumentsComplete",
};
const MOVE_OUT_CHECKLIST_KEY: Record<keyof MoveOutChecklist, TranslationKey> = {
  noticeConfirmed: "checklist.moveOut.noticeConfirmed",
  moveOutDateConfirmed: "checklist.moveOut.moveOutDateConfirmed",
  keysReturned: "checklist.moveOut.keysReturned",
  moveOutMeterReadingCaptured: "checklist.moveOut.moveOutMeterReadingCaptured",
  balanceReviewed: "checklist.moveOut.balanceReviewed",
  guaranteeReviewCompleted: "checklist.moveOut.guaranteeReviewCompleted",
};
const ADVANCE_METHOD_KEY: Record<"spread-evenly" | "fixed-monthly-reduction", TranslationKey> = {
  "spread-evenly": "advance.method.spreadEvenly",
  "fixed-monthly-reduction": "advance.method.fixedMonthly",
};
const ADVANCE_APPLIED_KEY: Record<"rent" | "charges" | "rent-and-charges", TranslationKey> = {
  "rent": "advance.appliedTo.rent",
  "charges": "advance.appliedTo.charges",
  "rent-and-charges": "advance.appliedTo.rentAndCharges",
};

const GUARANTEE_DISPLAY: Record<GuaranteeStatus, { icon: LucideIcon; labelKey: TranslationKey; className: string }> = {
  active:               { icon: CheckCircle2,  labelKey: "guarantee.deposited",         className: "text-success" },
  released:             { icon: Undo2,         labelKey: "guarantee.released",          className: "text-muted-foreground" },
  pending:              { icon: Clock,         labelKey: "guarantee.waiting",           className: "text-warning" },
  incomplete:           { icon: Clock,         labelKey: "guarantee.waiting",           className: "text-warning" },
  "partially-retained": { icon: AlertTriangle, labelKey: "guarantee.partiallyRetained", className: "text-warning" },
};

const MOVE_STATUS_DISPLAY: Record<"not-scheduled" | "scheduled" | "completed", { icon: LucideIcon; labelKey: TranslationKey; className: string }> = {
  "not-scheduled": { icon: AlertTriangle, labelKey: "status.notScheduled", className: "text-muted-foreground" },
  scheduled:       { icon: Clock,         labelKey: "status.scheduled",    className: "text-warning" },
  completed:       { icon: CheckCircle2,  labelKey: "status.completed",    className: "text-success" },
};

export default function LeaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    leases, tenants, units, properties,
    getReceivableItemsByLease, getCashReceiptsByLease, getAllocationsByReceipt,
    getLeaseOutstanding, getGuaranteeByLease, allocations,
    addGuarantee, updateGuarantee, updateLease, updateUnit, deleteLease, confirmMoveOut,
    createCashReceipt, getTenantUnappliedCredit,
    getLeaseAssignments,
  } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverrideValidation, setPendingOverrideValidation] = useState<ValidationResult | null>(null);
  const [pendingOverrideAction, setPendingOverrideAction] = useState<string>("");
  const [receivablesOpen, setReceivablesOpen] = useState(false);
  const [cashReceiptsOpen, setCashReceiptsOpen] = useState(false);
  const [allocationsOpen, setAllocationsOpen] = useState(false);

  // Cash receipt form
  const [receiptSheetOpen, setReceiptSheetOpen] = useState(false);
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formAmount, setFormAmount] = useState("");
  const [formSourceType, setFormSourceType] = useState<CashReceiptSourceType>("bank-transfer");
  const [formRef, setFormRef] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formAutoAllocate, setFormAutoAllocate] = useState(true);

  // Guarantee form
  const [guaranteeSheetOpen, setGuaranteeSheetOpen] = useState(false);
  const [gType, setGType] = useState<GuaranteeType>("cash-deposit");
  const [gExpected, setGExpected] = useState("");
  const [gReceived, setGReceived] = useState("");
  const [gReceivedDate, setGReceivedDate] = useState("");
  const [gReleaseDate, setGReleaseDate] = useState("");
  const [gRetention, setGRetention] = useState("");
  const [gNotes, setGNotes] = useState("");

  // Notice form
  const [noticeSheetOpen, setNoticeSheetOpen] = useState(false);
  const [nDate, setNDate] = useState("");
  const [nMoveOut, setNMoveOut] = useState("");
  const [nReason, setNReason] = useState("");

  // End / Terminate / Renew dialogs
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [endDateInput, setEndDateInput] = useState("");
  const [endReasonInput, setEndReasonInput] = useState<LeaseEndReason>("natural-expiry");
  const [endNotesInput, setEndNotesInput] = useState("");
  const [endFreeUnit, setEndFreeUnit] = useState(true);

  const [termDialogOpen, setTermDialogOpen] = useState(false);
  const [termDateInput, setTermDateInput] = useState("");
  const [termReasonInput, setTermReasonInput] = useState("");
  const [termNotesInput, setTermNotesInput] = useState("");
  const [termFreeUnit, setTermFreeUnit] = useState(true);

  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [renewNewEndDate, setRenewNewEndDate] = useState("");
  const [renewNewRent, setRenewNewRent] = useState("");
  const [renewNewCharges, setRenewNewCharges] = useState("");

  // Move-in form
  const [moveInSheetOpen, setMoveInSheetOpen] = useState(false);
  const [miScheduled, setMiScheduled] = useState("");
  const [miMeter, setMiMeter] = useState("");
  const [miWaterMeter, setMiWaterMeter] = useState("");
  const [miKeys, setMiKeys] = useState("");

  // Move-out form
  const [moveOutSheetOpen, setMoveOutSheetOpen] = useState(false);
  const [moScheduled, setMoScheduled] = useState("");
  const [moMeter, setMoMeter] = useState("");
  const [moWaterMeter, setMoWaterMeter] = useState("");
  const [moNotes, setMoNotes] = useState("");

  // Return form
  const [returnSheetOpen, setReturnSheetOpen] = useState(false);
  const [retStatus, setRetStatus] = useState<ReturnStatus>("pending");
  const [retNotes, setRetNotes] = useState("");

  const lease = leases.find(l => l.id === id);
  if (!lease) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("detail.leaseNotFound")}</p>
        <Button variant="link" asChild className="mt-2"><Link to="/leases">← {t("nav.leases")}</Link></Button>
      </div>
    );
  }

  const tenant = tenants.find(tn => tn.id === lease.primaryTenantId);
  const unit = units.find(u => u.id === lease.unitId);
  const coTenants = (lease.coTenantIds ?? [])
    .map(tid => tenants.find(tn => tn.id === tid))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const property = properties.find(p => p.id === lease.propertyId);
  const locale = property?.locale ?? "fr-FR";
  const currency = property?.currencyCode ?? "EUR";
  const lifecycle = getLeaseStatus(lease);
  const guarantee = getGuaranteeByLease(lease.id);
  const moveInStatus = getMoveInStatus(lease);
  const moveOutStatus = getMoveOutStatus(lease);

  const todayIso = new Date().toISOString().slice(0, 10);
  const effectiveTerms = getEffectiveLeaseTerms(lease.id, todayIso, integrityState);
  const effRent = effectiveTerms?.monthlyRent ?? lease.monthlyRent;
  const effCharges = effectiveTerms?.monthlyCharges ?? lease.monthlyCharges;
  const effEndDate = effectiveTerms?.endDate ?? lease.endDate;
  const effDeposit = effectiveTerms?.depositAmount ?? lease.depositOrGuaranteeAmount;
  const effNotice = effectiveTerms?.noticePeriodText ?? lease.noticePeriodText;
  const totalMonthly = effRent + effCharges;
  // Find the latest active amendment that touched each field for the "(amendment n°X)" suffix.
  const activeAms = getLeaseAmendments(lease.id, integrityState.amendments)
    .filter(a => a.status === "active" && a.effectiveDate <= todayIso);
  const latestAmTouching = (field: string): number | null => {
    for (let i = activeAms.length - 1; i >= 0; i--) {
      const chs = integrityState.amendmentChanges.filter(c => c.amendmentId === activeAms[i].id);
      if (chs.some(c => c.fieldName === field)) return activeAms[i].amendmentNumber;
    }
    return null;
  };
  const rentAmNum = effRent !== lease.monthlyRent ? latestAmTouching("baseMonthlyRentTotal") : null;
  const chargesAmNum = effCharges !== lease.monthlyCharges ? latestAmTouching("baseMonthlyChargesTotal") : null;
  const endAmNum = effEndDate !== lease.endDate ? latestAmTouching("leaseEndDate") : null;
  const depositAmNum = effDeposit !== lease.depositOrGuaranteeAmount ? latestAmTouching("depositAmount") : null;
  const noticeAmNum = effNotice !== lease.noticePeriodText ? latestAmTouching("noticePeriodText") : null;
  const amSuffix = (n: number | null) => n != null
    ? <span className="text-[10px] text-muted-foreground ml-1">({t("amendments.basedOn").replace("{n}", String(n))})</span>
    : null;
  const advancePricing = computeAdvancePricing(lease);
  const hasAdvance = lease.hasAdvancePayment && advancePricing.advanceStatus !== 'not-applicable';
  const receivables = getReceivableItemsByLease(lease.id).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const receipts = getCashReceiptsByLease(lease.id).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  const { outstanding, overdue } = getLeaseOutstanding(lease.id);
  const totalAllocated = receivables.reduce((s, ri) => s + ri.allocatedAmount, 0);
  const unappliedCredit = tenant ? getTenantUnappliedCredit(tenant.id) : 0;

  const today = new Date().toISOString().split("T")[0];

  const handleAddReceipt = () => {
    if (!formAmount) return;
    const amt = parseFloat(formAmount);
    createCashReceipt({
      tenantId: lease.primaryTenantId,
      leaseId: lease.id,
      propertyId: lease.propertyId,
      unitId: lease.unitId,
      sourceType: formSourceType,
      paymentDate: formDate,
      bookingDate: null, valueDate: null,
      amountReceived: amt,
      currencyCode: currency,
      payerName: tenant ? getTenantFullName(tenant) : null,
      payerIban: null, payerBic: null,
      reference: formRef || null,
      remittanceInformation: null, endToEndReference: null,
      status: "unmatched",
      unmatchedAmount: amt,
      notes: formNotes,
      importBatchId: null, rawBankTransactionId: null,
    }, formAutoAllocate);
    setReceiptSheetOpen(false);
    setFormAmount(""); setFormRef(""); setFormNotes("");
  };

  const openGuaranteeForm = () => {
    if (guarantee) {
      setGType(guarantee.type); setGExpected(String(guarantee.expectedAmount)); setGReceived(String(guarantee.receivedAmount));
      setGReceivedDate(guarantee.receivedDate ?? ""); setGReleaseDate(guarantee.releaseDate ?? "");
      setGRetention(guarantee.retentionAmount != null ? String(guarantee.retentionAmount) : ""); setGNotes(guarantee.notes);
    } else {
      setGType("cash-deposit"); setGExpected(lease.depositOrGuaranteeAmount != null ? String(lease.depositOrGuaranteeAmount) : "");
      setGReceived(""); setGReceivedDate(""); setGReleaseDate(""); setGRetention(""); setGNotes("");
    }
    setGuaranteeSheetOpen(true);
  };

  const handleSaveGuarantee = () => {
    const expected = parseFloat(gExpected) || 0;
    const received = parseFloat(gReceived) || 0;
    const retention = gRetention ? parseFloat(gRetention) : null;
    const status = computeGuaranteeStatus({ expectedAmount: expected, receivedAmount: received, releaseDate: gReleaseDate || null, retentionAmount: retention });
    if (guarantee) {
      updateGuarantee({ ...guarantee, type: gType, expectedAmount: expected, receivedAmount: received, status, receivedDate: gReceivedDate || null, releaseDate: gReleaseDate || null, retentionAmount: retention, notes: gNotes });
      toast({ title: t("leaseToast.guaranteeUpdated") });
    } else {
      addGuarantee({ leaseId: lease.id, type: gType, expectedAmount: expected, receivedAmount: received, status, receivedDate: gReceivedDate || null, releaseDate: gReleaseDate || null, retentionAmount: retention, notes: gNotes });
      toast({ title: t("leaseToast.guaranteeAdded") });
    }
    setGuaranteeSheetOpen(false);
  };

  const openNoticeForm = () => { setNDate(lease.noticeDate ?? ""); setNMoveOut(lease.intendedMoveOutDate ?? ""); setNReason(lease.terminationReason ?? ""); setNoticeSheetOpen(true); };
  const handleSaveNotice = () => { updateLease({ ...lease, noticeGiven: true, noticeDate: nDate || null, intendedMoveOutDate: nMoveOut || null, terminationReason: nReason || null }); toast({ title: t("leaseToast.noticeRegistered") }); setNoticeSheetOpen(false); };
  const handleActivateLease = () => {
    const validation = canActivateLease(lease.id, integrityState);
    if (!validation.allowed) {
      toast({ title: t("leaseToast.cannotActivate"), description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
      return;
    }
    updateLease({ ...lease, lifecycleStage: "active" });
    if (validation.warnings.length > 0) {
      toast({ title: t("leaseToast.activatedWithWarnings"), description: validation.warnings.map(w => w.message).join(". ") });
    } else {
      toast({ title: t("leaseToast.activated") });
    }
  };

  const openEndDialog = () => {
    setEndDateInput(lease.moveOutActualDate ?? lease.intendedMoveOutDate ?? lease.endDate ?? today);
    setEndReasonInput(lease.noticeGiven ? "notice-completed" : "natural-expiry");
    setEndNotesInput("");
    setEndFreeUnit(!lease.moveOutActualDate);
    setEndDialogOpen(true);
  };

  const performEndLease = (overrideReason?: string) => {
    if (!endDateInput) {
      toast({ title: t("common.validationError"), description: t("lease.endDialog.endDate"), variant: "destructive" });
      return;
    }
    if (endDateInput < lease.startDate) {
      toast({ title: t("common.validationError"), description: t("lease.endDateBeforeStart"), variant: "destructive" });
      return;
    }
    const validation = canChangeLeaseStatus(lease.id, "ended", integrityState);
    if (!validation.allowed && !overrideReason) {
      if (validation.overrideAllowed) {
        setPendingOverrideValidation(validation);
        setPendingOverrideAction("ended");
        setEndDialogOpen(false);
        setOverrideDialogOpen(true);
        return;
      }
      toast({ title: t("lease.cannotEnd"), description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
      return;
    }
    if (overrideReason) {
      addOverride({
        entityType: "lease", entityId: lease.id,
        action: "status_change:ended",
        blockerCodes: [...validation.blockers.map(b => b.code), ...validation.warnings.map(w => w.code)],
        reason: overrideReason,
      });
    }
    const updatedLease = {
      ...lease,
      lifecycleStage: "ended" as const,
      endDate: endDateInput,
      endReason: endReasonInput,
      notes: endNotesInput ? `${lease.notes}${lease.notes ? "\n" : ""}[End] ${endNotesInput}` : lease.notes,
    };
    updateLease(updatedLease);
    if (endFreeUnit && unit && unit.currentStatus !== "vacant" && unit.currentStatus !== "archived") {
      updateUnit({ ...unit, currentStatus: "vacant", availableFrom: updatedLease.endDate });
    }
    toast({ title: t("lease.toastEnded") });
    setEndDialogOpen(false);
  };

  const handleMarkEnded = () => openEndDialog();

  const openTermDialog = () => {
    setTermDateInput(today);
    setTermReasonInput("");
    setTermNotesInput("");
    setTermFreeUnit(true);
    setTermDialogOpen(true);
  };

  const performTerminate = (overrideReason?: string) => {
    if (!termReasonInput.trim()) {
      toast({ title: t("common.validationError"), description: t("lease.terminateDialog.reason"), variant: "destructive" });
      return;
    }
    if (!termDateInput) {
      toast({ title: t("common.validationError"), description: t("lease.terminateDialog.endDate"), variant: "destructive" });
      return;
    }
    if (termDateInput < lease.startDate) {
      toast({ title: t("common.validationError"), description: t("lease.endDateBeforeStart"), variant: "destructive" });
      return;
    }
    const validation = canChangeLeaseStatus(lease.id, "terminated", integrityState);
    if (!validation.allowed && !overrideReason) {
      if (validation.overrideAllowed) {
        setPendingOverrideValidation(validation);
        setPendingOverrideAction("terminated");
        setTermDialogOpen(false);
        setOverrideDialogOpen(true);
        return;
      }
      toast({ title: t("lease.cannotTerminate"), description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
      return;
    }
    if (overrideReason) {
      addOverride({
        entityType: "lease", entityId: lease.id,
        action: "status_change:terminated",
        blockerCodes: [...validation.blockers.map(b => b.code), ...validation.warnings.map(w => w.code)],
        reason: overrideReason,
      });
    }
    updateLease({
      ...lease,
      lifecycleStage: "terminated",
      endDate: termDateInput,
      terminationReason: termReasonInput,
      notes: termNotesInput ? `${lease.notes}${lease.notes ? "\n" : ""}[Terminate] ${termNotesInput}` : lease.notes,
    });
    if (termFreeUnit && unit && unit.currentStatus !== "vacant" && unit.currentStatus !== "archived") {
      updateUnit({ ...unit, currentStatus: "vacant", availableFrom: termDateInput });
    }
    toast({ title: t("lease.toastTerminated") });
    setTermDialogOpen(false);
  };

  const handleMarkTerminated = () => openTermDialog();

  const openRenewDialog = () => {
    setRenewNewEndDate("");
    setRenewNewRent("");
    setRenewNewCharges("");
    setRenewDialogOpen(true);
  };

  const handleRenewLease = () => {
    const validation = canRenewLease(lease.id, renewNewEndDate, integrityState);
    if (!validation.allowed) {
      toast({ title: t("common.validationError"), description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
      return;
    }
    const patch: typeof lease = {
      ...lease,
      endDate: renewNewEndDate,
      // Renewal supersedes any pending notice
      noticeGiven: false,
      noticeDate: null,
      intendedMoveOutDate: null,
      terminationReason: null,
    };
    if (renewNewRent) patch.monthlyRent = parseFloat(renewNewRent);
    if (renewNewCharges) patch.monthlyCharges = parseFloat(renewNewCharges);
    updateLease(patch);
    if (validation.warnings.length > 0) {
      toast({ title: t("lease.toastRenewed"), description: validation.warnings.map(w => w.message).join(". ") });
    } else {
      toast({ title: t("lease.toastRenewed") });
    }
    setRenewDialogOpen(false);
  };

  const handleCancelNotice = () => {
    updateLease({
      ...lease,
      noticeGiven: false,
      noticeDate: null,
      intendedMoveOutDate: null,
      terminationReason: null,
    });
    toast({ title: t("lease.toastNoticeCancelled") });
  };

  const handleLeaseOverrideConfirm = (reason: string) => {
    if (!pendingOverrideValidation || !pendingOverrideAction) return;
    if (pendingOverrideAction === "ended") {
      performEndLease(reason);
    } else if (pendingOverrideAction === "terminated") {
      performTerminate(reason);
    }
    setPendingOverrideValidation(null);
    setPendingOverrideAction("");
  };

  const openMoveInForm = () => { setMiScheduled(lease.moveInScheduledDate ?? ""); setMiMeter(lease.moveInMeterReading ?? ""); setMiWaterMeter(lease.moveInWaterMeterReading ?? ""); setMiKeys(String(lease.keyHandoverCount)); setMoveInSheetOpen(true); };
  const handleScheduleMoveIn = () => { updateLease({ ...lease, moveInScheduledDate: miScheduled || null, moveInMeterReading: miMeter || null, moveInWaterMeterReading: miWaterMeter || null, keyHandoverCount: parseInt(miKeys) || 0 }); toast({ title: t("leaseToast.moveInScheduled") }); setMoveInSheetOpen(false); };
  const handleConfirmMoveIn = () => {
    updateLease({ ...lease, moveInActualDate: today, moveInScheduledDate: lease.moveInScheduledDate || today, moveInMeterReading: miMeter || lease.moveInMeterReading, moveInWaterMeterReading: miWaterMeter || lease.moveInWaterMeterReading, keyHandoverCount: parseInt(miKeys) || lease.keyHandoverCount,
      moveInChecklist: { leaseSigned: true, firstPaymentReceived: true, guaranteeConfirmed: true, keysHandedOver: true, meterReadingCaptured: true, tenantDocumentsComplete: true } });
    toast({ title: t("leaseToast.moveInConfirmed") }); setMoveInSheetOpen(false);
  };

  const openMoveOutForm = () => { setMoScheduled(lease.moveOutScheduledDate ?? lease.intendedMoveOutDate ?? ""); setMoMeter(lease.moveOutMeterReading ?? ""); setMoWaterMeter(lease.moveOutWaterMeterReading ?? ""); setMoNotes(lease.moveOutNotes); setMoveOutSheetOpen(true); };
  const handleScheduleMoveOut = () => { updateLease({ ...lease, moveOutScheduledDate: moScheduled || null, moveOutMeterReading: moMeter || null, moveOutWaterMeterReading: moWaterMeter || null, moveOutNotes: moNotes }); toast({ title: t("leaseToast.moveOutScheduled") }); setMoveOutSheetOpen(false); };
  const handleConfirmMoveOut = () => {
    confirmMoveOut({ ...lease, moveOutScheduledDate: lease.moveOutScheduledDate || today, moveOutMeterReading: moMeter || lease.moveOutMeterReading, moveOutWaterMeterReading: moWaterMeter || lease.moveOutWaterMeterReading, moveOutNotes: moNotes || lease.moveOutNotes,
      moveOutChecklist: { noticeConfirmed: true, moveOutDateConfirmed: true, keysReturned: true, moveOutMeterReadingCaptured: true, balanceReviewed: true, guaranteeReviewCompleted: true },
      returnStatus: lease.returnStatus || "pending" });
    toast({ title: t("leaseToast.moveOutConfirmed") }); setMoveOutSheetOpen(false);
  };

  const toggleMoveInChecklist = (key: keyof MoveInChecklist) => { updateLease({ ...lease, moveInChecklist: { ...lease.moveInChecklist, [key]: !lease.moveInChecklist[key] } }); };
  const toggleMoveOutChecklist = (key: keyof MoveOutChecklist) => { updateLease({ ...lease, moveOutChecklist: { ...lease.moveOutChecklist, [key]: !lease.moveOutChecklist[key] } }); };

  const openReturnForm = () => { setRetStatus(lease.returnStatus || "pending"); setRetNotes(lease.returnNotes); setReturnSheetOpen(true); };
  const handleSaveReturn = () => { updateLease({ ...lease, returnStatus: retStatus, returnNotes: retNotes }); toast({ title: t("leaseToast.returnStatusUpdated") }); setReturnSheetOpen(false); };
  const handleUpdateKeys = (keyHandover: number, keyReturn: number) => { updateLease({ ...lease, keyHandoverCount: keyHandover, keyReturnCount: keyReturn }); };
  const handleUpdateMeter = (field: "moveInMeterReading" | "moveOutMeterReading" | "moveInWaterMeterReading" | "moveOutWaterMeterReading", value: string) => {
    updateLease({ ...lease, [field]: value.trim() === "" ? null : value });
  };

  const enrichedReceivables = receivables.map(ri => {
    let effectiveStatus = ri.status;
    if (ri.outstandingAmount > 0 && ri.dueDate < today && (ri.status === "open" || ri.status === "partially-paid")) effectiveStatus = "overdue";
    return { ...ri, effectiveStatus };
  });

  const moveInComplete = Object.values(lease.moveInChecklist).every(Boolean);
  const moveOutComplete = Object.values(lease.moveOutChecklist).every(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link to="/leases"><ArrowLeft className="h-4 w-4 mr-1" />{t("nav.leases")}</Link>
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{lease.leaseReference}</h1>
              <StatusBadge status={lifecycle} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setReceiptSheetOpen(true)} size="sm" className="h-9"><Plus className="h-4 w-4 mr-1" />{t("lease.recordCashReceipt")}</Button>
            {(lease.lifecycleStage === "active" || lease.lifecycleStage === "draft") && (
              <Button variant="outline" size="sm" className="h-9" onClick={openNoticeForm}>
                <Bell className="h-4 w-4 mr-1" />
                {lease.noticeGiven ? t("detail.editNotice") : t("detail.registerNotice")}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("units.moreActions")}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {lease.lifecycleStage === "draft" && (() => {
                  const activationCheck = canActivateLease(lease.id, integrityState);
                  return (
                    <DropdownMenuItem onSelect={() => handleActivateLease()} disabled={!activationCheck.allowed}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />{t("leaseDetail.activateLease")}
                    </DropdownMenuItem>
                  );
                })()}
                {lease.lifecycleStage === "active" && (() => {
                  const endCheck = canChangeLeaseStatus(lease.id, "ended", integrityState);
                  const termCheck = canChangeLeaseStatus(lease.id, "terminated", integrityState);
                  const endDisabled = !endCheck.allowed && !endCheck.overrideAllowed;
                  const termDisabled = !termCheck.allowed && !termCheck.overrideAllowed;
                  return (
                    <>
                      <DropdownMenuItem onSelect={() => openRenewDialog()}>
                        <RefreshCw className="h-4 w-4 mr-2" />{t("lease.renew")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleMarkEnded()} disabled={endDisabled}>
                        <CheckCircle2 className="h-4 w-4 mr-2" />{t("detail.markEnded")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleMarkTerminated()} disabled={termDisabled} className="text-destructive focus:text-destructive">
                        <XCircle className="h-4 w-4 mr-2" />{t("detail.terminate")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  );
                })()}
                <DeleteDialog
                  entityType="lease"
                  entityId={lease.id}
                  entityLabel={lease.leaseReference}
                  onDelete={(lid) => { deleteLease(lid); toast({ title: t("lease.toastDeleted") }); navigate("/leases"); }}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />{t("action.delete")}
                    </DropdownMenuItem>
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Activation Blocker Panel (draft leases) */}
      {lease.lifecycleStage === "draft" && (() => {
        const activationCheck = canActivateLease(lease.id, integrityState);
        return (activationCheck.blockers.length > 0 || activationCheck.warnings.length > 0) ? (
          <StatusTransitionAlert validation={activationCheck} />
        ) : null;
      })()}

      {/* Warning banners */}
      {guarantee && (guarantee.status === "pending" || guarantee.status === "incomplete") && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t("leaseDetail.guaranteeBannerPrefix")} <strong>{guarantee.status}</strong>. {t("leaseDetail.guaranteeBannerExpected")}: {formatCurrency(guarantee.expectedAmount, currency, locale)}, {t("leaseDetail.guaranteeBannerReceived")}: {formatCurrency(guarantee.receivedAmount, currency, locale)}.
          </AlertDescription>
        </Alert>
      )}
      {!guarantee && lease.depositOrGuaranteeAmount && lease.depositOrGuaranteeAmount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t("leaseDetail.noGuaranteeBanner").replace("{amount}", formatCurrency(lease.depositOrGuaranteeAmount, currency, locale))}
            <Button variant="link" size="sm" className="ml-2 h-auto p-0" onClick={openGuaranteeForm}>{t("leaseDetail.addGuaranteeLink")}</Button>
          </AlertDescription>
        </Alert>
      )}
      {lease.noticeGiven && (
        <Alert>
          <Bell className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span>
                {t("leaseDetail.underNotice")}
                {lease.noticeDate && <> {t("leaseDetail.noticeGivenOn").replace("{date}", formatDate(lease.noticeDate, locale))}</>}
                {lease.intendedMoveOutDate && <> {t("leaseDetail.intendedMoveOutOn").replace("{date}", formatDate(lease.intendedMoveOutDate, locale))}</>}
              </span>
              {!lease.moveOutActualDate && (
                <Button variant="outline" size="sm" onClick={handleCancelNotice}>{t("lease.cancelNotice")}</Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Overdue end banner */}
      {lifecycle === "overdue-end" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-semibold mb-1">{t("lease.overdueBanner.title")}</div>
            <p className="text-xs mb-2">{t("lease.overdueBanner.description").replace("{date}", formatDate(lease.endDate, locale))}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={openRenewDialog}>{t("lease.overdueBanner.renew")}</Button>
              <Button size="sm" variant="outline" onClick={openEndDialog}>{t("lease.overdueBanner.end")}</Button>
              <Button size="sm" variant="destructive" onClick={openTermDialog}>{t("lease.overdueBanner.terminate")}</Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Lease Summary */}
      <Card>
        <CardHeader className="pb-3 items-center"><CardTitle className="text-sm font-medium text-left">{t("detail.leaseSummary")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const assignments = getLeaseAssignments(lease.id).filter(a => !a.endDate);
            const sortedAssignments = assignments.length > 0
              ? assignments.slice().sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
              : (unit ? [{
                  id: "fallback",
                  unitId: unit.id,
                  isPrimary: true,
                  assignmentType: "primary" as const,
                  startDate: lease.startDate,
                  endDate: null as string | null,
                  rentShare: lease.monthlyRent,
                  chargesShare: lease.monthlyCharges,
                }] : []);
            return (
              <div className="space-y-4 pb-4 border-b border-border">
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">{t("leases.tenant")}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {tenant && (
                      <div className="flex items-center gap-2 text-sm">
                        <HoverCard openDelay={150}>
                          <HoverCardTrigger asChild>
                            <Link to={`/tenants/${tenant.id}`} className="font-medium text-primary hover:underline">{getTenantFullName(tenant)}</Link>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-auto p-3 space-y-1.5">
                            <div className="flex items-center gap-2 text-xs"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-foreground">{tenant.email}</span></div>
                            <div className="flex items-center gap-2 text-xs"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-foreground">{tenant.phone || "—"}</span></div>
                          </HoverCardContent>
                        </HoverCard>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{t("leases.primaryTenant")}</span>
                      </div>
                    )}
                    {coTenants.map(ct => (
                      <div key={ct.id} className="flex items-center gap-2 text-sm">
                        <HoverCard openDelay={150}>
                          <HoverCardTrigger asChild>
                            <Link to={`/tenants/${ct.id}`} className="font-medium text-primary hover:underline">{getTenantFullName(ct)}</Link>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-auto p-3 space-y-1.5">
                            <div className="flex items-center gap-2 text-xs"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-foreground">{ct.email}</span></div>
                            <div className="flex items-center gap-2 text-xs"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-foreground">{ct.phone || "—"}</span></div>
                          </HoverCardContent>
                        </HoverCard>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t("amendments.coTenants")}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    {sortedAssignments.length > 1 ? `${t("table.unit")}s · ${sortedAssignments.length}` : t("table.unit")}
                  </p>
                  <div className="rounded border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="h-8">
                          <TableHead className="h-8 text-xs">{t("leases.col.unit")}</TableHead>
                          <TableHead className="h-8 text-xs">{t("leases.col.role")}</TableHead>
                          <TableHead className="h-8 text-xs">{t("leases.col.start")}</TableHead>
                          <TableHead className="h-8 text-xs">{t("leases.col.signed")}</TableHead>
                          <TableHead className="h-8 text-xs">{t("leases.col.end")}</TableHead>
                          <TableHead className="h-8 text-xs text-right">{t("leases.col.rentShare")}</TableHead>
                          <TableHead className="h-8 text-xs text-right">{t("leases.col.chargesShare")}</TableHead>
                          <TableHead className="h-8 text-xs text-right">{t("common.total")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedAssignments.map(a => {
                          const u = units.find(x => x.id === a.unitId);
                          if (!u) return null;
                          const isAnc = !a.isPrimary && isAncillaryAssignmentType(a.assignmentType);
                          const rowTotal = (a.rentShare ?? 0) + (a.chargesShare ?? 0);
                          // Per-unit signed date: lease.signedDate for inception units;
                          // otherwise the signedDate of the amendment that added this unit.
                          let signedFor: string | null = null;
                          if (a.startDate === lease.startDate) {
                            signedFor = lease.signedDate;
                          } else {
                            const addChange = integrityState.amendmentChanges.find(c =>
                              c.fieldName === "unitAssignments" &&
                              c.changeType === "add" &&
                              c.metadata?.unitId === a.unitId,
                            );
                            if (addChange) {
                              const am = integrityState.amendments.find(x => x.id === addChange.amendmentId);
                              signedFor = am?.signedDate ?? null;
                            }
                          }
                          return (
                            <TableRow key={a.id} className="h-9">
                              <TableCell className="py-1 text-xs">
                                <Link to={`/units/${u.id}`} className="font-medium text-primary hover:underline">{u.unitCode} — {u.unitLabel}</Link>
                              </TableCell>
                              <TableCell className="py-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${a.isPrimary ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                                  {a.isPrimary ? t("leases.role.primary") : (isAnc ? t(`leases.assignmentType.${a.assignmentType}` as TranslationKey) : t("leases.role.secondary"))}
                                </span>
                              </TableCell>
                              <TableCell className="py-1 text-xs text-muted-foreground">{formatDate(a.startDate, locale)}</TableCell>
                              <TableCell className="py-1 text-xs text-muted-foreground">{signedFor ? formatDate(signedFor, locale) : "—"}</TableCell>
                              <TableCell className="py-1 text-xs text-muted-foreground">{formatDate(effEndDate, locale)}</TableCell>
                              <TableCell className="py-1 text-right text-xs tabular-nums">{a.rentShare != null ? formatCurrency(a.rentShare, currency, locale) : "—"}</TableCell>
                              <TableCell className="py-1 text-right text-xs tabular-nums">{a.chargesShare != null ? formatCurrency(a.chargesShare, currency, locale) : "—"}</TableCell>
                              <TableCell className="py-1 text-right text-xs font-medium tabular-nums">{formatCurrency(rowTotal, currency, locale)}</TableCell>
                            </TableRow>
                          );
                        })}
                        {(() => {
                          const sumR = sortedAssignments.reduce((s, a) => s + (a.rentShare ?? 0), 0);
                          const sumC = sortedAssignments.reduce((s, a) => s + (a.chargesShare ?? 0), 0);
                          const grand = sumR + sumC;
                          return (
                            <TableRow className="border-t border-border bg-muted/30 h-9">
                              <TableCell colSpan={5} className="py-1 text-xs font-medium text-muted-foreground">Σ</TableCell>
                              <TableCell className="py-1 text-right text-xs font-semibold text-foreground tabular-nums">{formatCurrency(sumR, currency, locale)}</TableCell>
                              <TableCell className="py-1 text-right text-xs font-semibold text-foreground tabular-nums">{formatCurrency(sumC, currency, locale)}</TableCell>
                              <TableCell className="py-1 text-right text-xs font-semibold text-primary tabular-nums">{formatCurrency(grand, currency, locale)}</TableCell>
                            </TableRow>
                          );
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                  {endAmNum != null && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {t("leases.endDate")}: <span className="text-foreground font-medium">{formatDate(effEndDate, locale)}</span>{amSuffix(endAmNum)}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className="text-xs text-muted-foreground">{t("leases.dueDay")}</p><p className="text-sm font-medium text-foreground">{t("leaseDetail.dueDayOfMonth").replace("{day}", String(lease.dueDayOfMonth))}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("leases.deposit")}</p><p className="text-sm font-medium text-foreground">{effDeposit != null ? formatCurrency(effDeposit, currency, locale) : "—"}{amSuffix(depositAmNum)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("leases.noticePeriod")}</p><p className="text-sm font-medium text-foreground">{effNotice || "—"}{amSuffix(noticeAmNum)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("detail.noticeGiven")}</p><p className="text-sm font-medium text-foreground">{lease.noticeGiven ? t("common.yes") : t("common.no")}</p></div>
            {lease.noticeDate && <div><p className="text-xs text-muted-foreground">{t("detail.noticeDate")}</p><p className="text-sm font-medium text-foreground">{formatDate(lease.noticeDate, locale)}</p></div>}
            {lease.intendedMoveOutDate && <div><p className="text-xs text-muted-foreground">{t("detail.intendedMoveOut")}</p><p className="text-sm font-medium text-foreground">{formatDate(lease.intendedMoveOutDate, locale)}</p></div>}
            {lease.terminationReason && <div><p className="text-xs text-muted-foreground">{t("detail.reason")}</p><p className="text-sm text-foreground">{lease.terminationReason}</p></div>}
          </div>
        </CardContent>
      </Card>

      {/* Amendments / Avenants */}
      <AmendmentsSection leaseId={lease.id} />

      {/* Financial Summary */}
      <Card>
        <CardHeader className="pb-3 items-center"><CardTitle className="text-sm font-medium text-left">{t("detail.financialSummary")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-xs text-muted-foreground">{t("leaseDetail.totalAllocated")}</p><p className="text-lg font-bold text-success">{formatCurrency(totalAllocated, currency, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("table.outstanding")}</p><p className="text-lg font-bold text-foreground">{formatCurrency(outstanding, currency, locale)}</p></div>
            <div>
              <p className="text-xs text-muted-foreground">{t("table.overdue")}</p>
              <p className={`text-lg font-bold ${overdue > 0 ? "text-destructive" : "text-foreground"}`}>
                {overdue > 0 && <AlertTriangle className="h-4 w-4 inline mr-1" />}
                {formatCurrency(overdue, currency, locale)}
              </p>
            </div>
            {unappliedCredit > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">{t("leaseDetail.unappliedCredit")}</p>
                <p className="text-lg font-bold text-primary">
                  <Banknote className="h-4 w-4 inline mr-1" />
                  {formatCurrency(unappliedCredit, currency, locale)}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>


      {/* Advance Payment Card */}
      {hasAdvance && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center">
              <CardTitle className="text-sm font-medium flex-1 text-left">{t("rentPrepayment.title")}</CardTitle>
              <StatusBadge status={advancePricing.advanceStatus} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Hero: Rent paid until */}
            {advancePricing.prepaidUntilDate && (
              <div className="rounded-md border bg-muted/30 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">{t("rentPrepayment.rentPaidUntil")}</p>
                  <p className="text-xl font-bold text-foreground">{formatDate(advancePricing.prepaidUntilDate, locale)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{t("rentPrepayment.monthsRemaining")}</p>
                  <p className="text-xl font-bold text-primary">{advancePricing.monthsRemaining} / {advancePricing.durationMonths}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-xs text-muted-foreground">{t("rentPrepayment.amount")}</p><p className="text-lg font-bold text-foreground">{formatCurrency(advancePricing.advanceAmount, currency, locale)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("rentPrepayment.method")}</p><p className="text-sm font-medium text-foreground">{lease.advanceAllocationMethod ? t(ADVANCE_METHOD_KEY[lease.advanceAllocationMethod]) : "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("rentPrepayment.appliedTo")}</p><p className="text-sm font-medium text-foreground">{t(ADVANCE_APPLIED_KEY[lease.advanceAppliedTo || 'rent'])}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("rentPrepayment.paymentDate")}</p><p className="text-sm font-medium text-foreground">{lease.advancePaymentDate ? formatDate(lease.advancePaymentDate, locale) : "—"}</p></div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t("rentPrepayment.consumed")}: {formatCurrency(advancePricing.advanceConsumed, currency, locale)}</span>
                <span>{t("rentPrepayment.remaining")}: {formatCurrency(advancePricing.advanceRemaining, currency, locale)}</span>
              </div>
              <Progress value={advancePricing.advanceAmount > 0 ? (advancePricing.advanceConsumed / advancePricing.advanceAmount) * 100 : 0} className="h-2" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div><p className="text-xs text-muted-foreground">{t("rentPrepayment.firstMonthCovered")}</p><p className="font-medium text-foreground">{advancePricing.allocationStartMonth ? formatDate(advancePricing.allocationStartMonth + "-01", locale) : formatDate(lease.startDate, locale)}</p></div>
              {advancePricing.allocationEndDate && <div><p className="text-xs text-muted-foreground">{t("rentPrepayment.lastMonthCovered")}</p><p className="font-medium text-foreground">{formatDate(advancePricing.allocationEndDate + "-01", locale)}</p></div>}
              <div><p className="text-xs text-muted-foreground">{t("rentPrepayment.duration")}</p><p className="font-medium text-foreground">{advancePricing.durationMonths} {t("rentPrepayment.monthsSuffix")}</p></div>
            </div>

            {/* Collapsible Monthly Schedule */}
            {advancePricing.monthlySchedule.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground hover:text-foreground">
                    {t("rentPrepayment.schedule")}
                    <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 [&[data-state=open]]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">{t("rentPrepayment.col.month")}</TableHead>
                          <TableHead className="text-xs text-right">{t("rentPrepayment.col.rentDue")}</TableHead>
                          <TableHead className="text-xs text-right">{t("rentPrepayment.col.covered")}</TableHead>
                          <TableHead className="text-xs text-right">{t("rentPrepayment.col.remaining")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {advancePricing.monthlySchedule.map((row) => {
                          const now = new Date();
                          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                          const isCurrent = row.month === currentMonth;
                          const isPaidViaAdvance = row.fullyCovered;
                          const isPast = row.month < currentMonth;
                          return (
                            <TableRow key={row.month} className={isCurrent ? "bg-primary/5 font-medium" : ""}>
                              <TableCell className="text-xs">
                                <span className="flex items-center gap-1.5">
                                  {row.month}{isCurrent && <span className="text-primary text-[10px]">●</span>}
                                  {isPaidViaAdvance && (isPast || isCurrent) && (
                                    <span className="inline-flex items-center rounded-full bg-success/15 text-success px-1.5 py-0.5 text-[10px] font-semibold">{t("rentPrepayment.tag.paid")}</span>
                                  )}
                                  {isPaidViaAdvance && !isPast && !isCurrent && (
                                    <span className="inline-flex items-center rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[10px] font-semibold">{t("rentPrepayment.tag.prepaid")}</span>
                                  )}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-right">{formatCurrency(row.rentDue, currency, locale)}</TableCell>
                              <TableCell className="text-xs text-right text-success">{formatCurrency(row.prepaidShare, currency, locale)}</TableCell>
                              <TableCell className="text-xs text-right text-muted-foreground">{formatCurrency(row.prepaidRemaining, currency, locale)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>
      )}

      {/* Deposit / Guarantee Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5 flex-1 justify-start">
              {t("detail.depositGuarantee")}
              {guarantee && (() => {
                const d = GUARANTEE_DISPLAY[guarantee.status];
                const Icon = d.icon;
                return (
                  <span className={`ml-1.5 inline-flex items-center gap-1 text-xs ${d.className}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {t(d.labelKey)}
                  </span>
                );
              })()}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={openGuaranteeForm}>{guarantee ? t("detail.editGuarantee") : t("detail.addGuarantee")}</Button>
          </div>
        </CardHeader>
        <CardContent>
          {guarantee ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><p className="text-xs text-muted-foreground">{t("units.type")}</p><p className="text-sm font-medium text-foreground">{t(GUARANTEE_TYPE_KEY[guarantee.type])}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("table.expected")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(guarantee.expectedAmount, currency, locale)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("table.received")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(guarantee.receivedAmount, currency, locale)}</p></div>
              {guarantee.receivedDate && <div><p className="text-xs text-muted-foreground">{t("detail.receivedDate")}</p><p className="text-sm font-medium text-foreground">{formatDate(guarantee.receivedDate, locale)}</p></div>}
              {guarantee.releaseDate && <div><p className="text-xs text-muted-foreground">{t("detail.releaseDate")}</p><p className="text-sm font-medium text-foreground">{formatDate(guarantee.releaseDate, locale)}</p></div>}
              {guarantee.retentionAmount != null && guarantee.retentionAmount > 0 && (
                <div><p className="text-xs text-muted-foreground">{t("detail.retention")}</p><p className="text-sm font-medium text-destructive">{formatCurrency(guarantee.retentionAmount, currency, locale)}</p></div>
              )}
              {guarantee.notes && <div className="col-span-full"><p className="text-xs text-muted-foreground">{t("common.notes")}</p><p className="text-sm text-foreground">{guarantee.notes}</p></div>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("detail.noGuaranteeDesc")}</p>
          )}
        </CardContent>
      </Card>

      {/* Occupancy Operations */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4 text-left">{t("detail.occupancyOps")}</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Move-In Panel */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center">
                 <CardTitle className="text-sm font-medium flex items-center gap-1.5 flex-1 justify-start">
                   {t("detail.moveIn")}
                   {(() => {
                     const d = MOVE_STATUS_DISPLAY[moveInStatus];
                     const Icon = d.icon;
                     return (
                       <span className={`ml-1.5 inline-flex items-center gap-1 text-xs ${d.className}`}>
                         <Icon className="h-3.5 w-3.5" />
                         {t(d.labelKey)}
                       </span>
                     );
                   })()}
                 </CardTitle>
                 {moveInStatus !== "completed" && <Button variant="outline" size="sm" onClick={openMoveInForm}>{moveInStatus === "not-scheduled" ? t("detail.schedule") : t("action.edit")}</Button>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">{t("maintenance.scheduled")}</p><p className="text-sm font-medium text-foreground">{lease.moveInScheduledDate ? formatDate(lease.moveInScheduledDate, locale) : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("detail.actual")}</p><p className="text-sm font-medium text-foreground">{lease.moveInActualDate ? formatDate(lease.moveInActualDate, locale) : "—"}</p></div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("detail.checklist")}</p>
                {(Object.keys(lease.moveInChecklist) as (keyof MoveInChecklist)[]).map(key => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={lease.moveInChecklist[key]}
                      onCheckedChange={() => toggleMoveInChecklist(key)}
                      disabled={moveInStatus === "completed"}
                    />
                    <span className={`text-sm ${lease.moveInChecklist[key] ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {t(MOVE_IN_CHECKLIST_KEY[key])}
                    </span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Move-Out Panel */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center">
                 <CardTitle className="text-sm font-medium flex items-center gap-1.5 flex-1 justify-center">
                   {t("detail.moveOut")}
                   {(() => {
                     const d = MOVE_STATUS_DISPLAY[moveOutStatus];
                     const Icon = d.icon;
                     return (
                       <span className={`ml-1.5 inline-flex items-center gap-1 text-xs ${d.className}`}>
                         <Icon className="h-3.5 w-3.5" />
                         {t(d.labelKey)}
                       </span>
                     );
                   })()}
                 </CardTitle>
                 {moveOutStatus !== "completed" && <Button variant="outline" size="sm" onClick={openMoveOutForm}>{moveOutStatus === "not-scheduled" ? t("detail.schedule") : t("action.edit")}</Button>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">{t("maintenance.scheduled")}</p><p className="text-sm font-medium text-foreground">{lease.moveOutScheduledDate ? formatDate(lease.moveOutScheduledDate, locale) : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("detail.actual")}</p><p className="text-sm font-medium text-foreground">{lease.moveOutActualDate ? formatDate(lease.moveOutActualDate, locale) : "—"}</p></div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("detail.checklist")}</p>
                {(Object.keys(lease.moveOutChecklist) as (keyof MoveOutChecklist)[]).map(key => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={lease.moveOutChecklist[key]}
                      onCheckedChange={() => toggleMoveOutChecklist(key)}
                      disabled={moveOutStatus === "completed"}
                    />
                    <span className={`text-sm ${lease.moveOutChecklist[key] ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {t(MOVE_OUT_CHECKLIST_KEY[key])}
                    </span>
                  </label>
                ))}
              </div>
              {lease.moveOutNotes && <div><p className="text-xs text-muted-foreground">{t("common.notes")}</p><p className="text-sm text-foreground">{lease.moveOutNotes}</p></div>}
            </CardContent>
          </Card>

          {/* Keys & Meters */}
          <Card>
            <CardHeader className="pb-3 items-center"><CardTitle className="text-sm font-medium text-left">{t("detail.keysMeters")}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted-foreground">{t("detail.keysHandedOver")}</p><div className="flex items-center gap-2 mt-1"><Input type="number" min={0} className="w-20 h-8 text-sm" value={lease.keyHandoverCount} onChange={e => handleUpdateKeys(parseInt(e.target.value) || 0, lease.keyReturnCount)} /></div></div>
                  <div><p className="text-xs text-muted-foreground">{t("detail.keysReturned")}</p><div className="flex items-center gap-2 mt-1"><Input type="number" min={0} className="w-20 h-8 text-sm" value={lease.keyReturnCount} onChange={e => handleUpdateKeys(lease.keyHandoverCount, parseInt(e.target.value) || 0)} /></div></div>
                </div>
                <div className="border-t border-border pt-3">
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-x-3 gap-y-2 items-center text-xs">
                    <div className="text-muted-foreground"></div>
                    <div className="text-muted-foreground font-medium">{t("detail.moveInMeter")}</div>
                    <div className="text-muted-foreground font-medium">{t("detail.moveOutMeter")}</div>
                    <div className="text-muted-foreground font-medium text-right">{t("detail.consumption")}</div>

                    <div className="flex items-center gap-1.5 text-foreground"><Zap className="h-3.5 w-3.5 text-warning" />{t("detail.electricity")}</div>
                    <Input inputMode="decimal" placeholder="—" className="h-8 text-sm" value={lease.moveInMeterReading ?? ""} onChange={e => handleUpdateMeter("moveInMeterReading", e.target.value)} />
                    <Input inputMode="decimal" placeholder="—" className="h-8 text-sm" value={lease.moveOutMeterReading ?? ""} onChange={e => handleUpdateMeter("moveOutMeterReading", e.target.value)} />
                    <div className="text-sm font-semibold text-foreground text-right tabular-nums">{lease.moveInMeterReading && lease.moveOutMeterReading ? `${(parseFloat(lease.moveOutMeterReading) - parseFloat(lease.moveInMeterReading)).toLocaleString()} kWh` : "—"}</div>

                    <div className="flex items-center gap-1.5 text-foreground"><Droplet className="h-3.5 w-3.5 text-primary" />{t("detail.water")}</div>
                    <Input inputMode="decimal" placeholder="—" className="h-8 text-sm" value={lease.moveInWaterMeterReading ?? ""} onChange={e => handleUpdateMeter("moveInWaterMeterReading", e.target.value)} />
                    <Input inputMode="decimal" placeholder="—" className="h-8 text-sm" value={lease.moveOutWaterMeterReading ?? ""} onChange={e => handleUpdateMeter("moveOutWaterMeterReading", e.target.value)} />
                    <div className="text-sm font-semibold text-foreground text-right tabular-nums">{lease.moveInWaterMeterReading && lease.moveOutWaterMeterReading ? `${(parseFloat(lease.moveOutWaterMeterReading) - parseFloat(lease.moveInWaterMeterReading)).toLocaleString()} m³` : "—"}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Return Panel */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center">
                <CardTitle className="text-sm font-medium flex-1 text-center">{t("detail.returnStatus")}</CardTitle>
                <div className="flex items-center gap-2">
                  {lease.returnStatus && <StatusBadge status={lease.returnStatus} />}
                  <Button variant="outline" size="sm" onClick={openReturnForm}>{lease.returnStatus ? t("detail.update") : t("detail.setStatus")}</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {lease.returnStatus ? (
                <div className="space-y-2">
                  <div><p className="text-xs text-muted-foreground">{t("filter.status")}</p><StatusBadge status={lease.returnStatus} /></div>
                  {lease.returnNotes && <div><p className="text-xs text-muted-foreground">{t("common.notes")}</p><p className="text-sm text-foreground">{lease.returnNotes}</p></div>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("detail.noReturnDesc")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Receivables */}
      <Collapsible open={receivablesOpen} onOpenChange={setReceivablesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer">
              <div className="flex items-center">
                <CardTitle className="text-sm font-medium flex-1 text-center">{t("leaseDetail.openReceivables")}</CardTitle>
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", receivablesOpen && "rotate-180")} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {enrichedReceivables.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("leaseDetail.noReceivables")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t("leaseDetail.period")}</TableHead>
                      <TableHead className="text-xs">{t("table.type")}</TableHead>
                      <TableHead className="text-xs">{t("payments.table.dueDate")}</TableHead>
                      <TableHead className="text-xs text-right">{t("payments.table.expected")}</TableHead>
                      <TableHead className="text-xs text-right">{t("payments.table.allocated")}</TableHead>
                      <TableHead className="text-xs text-right">{t("payments.table.outstanding")}</TableHead>
                      <TableHead className="text-xs">{t("payments.table.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrichedReceivables.map(ri => (
                      <TableRow key={ri.id}>
                        <TableCell className="text-xs text-muted-foreground">{ri.periodMonth ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{getItemTypeLabel(t, ri.itemType)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(ri.dueDate, locale)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(ri.expectedAmount, currency, locale)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(ri.allocatedAmount, currency, locale)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{ri.outstandingAmount > 0 ? formatCurrency(ri.outstandingAmount, currency, locale) : "—"}</TableCell>
                        <TableCell><StatusBadge status={ri.effectiveStatus} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Cash Receipts */}
      <Collapsible open={cashReceiptsOpen} onOpenChange={setCashReceiptsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer">
              <div className="flex items-center">
                <CardTitle className="text-sm font-medium flex-1 text-center">{t("leaseDetail.cashReceipts")}</CardTitle>
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", cashReceiptsOpen && "rotate-180")} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {receipts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("leaseDetail.noCashReceipts")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t("payments.table.date")}</TableHead>
                      <TableHead className="text-xs text-right">{t("payments.table.received")}</TableHead>
                      <TableHead className="text-xs text-right">{t("payments.table.unmatched")}</TableHead>
                      <TableHead className="text-xs">{t("payments.table.source")}</TableHead>
                      <TableHead className="text-xs">{t("payments.table.reference")}</TableHead>
                      <TableHead className="text-xs">{t("payments.table.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipts.map(cr => (
                      <TableRow key={cr.id}>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(cr.paymentDate, locale)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(cr.amountReceived, currency, locale)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{cr.unmatchedAmount > 0 ? formatCurrency(cr.unmatchedAmount, currency, locale) : "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{getSourceTypeLabel(t, cr.sourceType)}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{cr.reference || "—"}</TableCell>
                        <TableCell><StatusBadge status={cr.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Allocation History */}
      {(() => {
        const leaseReceivableIds = new Set(receivables.map(r => r.id));
        const leaseAllocations = allocations.filter(a => leaseReceivableIds.has(a.receivableItemId)).sort((a, b) => b.allocationDate.localeCompare(a.allocationDate));
        if (leaseAllocations.length === 0) return null;
        return (
          <Collapsible open={allocationsOpen} onOpenChange={setAllocationsOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-3 cursor-pointer">
                  <div className="flex items-center">
                    <CardTitle className="text-sm font-medium flex-1 text-center">{t("leaseDetail.allocationHistory")}</CardTitle>
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", allocationsOpen && "rotate-180")} />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{t("payments.table.date")}</TableHead>
                        <TableHead className="text-xs">{t("payments.table.receivable")}</TableHead>
                        <TableHead className="text-xs text-right">{t("payments.table.amount")}</TableHead>
                        <TableHead className="text-xs">{t("payments.table.method")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaseAllocations.map(al => {
                        const ri = receivables.find(r => r.id === al.receivableItemId);
                        return (
                          <TableRow key={al.id}>
                            <TableCell className="text-xs text-muted-foreground">{formatDate(al.allocationDate, locale)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{ri?.label ?? "—"}</TableCell>
                            <TableCell className="text-right text-sm font-medium">{formatCurrency(al.allocatedAmount, currency, locale)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{getAllocationTypeLabel(t, al.allocationType)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })()}
      {lease.notes && (
        <Card>
          <CardHeader className="pb-3 items-center"><CardTitle className="text-sm font-medium text-center">{t("common.notes")}</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{lease.notes}</p></CardContent>
        </Card>
      )}

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("table.created")}: {formatDate(lease.createdAt, locale)}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("table.updated")}: {formatDate(lease.updatedAt, locale)}</span>
      </div>

      {/* Record Cash Receipt Sheet */}
      <Dialog open={receiptSheetOpen} onOpenChange={setReceiptSheetOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("leaseDialog.recordReceipt")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>{t("payments.dialog.sourceType")}</Label>
              <Select value={formSourceType} onValueChange={v => setFormSourceType(v as CashReceiptSourceType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["bank-transfer","instant-transfer","direct-debit","card","cash","cheque","manual"] as CashReceiptSourceType[]).map(k => (
                    <SelectItem key={k} value={k}>{getSourceTypeLabel(t, k)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("payments.dialog.paymentDate")}</Label><Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} /></div>
            <div><Label>{t("leaseDialog.amountWithCurrency").replace("{currency}", currency)}</Label><Input type="number" step="0.01" min="0" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" /></div>
            <div><Label>{t("payments.dialog.reference")}</Label><Input value={formRef} onChange={e => setFormRef(e.target.value)} /></div>
            <div><Label>{t("common.notes")}</Label><Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} /></div>
            <div className="flex items-center justify-between">
              <Label>{t("payments.dialog.autoAllocate")}</Label>
              <Switch checked={formAutoAllocate} onCheckedChange={setFormAutoAllocate} />
            </div>
            <Button onClick={handleAddReceipt} disabled={!formAmount} className="w-full">{t("leaseDialog.recordReceipt")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Guarantee Sheet */}
      <Dialog open={guaranteeSheetOpen} onOpenChange={setGuaranteeSheetOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{guarantee ? t("leaseDialog.editGuarantee") : t("leaseDialog.addGuarantee")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>{t("table.type")}</Label>
              <Select value={gType} onValueChange={v => setGType(v as GuaranteeType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(GUARANTEE_TYPE_KEY) as GuaranteeType[]).map(k => <SelectItem key={k} value={k}>{t(GUARANTEE_TYPE_KEY[k])}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("leaseDialog.expectedAmount")}</Label><Input type="number" step="0.01" value={gExpected} onChange={e => setGExpected(e.target.value)} /></div>
            <div><Label>{t("leaseDialog.receivedAmount")}</Label><Input type="number" step="0.01" value={gReceived} onChange={e => setGReceived(e.target.value)} /></div>
            <div><Label>{t("detail.receivedDate")}</Label><Input type="date" value={gReceivedDate} onChange={e => setGReceivedDate(e.target.value)} /></div>
            <div><Label>{t("detail.releaseDate")}</Label><Input type="date" value={gReleaseDate} onChange={e => setGReleaseDate(e.target.value)} /></div>
            <div><Label>{t("leaseDialog.retentionAmount")}</Label><Input type="number" step="0.01" value={gRetention} onChange={e => setGRetention(e.target.value)} /></div>
            <div><Label>{t("common.notes")}</Label><Textarea value={gNotes} onChange={e => setGNotes(e.target.value)} rows={2} /></div>
            <Button onClick={handleSaveGuarantee} className="w-full">{t("leaseDialog.saveGuarantee")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notice Sheet */}
      <Dialog open={noticeSheetOpen} onOpenChange={setNoticeSheetOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("leaseDialog.registerNotice")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>{t("detail.noticeDate")}</Label><Input type="date" value={nDate} onChange={e => setNDate(e.target.value)} /></div>
            <div><Label>{t("leaseDialog.intendedMoveOut")}</Label><Input type="date" value={nMoveOut} onChange={e => setNMoveOut(e.target.value)} /></div>
            <div><Label>{t("detail.reason")}</Label><Textarea value={nReason} onChange={e => setNReason(e.target.value)} rows={2} /></div>
            <Button onClick={handleSaveNotice} className="w-full">{t("leaseDialog.saveNotice")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move-In Sheet */}
      <Dialog open={moveInSheetOpen} onOpenChange={setMoveInSheetOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("leaseDialog.moveIn")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>{t("leaseDialog.scheduledDate")}</Label><Input type="date" value={miScheduled} onChange={e => setMiScheduled(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("leaseDialog.electricityMeter")}</Label><Input value={miMeter} onChange={e => setMiMeter(e.target.value)} placeholder="kWh" /></div>
              <div><Label>{t("leaseDialog.waterMeter")}</Label><Input value={miWaterMeter} onChange={e => setMiWaterMeter(e.target.value)} placeholder="m³" /></div>
            </div>
            <div><Label>{t("leaseDialog.keysHandedOver")}</Label><Input type="number" min={0} value={miKeys} onChange={e => setMiKeys(e.target.value)} /></div>
            <div className="flex gap-2">
              <Button onClick={handleScheduleMoveIn} variant="outline" className="flex-1">{t("leaseDialog.schedule")}</Button>
              <Button onClick={handleConfirmMoveIn} className="flex-1">{t("leaseDialog.confirmMoveIn")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move-Out Sheet */}
      <Dialog open={moveOutSheetOpen} onOpenChange={setMoveOutSheetOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("leaseDialog.moveOut")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>{t("leaseDialog.scheduledDate")}</Label><Input type="date" value={moScheduled} onChange={e => setMoScheduled(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("leaseDialog.electricityMeter")}</Label><Input value={moMeter} onChange={e => setMoMeter(e.target.value)} placeholder="kWh" /></div>
              <div><Label>{t("leaseDialog.waterMeter")}</Label><Input value={moWaterMeter} onChange={e => setMoWaterMeter(e.target.value)} placeholder="m³" /></div>
            </div>
            <div><Label>{t("common.notes")}</Label><Textarea value={moNotes} onChange={e => setMoNotes(e.target.value)} rows={2} /></div>
            <div className="flex gap-2">
              <Button onClick={handleScheduleMoveOut} variant="outline" className="flex-1">{t("leaseDialog.schedule")}</Button>
              <Button onClick={handleConfirmMoveOut} className="flex-1">{t("leaseDialog.confirmMoveOut")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return Sheet */}
      <Dialog open={returnSheetOpen} onOpenChange={setReturnSheetOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("leaseDialog.returnStatus")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>{t("table.status")}</Label>
              <Select value={retStatus} onValueChange={v => setRetStatus(v as ReturnStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t("status.pending")}</SelectItem>
                  <SelectItem value="in-review">{t("status.inReview")}</SelectItem>
                  <SelectItem value="completed">{t("status.completed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("common.notes")}</Label><Textarea value={retNotes} onChange={e => setRetNotes(e.target.value)} rows={2} /></div>
            <Button onClick={handleSaveReturn} className="w-full">{t("action.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Override Confirm Dialog */}
      {pendingOverrideValidation && (
        <OverrideConfirmDialog
          open={overrideDialogOpen}
          onOpenChange={(v) => { setOverrideDialogOpen(v); if (!v) { setPendingOverrideValidation(null); setPendingOverrideAction(""); } }}
          validation={pendingOverrideValidation}
          actionLabel={pendingOverrideAction === "ended" ? t("lease.overrideAndEnd") : t("lease.overrideAndTerminate")}
          onOverride={handleLeaseOverrideConfirm}
        />
      )}

      {/* End Lease Dialog */}
      <Dialog open={endDialogOpen} onOpenChange={setEndDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("lease.endDialog.title")}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">{t("lease.endDialog.description")}</p>
          <div className="space-y-3 mt-3">
            <div><Label>{t("lease.endDialog.endDate")}</Label><Input type="date" value={endDateInput} onChange={e => setEndDateInput(e.target.value)} /></div>
            <div>
              <Label>{t("lease.endDialog.reason")}</Label>
              <Select value={endReasonInput} onValueChange={v => setEndReasonInput(v as LeaseEndReason)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="natural-expiry">{t("lease.endReason.naturalExpiry")}</SelectItem>
                  <SelectItem value="mutual-non-renewal">{t("lease.endReason.mutualNonRenewal")}</SelectItem>
                  <SelectItem value="notice-completed">{t("lease.endReason.noticeCompleted")}</SelectItem>
                  <SelectItem value="other">{t("lease.endReason.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("lease.endDialog.notes")}</Label><Textarea value={endNotesInput} onChange={e => setEndNotesInput(e.target.value)} rows={2} /></div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">{t("lease.endDialog.freeUnit")}</Label>
              <Switch checked={endFreeUnit} onCheckedChange={setEndFreeUnit} />
            </div>
            <Button className="w-full" onClick={() => performEndLease()} disabled={!endDateInput}>{t("lease.endDialog.confirm")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Terminate Lease Dialog */}
      <Dialog open={termDialogOpen} onOpenChange={setTermDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("lease.terminateDialog.title")}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">{t("lease.terminateDialog.description")}</p>
          <div className="space-y-3 mt-3">
            <div><Label>{t("lease.terminateDialog.endDate")}</Label><Input type="date" value={termDateInput} onChange={e => setTermDateInput(e.target.value)} /></div>
            <div>
              <Label>{t("lease.terminateDialog.reason")}</Label>
              <Textarea value={termReasonInput} onChange={e => setTermReasonInput(e.target.value)} rows={2} placeholder={t("lease.terminateDialog.reasonPlaceholder")} />
            </div>
            <div><Label>{t("lease.terminateDialog.notes")}</Label><Textarea value={termNotesInput} onChange={e => setTermNotesInput(e.target.value)} rows={2} /></div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">{t("lease.terminateDialog.freeUnit")}</Label>
              <Switch checked={termFreeUnit} onCheckedChange={setTermFreeUnit} />
            </div>
            <Button className="w-full" variant="destructive" onClick={() => performTerminate()} disabled={!termDateInput || !termReasonInput.trim()}>{t("lease.terminateDialog.confirm")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Renew Lease Dialog */}
      <Dialog open={renewDialogOpen} onOpenChange={setRenewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("lease.renewDialog.title")}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">{t("lease.renewDialog.description")}</p>
          <div className="space-y-3 mt-3">
            <div>
              <Label>{t("lease.renewDialog.currentEndDate")}</Label>
              <p className="text-sm font-medium text-foreground">{formatDate(lease.endDate, locale)}</p>
            </div>
            <div><Label>{t("lease.renewDialog.newEndDate")}</Label><Input type="date" value={renewNewEndDate} onChange={e => setRenewNewEndDate(e.target.value)} min={lease.endDate} /></div>
            <div><Label>{t("lease.renewDialog.newRent")}</Label><Input type="number" step="0.01" value={renewNewRent} onChange={e => setRenewNewRent(e.target.value)} placeholder={String(lease.monthlyRent)} /></div>
            <div><Label>{t("lease.renewDialog.newCharges")}</Label><Input type="number" step="0.01" value={renewNewCharges} onChange={e => setRenewNewCharges(e.target.value)} placeholder={String(lease.monthlyCharges)} /></div>
            <Button className="w-full" onClick={handleRenewLease} disabled={!renewNewEndDate}>{t("lease.renewDialog.confirm")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
