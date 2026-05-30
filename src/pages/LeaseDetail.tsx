import { useState } from "react";
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
import { ArrowLeft, StickyNote, Clock, Plus, AlertTriangle, Shield, Bell, CheckCircle2, XCircle, Key, Gauge, PackageCheck, Truck, Home, Banknote, ChevronDown, Wallet, MoreVertical, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { computeAdvancePricing, ADVANCE_METHOD_LABELS, ADVANCE_APPLIED_LABELS } from "@/lib/advancePricing";
import { getTenantFullName, type GuaranteeType, type Guarantee, type ReturnStatus, type MoveInChecklist, type MoveOutChecklist, type LeaseEndReason, getLeaseStatus, getMoveInStatus, getMoveOutStatus, GUARANTEE_TYPE_LABELS, MOVE_IN_CHECKLIST_LABELS, MOVE_OUT_CHECKLIST_LABELS, computeGuaranteeStatus } from "@/types";
import { ITEM_TYPE_LABELS, SOURCE_TYPE_LABELS, ALLOCATION_TYPE_LABELS } from "@/types/receivables";
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

export default function LeaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    leases, tenants, units, properties,
    getReceivableItemsByLease, getCashReceiptsByLease, getAllocationsByReceipt,
    getLeaseOutstanding, getGuaranteeByLease, allocations,
    addGuarantee, updateGuarantee, updateLease, updateUnit, deleteLease, confirmMoveOut,
    createCashReceipt, getTenantUnappliedCredit,
  } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverrideValidation, setPendingOverrideValidation] = useState<ValidationResult | null>(null);
  const [pendingOverrideAction, setPendingOverrideAction] = useState<string>("");

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
  const [miKeys, setMiKeys] = useState("");

  // Move-out form
  const [moveOutSheetOpen, setMoveOutSheetOpen] = useState(false);
  const [moScheduled, setMoScheduled] = useState("");
  const [moMeter, setMoMeter] = useState("");
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
  const property = properties.find(p => p.id === lease.propertyId);
  const locale = property?.locale ?? "fr-FR";
  const currency = property?.currencyCode ?? "EUR";
  const lifecycle = getLeaseStatus(lease);
  const guarantee = getGuaranteeByLease(lease.id);
  const moveInStatus = getMoveInStatus(lease);
  const moveOutStatus = getMoveOutStatus(lease);

  const totalMonthly = lease.monthlyRent + lease.monthlyCharges;
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
      toast({ title: "Guarantee updated" });
    } else {
      addGuarantee({ leaseId: lease.id, type: gType, expectedAmount: expected, receivedAmount: received, status, receivedDate: gReceivedDate || null, releaseDate: gReleaseDate || null, retentionAmount: retention, notes: gNotes });
      toast({ title: "Guarantee added" });
    }
    setGuaranteeSheetOpen(false);
  };

  const openNoticeForm = () => { setNDate(lease.noticeDate ?? ""); setNMoveOut(lease.intendedMoveOutDate ?? ""); setNReason(lease.terminationReason ?? ""); setNoticeSheetOpen(true); };
  const handleSaveNotice = () => { updateLease({ ...lease, noticeGiven: true, noticeDate: nDate || null, intendedMoveOutDate: nMoveOut || null, terminationReason: nReason || null }); toast({ title: "Notice registered" }); setNoticeSheetOpen(false); };
  const handleActivateLease = () => {
    const validation = canActivateLease(lease.id, integrityState);
    if (!validation.allowed) {
      toast({ title: "Cannot activate lease", description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
      return;
    }
    updateLease({ ...lease, lifecycleStage: "active" });
    if (validation.warnings.length > 0) {
      toast({ title: "Lease activated with warnings", description: validation.warnings.map(w => w.message).join(". ") });
    } else {
      toast({ title: "Lease activated" });
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

  const openMoveInForm = () => { setMiScheduled(lease.moveInScheduledDate ?? ""); setMiMeter(lease.moveInMeterReading ?? ""); setMiKeys(String(lease.keyHandoverCount)); setMoveInSheetOpen(true); };
  const handleScheduleMoveIn = () => { updateLease({ ...lease, moveInScheduledDate: miScheduled || null, moveInMeterReading: miMeter || null, keyHandoverCount: parseInt(miKeys) || 0 }); toast({ title: "Move-in scheduled" }); setMoveInSheetOpen(false); };
  const handleConfirmMoveIn = () => {
    updateLease({ ...lease, moveInActualDate: today, moveInScheduledDate: lease.moveInScheduledDate || today, moveInMeterReading: miMeter || lease.moveInMeterReading, keyHandoverCount: parseInt(miKeys) || lease.keyHandoverCount,
      moveInChecklist: { leaseSigned: true, firstPaymentReceived: true, guaranteeConfirmed: true, keysHandedOver: true, meterReadingCaptured: true, tenantDocumentsComplete: true } });
    toast({ title: "Move-in confirmed" }); setMoveInSheetOpen(false);
  };

  const openMoveOutForm = () => { setMoScheduled(lease.moveOutScheduledDate ?? lease.intendedMoveOutDate ?? ""); setMoMeter(lease.moveOutMeterReading ?? ""); setMoNotes(lease.moveOutNotes); setMoveOutSheetOpen(true); };
  const handleScheduleMoveOut = () => { updateLease({ ...lease, moveOutScheduledDate: moScheduled || null, moveOutMeterReading: moMeter || null, moveOutNotes: moNotes }); toast({ title: "Move-out scheduled" }); setMoveOutSheetOpen(false); };
  const handleConfirmMoveOut = () => {
    confirmMoveOut({ ...lease, moveOutScheduledDate: lease.moveOutScheduledDate || today, moveOutMeterReading: moMeter || lease.moveOutMeterReading, moveOutNotes: moNotes || lease.moveOutNotes,
      moveOutChecklist: { noticeConfirmed: true, moveOutDateConfirmed: true, keysReturned: true, moveOutMeterReadingCaptured: true, balanceReviewed: true, guaranteeReviewCompleted: true },
      returnStatus: lease.returnStatus || "pending" });
    toast({ title: "Move-out confirmed. Unit set to vacant." }); setMoveOutSheetOpen(false);
  };

  const toggleMoveInChecklist = (key: keyof MoveInChecklist) => { updateLease({ ...lease, moveInChecklist: { ...lease.moveInChecklist, [key]: !lease.moveInChecklist[key] } }); };
  const toggleMoveOutChecklist = (key: keyof MoveOutChecklist) => { updateLease({ ...lease, moveOutChecklist: { ...lease.moveOutChecklist, [key]: !lease.moveOutChecklist[key] } }); };

  const openReturnForm = () => { setRetStatus(lease.returnStatus || "pending"); setRetNotes(lease.returnNotes); setReturnSheetOpen(true); };
  const handleSaveReturn = () => { updateLease({ ...lease, returnStatus: retStatus, returnNotes: retNotes }); toast({ title: "Return status updated" }); setReturnSheetOpen(false); };
  const handleUpdateKeys = (keyHandover: number, keyReturn: number) => { updateLease({ ...lease, keyHandoverCount: keyHandover, keyReturnCount: keyReturn }); };

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
              <StatusBadge status={lease.lifecycleStage} />
              {lifecycle !== lease.lifecycleStage && <StatusBadge status={lifecycle} />}
            </div>
            <div className="flex gap-2 mt-1 text-sm text-muted-foreground">
              {tenant && <Link to={`/tenants/${tenant.id}`} className="hover:underline text-primary">{getTenantFullName(tenant)}</Link>}
              <span>·</span>
              {unit && <Link to={`/units/${unit.id}`} className="hover:underline text-primary">{unit.unitCode}</Link>}
              <span>·</span>
              {property && <Link to={`/properties/${property.id}`} className="hover:underline text-primary">{property.name}</Link>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setReceiptSheetOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" />{t("lease.recordCashReceipt")}</Button>
            {(lease.lifecycleStage === "active" || lease.lifecycleStage === "draft") && (
              <Button variant="outline" size="sm" onClick={openNoticeForm}>
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
                      <CheckCircle2 className="h-4 w-4 mr-2" />Activate Lease
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
                        <Clock className="h-4 w-4 mr-2" />{t("lease.renew")}
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
            Guarantee is <strong>{guarantee.status}</strong>. Expected: {formatCurrency(guarantee.expectedAmount, currency, locale)}, Received: {formatCurrency(guarantee.receivedAmount, currency, locale)}.
          </AlertDescription>
        </Alert>
      )}
      {!guarantee && lease.depositOrGuaranteeAmount && lease.depositOrGuaranteeAmount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No guarantee record found. Expected deposit: {formatCurrency(lease.depositOrGuaranteeAmount, currency, locale)}.
            <Button variant="link" size="sm" className="ml-2 h-auto p-0" onClick={openGuaranteeForm}>Add Guarantee</Button>
          </AlertDescription>
        </Alert>
      )}
      {lease.noticeGiven && (
        <Alert>
          <Bell className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span>
                This lease is <strong>under notice</strong>.
                {lease.noticeDate && <> Notice given on {formatDate(lease.noticeDate, locale)}.</>}
                {lease.intendedMoveOutDate && <> Intended move-out: {formatDate(lease.intendedMoveOutDate, locale)}.</>}
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
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("detail.leaseSummary")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className="text-xs text-muted-foreground">{t("leases.startDate")}</p><p className="text-sm font-medium text-foreground">{formatDate(lease.startDate, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("leases.endDate")}</p><p className="text-sm font-medium text-foreground">{formatDate(lease.endDate, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("leases.dueDay")}</p><p className="text-sm font-medium text-foreground">{lease.dueDayOfMonth}th of each month</p></div>
            <div><p className="text-xs text-muted-foreground">{hasAdvance ? "Base Rent" : t("leases.monthlyRent")}</p><p className={`font-bold text-foreground ${hasAdvance ? "text-sm line-through opacity-60" : "text-lg"}`}>{formatCurrency(lease.monthlyRent, currency, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">{hasAdvance ? "Base Charges" : t("leases.monthlyCharges")}</p><p className={`font-bold text-foreground ${hasAdvance ? "text-sm line-through opacity-60" : "text-lg"}`}>{formatCurrency(lease.monthlyCharges, currency, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">{hasAdvance ? "Base Total" : t("detail.totalMonthly")}</p><p className={`font-bold ${hasAdvance ? "text-sm line-through opacity-60 text-foreground" : "text-lg text-primary"}`}>{formatCurrency(totalMonthly, currency, locale)}</p></div>
            {hasAdvance && (
              <>
                <div><p className="text-xs text-muted-foreground">Effective Rent</p><p className="text-lg font-bold text-foreground">{formatCurrency(advancePricing.effectiveMonthlyRent, currency, locale)}</p></div>
                <div><p className="text-xs text-muted-foreground">Effective Charges</p><p className="text-lg font-bold text-foreground">{formatCurrency(advancePricing.effectiveMonthlyCharges, currency, locale)}</p></div>
                <div><p className="text-xs text-muted-foreground">Effective Total</p><p className="text-lg font-bold text-primary">{formatCurrency(advancePricing.effectiveMonthlyDue, currency, locale)}</p></div>
              </>
            )}
            <div><p className="text-xs text-muted-foreground">{t("leases.deposit")}</p><p className="text-sm font-medium text-foreground">{lease.depositOrGuaranteeAmount != null ? formatCurrency(lease.depositOrGuaranteeAmount, currency, locale) : "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("leases.noticePeriod")}</p><p className="text-sm font-medium text-foreground">{lease.noticePeriodText || "—"}</p></div>
            {lease.signedDate && <div><p className="text-xs text-muted-foreground">{t("leases.signedDate")}</p><p className="text-sm font-medium text-foreground">{formatDate(lease.signedDate, locale)}</p></div>}
            <div><p className="text-xs text-muted-foreground">{t("detail.noticeGiven")}</p><p className="text-sm font-medium text-foreground">{lease.noticeGiven ? t("common.yes") : t("common.no")}</p></div>
            {lease.noticeDate && <div><p className="text-xs text-muted-foreground">{t("detail.noticeDate")}</p><p className="text-sm font-medium text-foreground">{formatDate(lease.noticeDate, locale)}</p></div>}
            {lease.intendedMoveOutDate && <div><p className="text-xs text-muted-foreground">{t("detail.intendedMoveOut")}</p><p className="text-sm font-medium text-foreground">{formatDate(lease.intendedMoveOutDate, locale)}</p></div>}
            {lease.terminationReason && <div><p className="text-xs text-muted-foreground">{t("detail.reason")}</p><p className="text-sm text-foreground">{lease.terminationReason}</p></div>}
          </div>
        </CardContent>
      </Card>

      {/* Financial Summary */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("detail.financialSummary")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-xs text-muted-foreground">Total Allocated</p><p className="text-lg font-bold text-success">{formatCurrency(totalAllocated, currency, locale)}</p></div>
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
                <p className="text-xs text-muted-foreground">Unapplied Credit</p>
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5"><Wallet className="h-4 w-4" />Advance Payment</CardTitle>
              <StatusBadge status={advancePricing.advanceStatus} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-xs text-muted-foreground">Advance Amount</p><p className="text-lg font-bold text-foreground">{formatCurrency(lease.advancePaymentAmount!, currency, locale)}</p></div>
              <div><p className="text-xs text-muted-foreground">Method</p><p className="text-sm font-medium text-foreground">{ADVANCE_METHOD_LABELS[lease.advanceAllocationMethod!]}</p></div>
              <div><p className="text-xs text-muted-foreground">Applied To</p><p className="text-sm font-medium text-foreground">{ADVANCE_APPLIED_LABELS[lease.advanceAppliedTo || 'rent']}</p></div>
              <div><p className="text-xs text-muted-foreground">Reduction / Month</p><p className="text-sm font-medium text-foreground">{formatCurrency(advancePricing.pricingAdjustmentPerMonth, currency, locale)}</p></div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Consumed: {formatCurrency(advancePricing.advanceConsumed, currency, locale)}</span>
                <span>Remaining: {formatCurrency(advancePricing.advanceRemaining, currency, locale)}</span>
              </div>
              <Progress value={lease.advancePaymentAmount! > 0 ? (advancePricing.advanceConsumed / lease.advancePaymentAmount!) * 100 : 0} className="h-2" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div><p className="text-xs text-muted-foreground">Allocation Start</p><p className="font-medium text-foreground">{lease.advanceAllocationStartDate ? formatDate(lease.advanceAllocationStartDate + "-01", locale) : formatDate(lease.startDate, locale)}</p></div>
              {advancePricing.allocationEndDate && <div><p className="text-xs text-muted-foreground">Allocation End</p><p className="font-medium text-foreground">{formatDate(advancePricing.allocationEndDate + "-01", locale)}</p></div>}
              <div><p className="text-xs text-muted-foreground">Duration</p><p className="font-medium text-foreground">{advancePricing.durationMonths} months</p></div>
            </div>

            {/* Collapsible Monthly Schedule */}
            {advancePricing.monthlySchedule.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground hover:text-foreground">
                    Monthly Allocation Schedule
                    <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 [&[data-state=open]]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Month</TableHead>
                          <TableHead className="text-xs text-right">Base Due</TableHead>
                          <TableHead className="text-xs text-right">Adjustment</TableHead>
                          <TableHead className="text-xs text-right">Effective Due</TableHead>
                          <TableHead className="text-xs text-right">Remaining</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {advancePricing.monthlySchedule.map((row) => {
                          const now = new Date();
                          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                          const isCurrent = row.month === currentMonth;
                          const isPaidViaAdvance = row.adjustment >= row.baseDue || row.effectiveDue === 0;
                          const isPast = row.month < currentMonth;
                          return (
                            <TableRow key={row.month} className={isCurrent ? "bg-primary/5 font-medium" : ""}>
                              <TableCell className="text-xs">
                                <span className="flex items-center gap-1.5">
                                  {row.month}{isCurrent && <span className="text-primary text-[10px]">●</span>}
                                  {isPaidViaAdvance && (isPast || isCurrent) && (
                                    <span className="inline-flex items-center rounded-full bg-success/15 text-success px-1.5 py-0.5 text-[10px] font-semibold">Paid</span>
                                  )}
                                  {isPaidViaAdvance && !isPast && !isCurrent && (
                                    <span className="inline-flex items-center rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[10px] font-semibold">Covered</span>
                                  )}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-right">{formatCurrency(row.baseDue, currency, locale)}</TableCell>
                              <TableCell className="text-xs text-right text-success">-{formatCurrency(row.adjustment, currency, locale)}</TableCell>
                              <TableCell className="text-xs text-right font-medium">{formatCurrency(row.effectiveDue, currency, locale)}</TableCell>
                              <TableCell className="text-xs text-right text-muted-foreground">{formatCurrency(row.advanceRemaining, currency, locale)}</TableCell>
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5"><Shield className="h-4 w-4" />{t("detail.depositGuarantee")}</CardTitle>
            <Button variant="outline" size="sm" onClick={openGuaranteeForm}>{guarantee ? t("detail.editGuarantee") : t("detail.addGuarantee")}</Button>
          </div>
        </CardHeader>
        <CardContent>
          {guarantee ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><p className="text-xs text-muted-foreground">{t("units.type")}</p><p className="text-sm font-medium text-foreground">{GUARANTEE_TYPE_LABELS[guarantee.type]}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("filter.status")}</p><StatusBadge status={guarantee.status} /></div>
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
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><Truck className="h-5 w-5" />{t("detail.occupancyOps")}</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Move-In Panel */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5"><Home className="h-4 w-4" />{t("detail.moveIn")}</CardTitle>
                <div className="flex items-center gap-2">
                  <StatusBadge status={moveInStatus === "completed" ? "completed" : moveInStatus === "scheduled" ? "scheduled" : "not-scheduled"} />
                  {moveInStatus !== "completed" && <Button variant="outline" size="sm" onClick={openMoveInForm}>{moveInStatus === "not-scheduled" ? t("detail.schedule") : t("action.edit")}</Button>}
                </div>
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
                      {MOVE_IN_CHECKLIST_LABELS[key]}
                    </span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Move-Out Panel */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5"><PackageCheck className="h-4 w-4" />{t("detail.moveOut")}</CardTitle>
                <div className="flex items-center gap-2">
                  <StatusBadge status={moveOutStatus === "completed" ? "completed" : moveOutStatus === "scheduled" ? "scheduled" : "not-scheduled"} />
                  {moveOutStatus !== "completed" && <Button variant="outline" size="sm" onClick={openMoveOutForm}>{moveOutStatus === "not-scheduled" ? t("detail.schedule") : t("action.edit")}</Button>}
                </div>
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
                      {MOVE_OUT_CHECKLIST_LABELS[key]}
                    </span>
                  </label>
                ))}
              </div>
              {lease.moveOutNotes && <div><p className="text-xs text-muted-foreground">{t("common.notes")}</p><p className="text-sm text-foreground">{lease.moveOutNotes}</p></div>}
            </CardContent>
          </Card>

          {/* Keys & Meters */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><Key className="h-4 w-4" />{t("detail.keysMeters")}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted-foreground">{t("detail.keysHandedOver")}</p><div className="flex items-center gap-2 mt-1"><Input type="number" min={0} className="w-20 h-8 text-sm" value={lease.keyHandoverCount} onChange={e => handleUpdateKeys(parseInt(e.target.value) || 0, lease.keyReturnCount)} /></div></div>
                <div><p className="text-xs text-muted-foreground">{t("detail.keysReturned")}</p><div className="flex items-center gap-2 mt-1"><Input type="number" min={0} className="w-20 h-8 text-sm" value={lease.keyReturnCount} onChange={e => handleUpdateKeys(lease.keyHandoverCount, parseInt(e.target.value) || 0)} /></div></div>
                <div><p className="text-xs text-muted-foreground">{t("detail.moveInMeter")}</p><p className="text-sm font-medium text-foreground">{lease.moveInMeterReading || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("detail.moveOutMeter")}</p><p className="text-sm font-medium text-foreground">{lease.moveOutMeterReading || "—"}</p></div>
                {lease.moveInMeterReading && lease.moveOutMeterReading && (
                  <div className="col-span-2"><p className="text-xs text-muted-foreground">{t("detail.consumption")}</p><p className="text-sm font-bold text-foreground">{(parseFloat(lease.moveOutMeterReading) - parseFloat(lease.moveInMeterReading)).toLocaleString()} units</p></div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Return Panel */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5"><Gauge className="h-4 w-4" />{t("detail.returnStatus")}</CardTitle>
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

      {/* Tenant & Unit */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("leases.tenant")}</CardTitle></CardHeader>
          <CardContent>
            {tenant ? (
              <div className="space-y-2">
                <div><p className="text-xs text-muted-foreground">{t("common.name")}</p><Link to={`/tenants/${tenant.id}`} className="text-sm font-medium text-primary hover:underline">{getTenantFullName(tenant)}</Link></div>
                <div><p className="text-xs text-muted-foreground">{t("tenants.email")}</p><p className="text-sm text-foreground">{tenant.email}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("tenants.phone")}</p><p className="text-sm text-foreground">{tenant.phone || "—"}</p></div>
              </div>
            ) : <p className="text-sm text-muted-foreground">Tenant not found.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("detail.unitProperty")}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {unit && <div><p className="text-xs text-muted-foreground">{t("table.unit")}</p><Link to={`/units/${unit.id}`} className="text-sm font-medium text-primary hover:underline">{unit.unitCode} — {unit.unitLabel}</Link></div>}
              {property && (
                <>
                  <div><p className="text-xs text-muted-foreground">{t("table.property")}</p><Link to={`/properties/${property.id}`} className="text-sm font-medium text-primary hover:underline">{property.name}</Link></div>
                  <div><p className="text-xs text-muted-foreground">{t("properties.city")}</p><p className="text-sm text-foreground">{property.city}</p></div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Receivables */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Open Receivables</CardTitle></CardHeader>
        <CardContent>
          {enrichedReceivables.length === 0 ? (
            <p className="text-sm text-muted-foreground">No receivable items.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Due Date</TableHead>
                  <TableHead className="text-xs text-right">Expected</TableHead>
                  <TableHead className="text-xs text-right">Allocated</TableHead>
                  <TableHead className="text-xs text-right">Outstanding</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrichedReceivables.map(ri => (
                  <TableRow key={ri.id}>
                    <TableCell className="text-xs text-muted-foreground">{ri.periodMonth ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ITEM_TYPE_LABELS[ri.itemType]}</TableCell>
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
      </Card>

      {/* Cash Receipts */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Cash Receipts</CardTitle></CardHeader>
        <CardContent>
          {receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cash receipts recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs text-right">Received</TableHead>
                  <TableHead className="text-xs text-right">Unmatched</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map(cr => (
                  <TableRow key={cr.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(cr.paymentDate, locale)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatCurrency(cr.amountReceived, currency, locale)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{cr.unmatchedAmount > 0 ? formatCurrency(cr.unmatchedAmount, currency, locale) : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{SOURCE_TYPE_LABELS[cr.sourceType]}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{cr.reference || "—"}</TableCell>
                    <TableCell><StatusBadge status={cr.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Allocation History */}
      {(() => {
        const leaseReceivableIds = new Set(receivables.map(r => r.id));
        const leaseAllocations = allocations.filter(a => leaseReceivableIds.has(a.receivableItemId)).sort((a, b) => b.allocationDate.localeCompare(a.allocationDate));
        if (leaseAllocations.length === 0) return null;
        return (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Allocation History</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Receivable</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Method</TableHead>
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
                        <TableCell className="text-xs text-muted-foreground">{ALLOCATION_TYPE_LABELS[al.allocationType]}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })()}
      {lease.notes && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><StickyNote className="h-4 w-4" />{t("common.notes")}</CardTitle></CardHeader>
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
          <DialogHeader><DialogTitle>Record Cash Receipt</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Source Type</Label>
              <Select value={formSourceType} onValueChange={v => setFormSourceType(v as CashReceiptSourceType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SOURCE_TYPE_LABELS) as CashReceiptSourceType[]).map(k => (
                    <SelectItem key={k} value={k}>{SOURCE_TYPE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Payment Date</Label><Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} /></div>
            <div><Label>Amount ({currency})</Label><Input type="number" step="0.01" min="0" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" /></div>
            <div><Label>Reference</Label><Input value={formRef} onChange={e => setFormRef(e.target.value)} /></div>
            <div><Label>Notes</Label><Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} /></div>
            <div className="flex items-center justify-between">
              <Label>Auto-allocate</Label>
              <Switch checked={formAutoAllocate} onCheckedChange={setFormAutoAllocate} />
            </div>
            <Button onClick={handleAddReceipt} disabled={!formAmount} className="w-full">Record Cash Receipt</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Guarantee Sheet */}
      <Dialog open={guaranteeSheetOpen} onOpenChange={setGuaranteeSheetOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{guarantee ? "Edit Guarantee" : "Add Guarantee"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Type</Label>
              <Select value={gType} onValueChange={v => setGType(v as GuaranteeType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(GUARANTEE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Expected Amount</Label><Input type="number" step="0.01" value={gExpected} onChange={e => setGExpected(e.target.value)} /></div>
            <div><Label>Received Amount</Label><Input type="number" step="0.01" value={gReceived} onChange={e => setGReceived(e.target.value)} /></div>
            <div><Label>Received Date</Label><Input type="date" value={gReceivedDate} onChange={e => setGReceivedDate(e.target.value)} /></div>
            <div><Label>Release Date</Label><Input type="date" value={gReleaseDate} onChange={e => setGReleaseDate(e.target.value)} /></div>
            <div><Label>Retention Amount</Label><Input type="number" step="0.01" value={gRetention} onChange={e => setGRetention(e.target.value)} /></div>
            <div><Label>Notes</Label><Textarea value={gNotes} onChange={e => setGNotes(e.target.value)} rows={2} /></div>
            <Button onClick={handleSaveGuarantee} className="w-full">Save Guarantee</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notice Sheet */}
      <Dialog open={noticeSheetOpen} onOpenChange={setNoticeSheetOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Register Notice</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Notice Date</Label><Input type="date" value={nDate} onChange={e => setNDate(e.target.value)} /></div>
            <div><Label>Intended Move-Out</Label><Input type="date" value={nMoveOut} onChange={e => setNMoveOut(e.target.value)} /></div>
            <div><Label>Reason</Label><Textarea value={nReason} onChange={e => setNReason(e.target.value)} rows={2} /></div>
            <Button onClick={handleSaveNotice} className="w-full">Save Notice</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move-In Sheet */}
      <Dialog open={moveInSheetOpen} onOpenChange={setMoveInSheetOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Move-In</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Scheduled Date</Label><Input type="date" value={miScheduled} onChange={e => setMiScheduled(e.target.value)} /></div>
            <div><Label>Meter Reading</Label><Input value={miMeter} onChange={e => setMiMeter(e.target.value)} /></div>
            <div><Label>Keys Handed Over</Label><Input type="number" min={0} value={miKeys} onChange={e => setMiKeys(e.target.value)} /></div>
            <div className="flex gap-2">
              <Button onClick={handleScheduleMoveIn} variant="outline" className="flex-1">Schedule</Button>
              <Button onClick={handleConfirmMoveIn} className="flex-1">Confirm Move-In</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move-Out Sheet */}
      <Dialog open={moveOutSheetOpen} onOpenChange={setMoveOutSheetOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Move-Out</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Scheduled Date</Label><Input type="date" value={moScheduled} onChange={e => setMoScheduled(e.target.value)} /></div>
            <div><Label>Meter Reading</Label><Input value={moMeter} onChange={e => setMoMeter(e.target.value)} /></div>
            <div><Label>Notes</Label><Textarea value={moNotes} onChange={e => setMoNotes(e.target.value)} rows={2} /></div>
            <div className="flex gap-2">
              <Button onClick={handleScheduleMoveOut} variant="outline" className="flex-1">Schedule</Button>
              <Button onClick={handleConfirmMoveOut} className="flex-1">Confirm Move-Out</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return Sheet */}
      <Dialog open={returnSheetOpen} onOpenChange={setReturnSheetOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Return Status</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Status</Label>
              <Select value={retStatus} onValueChange={v => setRetStatus(v as ReturnStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in-review">In Review</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={retNotes} onChange={e => setRetNotes(e.target.value)} rows={2} /></div>
            <Button onClick={handleSaveReturn} className="w-full">Save</Button>
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
