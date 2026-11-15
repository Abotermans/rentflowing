import { useEffect, useState, useCallback, useRef } from "react";
import { propertyBusinessDateISO } from "@/lib/businessTimeZone";
import { useBusinessNow } from "@/hooks/use-business-now";
import { LeaseEditDialog } from "@/components/leases/LeaseEditDialog";
import { cn } from "@/lib/utils";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { canWritePortfolioData } from "@/hooks/use-portfolio-write-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DateInput } from "@/components/shared/DateInput";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Clock, Plus, AlertTriangle, Bell, CheckCircle2, XCircle, ChevronDown, MoreVertical, Trash2, Undo2, Zap, Droplet, RefreshCw, Mail, Phone, Pencil, FileSignature, LogOut, LogIn, FileText, History, CalendarCheck, Info } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { computeCycles, getCurrentCycle, getNextCycle, getCyclePaidAmount, getRentFormulaSegmentStart } from "@/lib/leaseCycles";
import { getLeaseClosureReceivablesToReview, getOpenEndedReceivableThroughDate } from "@/lib/leaseReceivables";
import { getTenantFullName, isAncillaryUnitType, type Lease, type GuaranteeType, type Guarantee, type ReturnStatus, type MoveInChecklist, type MoveOutChecklist, type LeaseEndReason, type LeaseKeyItem, getLeaseStatus, getMoveInStatus, getMoveOutStatus, computeGuaranteeStatus, type GuaranteeStatus } from "@/types";
import { getItemTypeLabel, getSourceTypeLabel, getAllocationTypeLabel, isReceivableOutstanding } from "@/types/receivables";
import type { CashReceiptSourceType } from "@/types/receivables";
import { formatDate, formatCurrency, formatPeriodMonth, formatNumber } from "@/lib/formatters";
import { sumMoneyByCurrency, formatMoneyGroups } from "@/lib/money";
import { useToast } from "@/hooks/use-toast";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { useTableSort, useSortedRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { canChangeLeaseStatus, canActivateLease, canRenewLease, canSendForSignature, canMarkSigned } from "@/lib/integrity/leaseIntegrity";
import { LeaseBanner } from "@/components/shared/LeaseBanner";
import { OverrideConfirmDialog } from "@/components/shared/OverrideConfirmDialog";
import { useOverrideHistory } from "@/context/OverrideContext";
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
import { parseNoticeText, addNoticePeriod } from "@/lib/noticePeriod";
import { detailLinkClass } from "@/lib/detailLinks";
import { shouldWarnManualLeaseSigned, type LeaseDocumentLike } from "@/lib/leaseDocuments";
import { assignmentIsActiveOn, getMainLeaseUnit } from "@/lib/leaseAssignments";
import { buildRenewedLease } from "@/lib/leaseRenewal";
import { GuaranteeAlreadyExistsError, validateGuaranteeInput, type GuaranteeField, type GuaranteeError } from "@/lib/guaranteeValidation";
import { parseNonNegativeMoney } from "@/lib/validation";
import { BlurSaveInput } from "@/components/shared/BlurSaveInput";
import { normalizeMeterReading } from "@/lib/meterReading";

const GUARANTEE_TYPE_KEY: Record<GuaranteeType, TranslationKey> = {
  "cash-deposit": "guarantee.type.cashDeposit",
  "bank-guarantee": "guarantee.type.bankGuarantee",
  "insurance-guarantee": "guarantee.type.insuranceGuarantee",
  "corporate-guarantee": "guarantee.type.corporateGuarantee",
};
const PRICING_MODE_LABEL_KEY: Record<"separated" | "flat-charges" | "all-inclusive", TranslationKey> = {
  separated: "leases.pricingMode.separated",
  "flat-charges": "leases.pricingMode.flatCharges",
  "all-inclusive": "leases.pricingMode.allInclusive",
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

const formatMeterConsumption = (start: string | null | undefined, end: string | null | undefined, unit: string) => {
  if (!start?.trim() || !end?.trim()) return "—";
  const startValue = Number(start);
  const endValue = Number(end);
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) return "—";
  const consumption = endValue - startValue;
  return consumption >= 0 ? formatNumber(consumption, { unit }) : "—";
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
  const { leases } = useAppData();
  const { t } = useSettings();
  const lease = leases.find(l => l.id === id);
  if (!lease) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("detail.leaseNotFound")}</p>
        <Button variant="link" asChild className="mt-2"><Link to="/leases">← {t("nav.leases")}</Link></Button>
      </div>
    );
  }
  return <LeaseDetailContent lease={lease} />;
}

function LeaseDetailContent({ lease }: { lease: Lease }) {
  const businessNow = useBusinessNow();
  const navigate = useNavigate();
  const {
    tenants, units, properties,
    getReceivableItemsByLease, getCashReceiptsByLease, getAllocationsByReceipt,
    getGuaranteeByLease, allocations,
    addGuarantee, updateGuarantee, updateLeasePersisted, finalizeLeasePersisted, deleteLease,
    createCashReceiptPersisted, getTenantUnappliedCredit,
    getLeaseAssignments,
    updateLeaseWithAssignmentsPersisted,
    retryLoad,
  } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const { currentPortfolio } = usePortfolio();
  const canWrite = canWritePortfolioData(currentPortfolio?.role);
  const saveLeaseEdit = async (next: Lease): Promise<boolean> => {
    if (!canWrite) return false;
    try {
      if (next.moveOutScheduledDate !== lease.moveOutScheduledDate ||
        next.moveOutActualDate !== lease.moveOutActualDate ||
        next.intendedMoveOutDate !== lease.intendedMoveOutDate) {
        const today = propertyBusinessDateISO(properties.find(item => item.id === lease.propertyId), businessNow);
        const drafts = getLeaseAssignments(lease.id)
          .filter(item => !item.endDate || item.endDate >= today || item.endDate === lease.endDate)
          .map(item => ({
            unitId: item.unitId, rentShare: item.rentShare,
            chargesShare: item.chargesShare, startDate: item.startDate,
            endDate: item.endDate,
          }));
        await updateLeaseWithAssignmentsPersisted(next, drafts);
      } else {
        await updateLeasePersisted(next);
      }
      return true;
    } catch (error) {
      const description = error instanceof Error ? error.message :
        error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      toast({ title: t("settings.saveFailed"), description, variant: "destructive" });
      return false;
    }
  };
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
  const [formDate, setFormDate] = useState(() => propertyBusinessDateISO(
    properties.find(property => property.id === lease.propertyId),
  ));
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
  const [gErrors, setGErrors] = useState<Partial<Record<GuaranteeField, GuaranteeError>>>({});
  const [gReleaseDateError, setGReleaseDateError] = useState("");
  const [gSaving, setGSaving] = useState(false);

  // Notice form
  const [noticeSheetOpen, setNoticeSheetOpen] = useState(false);
  const [nDate, setNDate] = useState("");
  const [nNewEnd, setNNewEnd] = useState("");
  const [nNewEndTouched, setNNewEndTouched] = useState(false);
  const [cancelNoticeConfirmOpen, setCancelNoticeConfirmOpen] = useState(false);
  const [cancelNoticeSaving, setCancelNoticeSaving] = useState(false);
  const cancelNoticeSavingRef = useRef(false);
  const [nReason, setNReason] = useState("");

  // End / Terminate / Renew dialogs
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [endDateInput, setEndDateInput] = useState("");
  const [endReasonInput, setEndReasonInput] = useState<LeaseEndReason>("natural-expiry");
  const [endNotesInput, setEndNotesInput] = useState("");
  const [endFreeUnit, setEndFreeUnit] = useState(true);
  const [closingLease, setClosingLease] = useState(false);

  const [termDialogOpen, setTermDialogOpen] = useState(false);
  const [termDateInput, setTermDateInput] = useState("");
  const [termReasonInput, setTermReasonInput] = useState("");
  const [termNotesInput, setTermNotesInput] = useState("");
  const [termFreeUnit, setTermFreeUnit] = useState(true);

  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [renewNewEndDate, setRenewNewEndDate] = useState("");

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
  const [leaseDocuments, setLeaseDocuments] = useState<LeaseDocumentLike[]>([]);

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

  const unit = units.find(u => u.id === lease.unitId);
  const property = properties.find(p => p.id === lease.propertyId);
  const locale = property?.locale ?? "fr-FR";
  const currency = property?.currencyCode ?? "EUR";
  const todayIso = propertyBusinessDateISO(property, businessNow);
  const lifecycle = getLeaseStatus(lease, todayIso);
  const missingMainAssignment = lease.lifecycleStage !== "draft"
    && lease.lifecycleStage !== "pending-signature"
    && !getMainLeaseUnit(lease.id, integrityState.leaseUnitAssignments, units);
  const guarantee = getGuaranteeByLease(lease.id);
  const moveInStatus = getMoveInStatus(lease);
  const moveOutStatus = getMoveOutStatus(lease, todayIso);

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
    ? <span className="ml-1 text-xs text-muted-foreground">({t("amendments.basedOn").replace("{n}", String(n))})</span>
    : null;
  const receivables = getReceivableItemsByLease(lease.id).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const closureAllocationIds = new Set(allocations.map(allocation => allocation.receivableItemId));
  const closureReceivablesWarning = (endDate: string, context: "closure" | "moveOut" = "closure") => {
    if (!endDate) return null;
    const review = getLeaseClosureReceivablesToReview(receivables, lease.id, endDate, closureAllocationIds);
    if (!review.crossingCycles.length && !review.unknownCycleEnds.length && !review.protectedFuture.length) return null;
    const warningPrefix = context === "moveOut" ? "lease.moveOut" : "lease.closure";
    return (
      <div role="alert" className="flex gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="space-y-1">
          {review.crossingCycles.length > 0 && (
            <p>{t(`${warningPrefix}.crossingCycleWarning`).replace("{count}", String(review.crossingCycles.length))}</p>
          )}
          {review.unknownCycleEnds.length > 0 && (
            <p>{t(`${warningPrefix}.unknownCycleEndWarning`).replace("{count}", String(review.unknownCycleEnds.length))}</p>
          )}
          {review.protectedFuture.length > 0 && (
            <p>{t(`${warningPrefix}.protectedFutureWarning`).replace("{count}", String(review.protectedFuture.length))}</p>
          )}
        </div>
      </div>
    );
  };
  const isAdvanceBilling = (lease.rentFormula || 1) > 1;
  const formulaSegmentStart = getRentFormulaSegmentStart(lease, todayIso, integrityState.amendments, integrityState.amendmentChanges);
  const cycleDisplayEnd = effEndDate || getOpenEndedReceivableThroughDate(
    todayIso, lease.rentFormula, formulaSegmentStart, Math.max(31, Number(lease.rentFormula || 1) * 31),
  );
  const cycles = isAdvanceBilling ? computeCycles({ rentFormula: lease.rentFormula, startDate: formulaSegmentStart, endDate: cycleDisplayEnd, monthlyRent: effRent, monthlyCharges: effCharges }) : [];
  const currentCycle = isAdvanceBilling ? getCurrentCycle(cycles, todayIso) : null;
  const nextCycle = isAdvanceBilling ? getNextCycle(cycles, todayIso) : null;
  const [cyclesOpen, setCyclesOpen] = useState(false);
  const receipts = getCashReceiptsByLease(lease.id).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  const unappliedCredit = tenant ? getTenantUnappliedCredit(tenant.id, currency, lease.id) : 0;

  const portfolioId = property?.portfolioId ?? null;

  const refreshDocCounts = useCallback(async () => {
    if (!lease?.id) return;
    const { data, error } = await supabase
      .from("lease_documents")
      .select("id, lease_id, document_type, status, signed_date")
      .eq("lease_id", lease.id);
    if (error || !data) return;
    setDocumentsCount(data.length);
    setLeaseDocuments(data as LeaseDocumentLike[]);
  }, [lease?.id]);

  const handleDocumentsChanged = useCallback(() => {
    void refreshDocCounts();
    void retryLoad();
  }, [refreshDocCounts, retryLoad]);

  useEffect(() => { void refreshDocCounts(); }, [refreshDocCounts, documentsOpen]);

  const openDocumentsForLease = () => { setDocumentsOpen(true); };

  const today = todayIso;

  const handleAddReceipt = async () => {
    if (!canWrite) return;
    const amt = Number(formAmount);
    if (!formAmount.trim() || !Number.isFinite(amt) || amt <= 0) {
      toast({ title: t("common.validationError"), description: t("validation.receipt.positiveAmount"), variant: "destructive" });
      return;
    }
    if (!formDate) {
      toast({ title: t("validation.dates.title"), description: t("validation.dates.paymentDateRequired"), variant: "destructive" });
      return;
    }
    try {
      await createCashReceiptPersisted({
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
    } catch (error) {
      toast({ title: "Receipt could not be saved", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const openGuaranteeForm = () => {
    setGErrors({});
    setGReleaseDateError("");
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

  const handleSaveGuarantee = async () => {
    if (!canWrite || gSaving) return;
    const errors = validateGuaranteeInput({ expectedAmount: gExpected, receivedAmount: gReceived, retentionAmount: gRetention, releaseDate: gReleaseDate });
    setGErrors(errors);
    if (Object.keys(errors).length > 0) return;
    const expected = parseNonNegativeMoney(gExpected) ?? 0;
    const received = parseNonNegativeMoney(gReceived) ?? 0;
    const retention = gRetention.trim() ? parseNonNegativeMoney(gRetention) : null;
    const dateErrors = validateDateOrder([
      { earlier: gReceivedDate, later: gReleaseDate, message: t("validation.dates.releasedBeforeReceived") },
    ]);
    if (dateErrors.length > 0) {
      setGReleaseDateError(dateErrors.join(" "));
      return;
    }
    setGReleaseDateError("");
    const status = computeGuaranteeStatus({ expectedAmount: expected, receivedAmount: received, releaseDate: gReleaseDate || null, retentionAmount: retention });
    setGSaving(true);
    try {
      if (guarantee) {
        await updateGuarantee({ ...guarantee, type: gType, expectedAmount: expected, receivedAmount: received, status, receivedDate: gReceivedDate || null, releaseDate: gReleaseDate || null, retentionAmount: retention, notes: gNotes });
        toast({ title: t("leaseToast.guaranteeUpdated") });
      } else {
        await addGuarantee({ leaseId: lease.id, type: gType, expectedAmount: expected, receivedAmount: received, status, receivedDate: gReceivedDate || null, releaseDate: gReleaseDate || null, retentionAmount: retention, notes: gNotes });
        toast({ title: t("leaseToast.guaranteeAdded") });
      }
    } catch (err) {
      toast({
        title: t("common.validationError"),
        description: err instanceof GuaranteeAlreadyExistsError
          ? t("validation.guarantee.duplicate")
          : err instanceof Error ? err.message : "Guarantee could not be saved.",
        variant: "destructive",
      });
      return;
    } finally {
      setGSaving(false);
    }
    setGuaranteeSheetOpen(false);
  };

  const openNoticeForm = () => {
    const initialDate = lease.noticeDate ?? propertyBusinessDateISO(property);
    setNDate(initialDate);
    // When already under notice, pre-fill with the current lease end date
    // (which IS the post-notice end date). Otherwise auto-derive from notice period.
    if (lease.noticeGiven) {
      setNNewEnd(lease.endDate ?? "");
      setNNewEndTouched(true);
    } else {
      const parsed = parseNoticeText(effNotice || lease.noticePeriodText || "");
      const derived = parsed.value ? addNoticePeriod(initialDate, parsed.value, parsed.unit) : "";
      setNNewEnd(derived);
      setNNewEndTouched(false);
    }
    setNReason(lease.terminationReason ?? "");
    setNoticeSheetOpen(true);
  };

  // Re-derive the new end date when the user edits the notice date,
  // unless they have manually touched the end-date field.
  const handleNoticeDateChange = (v: string) => {
    setNDate(v);
    if (!nNewEndTouched && !lease.noticeGiven) {
      const parsed = parseNoticeText(effNotice || lease.noticePeriodText || "");
      if (parsed.value && v) setNNewEnd(addNoticePeriod(v, parsed.value, parsed.unit));
    }
  };

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
  const savePayerAccount = async () => {
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
    if (await saveLeaseEdit({ ...lease, payerAccounts: next })) setPayerDialogOpen(false);
  };
  const removePayerAccount = async (payerId: string) => {
    const current = lease.payerAccounts ?? [];
    const removed = current.find(p => p.id === payerId);
    let next = current.filter(p => p.id !== payerId);
    if (removed?.isDefault && next.length > 0 && !next.some(p => p.isDefault)) {
      next = next.map((p, i) => i === 0 ? { ...p, isDefault: true } : p);
    }
    await saveLeaseEdit({ ...lease, payerAccounts: next });
  };

  const handleSaveNotice = async () => {
    const dateErrors = validateDateOrder([
      { earlier: nDate, later: nNewEnd, message: t("validation.dates.newEndBeforeNotice") },
    ]);
    if (dateErrors.length > 0) {
      toast({ title: t("validation.dates.title"), description: dateErrors.join(" "), variant: "destructive" });
      return;
    }
    const newEnd = nNewEnd || null;
    // Snapshot the pre-notice end date only the first time, so successive
    // edits to the notice keep the original end date for restore-on-cancel.
    const snapshot = lease.preNoticeEndDate ?? (lease.noticeGiven ? lease.preNoticeEndDate ?? null : lease.endDate);
    const updatedLease = {
      ...lease,
      noticeGiven: true,
      noticeDate: nDate || null,
      intendedMoveOutDate: newEnd,
      terminationReason: nReason || null,
      endDate: newEnd ?? lease.endDate,
      preNoticeEndDate: snapshot,
      ...(lease.moveOutActualDate ? {} : { moveOutScheduledDate: newEnd }),
    };
    try {
      const today = propertyBusinessDateISO(property);
      const drafts = getLeaseAssignments(lease.id)
        .filter(item => !item.endDate || item.endDate >= today)
        .map(item => ({
          unitId: item.unitId, rentShare: item.rentShare, chargesShare: item.chargesShare,
          startDate: item.startDate, endDate: newEnd,
        }));
      await updateLeaseWithAssignmentsPersisted(updatedLease, drafts);
      toast({ title: t("leaseToast.noticeRegistered") });
      setNoticeSheetOpen(false);
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };
  const handleActivateLease = async () => {
    if (!canWrite) return;
    const validation = canActivateLease(lease.id, integrityState);
    if (!validation.allowed) {
      toast({ title: t("leaseToast.cannotActivate"), description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
      return;
    }
    try {
      await updateLeasePersisted({ ...lease, lifecycleStage: "active" }, "activated");
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      return;
    }
    if (validation.warnings.length > 0) {
      toast({ title: t("leaseToast.activatedWithWarnings"), description: validation.warnings.map(w => w.message).join(". ") });
    } else {
      toast({ title: t("leaseToast.activated") });
    }
  };

  // ===== Lifecycle: signature flow =====
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signDialogMode, setSignDialogMode] = useState<"mark-signed" | "set-signed-date">("mark-signed");
  const [manualSignConfirmOpen, setManualSignConfirmOpen] = useState(false);
  const [signSaving, setSignSaving] = useState(false);
  const signSavingRef = useRef(false);
  const [signDateInput, setSignDateInput] = useState<string>(today);

  const handleSendForSignature = async () => {
    if (!canWrite) return;
    const validation = canSendForSignature(lease.id, integrityState);
    if (!validation.allowed) {
      toast({ title: t("leaseToast.cannotActivate"), description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
      return;
    }
    try {
      await updateLeasePersisted({ ...lease, lifecycleStage: "pending-signature" }, "sent-for-signature");
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      return;
    }
    toast({ title: t("lease.toastSentForSignature") });
  };

  const openMarkSignedDialog = () => {
    setSignDialogMode("mark-signed");
    setSignDateInput(lease.signedDate ?? today);
    setSignDialogOpen(true);
  };

  const openSetSignedDateDialog = () => {
    setSignDialogMode("set-signed-date");
    setSignDateInput(lease.signedDate ?? today);
    setSignDialogOpen(true);
  };

  const performMarkSigned = async () => {
    if (!canWrite || signSavingRef.current) return;
    signSavingRef.current = true;
    setSignSaving(true);
    const stage: typeof lease.lifecycleStage =
      (lease.startDate && lease.startDate <= today) ? "active" : "signed";
    const next = { ...lease, signedDate: signDateInput, lifecycleStage: stage };
    try {
      await updateLeasePersisted(next, stage === "active" ? "activated" : "signed");
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      return;
    } finally {
      signSavingRef.current = false;
      setSignSaving(false);
    }
    toast({ title: t("lease.toastSigned") });
    setSignDialogOpen(false);
    setManualSignConfirmOpen(false);
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
    if (shouldWarnManualLeaseSigned(lease.id, leaseDocuments)) {
      setManualSignConfirmOpen(true);
      return;
    }
    performMarkSigned();
  };

  const handleSetSignedDate = async () => {
    if (!canWrite || signSavingRef.current) return;
    if (!signDateInput) {
      toast({ title: t("common.validationError"), description: t("lease.signedDateRequired"), variant: "destructive" });
      return;
    }
    if (lease.startDate && signDateInput > lease.startDate) {
      toast({ title: t("validation.dates.title"), description: t("validation.dates.signedAfterStart"), variant: "destructive" });
      return;
    }
    signSavingRef.current = true;
    setSignSaving(true);
    try {
      await updateLeasePersisted({ ...lease, signedDate: signDateInput });
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      return;
    } finally {
      signSavingRef.current = false;
      setSignSaving(false);
    }
    toast({ title: t("lease.action.setSignedDate") });
    setSignDialogOpen(false);
  };

  const handleCancelSignature = async () => {
    const toStage = lease.lifecycleStage === "signed" ? "pending-signature" : "draft";
    try {
      await updateLeasePersisted({ ...lease, lifecycleStage: toStage, signedDate: null }, "signature-canceled");
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      return;
    }
    toast({ title: t("lease.toastCanceledSignature") });
  };

  const openEndDialog = () => {
    const proposedDate = lease.moveOutActualDate ?? lease.intendedMoveOutDate ?? lease.endDate ?? today;
    setEndDateInput(proposedDate > todayIso ? todayIso : proposedDate);
    setEndReasonInput(lease.noticeGiven ? "notice-completed" : "natural-expiry");
    setEndNotesInput("");
    setEndFreeUnit(!lease.moveOutActualDate);
    setEndDialogOpen(true);
  };

  const performEndLease = async (overrideReason?: string): Promise<boolean> => {
    if (!endDateInput) {
      toast({ title: t("common.validationError"), description: t("lease.endDialog.endDate"), variant: "destructive" });
      return false;
    }
    if (endDateInput < lease.startDate) {
      toast({ title: t("common.validationError"), description: t("lease.endDateBeforeStart"), variant: "destructive" });
      return false;
    }
    if (endDateInput > todayIso) {
      toast({ title: t("common.validationError"), description: t("lease.closure.futureDate"), variant: "destructive" });
      return false;
    }
    const protectedFuture = getLeaseClosureReceivablesToReview(
      receivables, lease.id, endDateInput, closureAllocationIds,
    ).protectedFuture;
    if (protectedFuture.length) {
      toast({ title: t("common.validationError"), description: t("lease.closure.protectedFutureWarning").replace("{count}", String(protectedFuture.length)), variant: "destructive" });
      return false;
    }
    const validation = canChangeLeaseStatus(lease.id, "ended", integrityState);
    if (!validation.allowed && !overrideReason) {
      if (validation.overrideAllowed) {
        setPendingOverrideValidation(validation);
        setPendingOverrideAction("ended");
        setEndDialogOpen(false);
        setOverrideDialogOpen(true);
        return false;
      }
      toast({ title: t("lease.cannotEnd"), description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
      return false;
    }
    const updatedLease = {
      ...lease,
      lifecycleStage: "ended" as const,
      endDate: endDateInput,
      endReason: endReasonInput,
      notes: endNotesInput ? `${lease.notes}${lease.notes ? "\n" : ""}[End] ${endNotesInput}` : lease.notes,
    };
    setClosingLease(true);
    try {
      await finalizeLeasePersisted(updatedLease, {
        freeUnits: endFreeUnit, vacancyDate: endDateInput,
        historyReason: endReasonInput || "ended", historyNotes: endNotesInput || undefined,
      });
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      return false;
    } finally {
      setClosingLease(false);
    }
    if (overrideReason) {
      addOverride({
        entityType: "lease", entityId: lease.id,
        action: "status_change:ended",
        blockerCodes: [...validation.blockers.map(b => b.code), ...validation.warnings.map(w => w.code)],
        reason: overrideReason,
      });
    }
    toast({ title: t("lease.toastEnded") });
    setEndDialogOpen(false);
    return true;
  };

  const handleMarkEnded = () => openEndDialog();

  const openTermDialog = () => {
    setTermDateInput(todayIso);
    setTermReasonInput("");
    setTermNotesInput("");
    setTermFreeUnit(true);
    setTermDialogOpen(true);
  };

  const performTerminate = async (overrideReason?: string): Promise<boolean> => {
    if (!termReasonInput.trim()) {
      toast({ title: t("common.validationError"), description: t("lease.terminateDialog.reason"), variant: "destructive" });
      return false;
    }
    if (!termDateInput) {
      toast({ title: t("common.validationError"), description: t("lease.terminateDialog.endDate"), variant: "destructive" });
      return false;
    }
    if (termDateInput < lease.startDate) {
      toast({ title: t("common.validationError"), description: t("lease.endDateBeforeStart"), variant: "destructive" });
      return false;
    }
    if (termDateInput > todayIso) {
      toast({ title: t("common.validationError"), description: t("lease.closure.futureDate"), variant: "destructive" });
      return false;
    }
    const protectedFuture = getLeaseClosureReceivablesToReview(
      receivables, lease.id, termDateInput, closureAllocationIds,
    ).protectedFuture;
    if (protectedFuture.length) {
      toast({ title: t("common.validationError"), description: t("lease.closure.protectedFutureWarning").replace("{count}", String(protectedFuture.length)), variant: "destructive" });
      return false;
    }
    const validation = canChangeLeaseStatus(lease.id, "terminated", integrityState);
    if (!validation.allowed && !overrideReason) {
      if (validation.overrideAllowed) {
        setPendingOverrideValidation(validation);
        setPendingOverrideAction("terminated");
        setTermDialogOpen(false);
        setOverrideDialogOpen(true);
        return false;
      }
      toast({ title: t("lease.cannotTerminate"), description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
      return false;
    }
    const updatedLease = {
      ...lease,
      lifecycleStage: "terminated" as const,
      endDate: termDateInput,
      terminationReason: termReasonInput,
      notes: termNotesInput ? `${lease.notes}${lease.notes ? "\n" : ""}[Terminate] ${termNotesInput}` : lease.notes,
    };
    setClosingLease(true);
    try {
      await finalizeLeasePersisted(updatedLease, {
        freeUnits: termFreeUnit, vacancyDate: termDateInput,
        historyReason: termReasonInput || "terminated", historyNotes: termNotesInput || undefined,
      });
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      return false;
    } finally {
      setClosingLease(false);
    }
    if (overrideReason) {
      addOverride({
        entityType: "lease", entityId: lease.id,
        action: "status_change:terminated",
        blockerCodes: [...validation.blockers.map(b => b.code), ...validation.warnings.map(w => w.code)],
        reason: overrideReason,
      });
    }
    toast({ title: t("lease.toastTerminated") });
    setTermDialogOpen(false);
    return true;
  };

  const handleMarkTerminated = () => openTermDialog();

  const openRenewDialog = () => {
    setRenewNewEndDate("");
    setRenewDialogOpen(true);
  };

  const handleRenewLease = async () => {
    const validation = canRenewLease(lease.id, renewNewEndDate, integrityState);
    if (!validation.allowed) {
      toast({ title: t("common.validationError"), description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
      return;
    }
    const patch = buildRenewedLease(lease, renewNewEndDate);
    try {
      const drafts = getLeaseAssignments(lease.id)
        .filter(item => assignmentIsActiveOn(item, lease.endDate))
        .map(item => ({
          unitId: item.unitId,
          rentShare: item.rentShare,
          chargesShare: item.chargesShare,
          startDate: item.startDate,
          endDate: renewNewEndDate,
        }));
      await updateLeaseWithAssignmentsPersisted(patch, drafts);
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      return;
    }
    if (validation.warnings.length > 0) {
      toast({ title: t("lease.toastRenewed"), description: validation.warnings.map(w => w.message).join(". ") });
    } else {
      toast({ title: t("lease.toastRenewed") });
    }
    setRenewDialogOpen(false);
  };

  const handleCancelNotice = async () => {
    if (!canWrite || cancelNoticeSavingRef.current) return;
    cancelNoticeSavingRef.current = true;
    setCancelNoticeSaving(true);
    const clearScheduled = !lease.moveOutActualDate;
    const restoreEnd = lease.preNoticeEndDate ?? lease.endDate;
    const updatedLease = {
      ...lease,
      noticeGiven: false,
      noticeDate: null,
      intendedMoveOutDate: null,
      terminationReason: null,
      endDate: restoreEnd,
      preNoticeEndDate: null,
      ...(clearScheduled ? { moveOutScheduledDate: null } : {}),
    };
    try {
      const today = propertyBusinessDateISO(property);
      const drafts = getLeaseAssignments(lease.id)
        .filter(item => !item.endDate || item.endDate >= today || item.endDate === lease.endDate)
        .map(item => ({
          unitId: item.unitId, rentShare: item.rentShare, chargesShare: item.chargesShare,
          startDate: item.startDate, endDate: restoreEnd || null,
        }));
      await updateLeaseWithAssignmentsPersisted(updatedLease, drafts);
      toast({ title: t("lease.toastNoticeCancelled") });
      setCancelNoticeConfirmOpen(false);
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      cancelNoticeSavingRef.current = false;
      setCancelNoticeSaving(false);
    }
  };

  const handleLeaseOverrideConfirm = async (reason: string): Promise<boolean> => {
    if (!pendingOverrideValidation || !pendingOverrideAction) return false;
    let saved = false;
    if (pendingOverrideAction === "ended") {
      saved = await performEndLease(reason);
    } else if (pendingOverrideAction === "terminated") {
      saved = await performTerminate(reason);
    }
    if (saved) {
      setPendingOverrideValidation(null);
      setPendingOverrideAction("");
    }
    return saved;
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
  const handleScheduleMoveIn = async () => {
    if (!await saveLeaseEdit({ ...lease, moveInScheduledDate: miScheduled || null, moveInMeterReading: miMeter || null, moveInWaterMeterReading: miWaterMeter || null, keyHandoverCount: parseInt(miKeys) || 0 })) return;
    toast({ title: t("leaseToast.moveInScheduled") });
    setMoveInSheetOpen(false);
  };
  const handleConfirmMoveIn = async () => {
    if (!miActualDate) return;
    const dateErrors = validateDateOrder([
      { earlier: miScheduled || lease.moveInScheduledDate, later: miActualDate, message: t("validation.dates.moveInActualBeforeScheduled") },
    ]);
    if (dateErrors.length > 0) {
      toast({ title: t("validation.dates.title"), description: dateErrors.join(" "), variant: "destructive" });
      return;
    }
    if (!await saveLeaseEdit({
      ...lease,
      moveInActualDate: miActualDate,
      moveInScheduledDate: lease.moveInScheduledDate || miScheduled || miActualDate,
      moveInMeterReading: miMeter || lease.moveInMeterReading,
      moveInWaterMeterReading: miWaterMeter || lease.moveInWaterMeterReading,
      keyHandoverCount: parseInt(miKeys) || lease.keyHandoverCount,
    })) return;
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
  const handleScheduleMoveOut = async () => {
    const next = moScheduled || null;
    if (!await saveLeaseEdit({
      ...lease,
      moveOutScheduledDate: next,
      moveOutNotes: moNotes,
      ...(lease.noticeGiven ? { intendedMoveOutDate: next } : {}),
    })) return;
    toast({ title: t("leaseToast.moveOutScheduled") });
    setMoveOutSheetOpen(false);
  };
  const handleCompleteMoveOut = async () => {
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
    if (!await saveLeaseEdit({
      ...lease,
      moveOutActualDate: moActualDate,
      moveOutScheduledDate: scheduled,
      ...(lease.noticeGiven ? { intendedMoveOutDate: scheduled } : {}),
      moveOutMeterReading: moMeter || lease.moveOutMeterReading,
      moveOutWaterMeterReading: moWaterMeter || lease.moveOutWaterMeterReading,
      moveOutNotes: moNotes || lease.moveOutNotes,
      returnStatus: lease.returnStatus || "pending",
    })) return;
    toast({ title: t("leaseToast.moveOutConfirmed") });
    setMoveOutSheetOpen(false);
  };

  const toggleMoveInChecklist = async (key: keyof MoveInChecklist) => {
    const nextValue = !lease.moveInChecklist[key];
    const nextChecklist = { ...lease.moveInChecklist, [key]: nextValue };
    // If unchecking while move-in was completed, revert status to "scheduled"
    // by clearing the actual move-in date.
    const shouldRevert = !nextValue && !!lease.moveInActualDate;
    await saveLeaseEdit({
      ...lease,
      moveInChecklist: nextChecklist,
      ...(shouldRevert ? { moveInActualDate: "" } : {}),
    });
  };
  const toggleMoveOutChecklist = async (key: keyof MoveOutChecklist) => {
    const nextValue = !lease.moveOutChecklist[key];
    const nextChecklist = { ...lease.moveOutChecklist, [key]: nextValue };
    // If unchecking while move-out was completed, revert status to "scheduled"
    // by clearing the actual move-out date.
    const shouldRevert = !nextValue && !!lease.moveOutActualDate;
    await saveLeaseEdit({
      ...lease,
      moveOutChecklist: nextChecklist,
      ...(shouldRevert ? { moveOutActualDate: "" } : {}),
    });
  };

  const openReturnForm = () => { setRetStatus(lease.returnStatus || "pending"); setRetNotes(lease.returnNotes); setReturnSheetOpen(true); };
  const handleSaveReturn = async () => {
    if (!await saveLeaseEdit({ ...lease, returnStatus: retStatus, returnNotes: retNotes })) return;
    toast({ title: t("leaseToast.returnStatusUpdated") });
    setReturnSheetOpen(false);
  };
  const handleUpdateKeys = async (keyHandover: number, keyReturn: number) => { await saveLeaseEdit({ ...lease, keyHandoverCount: keyHandover, keyReturnCount: keyReturn }); };
  const updateKeyItems = async (items: LeaseKeyItem[]) => saveLeaseEdit({ ...lease, keys: items });
  const addKeyItem = (kind: "key" | "badge") => {
    const items = lease.keys ?? [];
    const next: LeaseKeyItem = { id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, kind, label: "", handedOverDate: null, returnedDate: null };
    void updateKeyItems([...items, next]);
  };
  const patchKeyItem = (id: string, patch: Partial<LeaseKeyItem>) => {
    const items = (lease.keys ?? []).map(k => k.id === id ? { ...k, ...patch } : k);
    return updateKeyItems(items);
  };
  const removeKeyItem = (id: string) => { void updateKeyItems((lease.keys ?? []).filter(k => k.id !== id)); };
  const handleUpdateMeter = async (field: "moveInMeterReading" | "moveOutMeterReading" | "moveInWaterMeterReading" | "moveOutWaterMeterReading", value: string) => {
    const normalized = normalizeMeterReading(value);
    if (normalized === undefined) {
      toast({ title: t("common.validationError"), description: t("validation.meterReading"), variant: "destructive" });
      return false;
    }
    return saveLeaseEdit({ ...lease, [field]: normalized });
  };

  const enrichedReceivables = receivables.map(ri => {
    let effectiveStatus = ri.status;
    if (ri.outstandingAmount > 0 && ri.dueDate < today && (ri.status === "open" || ri.status === "partially-paid")) effectiveStatus = "overdue";
    return { ...ri, effectiveStatus };
  });

  // KPI sums for the receivables section header
  const groupReceivables = (
    items: typeof receivables,
    amount: (item: (typeof receivables)[number]) => number,
  ) => sumMoneyByCurrency(items.map(item => ({ amount: amount(item), currencyCode: item.currencyCode, locale })));
  const formatReceivableGroups = (groups: ReturnType<typeof groupReceivables>) =>
    formatMoneyGroups(groups, formatCurrency(0, currency, locale));
  const openReceivables = receivables.filter(isReceivableOutstanding);
  const rentCollected = groupReceivables(receivables.filter(item => item.itemType === "rent"), item => item.allocatedAmount);
  const chargesCollected = groupReceivables(receivables.filter(item => item.itemType === "charges" || item.itemType === "charges-adjustment"), item => item.allocatedAmount);
  const outstanding = groupReceivables(openReceivables, item => item.outstandingAmount);
  const overdue = groupReceivables(openReceivables.filter(item => item.dueDate < todayIso), item => item.outstandingAmount);
  const totalExpected = groupReceivables(receivables, item => item.expectedAmount);
  const totalAllocated = groupReceivables(receivables, item => item.allocatedAmount);
  const totalOutstanding = groupReceivables(receivables, item => item.outstandingAmount);
  const receivableCurrencyMismatch = receivables.some(item => item.status !== "cancelled" && item.currencyCode !== currency);

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
        <div className="flex flex-col items-start gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{lease.leaseReference}</h1>
              <StatusBadge status={lifecycle} />
              <button className="text-sm text-primary hover:underline flex items-center" onClick={openDocumentsForLease}>
                <FileText className="h-4 w-4 mr-1.5" />{t("documents.title")}
                {documentsCount > 0 && <span className="ml-1 text-muted-foreground">({documentsCount})</span>}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canWrite && lease.lifecycleStage === "draft" && (
              <Button variant="outline" size="sm" className="h-9" onClick={() => setEditDialogOpen(true)}>
                <Pencil className="h-4 w-4 mr-1" />{t("action.edit")}
              </Button>
            )}
            {canWrite && lease.lifecycleStage === "draft" && (() => {
              const check = canSendForSignature(lease.id, integrityState);
              return (
                <Button onClick={() => handleSendForSignature()} size="sm" className="h-9" disabled={!check.allowed}>
                  <FileSignature className="h-4 w-4 mr-1" />{t("lease.sendForSignature")}
                </Button>
              );
            })()}
            {canWrite && lease.lifecycleStage === "pending-signature" && (
              <Button onClick={() => openMarkSignedDialog()} size="sm" className="h-9">
                <CheckCircle2 className="h-4 w-4 mr-1" />{t("lease.markSigned")}
              </Button>
            )}
            {canWrite && lease.lifecycleStage !== "draft" && lease.lifecycleStage !== "pending-signature" && (
              <Button onClick={() => setReceiptSheetOpen(true)} size="sm" className="h-9"><Plus className="h-4 w-4 mr-1" />{t("lease.recordCashReceipt")}</Button>
            )}
            {canWrite && (lease.lifecycleStage === "active" || lease.lifecycleStage === "signed") && !lease.noticeGiven && (
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
                {canWrite && (lease.lifecycleStage === "pending-signature" || lease.lifecycleStage === "signed") && (
                  <DropdownMenuItem onSelect={() => handleCancelSignature()}>
                    <Undo2 className="h-4 w-4 mr-2" />{t("lease.cancelSignature")}
                  </DropdownMenuItem>
                )}
                {canWrite && lease.lifecycleStage === "active" && (() => {
                  const endCheck = canChangeLeaseStatus(lease.id, "ended", integrityState);
                  const endDisabled = !endCheck.allowed && !endCheck.overrideAllowed;
                  return (
                    <DropdownMenuItem onSelect={() => handleMarkEnded()} disabled={endDisabled}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />{t("detail.markEnded")}
                    </DropdownMenuItem>
                  );
                })()}
                <DropdownMenuItem onSelect={() => setStatusHistoryOpen(true)}>
                  <History className="h-4 w-4 mr-2" />{t("lease.statusHistory.menuItem")}
                </DropdownMenuItem>
                {canWrite && (lease.lifecycleStage === "signed" || lease.lifecycleStage === "active") && (() => {
                  const termCheck = canChangeLeaseStatus(lease.id, "terminated", integrityState);
                  const termDisabled = !termCheck.allowed && !termCheck.overrideAllowed;
                  return (
                    <DropdownMenuItem onSelect={() => handleMarkTerminated()} disabled={termDisabled} className="text-destructive focus:text-destructive">
                      <XCircle className="h-4 w-4 mr-2" />{t("detail.terminate")}
                    </DropdownMenuItem>
                  );
                })()}
                {canWrite && <DropdownMenuSeparator />}
                {canWrite && <DeleteDialog
                  entityType="lease"
                  entityId={lease.id}
                  entityLabel={lease.leaseReference}
                  onDelete={async (lid) => { await deleteLease(lid); toast({ title: t("lease.toastDeleted") }); navigate("/leases"); }}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />{t("action.delete")}
                    </DropdownMenuItem>
                  }
                />}
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
              {lease.noticeDate && lease.endDate && " · "}
              {lease.endDate && <>{t("detail.newEndDate")}: {formatDate(lease.endDate, locale)}</>}
            </>
          }
          actions={
            canWrite && !lease.moveOutActualDate && (
              <>
                <Button variant="outline" size="sm" onClick={openNoticeForm}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  {t("detail.editNotice")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCancelNoticeConfirmOpen(true)}>
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
            case "LEASE_NO_MAIN_UNIT":
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
              return { label: t("lease.action.setSignedDate"), onClick: openSetSignedDateDialog, icon: CalendarCheck };
            default:
              return null;
          }
        };

        const renderIssueGroup = (
          headerText: string,
          check: ValidationResult,
        ) => {
          const visibleWarnings = check.warnings.filter(
            w => showOccupancyOps || w.code !== "LEASE_NO_MOVE_IN",
          );
          if (check.blockers.length === 0 && visibleWarnings.length === 0) return null;
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
                    actions={canWrite && action && (
                      <Button variant="outline" size="sm" onClick={action.onClick}>
                        {action.icon && <action.icon className="h-4 w-4 mr-1.5" />}
                        {action.label}
                      </Button>
                    )}
                  />
                );
              })}
              {visibleWarnings.map(w => {
                const action = issueAction(w.code);
                return (
                  <LeaseBanner
                    key={`w-${w.code}`}
                    tone="warning"
                    icon={AlertTriangle}
                    title={w.message}
                    actions={canWrite && action && (
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
          actions={canWrite &&
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
            actions={canWrite &&
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
        if (!showOccupancyOps) return null;
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
            actions={canWrite &&
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
            actions={canWrite &&
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
      {missingMainAssignment && (
        <LeaseBanner
          tone="warning"
          icon={AlertTriangle}
          title={t("leaseDetail.missingMainAssignment.title")}
          description={t("leaseDetail.missingMainAssignment.description")}
        />
      )}
      {lifecycle === "overdue-end" && (
        <LeaseBanner
          tone="destructive"
          icon={AlertTriangle}
          title={t("lease.overdueBanner.title")}
          description={t("lease.overdueBanner.description").replace("{date}", formatDate(lease.endDate, locale))}
          actions={canWrite &&
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
            const today = propertyBusinessDateISO(property, businessNow);
            const allAssignments = getLeaseAssignments(lease.id);
            const latestAssignmentEnd = allAssignments.map(a => a.endDate).filter((date): date is string => !!date).sort().at(-1);
            const normalSummaryDate = today < lease.startDate ? lease.startDate : effEndDate && today > effEndDate ? effEndDate : today;
            const summaryDate = lease.lifecycleStage === "ended" || lease.lifecycleStage === "terminated"
              ? lease.moveOutActualDate || latestAssignmentEnd || normalSummaryDate
              : normalSummaryDate;
            const assignments = allAssignments.filter(a => assignmentIsActiveOn(a, summaryDate));
            const sortedAssignments = assignments.length > 0
              ? assignments.slice().sort((a, b) => {
                  const au = units.find(u => u.id === a.unitId);
                  const bu = units.find(u => u.id === b.unitId);
                  return Number(!!bu && !isAncillaryUnitType(bu.unitType)) - Number(!!au && !isAncillaryUnitType(au.unitType));
                })
              : (allAssignments.length === 0 && unit ? [{
                  id: "fallback",
                  unitId: unit.id,
                  startDate: lease.startDate,
                  endDate: null as string | null,
                  rentShare: lease.monthlyRent,
                  chargesShare: lease.monthlyCharges,
                }] : []);
            const pricingFallbackApplies =
              sortedAssignments.length === 1 &&
              (sortedAssignments[0].rentShare ?? 0) === 0 &&
              (sortedAssignments[0].chargesShare ?? 0) === 0 &&
              (lease.monthlyRent > 0 || lease.monthlyCharges > 0);
            const pricingFor = (a: typeof sortedAssignments[number]) => ({
              rent: pricingFallbackApplies ? lease.monthlyRent : a.rentShare,
              charges: pricingFallbackApplies ? lease.monthlyCharges : a.chargesShare,
            });
            const pricingMode = lease.pricingMode ?? "separated";
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
                            <Link to={`/tenants/${tenant.id}`} className={`font-medium ${detailLinkClass}`}>{getTenantFullName(tenant)}</Link>
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
                            <Link to={`/tenants/${ct.id}`} className={`font-medium ${detailLinkClass}`}>{getTenantFullName(ct)}</Link>
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
                    <div><p className="text-xs text-muted-foreground">{t("leases.pricingMode")}</p><p className="text-sm font-medium text-foreground">{t(PRICING_MODE_LABEL_KEY[pricingMode])}</p></div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("leaseDetail.rentIndexation")}</p>
                      <p className="text-sm font-medium text-foreground">
                        {lease.indexationEnabled
                          ? `${lease.indexationBaseIndex ?? "—"} → ${lease.indexationCurrentIndex ?? "—"}${lease.indexationCapPercent != null ? ` · ${t("leaseDetail.indexationCap").replace("{percent}", String(lease.indexationCapPercent))}` : ""}`
                          : t("leaseDetail.disabled")}
                      </p>
                    </div>
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
                          const rowPricing = pricingFor(a);
                          const rowTotal = (rowPricing.rent ?? 0) + (rowPricing.charges ?? 0);
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
                                <Link to={`/units/${u.id}`} className={`font-medium ${detailLinkClass}`}>{u.unitCode}</Link>
                              </TableCell>
                              <TableCell className="py-1 text-sm text-muted-foreground">{formatDate(a.startDate, locale)}</TableCell>
                              <TableCell className="py-1 text-sm text-muted-foreground">{signedFor ? formatDate(signedFor, locale) : "—"}</TableCell>
                              <TableCell className="py-1 text-sm text-muted-foreground">{formatDate(a.endDate ?? effEndDate, locale)}</TableCell>
                              <TableCell className="py-1 text-right text-sm tabular-nums">{rowPricing.rent != null ? formatCurrency(rowPricing.rent, currency, locale) : "—"}</TableCell>
                              <TableCell className="py-1 text-right text-sm tabular-nums">{rowPricing.charges != null ? formatCurrency(rowPricing.charges, currency, locale) : "—"}</TableCell>
                              <TableCell className="py-1 text-right text-sm font-medium tabular-nums">{formatCurrency(rowTotal, currency, locale)}</TableCell>
                            </TableRow>
                          );
                        })}
                        {(() => {
                          const pricedAssignments = Array.from(sortedAssignments, pricingFor);
                          const sumR = pricedAssignments.reduce((s, pricing) => s + (pricing.rent ?? 0), 0);
                          const sumC = pricedAssignments.reduce((s, pricing) => s + (pricing.charges ?? 0), 0);
                          const grand = sumR + sumC;
                          return (
                            <TableRow className="border-t border-border bg-muted/30 h-9">
                              <TableCell colSpan={4} className="py-1 text-sm font-medium text-muted-foreground">Total</TableCell>
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
                {canWrite && <Button size="sm" variant="outline" className="h-8" onClick={(e) => { e.stopPropagation(); openPayerForm(null); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> {t("lease.addPayer")}
                </Button>}
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
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                                  {t("lease.payerDefault")}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-mono text-foreground">{pa.payerIban || "—"}</TableCell>
                          <TableCell className="text-sm font-mono text-foreground">{pa.payerBic || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{pa.notes || "—"}</TableCell>
                          <TableCell className="text-right">
                            {canWrite && (
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPayerForm(pa.id)} aria-label={t("lease.editPayer")}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removePayerAccount(pa.id)} aria-label={t("lease.removePayer")}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            )}
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
          lease={lease}
          todayISO={todayIso}
          onDocumentsChanged={handleDocumentsChanged}
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
                            <TableCell className="text-xs">{c.index}{isCurrent && <span className="ml-1 text-xs text-primary">●</span>}</TableCell>
                            <TableCell className="text-xs">{formatDate(c.startDate, locale)} → {formatDate(c.endDate, locale)}</TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(c.rentTotal, currency, locale)}</TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(c.chargesTotal, currency, locale)}</TableCell>
                            <TableCell className="text-xs text-right font-medium">{formatCurrency(c.total, currency, locale)}</TableCell>
                            <TableCell className={`text-xs text-right ${fullyPaid ? "text-success" : "text-muted-foreground"}`}>{formatCurrency(paid, currency, locale)}</TableCell>
                            <TableCell className="text-xs">
                              <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${statusClass}`}>
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
              {canWrite && <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openGuaranteeForm(); }}>
                {guarantee ? <><Pencil className="h-3.5 w-3.5 mr-1" />{t("action.edit")}</> : <><Plus className="h-3.5 w-3.5 mr-1" />{t("detail.addGuarantee")}</>}
              </Button>}
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
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">{t("table.expected")}</p>
                <p className="text-sm font-medium text-foreground">
                  {effDeposit != null ? formatCurrency(effDeposit, currency, locale) : "—"}
                  {amSuffix(depositAmNum)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">{t("detail.noGuaranteeDesc")}</p>
            </div>
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
                {canWrite && status !== "completed" && (
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
                              disabled={!canWrite}
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
                              disabled={!canWrite}
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
                <div className="relative"><BlurSaveInput disabled={!canWrite} inputMode="decimal" placeholder="—" ariaLabel={`${t("detail.electricity")} ${t("detail.moveInMeter")}`} className="h-8 text-sm pr-10" value={lease.moveInMeterReading ?? ""} onCommit={value => handleUpdateMeter("moveInMeterReading", value)} /><span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-muted-foreground">kWh</span></div>
                <div className="relative"><BlurSaveInput disabled={!canWrite} inputMode="decimal" placeholder="—" ariaLabel={`${t("detail.electricity")} ${t("detail.moveOutMeter")}`} className="h-8 text-sm pr-10" value={lease.moveOutMeterReading ?? ""} onCommit={value => handleUpdateMeter("moveOutMeterReading", value)} /><span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-muted-foreground">kWh</span></div>
                <div className="text-sm font-semibold text-foreground text-right tabular-nums">{formatMeterConsumption(lease.moveInMeterReading, lease.moveOutMeterReading, "kWh")}</div>

                <div className="flex items-center gap-1.5 text-foreground"><Droplet className="h-3.5 w-3.5 text-primary" />{t("detail.water")}</div>
                <div className="relative"><BlurSaveInput disabled={!canWrite} inputMode="decimal" placeholder="—" ariaLabel={`${t("detail.water")} ${t("detail.moveInMeter")}`} className="h-8 text-sm pr-8" value={lease.moveInWaterMeterReading ?? ""} onCommit={value => handleUpdateMeter("moveInWaterMeterReading", value)} /><span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-muted-foreground">m³</span></div>
                <div className="relative"><BlurSaveInput disabled={!canWrite} inputMode="decimal" placeholder="—" ariaLabel={`${t("detail.water")} ${t("detail.moveOutMeter")}`} className="h-8 text-sm pr-8" value={lease.moveOutWaterMeterReading ?? ""} onCommit={value => handleUpdateMeter("moveOutWaterMeterReading", value)} /><span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-muted-foreground">m³</span></div>
                <div className="text-sm font-semibold text-foreground text-right tabular-nums">{formatMeterConsumption(lease.moveInWaterMeterReading, lease.moveOutWaterMeterReading, "m³")}</div>
              </div>
            </CardContent>
          </Card>

          {/* Keys & Badges */}
          <Card>
            <CardHeader className="pb-3 flex-row items-center space-y-0 gap-2">
              <CardTitle className="text-base font-medium text-left flex-1">{t("detail.keysBadges")}</CardTitle>
              {canWrite && <Button variant="outline" size="sm" onClick={() => addKeyItem("key")}><Plus className="h-3.5 w-3.5 mr-1" />{t("action.add")}</Button>}
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
                          <Select disabled={!canWrite} value={k.kind} onValueChange={(v) => patchKeyItem(k.id, { kind: v as "key" | "badge" })}>
                            <SelectTrigger className="h-8 text-sm min-w-0 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="key">{t("detail.kindKey")}</SelectItem>
                              <SelectItem value="badge">{t("detail.kindBadge")}</SelectItem>
                            </SelectContent>
                          </Select>
                          <BlurSaveInput disabled={!canWrite} className="h-8 text-sm min-w-0 w-full" ariaLabel={t("detail.identifier")} placeholder={t("detail.identifier")} value={k.label} onCommit={value => patchKeyItem(k.id, { label: value })} />
                          <DateInput disabled={!canWrite} className="h-8 text-sm min-w-0 w-full" value={k.handedOverDate ?? ""} onChange={value => patchKeyItem(k.id, { handedOverDate: value || null })} />
                          <DateInput disabled={!canWrite} className="h-8 text-sm min-w-0 w-full" value={k.returnedDate ?? ""} onChange={value => patchKeyItem(k.id, { returnedDate: value || null })} />
                          {canWrite ? <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeKeyItem(k.id)}><Trash2 className="h-3.5 w-3.5" /></Button> : <span />}
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
              {receivableCurrencyMismatch && (
                <p className="mb-4 text-sm text-warning">{t("leaseDetail.mixedCurrencyWarning")}</p>
              )}
              {/* KPI strip (embeds the former Financial Summary) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-b pb-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t("leaseDetail.rentCollected")}</p>
                  <p className="text-lg font-bold text-success">{formatReceivableGroups(rentCollected)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("leaseDetail.chargesCollected")}</p>
                  <p className="text-lg font-bold text-success">{formatReceivableGroups(chargesCollected)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("table.outstanding")}</p>
                  <p className="text-lg font-bold text-foreground">{formatReceivableGroups(outstanding)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("table.overdue")}</p>
                  <p className={`text-lg font-bold ${overdue.length > 0 ? "text-destructive" : "text-foreground"}`}>
                    {formatReceivableGroups(overdue)}
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
                            {ri.cycleEndDate && (ri.itemType === "rent" || ri.itemType === "charges") && ri.periodMonth && ri.cycleEndDate.slice(0, 7) !== ri.periodMonth
                              ? `${formatPeriodMonth(ri.periodMonth)} → ${formatPeriodMonth(ri.cycleEndDate.slice(0, 7))}`
                              : formatPeriodMonth(ri.periodMonth)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{getItemTypeLabel(t, ri.itemType)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(ri.dueDate, locale)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatCurrency(ri.expectedAmount, ri.currencyCode, locale)}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(ri.allocatedAmount, ri.currencyCode, locale)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{ri.outstandingAmount > 0 ? formatCurrency(ri.outstandingAmount, ri.currencyCode, locale) : "—"}</TableCell>
                          <TableCell><StatusBadge status={ri.effectiveStatus} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className="sticky bottom-0">
                      <TableRow>
                        <TableCell className="text-xs font-medium" colSpan={3}>{t("leaseDetail.total")}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{formatReceivableGroups(totalExpected)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{formatReceivableGroups(totalAllocated)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{formatReceivableGroups(totalOutstanding)}</TableCell>
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
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(cr.amountReceived, cr.currencyCode, locale)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{cr.unmatchedAmount > 0 ? formatCurrency(cr.unmatchedAmount, cr.currencyCode, locale) : "—"}</TableCell>
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
                            <TableCell className="text-right text-sm font-medium">{formatCurrency(al.allocatedAmount, ri?.currencyCode ?? currency, locale)}</TableCell>
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
              {canWrite && <Button variant="outline" size="sm" className="h-8 gap-2" onClick={(e) => { e.stopPropagation(); setNotesInput(lease.notes || ""); setNotesDialogOpen(true); }}>
                <Pencil className="h-3.5 w-3.5" />{t("action.edit")}
              </Button>}
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
      <Dialog open={canWrite && notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("common.notes")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <Textarea value={notesInput} onChange={e => setNotesInput(e.target.value)} rows={6} />
          </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>{t("action.cancel")}</Button>
              <Button onClick={async () => { if (!await saveLeaseEdit({ ...lease, notes: notesInput })) return; setNotesDialogOpen(false); toast({ title: t("action.save") }); }}>{t("action.save")}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Cash Receipt Sheet */}
      <Dialog open={canWrite && receiptSheetOpen} onOpenChange={setReceiptSheetOpen}>
        <DialogContent>
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
            <div><Label>{t("payments.dialog.paymentDate")}</Label><DateInput value={formDate} onChange={setFormDate} /></div>
            <div><Label>{t("leaseDialog.amountWithCurrency").replace("{currency}", currency)}</Label><Input type="number" step="0.01" min="0" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" /></div>
            <div><Label>{t("payments.dialog.reference")}</Label><Input value={formRef} onChange={e => setFormRef(e.target.value)} /></div>
            <div><Label>{t("common.notes")}</Label><Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} /></div>
            <div className="flex items-center justify-between">
              <Label>{t("payments.dialog.autoAllocate")}</Label>
              <Switch checked={formAutoAllocate} onCheckedChange={setFormAutoAllocate} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleAddReceipt} disabled={!formAmount}>{t("leaseDialog.recordReceipt")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guarantee Sheet */}
      <Dialog open={canWrite && guaranteeSheetOpen} onOpenChange={open => { if (!gSaving) setGuaranteeSheetOpen(open); }}>
        <DialogContent>
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
            <div><Label>{t("leaseDialog.expectedAmount")}</Label><Input type="text" inputMode="decimal" aria-invalid={!!gErrors.expectedAmount} className={cn(gErrors.expectedAmount && "border-destructive")} value={gExpected} onChange={e => { setGExpected(e.target.value); setGErrors(prev => ({ ...prev, expectedAmount: undefined })); }} />{gErrors.expectedAmount && <p className="text-sm text-destructive">{t(`validation.guarantee.${gErrors.expectedAmount}` as TranslationKey)}</p>}</div>
            <div><Label>{t("leaseDialog.receivedAmount")}</Label><Input type="text" inputMode="decimal" aria-invalid={!!gErrors.receivedAmount} className={cn(gErrors.receivedAmount && "border-destructive")} value={gReceived} onChange={e => { setGReceived(e.target.value); setGErrors(prev => ({ ...prev, receivedAmount: undefined, retentionAmount: undefined })); }} />{gErrors.receivedAmount && <p className="text-sm text-destructive">{t(`validation.guarantee.${gErrors.receivedAmount}` as TranslationKey)}</p>}</div>
            <div><Label>{t("detail.receivedDate")}</Label><DateInput value={gReceivedDate} onChange={value => { setGReceivedDate(value); if (validateDateOrder([{ earlier: value, later: gReleaseDate, message: t("validation.dates.releasedBeforeReceived") }]).length === 0) setGReleaseDateError(""); }} /></div>
            <div><Label>{t("detail.releaseDate")}</Label><DateInput value={gReleaseDate} aria-invalid={!!gReleaseDateError} onChange={value => { setGReleaseDate(value); setGErrors(prev => ({ ...prev, retentionAmount: undefined })); if (validateDateOrder([{ earlier: gReceivedDate, later: value, message: t("validation.dates.releasedBeforeReceived") }]).length === 0) setGReleaseDateError(""); }} />{gReleaseDateError && <p className="text-sm text-destructive">{gReleaseDateError}</p>}</div>
            <div><Label>{t("leaseDialog.retentionAmount")}</Label><Input type="text" inputMode="decimal" aria-invalid={!!gErrors.retentionAmount} className={cn(gErrors.retentionAmount && "border-destructive")} value={gRetention} onChange={e => { setGRetention(e.target.value); setGErrors(prev => ({ ...prev, retentionAmount: undefined })); }} />{gErrors.retentionAmount && <p className="text-sm text-destructive">{t(`validation.guarantee.${gErrors.retentionAmount}` as TranslationKey)}</p>}</div>
            <div><Label>{t("common.notes")}</Label><Textarea value={gNotes} onChange={e => setGNotes(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={gSaving} onClick={() => setGuaranteeSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button disabled={gSaving} onClick={handleSaveGuarantee}>{t("leaseDialog.saveGuarantee")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notice Sheet */}
      <Dialog open={canWrite && noticeSheetOpen} onOpenChange={setNoticeSheetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{lease.noticeGiven ? t("detail.editNotice") : t("leaseDialog.registerNotice")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>{t("detail.noticeDate")}</Label><DateInput value={nDate} max={nNewEnd || undefined} onChange={handleNoticeDateChange} /></div>
            <div>
              <Label className="flex items-center gap-1.5">
                {t("leaseDialog.newEndDate")}
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="info">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      {t("leaseDialog.newEndDateTooltip")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <DateInput value={nNewEnd} min={nDate || undefined} onChange={value => { setNNewEnd(value); setNNewEndTouched(true); }} />
              {!nNewEndTouched && <p className="mt-1 text-xs text-muted-foreground">{t("leaseDialog.newEndDateHint")}</p>}
            </div>
            <div><Label>{t("detail.reason")}</Label><Textarea value={nReason} onChange={e => setNReason(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoticeSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSaveNotice}>{t("leaseDialog.saveNotice")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={canWrite && cancelNoticeConfirmOpen} onOpenChange={nextOpen => { if (!cancelNoticeSavingRef.current) setCancelNoticeConfirmOpen(nextOpen); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("lease.cancelNoticeConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("lease.cancelNoticeConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelNoticeSaving}>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={cancelNoticeSaving} onClick={(event) => { event.preventDefault(); void handleCancelNotice(); }}>
              {t("lease.cancelNotice")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move-In Sheet */}
      <Dialog open={canWrite && moveInSheetOpen} onOpenChange={setMoveInSheetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("leaseDialog.moveIn")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            {moveInMode === "schedule" ? (
              <>
                <div><Label>{t("leaseDialog.scheduledDate")}</Label><DateInput value={miScheduled} onChange={setMiScheduled} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-warning" />{t("leaseDialog.electricityMeter")}</Label>
                    <div className="relative mt-1.5">
                      <Input inputMode="decimal" value={miMeter} onChange={e => setMiMeter(e.target.value)} className="h-8 text-sm pr-10" placeholder="—" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-muted-foreground">kWh</span>
                    </div>
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5"><Droplet className="h-3.5 w-3.5 text-primary" />{t("leaseDialog.waterMeter")}</Label>
                    <div className="relative mt-1.5">
                      <Input inputMode="decimal" value={miWaterMeter} onChange={e => setMiWaterMeter(e.target.value)} className="h-8 text-sm pr-8" placeholder="—" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-muted-foreground">m³</span>
                    </div>
                  </div>
                </div>
                <div><Label>{t("leaseDialog.keysHandedOver")}</Label><Input type="number" min={0} value={miKeys} onChange={e => setMiKeys(e.target.value)} /></div>
              </>
            ) : (
              <>
                <div>
                  <Label>{t("leaseDialog.scheduledDate")}</Label>
                  <p className="text-sm text-muted-foreground mt-1">{miScheduled ? formatDate(miScheduled, locale) : "—"}</p>
                </div>
                <div><Label>{t("detail.actual")}</Label><DateInput value={miActualDate} onChange={setMiActualDate} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-warning" />{t("leaseDialog.electricityMeter")}</Label>
                    <div className="relative mt-1.5">
                      <Input inputMode="decimal" value={miMeter} onChange={e => setMiMeter(e.target.value)} className="h-8 text-sm pr-10" placeholder="—" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-muted-foreground">kWh</span>
                    </div>
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5"><Droplet className="h-3.5 w-3.5 text-primary" />{t("leaseDialog.waterMeter")}</Label>
                    <div className="relative mt-1.5">
                      <Input inputMode="decimal" value={miWaterMeter} onChange={e => setMiWaterMeter(e.target.value)} className="h-8 text-sm pr-8" placeholder="—" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-muted-foreground">m³</span>
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
                            <BlurSaveInput className="h-8 text-sm min-w-0 w-full" ariaLabel={t("detail.identifier")} placeholder={t("detail.identifier")} value={k.label} onCommit={value => patchKeyItem(k.id, { label: value })} />
                            <DateInput className="h-8 text-sm min-w-0 w-full" value={k.handedOverDate ?? ""} onChange={value => patchKeyItem(k.id, { handedOverDate: value || null })} />
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeKeyItem(k.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveInSheetOpen(false)}>{t("action.cancel")}</Button>
            {moveInMode === "schedule"
              ? <Button onClick={handleScheduleMoveIn}>{t("action.save")}</Button>
              : <Button onClick={handleConfirmMoveIn} disabled={!miActualDate}>{t("leaseDialog.confirmMoveIn")}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move-Out Sheet */}
      <Dialog open={canWrite && moveOutSheetOpen} onOpenChange={setMoveOutSheetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("leaseDialog.moveOut")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            {moveOutMode === "schedule" ? (
              <>
                <div><Label>{t("leaseDialog.scheduledDate")}</Label><DateInput value={moScheduled} onChange={setMoScheduled} /></div>
                {closureReceivablesWarning(moScheduled, "moveOut")}
                <div><Label>{t("common.notes")}</Label><Textarea value={moNotes} onChange={e => setMoNotes(e.target.value)} rows={2} /></div>
              </>
            ) : (
              <>
                <div>
                  <Label>{t("leaseDialog.scheduledDate")}</Label>
                  <p className="text-sm text-muted-foreground mt-1">{moScheduled ? formatDate(moScheduled, locale) : "—"}</p>
                </div>
                <div><Label>{t("detail.actual")}</Label><DateInput value={moActualDate} onChange={setMoActualDate} /></div>
                {closureReceivablesWarning(moActualDate, "moveOut")}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-warning" />
                      {t("leaseDialog.electricityMeter")}
                    </Label>
                    <div className="relative mt-1.5">
                      <Input inputMode="decimal" value={moMeter} onChange={e => setMoMeter(e.target.value)} className="h-8 text-sm pr-10" placeholder="—" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-muted-foreground">kWh</span>
                    </div>
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <Droplet className="h-3.5 w-3.5 text-primary" />
                      {t("leaseDialog.waterMeter")}
                    </Label>
                    <div className="relative mt-1.5">
                      <Input inputMode="decimal" value={moWaterMeter} onChange={e => setMoWaterMeter(e.target.value)} className="h-8 text-sm pr-8" placeholder="—" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-muted-foreground">m³</span>
                    </div>
                  </div>
                </div>
                {(lease.keys ?? []).filter(k => k.handedOverDate).length > 0 && (
                  <div>
                    <Label>{t("detail.keysBadges")}</Label>
                    <div className="mt-1.5 border rounded-md divide-y">
                      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b bg-muted/40 px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
                        <span className="w-12">{t("detail.kindKey")}</span>
                        <span>{t("detail.identifier")}</span>
                        <span className="w-[150px] text-right pr-2">{t("detail.returned")}</span>
                      </div>
                      {(lease.keys ?? []).filter(k => k.handedOverDate).map(k => (
                        <div key={k.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 py-1.5 text-sm">
                          <span className="text-xs text-muted-foreground w-12">{k.kind === "badge" ? t("detail.kindBadge") : t("detail.kindKey")}</span>
                          <span className="truncate">{k.label || "—"}</span>
                          <DateInput className="h-8 text-sm w-[150px]" value={k.returnedDate ?? ""} onChange={value => patchKeyItem(k.id, { returnedDate: value || null })} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div><Label>{t("common.notes")}</Label><Textarea value={moNotes} onChange={e => setMoNotes(e.target.value)} rows={2} /></div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOutSheetOpen(false)}>{t("action.cancel")}</Button>
            {moveOutMode === "schedule"
              ? <Button onClick={handleScheduleMoveOut}>{t("action.save")}</Button>
              : <Button onClick={handleCompleteMoveOut} disabled={!moActualDate}>{t("leaseDialog.confirmMoveOut")}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Sheet */}
      <Dialog open={canWrite && returnSheetOpen} onOpenChange={setReturnSheetOpen}>
        <DialogContent>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSaveReturn}>{t("action.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override Confirm Dialog */}
      {pendingOverrideValidation && (
        <OverrideConfirmDialog
          open={canWrite && overrideDialogOpen}
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
      <Dialog open={canWrite && endDialogOpen} onOpenChange={setEndDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("lease.endDialog.title")}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">{t("lease.endDialog.description")}</p>
          <div className="space-y-3 mt-3">
            <div><Label>{t("lease.endDialog.endDate")}</Label><DateInput value={endDateInput} onChange={setEndDateInput} max={todayIso} /></div>
            {closureReceivablesWarning(endDateInput)}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndDialogOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={() => void performEndLease()} disabled={!endDateInput || closingLease}>{t("lease.endDialog.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terminate Lease Dialog */}
      <Dialog open={canWrite && termDialogOpen} onOpenChange={setTermDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("lease.terminateDialog.title")}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">{t("lease.terminateDialog.description")}</p>
          <div className="space-y-3 mt-3">
            <div><Label>{t("lease.terminateDialog.endDate")}</Label><DateInput value={termDateInput} onChange={setTermDateInput} max={todayIso} /></div>
            {closureReceivablesWarning(termDateInput)}
            <div>
              <Label>{t("lease.terminateDialog.reason")}</Label>
              <Textarea value={termReasonInput} onChange={e => setTermReasonInput(e.target.value)} rows={2} placeholder={t("lease.terminateDialog.reasonPlaceholder")} />
            </div>
            <div><Label>{t("lease.terminateDialog.notes")}</Label><Textarea value={termNotesInput} onChange={e => setTermNotesInput(e.target.value)} rows={2} /></div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">{t("lease.terminateDialog.freeUnit")}</Label>
              <Switch checked={termFreeUnit} onCheckedChange={setTermFreeUnit} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTermDialogOpen(false)}>{t("action.cancel")}</Button>
            <Button variant="destructive" onClick={() => void performTerminate()} disabled={!termDateInput || !termReasonInput.trim() || closingLease}>{t("lease.terminateDialog.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renew Lease Dialog */}
      <Dialog open={canWrite && renewDialogOpen} onOpenChange={setRenewDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("lease.renewDialog.title")}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">{t("lease.renewDialog.description")}</p>
          <div className="space-y-3 mt-3">
            <div>
              <Label>{t("lease.renewDialog.currentEndDate")}</Label>
              <p className="text-sm font-medium text-foreground">{formatDate(lease.endDate, locale)}</p>
            </div>
            <div><Label>{t("lease.renewDialog.newEndDate")}</Label><DateInput value={renewNewEndDate} onChange={setRenewNewEndDate} min={lease.preNoticeEndDate && lease.preNoticeEndDate > lease.endDate ? lease.preNoticeEndDate : lease.endDate} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewDialogOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleRenewLease} disabled={!renewNewEndDate}>{t("lease.renewDialog.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Signed dialog */}
      <LeaseEditDialog lease={lease} open={canWrite && editDialogOpen} onOpenChange={setEditDialogOpen} />

      {/* Mark Signed dialog */}
      <Dialog open={canWrite && signDialogOpen} onOpenChange={nextOpen => { if (!signSavingRef.current) setSignDialogOpen(nextOpen); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {signDialogMode === "set-signed-date"
                ? t("lease.action.setSignedDate")
                : t("lease.markSigned")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label>{t("leases.signedDate")}</Label>
              <DateInput disabled={signSaving} value={signDateInput} onChange={setSignDateInput} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={signSaving} onClick={() => setSignDialogOpen(false)}>{t("action.cancel")}</Button>
            <Button
              onClick={signDialogMode === "set-signed-date" ? handleSetSignedDate : handleMarkSigned}
              disabled={!signDateInput || signSaving}
            >
              {signDialogMode === "set-signed-date"
                ? t("lease.action.setSignedDate")
                : t("lease.markSigned")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={canWrite && manualSignConfirmOpen} onOpenChange={nextOpen => { if (!signSavingRef.current) setManualSignConfirmOpen(nextOpen); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("lease.manualSignedOverrideTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("lease.manualSignedOverrideDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signSaving}>{t("action.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={signSaving} onClick={(event) => { event.preventDefault(); void performMarkSigned(); }}>{t("action.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payer account Dialog */}
      <Dialog open={canWrite && payerDialogOpen} onOpenChange={setPayerDialogOpen}>
        <DialogContent>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayerDialogOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={savePayerAccount}>{t("action.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
