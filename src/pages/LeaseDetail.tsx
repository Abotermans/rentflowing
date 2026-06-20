import { useEffect, useState, useCallback } from "react";
import { LeaseEditDialog } from "@/components/leases/LeaseEditDialog";
import { cn } from "@/lib/utils";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { ArrowLeft, Clock, Plus, AlertTriangle, Bell, CheckCircle2, XCircle, ChevronDown, MoreVertical, Trash2, Undo2, Zap, Droplet, RefreshCw, Mail, Phone, Pencil, FileSignature, LogOut, LogIn, FileText, History, CalendarCheck } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { computeCycles, getCurrentCycle, getNextCycle, getCyclePaidAmount } from "@/lib/leaseCycles";
import { getTenantFullName, type GuaranteeType, type Guarantee, type ReturnStatus, type MoveInChecklist, type MoveOutChecklist, type LeaseEndReason, type LeaseKeyItem, getLeaseStatus, getMoveInStatus, getMoveOutStatus, computeGuaranteeStatus, type GuaranteeStatus } from "@/types";
import { ASSIGNMENT_TYPE_LABELS, isAncillaryAssignmentType } from "@/types";
import { getItemTypeLabel, getSourceTypeLabel, getAllocationTypeLabel } from "@/types/receivables";
import type { CashReceiptSourceType } from "@/types/receivables";
import { formatDate, formatCurrency, formatPeriodMonth, formatNumber } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { useTableSort, useSortedRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { canChangeLeaseStatus, canActivateLease, canRenewLease, canSendForSignature, canMarkSigned } from "@/lib/integrity/leaseIntegrity";
import { LeaseBanner } from "@/components/shared/LeaseBanner";
import { OverrideConfirmDialog } from "@/components/shared/OverrideConfirmDialog";
import { useOverrideHistory } from "@/context/OverrideContext";
import { logLeaseStatusChange } from "@/hooks/useLeaseStatusHistory";
import { LeaseStatusHistoryDialog } from "@/components/leases/LeaseStatusHistoryDialog";
import type { ValidationResult } from "@/lib/integrity/types";
import type { TranslationKey } from "@/i18n/translations";
import { AmendmentsSection } from "@/components/amendments/AmendmentsSection";
import { LeaseDocumentsDialog } from "@/components/leases/LeaseDocumentsDialog";
import { supabase } from "@/integrations/supabase/client";
import { ChargesReconciliationSection } from "@/components/leases/ChargesReconciliationSection";
import { getEffectiveLeaseTerms, getLeaseAmendments } from "@/lib/amendments";
import { newId } from "@/lib/repo";
import type { LeasePayerAccount } from "@/types";
import { validateDateOrder } from "@/lib/dateValidation";

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
    addGuarantee, updateGuarantee, updateLease, updateUnit, deleteLease,
    createCashReceipt, getTenantUnappliedCredit,
    getLeaseAssignments,
  } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const { currentPortfolio } = usePortfolio();
  const portfolioIdForLogs = currentPortfolio?.id ?? "";
  const showOccupancyOps = !!currentPortfolio?.show_occupancy_operations;
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [statusHistoryOpen, setStatusHistoryOpen] = useState(false);
  const [pendingOverrideValidation, setPendingOverrideValidation] = useState<ValidationResult | null>(null);
  const [pendingOverrideAction, setPendingOverrideAction] = useState<string>("");
  const [receivablesOpen, setReceivablesOpen] = useState(true);
  const [cashReceiptsOpen, setCashReceiptsOpen] = useState(false);
  const [allocationsOpen, setAllocationsOpen] = useState(false);
  const [advanceBillingOpen, setAdvanceBillingOpen] = useState(true);
  const [depositOpen, setDepositOpen] = useState(true);
  const [occupancyOpen, setOccupancyOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const [payerAccountsOpen, setPayerAccountsOpen] = useState(true);
  const [leaseSummaryOpen, setLeaseSummaryOpen] = useState(true);

  // Cash receipt form
  const [receiptSheetOpen, setReceiptSheetOpen] = useState(false);
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formAmount, setFormAmount] = useState("");
  const [formSourceType, setFormSourceType] = useState<CashReceiptSourceType>("bank-transfer");
  const [formRef, setFormRef] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formAutoAllocate, setFormAutoAllocate] = useState(true);

  // Notes edit
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesInput, setNotesInput] = useState("");

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
  const [miActualDate, setMiActualDate] = useState("");
  const [moveInMode, setMoveInMode] = useState<"schedule" | "complete">("schedule");
  const [miKeys, setMiKeys] = useState("");

  // Move-out form
  const [moveOutSheetOpen, setMoveOutSheetOpen] = useState(false);
  const [moScheduled, setMoScheduled] = useState("");
  const [moMeter, setMoMeter] = useState("");
  const [moWaterMeter, setMoWaterMeter] = useState("");
  const [moNotes, setMoNotes] = useState("");
  const [moActualDate, setMoActualDate] = useState("");
  const [moveOutMode, setMoveOutMode] = useState<"schedule" | "complete">("schedule");
  const [newAmendmentSignal, setNewAmendmentSignal] = useState(0);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [documentsCount, setDocumentsCount] = useState<number>(0);

  // Return form
  const [returnSheetOpen, setReturnSheetOpen] = useState(false);
  const [retStatus, setRetStatus] = useState<ReturnStatus>("pending");
  const [retNotes, setRetNotes] = useState("");

  // Payer accounts dialog
  const [payerDialogOpen, setPayerDialogOpen] = useState(false);
  const [payerEditingId, setPayerEditingId] = useState<string | null>(null);
  const [payerName, setPayerName] = useState("");
  const [payerIban, setPayerIban] = useState("");
  const [payerBic, setPayerBic] = useState("");
  const [payerIsDefault, setPayerIsDefault] = useState(false);
  const [payerNotes, setPayerNotes] = useState("");

  const lease = leases.find(l => l.id === id);
  if (!lease) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("detail.leaseNotFound")}</p>
        <Button variant="link" asChild className="mt-2"><Link to="/leases">← {t("nav.leases")}</Link></Button>
      </div>
    );
  }

  const unit = units.find(u => u.id === lease.unitId);
  const property = properties.find(p => p.id === lease.propertyId);
  const locale = property?.locale ?? "fr-FR";
  const currency = property?.currencyCode ?? "EUR";
  const lifecycle = getLeaseStatus(lease);
  const guarantee = getGuaranteeByLease(lease.id);
  const moveInStatus = getMoveInStatus(lease);
  const moveOutStatus = getMoveOutStatus(lease);

  const todayIso = new Date().toISOString().slice(0, 10);
  const effectiveTerms = getEffectiveLeaseTerms(lease.id, todayIso, integrityState);
  const effPrimaryTenantId = effectiveTerms?.primaryTenantId ?? lease.primaryTenantId;
  const effCoTenantIds = effectiveTerms?.coTenantIds ?? lease.coTenantIds ?? [];
  const tenant = tenants.find(tn => tn.id === effPrimaryTenantId);
  const coTenants = effCoTenantIds
    .map(tid => tenants.find(tn => tn.id === tid))
    .filter((x): x is NonNullable<typeof x> => !!x);
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
  const receivables = getReceivableItemsByLease(lease.id).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const isAdvanceBilling = (lease.rentFormula || 1) > 1;
  const cycles = isAdvanceBilling ? computeCycles({ rentFormula: lease.rentFormula, startDate: lease.startDate, endDate: effEndDate, monthlyRent: effRent, monthlyCharges: effCharges }) : [];
  const currentCycle = isAdvanceBilling ? getCurrentCycle(cycles, todayIso) : null;
  const nextCycle = isAdvanceBilling ? getNextCycle(cycles, todayIso) : null;
  const [cyclesOpen, setCyclesOpen] = useState(false);
  const receipts = getCashReceiptsByLease(lease.id).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  const { outstanding, overdue } = getLeaseOutstanding(lease.id);
  const totalAllocated = receivables.reduce((s, ri) => s + ri.allocatedAmount, 0);
  const unappliedCredit = tenant ? getTenantUnappliedCredit(tenant.id) : 0;

  const portfolioId = property?.portfolioId ?? null;

  const refreshDocCounts = useCallback(async () => {
    if (!lease?.id) return;
    const { data, error } = await supabase
      .from("lease_documents")
      .select("id")
      .eq("lease_id", lease.id);
    if (error || !data) return;
    setDocumentsCount(data.length);
  }, [lease?.id]);

  useEffect(() => { void refreshDocCounts(); }, [refreshDocCounts, documentsOpen]);

  const openDocumentsForLease = () => { setDocumentsOpen(true); };

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
    const dateErrors = validateDateOrder([
      { earlier: gReceivedDate, later: gReleaseDate, message: t("validation.dates.releasedBeforeReceived") },
    ]);
    if (dateErrors.length > 0) {
      toast({ title: t("validation.dates.title"), description: dateErrors.join(" "), variant: "destructive" });
      return;
    }
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

  // === Payer accounts ===
  const openPayerForm = (payerId: string | null) => {
    const existing = payerId ? (lease.payerAccounts ?? []).find(p => p.id === payerId) : null;
    setPayerEditingId(payerId);
    setPayerName(existing?.payerName ?? (tenant ? getTenantFullName(tenant) : ""));
    setPayerIban(existing?.payerIban ?? "");
    setPayerBic(existing?.payerBic ?? "");
    setPayerIsDefault(existing ? existing.isDefault : (lease.payerAccounts ?? []).length === 0);
    setPayerNotes(existing?.notes ?? "");
    setPayerDialogOpen(true);
  };
  const savePayerAccount = () => {
    const trimmedName = payerName.trim();
    if (!trimmedName) {
      toast({ title: t("lease.payerName"), description: t("lease.payerNamePlaceholder"), variant: "destructive" });
      return;
    }
    const current = lease.payerAccounts ?? [];
    const entry: LeasePayerAccount = {
      id: payerEditingId ?? newId(),
      payerName: trimmedName,
      payerIban: payerIban.trim() ? payerIban.replace(/\s+/g, "").toUpperCase() : null,
      payerBic: payerBic.trim() ? payerBic.replace(/\s+/g, "").toUpperCase() : null,
      isDefault: payerIsDefault,
      notes: payerNotes.trim(),
    };
    let next = payerEditingId
      ? current.map(p => p.id === payerEditingId ? entry : p)
      : [...current, entry];
    if (entry.isDefault) {
      next = next.map(p => p.id === entry.id ? p : { ...p, isDefault: false });
    } else if (!next.some(p => p.isDefault) && next.length > 0) {
      next = next.map((p, i) => i === 0 ? { ...p, isDefault: true } : p);
    }
    updateLease({ ...lease, payerAccounts: next });
    setPayerDialogOpen(false);
  };
  const removePayerAccount = (payerId: string) => {
    const current = lease.payerAccounts ?? [];
    const removed = current.find(p => p.id === payerId);
    let next = current.filter(p => p.id !== payerId);
    if (removed?.isDefault && next.length > 0 && !next.some(p => p.isDefault)) {
      next = next.map((p, i) => i === 0 ? { ...p, isDefault: true } : p);
    }
    updateLease({ ...lease, payerAccounts: next });
  };

  const handleSaveNotice = () => {
    const dateErrors = validateDateOrder([
      { earlier: nDate, later: nMoveOut, message: t("validation.dates.intendedMoveOutBeforeNotice") },
    ]);
    if (dateErrors.length > 0) {
      toast({ title: t("validation.dates.title"), description: dateErrors.join(" "), variant: "destructive" });
      return;
    }
    updateLease({
      ...lease,
      noticeGiven: true,
      noticeDate: nDate || null,
      intendedMoveOutDate: nMoveOut || null,
      terminationReason: nReason || null,
      ...(lease.moveOutActualDate ? {} : { moveOutScheduledDate: nMoveOut || null }),
    });
    toast({ title: t("leaseToast.noticeRegistered") });
    setNoticeSheetOpen(false);
  };
  const handleActivateLease = () => {
    const validation = canActivateLease(lease.id, integrityState);
    if (!validation.allowed) {
      toast({ title: t("leaseToast.cannotActivate"), description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
      return;
    }
    const fromStage = lease.lifecycleStage;
    updateLease({ ...lease, lifecycleStage: "active" });
    logLeaseStatusChange({ leaseId: lease.id, portfolioId: portfolioIdForLogs, fromStage, toStage: "active", reason: "activated" });
    if (validation.warnings.length > 0) {
      toast({ title: t("leaseToast.activatedWithWarnings"), description: validation.warnings.map(w => w.message).join(". ") });
    } else {
      toast({ title: t("leaseToast.activated") });
    }
  };

  // ===== Lifecycle: signature flow =====
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signDateInput, setSignDateInput] = useState<string>(today);

  const handleSendForSignature = () => {
    const validation = canSendForSignature(lease.id, integrityState);
    if (!validation.allowed) {
      toast({ title: t("leaseToast.cannotActivate"), description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
      return;
    }
    const fromStage = lease.lifecycleStage;
    updateLease({ ...lease, lifecycleStage: "pending-signature" });
    logLeaseStatusChange({ leaseId: lease.id, portfolioId: portfolioIdForLogs, fromStage, toStage: "pending-signature", reason: "sent-for-signature" });
    toast({ title: t("lease.toastSentForSignature") });
  };

  const openMarkSignedDialog = () => {
    setSignDateInput(lease.signedDate ?? today);
    setSignDialogOpen(true);
  };

  const handleMarkSigned = () => {
    if (!signDateInput) {
      toast({ title: t("common.validationError"), description: t("lease.signedDateRequired"), variant: "destructive" });
      return;
    }
    if (lease.startDate && signDateInput > lease.startDate) {
      toast({ title: t("validation.dates.title"), description: t("validation.dates.signedAfterStart"), variant: "destructive" });
      return;
    }
    const stage: typeof lease.lifecycleStage =
      (lease.startDate && lease.startDate <= today) ? "active" : "signed";
    const fromStage = lease.lifecycleStage;
    const next = { ...lease, signedDate: signDateInput, lifecycleStage: stage };
    updateLease(next);
    logLeaseStatusChange({ leaseId: lease.id, portfolioId: portfolioIdForLogs, fromStage, toStage: stage, reason: stage === "active" ? "activated" : "signed" });
    toast({ title: t("lease.toastSigned") });
    setSignDialogOpen(false);
  };

  const handleCancelSignature = () => {
    const fromStage = lease.lifecycleStage;
    updateLease({ ...lease, lifecycleStage: "draft", signedDate: null });
    logLeaseStatusChange({ leaseId: lease.id, portfolioId: portfolioIdForLogs, fromStage, toStage: "draft", reason: "signature-canceled" });
    toast({ title: t("lease.toastCanceledSignature") });
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
    logLeaseStatusChange({
      leaseId: lease.id, portfolioId: portfolioIdForLogs,
      fromStage: lease.lifecycleStage, toStage: "ended",
      reason: endReasonInput || "ended",
      notes: endNotesInput || null,
    });
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
    logLeaseStatusChange({
      leaseId: lease.id, portfolioId: portfolioIdForLogs,
      fromStage: lease.lifecycleStage, toStage: "terminated",
      reason: termReasonInput || "terminated",
      notes: termNotesInput || null,
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
    const clearScheduled = !lease.moveOutActualDate;
    updateLease({
      ...lease,
      noticeGiven: false,
      noticeDate: null,
      intendedMoveOutDate: null,
      terminationReason: null,
      ...(clearScheduled ? { moveOutScheduledDate: null } : {}),
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

  const openMoveInForm = (opts?: { mode?: "schedule" | "complete" }) => {
    const mode = opts?.mode ?? "schedule";
    setMoveInMode(mode);
    setMiScheduled(lease.moveInScheduledDate ?? "");
    setMiMeter(lease.moveInMeterReading ?? "");
    setMiWaterMeter(lease.moveInWaterMeterReading ?? "");
    setMiKeys(String(lease.keyHandoverCount));
    setMiActualDate(lease.moveInActualDate ?? (mode === "complete" ? today : ""));
    setMoveInSheetOpen(true);
  };
  const handleScheduleMoveIn = () => {
    updateLease({ ...lease, moveInScheduledDate: miScheduled || null, moveInMeterReading: miMeter || null, moveInWaterMeterReading: miWaterMeter || null, keyHandoverCount: parseInt(miKeys) || 0 });
    toast({ title: t("leaseToast.moveInScheduled") });
    setMoveInSheetOpen(false);
  };
  const handleConfirmMoveIn = () => {
    if (!miActualDate) return;
    const dateErrors = validateDateOrder([
      { earlier: miScheduled || lease.moveInScheduledDate, later: miActualDate, message: t("validation.dates.moveInActualBeforeScheduled") },
    ]);
    if (dateErrors.length > 0) {
      toast({ title: t("validation.dates.title"), description: dateErrors.join(" "), variant: "destructive" });
      return;
    }
    updateLease({
      ...lease,
      moveInActualDate: miActualDate,
      moveInScheduledDate: lease.moveInScheduledDate || miScheduled || miActualDate,
      moveInMeterReading: miMeter || lease.moveInMeterReading,
      moveInWaterMeterReading: miWaterMeter || lease.moveInWaterMeterReading,
      keyHandoverCount: parseInt(miKeys) || lease.keyHandoverCount,
    });
    toast({ title: t("leaseToast.moveInConfirmed") });
    setMoveInSheetOpen(false);
  };

  const openMoveOutForm = (opts?: { prefillScheduled?: string; mode?: "schedule" | "complete" }) => {
    const mode = opts?.mode ?? "schedule";
    setMoveOutMode(mode);
    setMoScheduled(lease.moveOutScheduledDate ?? lease.intendedMoveOutDate ?? opts?.prefillScheduled ?? "");
    setMoMeter(lease.moveOutMeterReading ?? "");
    setMoWaterMeter(lease.moveOutWaterMeterReading ?? "");
    setMoNotes(lease.moveOutNotes);
    setMoActualDate(lease.moveOutActualDate ?? (mode === "complete" ? today : ""));
    setMoveOutSheetOpen(true);
  };
  const handleScheduleMoveOut = () => {
    const next = moScheduled || null;
    updateLease({
      ...lease,
      moveOutScheduledDate: next,
      moveOutNotes: moNotes,
      ...(lease.noticeGiven ? { intendedMoveOutDate: next } : {}),
    });
    toast({ title: t("leaseToast.moveOutScheduled") });
    setMoveOutSheetOpen(false);
  };
  const handleCompleteMoveOut = () => {
    if (!moActualDate) return;
    const scheduled = lease.moveOutScheduledDate || moScheduled || moActualDate;
    const dateErrors = validateDateOrder([
      { earlier: moScheduled || lease.moveOutScheduledDate, later: moActualDate, message: t("validation.dates.moveOutActualBeforeScheduled") },
      { earlier: lease.moveInActualDate, later: moActualDate, message: t("validation.dates.moveOutBeforeMoveIn") },
    ]);
    if (dateErrors.length > 0) {
      toast({ title: t("validation.dates.title"), description: dateErrors.join(" "), variant: "destructive" });
      return;
    }
    updateLease({
      ...lease,
      moveOutActualDate: moActualDate,
      moveOutScheduledDate: scheduled,
      ...(lease.noticeGiven ? { intendedMoveOutDate: scheduled } : {}),
      moveOutMeterReading: moMeter || lease.moveOutMeterReading,
      moveOutWaterMeterReading: moWaterMeter || lease.moveOutWaterMeterReading,
      moveOutNotes: moNotes || lease.moveOutNotes,
      returnStatus: lease.returnStatus || "pending",
    });
    toast({ title: t("leaseToast.moveOutConfirmed") });
    setMoveOutSheetOpen(false);
  };

  const toggleMoveInChecklist = (key: keyof MoveInChecklist) => {
    const nextValue = !lease.moveInChecklist[key];
    const nextChecklist = { ...lease.moveInChecklist, [key]: nextValue };
    // If unchecking while move-in was completed, revert status to "scheduled"
    // by clearing the actual move-in date.
    const shouldRevert = !nextValue && !!lease.moveInActualDate;
    updateLease({
      ...lease,
      moveInChecklist: nextChecklist,
      ...(shouldRevert ? { moveInActualDate: "" } : {}),
    });
  };
  const toggleMoveOutChecklist = (key: keyof MoveOutChecklist) => {
    const nextValue = !lease.moveOutChecklist[key];
    const nextChecklist = { ...lease.moveOutChecklist, [key]: nextValue };
    // If unchecking while move-out was completed, revert status to "scheduled"
    // by clearing the actual move-out date.
    const shouldRevert = !nextValue && !!lease.moveOutActualDate;
    updateLease({
      ...lease,
      moveOutChecklist: nextChecklist,
      ...(shouldRevert ? { moveOutActualDate: "" } : {}),
    });
  };

  const openReturnForm = () => { setRetStatus(lease.returnStatus || "pending"); setRetNotes(lease.returnNotes); setReturnSheetOpen(true); };
  const handleSaveReturn = () => { updateLease({ ...lease, returnStatus: retStatus, returnNotes: retNotes }); toast({ title: t("leaseToast.returnStatusUpdated") }); setReturnSheetOpen(false); };
  const handleUpdateKeys = (keyHandover: number, keyReturn: number) => { updateLease({ ...lease, keyHandoverCount: keyHandover, keyReturnCount: keyReturn }); };
  const updateKeyItems = (items: LeaseKeyItem[]) => { updateLease({ ...lease, keys: items }); };
  const addKeyItem = (kind: "key" | "badge") => {
    const items = lease.keys ?? [];
    const next: LeaseKeyItem = { id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, kind, label: "", handedOverDate: null, returnedDate: null };
    updateKeyItems([...items, next]);
  };
  const patchKeyItem = (id: string, patch: Partial<LeaseKeyItem>) => {
    const items = (lease.keys ?? []).map(k => k.id === id ? { ...k, ...patch } : k);
    updateKeyItems(items);
  };
  const removeKeyItem = (id: string) => { updateKeyItems((lease.keys ?? []).filter(k => k.id !== id)); };
  const handleUpdateMeter = (field: "moveInMeterReading" | "moveOutMeterReading" | "moveInWaterMeterReading" | "moveOutWaterMeterReading", value: string) => {
    updateLease({ ...lease, [field]: value.trim() === "" ? null : value });
  };

  const enrichedReceivables = receivables.map(ri => {
    let effectiveStatus = ri.status;
    if (ri.outstandingAmount > 0 && ri.dueDate < today && (ri.status === "open" || ri.status === "partially-paid")) effectiveStatus = "overdue";
    return { ...ri, effectiveStatus };
  });

  // KPI sums for the receivables section header
  const rentCollected = receivables
    .filter(ri => ri.itemType === "rent")
    .reduce((s, ri) => s + ri.allocatedAmount, 0);
  const chargesCollected = receivables
    .filter(ri => ri.itemType === "charges" || ri.itemType === "charges-adjustment")
    .reduce((s, ri) => s + ri.allocatedAmount, 0);
  const totalExpected = receivables.reduce((s, ri) => s + ri.expectedAmount, 0);
  const totalOutstanding = receivables.reduce((s, ri) => s + ri.outstandingAmount, 0);

  // Sortable receivables table
  type RecvSortKey = "period" | "type" | "dueDate" | "expected" | "allocated" | "outstanding" | "status";
  const { sort: recvSort, toggle: toggleRecvSort } = useTableSort<RecvSortKey>("dueDate", "desc");
  const sortedReceivables = useSortedRows(enrichedReceivables, recvSort, (ri, key) => {
    switch (key) {
      case "period": return ri.periodMonth ?? "";
      case "type": return getItemTypeLabel(t, ri.itemType);
      case "dueDate": return ri.dueDate;
      case "expected": return ri.expectedAmount;
      case "allocated": return ri.allocatedAmount;
      case "outstanding": return ri.outstandingAmount;
      case "status": return ri.effectiveStatus;
    }
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
              <button className="text-sm text-primary hover:underline flex items-center" onClick={openDocumentsForLease}>
                <FileText className="h-4 w-4 mr-1.5" />{t("documents.title")}
                {documentsCount > 0 && <span className="ml-1 text-muted-foreground">({documentsCount})</span>}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lease.lifecycleStage === "draft" && (
              <Button variant="outline" size="sm" className="h-9" onClick={() => setEditDialogOpen(true)}>
                <Pencil className="h-4 w-4 mr-1" />{t("action.edit")}
              </Button>
            )}
            {lease.lifecycleStage === "draft" && (() => {
              const check = canSendForSignature(lease.id, integrityState);
              return (
                <Button onClick={() => handleSendForSignature()} size="sm" className="h-9" disabled={!check.allowed}>
                  <FileSignature className="h-4 w-4 mr-1" />{t("lease.sendForSignature")}
                </Button>
              );
            })()}
            {lease.lifecycleStage === "pending-signature" && (
              <Button onClick={() => openMarkSignedDialog()} size="sm" className="h-9">
                <CheckCircle2 className="h-4 w-4 mr-1" />{t("lease.markSigned")}
              </Button>
            )}
            {lease.lifecycleStage !== "draft" && lease.lifecycleStage !== "pending-signature" && (
              <Button onClick={() => setReceiptSheetOpen(true)} size="sm" className="h-9"><Plus className="h-4 w-4 mr-1" />{t("lease.recordCashReceipt")}</Button>
            )}
            {(lease.lifecycleStage === "active" || lease.lifecycleStage === "signed") && !lease.noticeGiven && (
              <Button variant="outline" size="sm" className="h-9" onClick={openNoticeForm}>
                <Bell className="h-4 w-4 mr-1" />
                {t("detail.registerNotice")}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("units.moreActions")}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => setStatusHistoryOpen(true)}>
                  <History className="h-4 w-4 mr-2" />{t("lease.statusHistory.menuItem")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {lease.lifecycleStage === "pending-signature" && (
                  <>
                    <DropdownMenuItem onSelect={() => handleCancelSignature()}>
                      <Undo2 className="h-4 w-4 mr-2" />{t("lease.cancelSignature")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {lease.lifecycleStage === "signed" && (() => {
                  const termCheck = canChangeLeaseStatus(lease.id, "terminated", integrityState);
                  const termDisabled = !termCheck.allowed && !termCheck.overrideAllowed;
                  return (
                    <>
                      <DropdownMenuItem onSelect={() => handleMarkTerminated()} disabled={termDisabled} className="text-destructive focus:text-destructive">
                        <XCircle className="h-4 w-4 mr-2" />{t("detail.terminate")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  );
                })()}
                {lease.lifecycleStage === "active" && (() => {
                  const endCheck = canChangeLeaseStatus(lease.id, "ended", integrityState);
                  const termCheck = canChangeLeaseStatus(lease.id, "terminated", integrityState);
                  const endDisabled = !endCheck.allowed && !endCheck.overrideAllowed;
                  const termDisabled = !termCheck.allowed && !termCheck.overrideAllowed;
                  return (
                    <>
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

      {/* Banner stack — every banner shares the LeaseBanner shell for visual consistency */}
      <div className="space-y-3">
      {lease.noticeGiven && lease.lifecycleStage !== "ended" && lease.lifecycleStage !== "terminated" && (
        <LeaseBanner
          tone="info"
          icon={Bell}
          title={t("leaseDetail.underNotice")}
          description={
            <>
              {lease.noticeDate && <>{t("leaseDetail.noticeGivenOn").replace("{date}", formatDate(lease.noticeDate, locale))}</>}
              {showOccupancyOps && lease.noticeDate && lease.intendedMoveOutDate && " · "}
              {showOccupancyOps && lease.intendedMoveOutDate && <>{t("detail.intendedMoveOut")}: {formatDate(lease.intendedMoveOutDate, locale)}</>}
            </>
          }
          actions={
            !lease.moveOutActualDate && (
              <>
                <Button variant="outline" size="sm" onClick={openNoticeForm}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  {t("detail.editNotice")}
                </Button>
                <Button variant="outline" size="sm" onClick={handleCancelNotice}>
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  {t("lease.cancelNotice")}
                </Button>
              </>
            )
          }
        />
      )}

      {(() => {
        // Build a single mapping from a blocker/warning issue code to the
        // dedicated user action (opens a modal or scrolls to a section).
        const issueAction = (code: string): { label: string; onClick: () => void; icon?: LucideIcon } | null => {
          switch (code) {
            case "LEASE_NO_TENANTS":
            case "LEASE_BILLING_TENANT_INVALID":
            case "LEASE_NO_UNITS":
            case "LEASE_PROPERTY_UNIT_MISMATCH":
            case "LEASE_UNIT_ALREADY_ACTIVE":
              return { label: t("lease.action.editLease"), onClick: () => setEditDialogOpen(true), icon: Pencil };
            case "LEASE_NO_DEPOSIT":
              return { label: t("leaseDetail.addGuaranteeLink"), onClick: openGuaranteeForm, icon: Plus };
            case "LEASE_NO_MOVE_IN":
              return {
                label: t("lease.action.scheduleMoveIn"),
                onClick: () => openMoveInForm({ mode: "schedule" }),
                icon: CalendarCheck,
              };
            case "LEASE_SIGNED_DATE_REQUIRED":
              return { label: t("lease.action.setSignedDate"), onClick: () => setEditDialogOpen(true), icon: Pencil };
            default:
              return null;
          }
        };

        const renderIssueGroup = (
          headerText: string,
          check: ValidationResult,
        ) => {
          if (check.blockers.length === 0 && check.warnings.length === 0) return null;
          return (
            <div className="space-y-2">
              {/* Removed header text per request */}
              {check.blockers.map(b => {
                const action = issueAction(b.code);
                return (
                  <LeaseBanner
                    key={`b-${b.code}`}
                    tone="destructive"
                    icon={XCircle}
                    title={b.message}
                    actions={action && (
                      <Button variant="outline" size="sm" onClick={action.onClick}>
                        {action.icon && <action.icon className="h-4 w-4 mr-1.5" />}
                        {action.label}
                      </Button>
                    )}
                  />
                );
              })}
              {check.warnings.map(w => {
                const action = issueAction(w.code);
                return (
                  <LeaseBanner
                    key={`w-${w.code}`}
                    tone="warning"
                    icon={AlertTriangle}
                    title={w.message}
                    actions={action && (
                      <Button variant="outline" size="sm" onClick={action.onClick}>
                        {action.icon && <action.icon className="h-4 w-4 mr-1.5" />}
                        {action.label}
                      </Button>
                    )}
                  />
                );
              })}
            </div>
          );
        };

        return (
          <>
            {lease.lifecycleStage === "draft" &&
              renderIssueGroup(t("lease.activationBlocked"), canSendForSignature(lease.id, integrityState))}
            {lease.lifecycleStage === "active" && !lease.signedDate &&
              renderIssueGroup(t("lease.signatureBlocked"), canMarkSigned(lease.id, integrityState))}
          </>
        );
      })()}

      {guarantee && (guarantee.status === "pending" || guarantee.status === "incomplete") && (
        <LeaseBanner
          tone="warning"
          icon={Clock}
          title={<>{t("leaseDetail.guaranteeBannerPrefix")} <strong>{t("guarantee.waiting")}</strong></>}
          description={`${t("leaseDetail.guaranteeBannerExpected")}: ${formatCurrency(guarantee.expectedAmount, currency, locale)} · ${t("leaseDetail.guaranteeBannerReceived")}: ${formatCurrency(guarantee.receivedAmount, currency, locale)}`}
        />
      )}
      {!guarantee && lease.depositOrGuaranteeAmount && lease.depositOrGuaranteeAmount > 0 && (
        <LeaseBanner
          tone="destructive"
          icon={AlertTriangle}
          title={t("leaseDetail.noGuaranteeBanner").replace("{amount}", formatCurrency(lease.depositOrGuaranteeAmount, currency, locale))}
          actions={
            <Button variant="outline" size="sm" onClick={openGuaranteeForm}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t("leaseDetail.addGuaranteeLink")}
            </Button>
          }
        />
      )}

      {(() => {
        const scheduled = lease.moveOutScheduledDate;
        if (!scheduled) return null;
        if (scheduled >= today) return null;
        const checklistValues = Object.values(lease.moveOutChecklist);
        const total = checklistValues.length;
        const done = checklistValues.filter(Boolean).length;
        if (done === total) return null;
        return (
          <LeaseBanner
            tone="warning"
            icon={AlertTriangle}
            title={t("lease.moveOutOverdue.title").replace("{date}", formatDate(scheduled, locale))}
            description={t("lease.moveOutOverdue.description")
              .replace("{done}", String(done))
              .replace("{total}", String(total))}
            actions={
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    document.getElementById("move-out-checklist")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {t("lease.moveOutOverdue.completeChecklist")}
                </Button>
                {!lease.moveOutActualDate && (
                  <Button size="sm" variant="outline" onClick={() => openMoveOutForm({ mode: "complete" })}>
                    {t("lease.moveOutOverdue.recordMoveOut")}
                  </Button>
                )}
              </>
            }
          />
        );
      })()}

      {(() => {
        const stage = lease.lifecycleStage;
        if (stage !== "pending-signature" && stage !== "signed" && stage !== "active") return null;
        const checklistValues = Object.values(lease.moveInChecklist);
        const total = checklistValues.length;
        const done = checklistValues.filter(Boolean).length;
        if (done === total) return null;
        return (
          <LeaseBanner
            tone="warning"
            icon={AlertTriangle}
            title={t("lease.moveInIncomplete.title")}
            description={t("lease.moveInIncomplete.description")
              .replace("{done}", String(done))
              .replace("{total}", String(total))}
            actions={
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    document.getElementById("move-in-checklist")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {t("lease.moveInIncomplete.completeChecklist")}
                </Button>
                {!lease.moveInActualDate && (
                  <Button size="sm" variant="outline" onClick={() => openMoveInForm({ mode: "complete" })}>
                    {t("lease.moveInIncomplete.recordMoveIn")}
                  </Button>
                )}
              </>
            }
          />
        );
      })()}

      {/* End-of-lease approaching */}
      {(() => {
        if (lease.lifecycleStage !== "active") return null;
        if (lease.moveOutActualDate) return null;
        const END_WARN_DAYS = 60;
        const endIso = lease.endDate;
        if (!endIso) return null;
        const toUTC = (iso: string) => { const [y,m,d] = iso.split("-").map(Number); return Date.UTC(y, (m||1)-1, d||1); };
        const days = Math.round((toUTC(endIso) - toUTC(today)) / 86400000);
        if (days > END_WARN_DAYS) return null;
        let headline: string;
        if (days < 0) headline = t("lease.endingSoon.passed");
        else if (days === 0) headline = t("lease.endingSoon.today");
        else if (days === 1) headline = t("lease.endingSoon.tomorrow");
        else headline = t("lease.endingSoon.title").replace("{days}", String(days));
        const showScheduleMoveOut = !lease.noticeGiven && moveOutStatus === "not-scheduled";
        return (
          <LeaseBanner
            tone="warning"
            icon={Clock}
            title={headline}
            actions={
              <>
                <Button size="sm" variant="outline" onClick={() => setNewAmendmentSignal(n => n + 1)}>
                  {t("lease.endingSoon.suggestAmendment")}
                </Button>
                {showScheduleMoveOut && (
                  <Button size="sm" variant="outline" onClick={() => openMoveOutForm({ prefillScheduled: endIso })}>
                    {t("lease.endingSoon.suggestMoveOut")}
                  </Button>
                )}
              </>
            }
          />
        );
      })()}

      {/* Overdue end banner */}
      {lifecycle === "overdue-end" && (
        <LeaseBanner
          tone="destructive"
          icon={AlertTriangle}
          title={t("lease.overdueBanner.title")}
          description={t("lease.overdueBanner.description").replace("{date}", formatDate(lease.endDate, locale))}
          actions={
            <>
              <Button size="sm" variant="outline" onClick={openRenewDialog}>{t("lease.overdueBanner.renew")}</Button>
              <Button size="sm" variant="outline" onClick={openEndDialog}>{t("lease.overdueBanner.end")}</Button>
              <Button size="sm" variant="destructive" onClick={openTermDialog}>{t("lease.overdueBanner.terminate")}</Button>
            </>
          }
        />
      )}
      </div>

      {/* Lease Summary */}
      <Collapsible open={leaseSummaryOpen} onOpenChange={setLeaseSummaryOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
              <CardTitle className="text-base font-medium flex-1 text-left">{t("detail.leaseSummary")}</CardTitle>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-7 w-7">
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", leaseSummaryOpen && "rotate-180")} />
                </span>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
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
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground mb-1.5">{t("leases.tenant")}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {tenant && (
                      <div className="flex items-center gap-2 text-sm">
                        <HoverCard openDelay={150}>
                          <HoverCardTrigger asChild>
                            <Link to={`/tenants/${tenant.id}`} className="font-medium text-foreground hover:text-primary hover:underline">{getTenantFullName(tenant)}</Link>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-auto p-3 space-y-1.5">
                            <div className="flex items-center gap-2 text-xs"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-foreground">{tenant.email}</span></div>
                            <div className="flex items-center gap-2 text-xs"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-foreground">{tenant.phone || "—"}</span></div>
                          </HoverCardContent>
                        </HoverCard>
                      </div>
                    )}
                    {coTenants.map(ct => (
                      <div key={ct.id} className="flex items-center gap-2 text-sm">
                        <HoverCard openDelay={150}>
                          <HoverCardTrigger asChild>
                            <Link to={`/tenants/${ct.id}`} className="font-medium text-foreground hover:text-primary hover:underline">{getTenantFullName(ct)}</Link>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-auto p-3 space-y-1.5">
                            <div className="flex items-center gap-2 text-xs"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-foreground">{ct.email}</span></div>
                            <div className="flex items-center gap-2 text-xs"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-foreground">{ct.phone || "—"}</span></div>
                          </HoverCardContent>
                        </HoverCard>
                      </div>
                    ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <div><p className="text-xs text-muted-foreground">{t("leases.dueDay")}</p><p className="text-sm font-medium text-foreground">{t("leaseDetail.dueDayOfMonth").replace("{day}", String(lease.dueDayOfMonth))}</p></div>
                    <div><p className="text-xs text-muted-foreground">{t("leases.noticePeriod")}</p><p className="text-sm font-medium text-foreground">{effNotice || "—"}{amSuffix(noticeAmNum)}</p></div>
                    <div><p className="text-xs text-muted-foreground">{t("detail.noticeGiven")}</p><p className="text-sm font-medium text-foreground">{lease.noticeGiven ? t("common.yes") : t("common.no")}</p></div>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    {sortedAssignments.length > 1 ? `${t("table.unit")}s` : t("table.unit")}
                  </p>
                  <div className="rounded border overflow-hidden">
                    <Table className="[&_th]:px-2 [&_td]:px-2">
                      <TableHeader>
                        <TableRow className="h-8">
                          <TableHead className="h-8 text-sm">{t("leases.col.unit")}</TableHead>
                          <TableHead className="h-8 text-sm">{t("leases.col.role")}</TableHead>
                          <TableHead className="h-8 text-sm">{t("leases.col.start")}</TableHead>
                          <TableHead className="h-8 text-sm">{t("leases.col.signed")}</TableHead>
                          <TableHead className="h-8 text-sm">{t("leases.col.end")}</TableHead>
                          <TableHead className="h-8 text-sm text-right">{t("leases.col.rentShare")}</TableHead>
                          <TableHead className="h-8 text-sm text-right">{t("leases.col.chargesShare")}</TableHead>
                          <TableHead className="h-8 text-sm text-right">{t("common.total")}</TableHead>
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
                              <TableCell className="py-1 text-sm">
                                <Link to={`/units/${u.id}`} className="font-medium text-primary hover:underline">{u.unitCode} — {u.unitLabel}</Link>
                              </TableCell>
                              <TableCell className="py-1">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${a.isPrimary ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                                  {a.isPrimary ? t("leases.role.primary") : (isAnc ? t(`leases.assignmentType.${a.assignmentType}` as TranslationKey) : t("leases.role.secondary"))}
                                </span>
                              </TableCell>
                              <TableCell className="py-1 text-sm text-muted-foreground">{formatDate(a.startDate, locale)}</TableCell>
                              <TableCell className="py-1 text-sm text-muted-foreground">{signedFor ? formatDate(signedFor, locale) : "—"}</TableCell>
                              <TableCell className="py-1 text-sm text-muted-foreground">{formatDate(effEndDate, locale)}</TableCell>
                              <TableCell className="py-1 text-right text-sm tabular-nums">{a.rentShare != null ? formatCurrency(a.rentShare, currency, locale) : "—"}</TableCell>
                              <TableCell className="py-1 text-right text-sm tabular-nums">{a.chargesShare != null ? formatCurrency(a.chargesShare, currency, locale) : "—"}</TableCell>
                              <TableCell className="py-1 text-right text-sm font-medium tabular-nums">{formatCurrency(rowTotal, currency, locale)}</TableCell>
                            </TableRow>
                          );
                        })}
                        {(() => {
                          const sumR = sortedAssignments.reduce((s, a) => s + (a.rentShare ?? 0), 0);
                          const sumC = sortedAssignments.reduce((s, a) => s + (a.chargesShare ?? 0), 0);
                          const grand = sumR + sumC;
                          return (
                            <TableRow className="border-t border-border bg-muted/30 h-9">
                              <TableCell colSpan={5} className="py-1 text-sm font-medium text-muted-foreground">Total</TableCell>
                              <TableCell className="py-1 text-right text-sm font-semibold text-foreground tabular-nums">{formatCurrency(sumR, currency, locale)}</TableCell>
                              <TableCell className="py-1 text-right text-sm font-semibold text-foreground tabular-nums">{formatCurrency(sumC, currency, locale)}</TableCell>
                              <TableCell className="py-1 text-right text-sm font-semibold text-foreground tabular-nums">{formatCurrency(grand, currency, locale)}</TableCell>
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
            {lease.noticeDate && <div><p className="text-xs text-muted-foreground">{t("detail.noticeDate")}</p><p className="text-sm font-medium text-foreground">{formatDate(lease.noticeDate, locale)}</p></div>}
            {lease.terminationReason && <div><p className="text-xs text-muted-foreground">{t("detail.reason")}</p><p className="text-sm text-foreground">{lease.terminationReason}</p></div>}
          </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

      {/* Amendments / Avenants */}
      <AmendmentsSection
        leaseId={lease.id}
        newAmendmentSignal={newAmendmentSignal}
      />

      {/* Payer Accounts */}
      <Collapsible open={payerAccountsOpen} onOpenChange={setPayerAccountsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
              <CardTitle className="text-base font-medium flex-1 text-left">{t("lease.payerAccounts")}</CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8" onClick={(e) => { e.stopPropagation(); openPayerForm(null); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> {t("lease.addPayer")}
                </Button>
                <span className="inline-flex items-center justify-center h-7 w-7">
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", payerAccountsOpen && "rotate-180")} />
                </span>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {(lease.payerAccounts ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("lease.payerEmpty")}</p>
              ) : (
                <Table>
                    <TableHeader>
                      <TableRow className="h-8">
                        <TableHead className="h-8 text-sm">{t("lease.payerName")}</TableHead>
                        <TableHead className="h-8 text-sm">{t("lease.payerIban")}</TableHead>
                        <TableHead className="h-8 text-sm">{t("lease.payerBic")}</TableHead>
                        <TableHead className="h-8 text-sm">{t("lease.payerNotes")}</TableHead>
                        <TableHead className="h-8 text-sm w-[1%]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(lease.payerAccounts ?? []).map(pa => (
                        <TableRow key={pa.id} className="h-9">
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{pa.payerName || "—"}</span>
                              {pa.isDefault && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                  {t("lease.payerDefault")}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-mono text-foreground">{pa.payerIban || "—"}</TableCell>
                          <TableCell className="text-sm font-mono text-foreground">{pa.payerBic || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{pa.notes || "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPayerForm(pa.id)} aria-label={t("lease.editPayer")}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removePayerAccount(pa.id)} aria-label={t("lease.removePayer")}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {portfolioId && (
        <LeaseDocumentsDialog
          open={documentsOpen}
          onOpenChange={(o) => { setDocumentsOpen(o); if (!o) void refreshDocCounts(); }}
          leaseId={lease.id}
          portfolioId={portfolioId}
        />
      )}


      {/* Advance Billing — only when rentFormula > 1 */}
      {isAdvanceBilling && (
        <Collapsible open={advanceBillingOpen} onOpenChange={setAdvanceBillingOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
              <CardTitle className="text-base font-medium flex-1 text-left">
                {t("advanceCycle.title")}
              </CardTitle>
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", advanceBillingOpen && "rotate-180")} />
              </span>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{t("advanceCycle.frequency")}</p>
                <p className="text-sm font-medium text-foreground">{t("advanceCycle.everyN").replace("{n}", String(lease.rentFormula))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("advanceCycle.paidFrom")}</p>
                <p className="text-sm font-medium text-foreground">{currentCycle ? formatDate(currentCycle.startDate, locale) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("advanceCycle.paidUntil")}</p>
                <p className="text-sm font-medium text-foreground">{currentCycle ? formatDate(currentCycle.endDate, locale) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("advanceCycle.nextDueDate")}</p>
                <p className="text-sm font-medium text-foreground">{nextCycle ? formatDate(nextCycle.startDate, locale) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("advanceCycle.nextDueAmount")}</p>
                <p className="text-sm font-medium text-foreground">{nextCycle ? formatCurrency(nextCycle.total, currency, locale) : "—"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 border-t pt-3">
              <div>
                <p className="text-xs text-muted-foreground">{t("advanceCycle.monthlyRent")}</p>
                <p className="text-sm font-medium text-foreground">{formatCurrency(effRent, currency, locale)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("advanceCycle.monthlyCharges")}</p>
                <p className="text-sm font-medium text-foreground">{formatCurrency(effCharges, currency, locale)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("advanceCycle.cycleTotal")}</p>
                <p className="text-lg font-bold text-foreground">{currentCycle ? formatCurrency(currentCycle.total, currency, locale) : "—"}</p>
              </div>
            </div>

            <Collapsible open={cyclesOpen} onOpenChange={setCyclesOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground hover:text-foreground">
                  {t("advanceCycle.allCycles")}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${cyclesOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">{t("advanceCycle.period")}</TableHead>
                        <TableHead className="text-xs text-right">{t("advanceCycle.rent")}</TableHead>
                        <TableHead className="text-xs text-right">{t("advanceCycle.charges")}</TableHead>
                        <TableHead className="text-xs text-right">{t("advanceCycle.total")}</TableHead>
                        <TableHead className="text-xs text-right">{t("advanceCycle.paid")}</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cycles.map(c => {
                        const isCurrent = currentCycle?.index === c.index;
                        const paid = getCyclePaidAmount(c, receivables);
                        const fullyPaid = paid >= c.total - 0.005;
                        let status: "paid" | "late" | "current" | "future";
                        let statusLabel: string;
                        let statusClass: string;
                        if (fullyPaid) {
                          status = "paid"; statusLabel = "Paid";
                          statusClass = "bg-success/10 text-success border-success/20";
                        } else if (c.endDate < todayIso) {
                          status = "late"; statusLabel = "Late";
                          statusClass = "bg-destructive/10 text-destructive border-destructive/20";
                        } else if (c.startDate <= todayIso) {
                          status = "current"; statusLabel = paid > 0 ? "Partially paid" : "Due";
                          statusClass = paid > 0
                            ? "bg-warning/10 text-warning border-warning/20"
                            : "bg-primary/10 text-primary border-primary/20";
                        } else {
                          status = "future"; statusLabel = "Future";
                          statusClass = "bg-muted text-muted-foreground border-border";
                        }
                        return (
                          <TableRow key={c.index} className={isCurrent ? "bg-primary/5 font-medium" : ""}>
                            <TableCell className="text-xs">{c.index}{isCurrent && <span className="text-primary text-[10px] ml-1">●</span>}</TableCell>
                            <TableCell className="text-xs">{formatDate(c.startDate, locale)} → {formatDate(c.endDate, locale)}</TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(c.rentTotal, currency, locale)}</TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(c.chargesTotal, currency, locale)}</TableCell>
                            <TableCell className="text-xs text-right font-medium">{formatCurrency(c.total, currency, locale)}</TableCell>
                            <TableCell className={`text-xs text-right ${fullyPaid ? "text-success" : "text-muted-foreground"}`}>{formatCurrency(paid, currency, locale)}</TableCell>
                            <TableCell className="text-xs">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium ${statusClass}`}>
                                {statusLabel}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
          </CollapsibleContent>
        </Card>
        </Collapsible>
      )}

      {/* Deposit / Guarantee Card */}
      <Collapsible open={depositOpen} onOpenChange={setDepositOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex items-center gap-1.5 flex-1 justify-start">
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
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openGuaranteeForm(); }}>
                {guarantee ? <><Pencil className="h-3.5 w-3.5 mr-1" />{t("action.edit")}</> : <><Plus className="h-3.5 w-3.5 mr-1" />{t("detail.addGuarantee")}</>}
              </Button>
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", depositOpen && "rotate-180")} />
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
        <CardContent>
          {guarantee ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-xs text-muted-foreground">{t("units.type")}</p><p className="text-sm font-medium text-foreground">{t(GUARANTEE_TYPE_KEY[guarantee.type])}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("table.expected")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(guarantee.expectedAmount, currency, locale)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("table.received")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(guarantee.receivedAmount, currency, locale)}</p></div>
              {guarantee.receivedDate && <div><p className="text-xs text-muted-foreground">{t("detail.receivedDate")}</p><p className="text-sm font-medium text-foreground">{formatDate(guarantee.receivedDate, locale)}</p></div>}
              {guarantee.releaseDate && <div><p className="text-xs text-muted-foreground">{t("detail.releaseDate")}</p><p className="text-sm font-medium text-foreground">{formatDate(guarantee.releaseDate, locale)}</p></div>}
              {guarantee.retentionAmount != null && guarantee.retentionAmount > 0 && (
                <div><p className="text-xs text-muted-foreground">{t("detail.retention")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(guarantee.retentionAmount, currency, locale)}</p></div>
              )}
              {guarantee.notes && <div className="col-span-full"><p className="text-xs text-muted-foreground">{t("common.notes")}</p><p className="text-sm text-foreground">{guarantee.notes}</p></div>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("detail.noGuaranteeDesc")}</p>
          )}
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      <ChargesReconciliationSection lease={lease} currency={currency} locale={locale} />

      {/* Occupancy Operations */}
      <Collapsible open={occupancyOpen} onOpenChange={setOccupancyOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex-1 text-left">{t("detail.occupancyOps")}</CardTitle>
            <span className="inline-flex items-center justify-center h-7 w-7">
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", occupancyOpen && "rotate-180")} />
            </span>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
        <CardContent>
        <div className="grid gap-6 lg:grid-cols-2">
          {showOccupancyOps && (() => {
            const miKeys = Object.keys(lease.moveInChecklist) as (keyof MoveInChecklist)[];
            const moKeys = Object.keys(lease.moveOutChecklist) as (keyof MoveOutChecklist)[];
            const maxLen = Math.max(miKeys.length, moKeys.length);
            const miDisplay = MOVE_STATUS_DISPLAY[moveInStatus];
            const moDisplay = MOVE_STATUS_DISPLAY[moveOutStatus];
            const MiIcon = miDisplay.icon;
            const MoIcon = moDisplay.icon;
          const renderHeader = (label: string, display: typeof miDisplay, Icon: typeof MiIcon, status: typeof moveInStatus, onOpen: () => void, onComplete?: () => void, completeLabel?: string, CompleteIcon: typeof MiIcon = CheckCircle2) => (
              <div className="flex items-start justify-between gap-2 min-h-[2rem] flex-wrap">
                <div className="flex items-center gap-1.5 text-base font-medium min-w-0">
                  {label}
                  <span className={`ml-1.5 inline-flex items-center gap-1 text-xs ${display.className}`}>
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="whitespace-nowrap">{t(display.labelKey)}</span>
                  </span>
                </div>
                {status !== "completed" && (
                  <div className="flex gap-2 ml-auto flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={onOpen}>
                      {status === "not-scheduled" ? <><Clock className="h-3.5 w-3.5 mr-1" />{t("detail.schedule")}</> : <Pencil className="h-3.5 w-3.5" />}
                    </Button>
                    {status === "scheduled" && onComplete && (
                      <Button size="sm" onClick={onComplete}>
                        <CompleteIcon className="h-3.5 w-3.5 mr-1" />{completeLabel ?? t("detail.complete")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
            const renderDates = (scheduled: string | null, actual: string | null) => (
              <div className="grid grid-cols-2 gap-3 min-h-[3rem]">
                <div><p className="text-xs text-muted-foreground">{t("maintenance.scheduled")}</p><p className="text-sm font-medium text-foreground">{scheduled ? formatDate(scheduled, locale) : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("detail.actual")}</p><p className="text-sm font-medium text-foreground">{actual ? formatDate(actual, locale) : "—"}</p></div>
              </div>
            );
            return (
              <>
                {/* Move-In column */}
                <Card id="move-in-checklist" className="flex flex-col scroll-mt-20">
                  <CardHeader className="pb-3">{renderHeader(t("detail.moveIn"), miDisplay, MiIcon, moveInStatus, () => openMoveInForm({ mode: "schedule" }), () => openMoveInForm({ mode: "complete" }), t("lease.recordMoveIn"), LogIn)}</CardHeader>
                  <CardContent className="space-y-3 flex-1">
                    {renderDates(lease.moveInScheduledDate, lease.moveInActualDate)}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide min-h-[1.25rem]">{t("detail.checklist")}</p>
                      {Array.from({ length: maxLen }).map((_, i) => {
                        const key = miKeys[i];
                        if (!key) return <div key={`mi-empty-${i}`} className="h-6" />;
                        return (
                          <label key={key} className="flex items-center gap-2 cursor-pointer h-6">
                            <Checkbox
                              checked={lease.moveInChecklist[key]}
                              onCheckedChange={() => toggleMoveInChecklist(key)}
                            />
                            <span className={`text-sm ${lease.moveInChecklist[key] ? "text-muted-foreground line-through" : "text-foreground"}`}>
                              {t(MOVE_IN_CHECKLIST_KEY[key])}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Move-Out column */}
                <Card id="move-out-checklist" className="flex flex-col scroll-mt-20">
                  <CardHeader className="pb-3">{renderHeader(t("detail.moveOut"), moDisplay, MoIcon, moveOutStatus, () => openMoveOutForm({ mode: "schedule" }), () => openMoveOutForm({ mode: "complete" }), t("lease.moveOutOverdue.recordMoveOut"), LogOut)}</CardHeader>
                  <CardContent className="space-y-3 flex-1">
                    {renderDates(lease.moveOutScheduledDate, lease.moveOutActualDate)}
                    {moveOutStatus === "not-scheduled" ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide min-h-[1.25rem]">{t("detail.checklist")}</p>
                        <p className="text-sm text-muted-foreground italic">{t("detail.moveOut.checklistGated")}</p>
                      </div>
                    ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide min-h-[1.25rem]">{t("detail.checklist")}</p>
                      {Array.from({ length: maxLen }).map((_, i) => {
                        const key = moKeys[i];
                        if (!key) return <div key={`mo-empty-${i}`} className="h-6" />;
                        return (
                          <label key={key} className="flex items-center gap-2 cursor-pointer h-6">
                            <Checkbox
                              checked={lease.moveOutChecklist[key]}
                              onCheckedChange={() => toggleMoveOutChecklist(key)}
                            />
                            <span className={`text-sm ${lease.moveOutChecklist[key] ? "text-muted-foreground line-through" : "text-foreground"}`}>
                              {t(MOVE_OUT_CHECKLIST_KEY[key])}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    )}
                    {lease.moveOutNotes && <div><p className="text-xs text-muted-foreground">{t("common.notes")}</p><p className="text-sm text-foreground">{lease.moveOutNotes}</p></div>}
                  </CardContent>
                </Card>
              </>
            );
          })()}

          {/* Meters */}
          <Card>
            <CardHeader className="pb-3 flex-row items-center space-y-0"><CardTitle className="text-base font-medium text-left">{t("detail.meters")}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-x-3 gap-y-2 items-center text-xs">
                <div className="text-muted-foreground"></div>
                <div className="text-muted-foreground font-medium">{t("detail.moveInMeter")}</div>
                <div className="text-muted-foreground font-medium">{t("detail.moveOutMeter")}</div>
                <div className="text-muted-foreground font-medium text-right">{t("detail.consumption")}</div>

                <div className="flex items-center gap-1.5 text-foreground"><Zap className="h-3.5 w-3.5 text-warning" />{t("detail.electricity")}</div>
                <div className="relative"><Input inputMode="decimal" placeholder="—" className="h-8 text-sm pr-10" value={lease.moveInMeterReading ?? ""} onChange={e => handleUpdateMeter("moveInMeterReading", e.target.value)} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">kWh</span></div>
                <div className="relative"><Input inputMode="decimal" placeholder="—" className="h-8 text-sm pr-10" value={lease.moveOutMeterReading ?? ""} onChange={e => handleUpdateMeter("moveOutMeterReading", e.target.value)} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">kWh</span></div>
                <div className="text-sm font-semibold text-foreground text-right tabular-nums">{lease.moveInMeterReading && lease.moveOutMeterReading ? formatNumber(parseFloat(lease.moveOutMeterReading) - parseFloat(lease.moveInMeterReading), { unit: "kWh" }) : "—"}</div>

                <div className="flex items-center gap-1.5 text-foreground"><Droplet className="h-3.5 w-3.5 text-primary" />{t("detail.water")}</div>
                <div className="relative"><Input inputMode="decimal" placeholder="—" className="h-8 text-sm pr-8" value={lease.moveInWaterMeterReading ?? ""} onChange={e => handleUpdateMeter("moveInWaterMeterReading", e.target.value)} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">m³</span></div>
                <div className="relative"><Input inputMode="decimal" placeholder="—" className="h-8 text-sm pr-8" value={lease.moveOutWaterMeterReading ?? ""} onChange={e => handleUpdateMeter("moveOutWaterMeterReading", e.target.value)} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">m³</span></div>
                <div className="text-sm font-semibold text-foreground text-right tabular-nums">{lease.moveInWaterMeterReading && lease.moveOutWaterMeterReading ? formatNumber(parseFloat(lease.moveOutWaterMeterReading) - parseFloat(lease.moveInWaterMeterReading), { unit: "m³" }) : "—"}</div>
              </div>
            </CardContent>
          </Card>

          {/* Keys & Badges */}
          <Card>
            <CardHeader className="pb-3 flex-row items-center space-y-0 gap-2">
              <CardTitle className="text-base font-medium text-left flex-1">{t("detail.keysBadges")}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => addKeyItem("key")}><Plus className="h-3.5 w-3.5 mr-1" />{t("action.add")}</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(lease.keys ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("detail.noKeysBadges")}</p>
                ) : (
                  <div className="overflow-x-auto -mx-2 px-2">
                    <div className="grid grid-cols-[minmax(80px,1fr)_minmax(0,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_auto] gap-3 items-center text-sm min-w-[480px]">
                      <div className="text-muted-foreground font-medium">{t("detail.type")}</div>
                      <div className="text-muted-foreground font-medium">{t("detail.identifier")}</div>
                      <div className="text-muted-foreground font-medium">{t("detail.handedOver")}</div>
                      <div className="text-muted-foreground font-medium">{t("detail.returned")}</div>
                      <div></div>
                      {(lease.keys ?? []).map(k => (
                        <div key={k.id} className="contents">
                          <Select value={k.kind} onValueChange={(v) => patchKeyItem(k.id, { kind: v as "key" | "badge" })}>
                            <SelectTrigger className="h-8 text-sm min-w-0 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="key">{t("detail.kindKey")}</SelectItem>
                              <SelectItem value="badge">{t("detail.kindBadge")}</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input className="h-8 text-sm min-w-0 w-full" placeholder={t("detail.identifier")} value={k.label} onChange={e => patchKeyItem(k.id, { label: e.target.value })} />
                          <Input type="date" className="h-8 text-sm min-w-0 w-full" value={k.handedOverDate ?? ""} onChange={e => patchKeyItem(k.id, { handedOverDate: e.target.value || null })} />
                          <Input type="date" className="h-8 text-sm min-w-0 w-full" value={k.returnedDate ?? ""} onChange={e => patchKeyItem(k.id, { returnedDate: e.target.value || null })} />
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeKeyItem(k.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      {/* Receivables */}
      <Collapsible open={receivablesOpen} onOpenChange={setReceivablesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
              <CardTitle className="text-base font-medium flex-1 text-left">{t("leaseDetail.receivables")}</CardTitle>
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", receivablesOpen && "rotate-180")} />
              </span>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {/* KPI strip (embeds the former Financial Summary) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-b pb-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t("leaseDetail.rentCollected")}</p>
                  <p className="text-lg font-bold text-success">{formatCurrency(rentCollected, currency, locale)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("leaseDetail.chargesCollected")}</p>
                  <p className="text-lg font-bold text-success">{formatCurrency(chargesCollected, currency, locale)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("table.outstanding")}</p>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(outstanding, currency, locale)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("table.overdue")}</p>
                  <p className={`text-lg font-bold ${overdue > 0 ? "text-destructive" : "text-foreground"}`}>
                    {formatCurrency(overdue, currency, locale)}
                  </p>
                </div>
                {unappliedCredit > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t("leaseDetail.unappliedCredit")}</p>
                    <p className="text-lg font-bold text-primary">
                      {formatCurrency(unappliedCredit, currency, locale)}
                    </p>
                  </div>
                )}
              </div>
              {enrichedReceivables.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("leaseDetail.noReceivables")}</p>
              ) : (
                <div className="max-h-[480px] overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <SortableTableHead sortKey="period" sort={recvSort} onSort={toggleRecvSort} className="text-xs">{t("leaseDetail.period")}</SortableTableHead>
                        <SortableTableHead sortKey="type" sort={recvSort} onSort={toggleRecvSort} className="text-xs">{t("table.type")}</SortableTableHead>
                        <SortableTableHead sortKey="dueDate" sort={recvSort} onSort={toggleRecvSort} className="text-xs">{t("payments.table.dueDate")}</SortableTableHead>
                        <SortableTableHead sortKey="expected" sort={recvSort} onSort={toggleRecvSort} align="right" className="text-xs">{t("payments.table.expected")}</SortableTableHead>
                        <SortableTableHead sortKey="allocated" sort={recvSort} onSort={toggleRecvSort} align="right" className="text-xs">{t("payments.table.allocated")}</SortableTableHead>
                        <SortableTableHead sortKey="outstanding" sort={recvSort} onSort={toggleRecvSort} align="right" className="text-xs">{t("payments.table.outstanding")}</SortableTableHead>
                        <SortableTableHead sortKey="status" sort={recvSort} onSort={toggleRecvSort} className="text-xs">{t("payments.table.status")}</SortableTableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedReceivables.map(ri => (
                        <TableRow key={ri.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {ri.cycleEndDate && (ri.itemType === "rent" || ri.itemType === "charges") && ri.periodMonth
                              ? `${formatPeriodMonth(ri.periodMonth)} → ${formatPeriodMonth(ri.cycleEndDate.slice(0, 7))}`
                              : formatPeriodMonth(ri.periodMonth)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{getItemTypeLabel(t, ri.itemType)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(ri.dueDate, locale)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatCurrency(ri.expectedAmount, currency, locale)}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(ri.allocatedAmount, currency, locale)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{ri.outstandingAmount > 0 ? formatCurrency(ri.outstandingAmount, currency, locale) : "—"}</TableCell>
                          <TableCell><StatusBadge status={ri.effectiveStatus} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className="sticky bottom-0">
                      <TableRow>
                        <TableCell className="text-xs font-medium" colSpan={3}>{t("leaseDetail.total")}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{formatCurrency(totalExpected, currency, locale)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{formatCurrency(totalAllocated, currency, locale)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{formatCurrency(totalOutstanding, currency, locale)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Cash Receipts */}
      <Collapsible open={cashReceiptsOpen} onOpenChange={setCashReceiptsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
              <CardTitle className="text-base font-medium flex-1 text-left">{t("leaseDetail.cashReceipts")}</CardTitle>
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", cashReceiptsOpen && "rotate-180")} />
              </span>
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
                <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
                  <CardTitle className="text-base font-medium flex-1 text-left">{t("leaseDetail.allocationHistory")}</CardTitle>
                  <span className="inline-flex items-center justify-center h-7 w-7">
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", allocationsOpen && "rotate-180")} />
                  </span>
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
      <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex-1 text-left">{t("common.notes")}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 gap-2" onClick={(e) => { e.stopPropagation(); setNotesInput(lease.notes || ""); setNotesDialogOpen(true); }}>
                <Pencil className="h-3.5 w-3.5" />{t("action.edit")}
              </Button>
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", notesOpen && "rotate-180")} />
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            {lease.notes
              ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lease.notes}</p>
              : <p className="text-sm text-muted-foreground italic">—</p>}
          </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("table.created")}: {formatDate(lease.createdAt, locale)}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("table.updated")}: {formatDate(lease.updatedAt, locale)}</span>
      </div>

      {/* Edit Notes */}
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("common.notes")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <Textarea value={notesInput} onChange={e => setNotesInput(e.target.value)} rows={6} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>{t("action.cancel")}</Button>
              <Button onClick={() => { updateLease({ ...lease, notes: notesInput }); setNotesDialogOpen(false); toast({ title: t("action.save") }); }}>{t("action.save")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
            {moveInMode === "schedule" ? (
              <>
                <div><Label>{t("leaseDialog.scheduledDate")}</Label><Input type="date" value={miScheduled} onChange={e => setMiScheduled(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-warning" />{t("leaseDialog.electricityMeter")}</Label>
                    <div className="relative mt-1.5">
                      <Input inputMode="decimal" value={miMeter} onChange={e => setMiMeter(e.target.value)} className="h-8 text-sm pr-10" placeholder="—" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">kWh</span>
                    </div>
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5"><Droplet className="h-3.5 w-3.5 text-primary" />{t("leaseDialog.waterMeter")}</Label>
                    <div className="relative mt-1.5">
                      <Input inputMode="decimal" value={miWaterMeter} onChange={e => setMiWaterMeter(e.target.value)} className="h-8 text-sm pr-8" placeholder="—" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">m³</span>
                    </div>
                  </div>
                </div>
                <div><Label>{t("leaseDialog.keysHandedOver")}</Label><Input type="number" min={0} value={miKeys} onChange={e => setMiKeys(e.target.value)} /></div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setMoveInSheetOpen(false)} className="flex-1">{t("action.cancel")}</Button>
                  <Button onClick={handleScheduleMoveIn} className="flex-1">{t("action.save")}</Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label>{t("leaseDialog.scheduledDate")}</Label>
                  <p className="text-sm text-muted-foreground mt-1">{miScheduled ? formatDate(miScheduled, locale) : "—"}</p>
                </div>
                <div><Label>{t("detail.actual")}</Label><Input type="date" value={miActualDate} onChange={e => setMiActualDate(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-warning" />{t("leaseDialog.electricityMeter")}</Label>
                    <div className="relative mt-1.5">
                      <Input inputMode="decimal" value={miMeter} onChange={e => setMiMeter(e.target.value)} className="h-8 text-sm pr-10" placeholder="—" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">kWh</span>
                    </div>
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5"><Droplet className="h-3.5 w-3.5 text-primary" />{t("leaseDialog.waterMeter")}</Label>
                    <div className="relative mt-1.5">
                      <Input inputMode="decimal" value={miWaterMeter} onChange={e => setMiWaterMeter(e.target.value)} className="h-8 text-sm pr-8" placeholder="—" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">m³</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{t("leaseDialog.keysHandedOver")}</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => addKeyItem("key")}>
                      <Plus className="h-3.5 w-3.5 mr-1" />{t("action.add")}
                    </Button>
                  </div>
                  {(lease.keys ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("detail.noKeysBadges")}</p>
                  ) : (
                    <div className="overflow-x-auto -mx-2 px-2">
                      <div className="grid grid-cols-[minmax(80px,1fr)_minmax(0,2fr)_minmax(120px,1fr)_auto] gap-2 items-center text-sm min-w-[420px]">
                        <div className="text-muted-foreground font-medium text-xs">{t("detail.type")}</div>
                        <div className="text-muted-foreground font-medium text-xs">{t("detail.identifier")}</div>
                        <div className="text-muted-foreground font-medium text-xs">{t("detail.handedOver")}</div>
                        <div></div>
                        {(lease.keys ?? []).map(k => (
                          <div key={k.id} className="contents">
                            <Select value={k.kind} onValueChange={(v) => patchKeyItem(k.id, { kind: v as "key" | "badge" })}>
                              <SelectTrigger className="h-8 text-sm min-w-0 w-full"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="key">{t("detail.kindKey")}</SelectItem>
                                <SelectItem value="badge">{t("detail.kindBadge")}</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input className="h-8 text-sm min-w-0 w-full" placeholder={t("detail.identifier")} value={k.label} onChange={e => patchKeyItem(k.id, { label: e.target.value })} />
                            <Input type="date" className="h-8 text-sm min-w-0 w-full" value={k.handedOverDate ?? ""} onChange={e => patchKeyItem(k.id, { handedOverDate: e.target.value || null })} />
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeKeyItem(k.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setMoveInSheetOpen(false)} className="flex-1">{t("action.cancel")}</Button>
                  <Button onClick={handleConfirmMoveIn} disabled={!miActualDate} className="flex-1">{t("leaseDialog.confirmMoveIn")}</Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Move-Out Sheet */}
      <Dialog open={moveOutSheetOpen} onOpenChange={setMoveOutSheetOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("leaseDialog.moveOut")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            {moveOutMode === "schedule" ? (
              <>
                <div><Label>{t("leaseDialog.scheduledDate")}</Label><Input type="date" value={moScheduled} onChange={e => setMoScheduled(e.target.value)} /></div>
                <div><Label>{t("common.notes")}</Label><Textarea value={moNotes} onChange={e => setMoNotes(e.target.value)} rows={2} /></div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setMoveOutSheetOpen(false)} className="flex-1">{t("action.cancel")}</Button>
                  <Button onClick={handleScheduleMoveOut} className="flex-1">{t("action.save")}</Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label>{t("leaseDialog.scheduledDate")}</Label>
                  <p className="text-sm text-muted-foreground mt-1">{moScheduled ? formatDate(moScheduled, locale) : "—"}</p>
                </div>
                <div><Label>{t("detail.actual")}</Label><Input type="date" value={moActualDate} onChange={e => setMoActualDate(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-warning" />
                      {t("leaseDialog.electricityMeter")}
                    </Label>
                    <div className="relative mt-1.5">
                      <Input inputMode="decimal" value={moMeter} onChange={e => setMoMeter(e.target.value)} className="h-8 text-sm pr-10" placeholder="—" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">kWh</span>
                    </div>
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <Droplet className="h-3.5 w-3.5 text-primary" />
                      {t("leaseDialog.waterMeter")}
                    </Label>
                    <div className="relative mt-1.5">
                      <Input inputMode="decimal" value={moWaterMeter} onChange={e => setMoWaterMeter(e.target.value)} className="h-8 text-sm pr-8" placeholder="—" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">m³</span>
                    </div>
                  </div>
                </div>
                {(lease.keys ?? []).filter(k => k.handedOverDate).length > 0 && (
                  <div>
                    <Label>{t("detail.keysBadges")}</Label>
                    <div className="mt-1.5 border rounded-md divide-y">
                      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 py-1 text-[11px] text-muted-foreground uppercase tracking-wide border-b bg-muted/40">
                        <span className="w-12">{t("detail.kindKey")}</span>
                        <span>{t("detail.identifier")}</span>
                        <span className="w-[150px] text-right pr-2">{t("detail.returned")}</span>
                      </div>
                      {(lease.keys ?? []).filter(k => k.handedOverDate).map(k => (
                        <div key={k.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 py-1.5 text-sm">
                          <span className="text-xs text-muted-foreground w-12">{k.kind === "badge" ? t("detail.kindBadge") : t("detail.kindKey")}</span>
                          <span className="truncate">{k.label || "—"}</span>
                          <Input type="date" className="h-8 text-sm w-[150px]" value={k.returnedDate ?? ""} onChange={e => patchKeyItem(k.id, { returnedDate: e.target.value || null })} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div><Label>{t("common.notes")}</Label><Textarea value={moNotes} onChange={e => setMoNotes(e.target.value)} rows={2} /></div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setMoveOutSheetOpen(false)} className="flex-1">{t("action.cancel")}</Button>
                  <Button onClick={handleCompleteMoveOut} disabled={!moActualDate} className="flex-1">{t("leaseDialog.confirmMoveOut")}</Button>
                </div>
              </>
            )}
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

      <LeaseStatusHistoryDialog
        open={statusHistoryOpen}
        onOpenChange={setStatusHistoryOpen}
        leaseId={lease.id}
        leaseReference={lease.leaseReference}
        currentStage={lease.lifecycleStage}
      />

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

      {/* Mark Signed dialog */}
      <LeaseEditDialog lease={lease} open={editDialogOpen} onOpenChange={setEditDialogOpen} />

      {/* Mark Signed dialog */}
      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("lease.markSigned")}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label>{t("leases.signedDate")}</Label>
              <Input type="date" value={signDateInput} onChange={e => setSignDateInput(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleMarkSigned} disabled={!signDateInput}>{t("lease.markSigned")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payer account Dialog */}
      <Dialog open={payerDialogOpen} onOpenChange={setPayerDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{payerEditingId ? t("lease.editPayer") : t("lease.addPayer")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="payer-name">{t("lease.payerName")} *</Label>
              <Input id="payer-name" value={payerName} onChange={e => setPayerName(e.target.value)} placeholder={t("lease.payerNamePlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="payer-iban">{t("lease.payerIban")}</Label>
                <Input id="payer-iban" value={payerIban} onChange={e => setPayerIban(e.target.value)} className="font-mono" placeholder="FR76 …" />
              </div>
              <div>
                <Label htmlFor="payer-bic">{t("lease.payerBic")}</Label>
                <Input id="payer-bic" value={payerBic} onChange={e => setPayerBic(e.target.value)} className="font-mono" />
              </div>
            </div>
            <div>
              <Label htmlFor="payer-notes">{t("lease.payerNotes")}</Label>
              <Input id="payer-notes" value={payerNotes} onChange={e => setPayerNotes(e.target.value)} placeholder={t("lease.payerNotesPlaceholder")} />
            </div>
            <div className="flex items-center justify-between rounded border p-2">
              <Label htmlFor="payer-default" className="text-sm font-normal">{t("lease.payerDefault")}</Label>
              <Switch id="payer-default" checked={payerIsDefault} onCheckedChange={setPayerIsDefault} />
            </div>
            <Button className="w-full" onClick={savePayerAccount}>{t("action.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
