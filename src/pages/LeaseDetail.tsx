import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ArrowLeft, StickyNote, Clock, Plus, AlertTriangle, Shield, Bell, CheckCircle2, XCircle, Key, Gauge, PackageCheck, Truck, Home } from "lucide-react";
import { getTenantFullName, type PaymentMethod, type GuaranteeType, type Guarantee, type ReturnStatus, type MoveInChecklist, type MoveOutChecklist, getLeaseLifecycleStatus, getMoveInStatus, getMoveOutStatus, GUARANTEE_TYPE_LABELS, MOVE_IN_CHECKLIST_LABELS, MOVE_OUT_CHECKLIST_LABELS, computeGuaranteeStatus } from "@/types";
import { formatDate, formatCurrency } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LeaseDetail() {
  const { id } = useParams<{ id: string }>();
  const { leases, tenants, units, properties, getLedgerByLease, getPaymentsByLease, getLeaseOutstanding, addPayment, getGuaranteeByLease, addGuarantee, updateGuarantee, updateLease, confirmMoveOut } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();

  // Payment form
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formAmount, setFormAmount] = useState("");
  const [formMethod, setFormMethod] = useState<PaymentMethod>("bank-transfer");
  const [formRef, setFormRef] = useState("");
  const [formNotes, setFormNotes] = useState("");

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

  const tenant = tenants.find(t => t.id === lease.primaryTenantId);
  const unit = units.find(u => u.id === lease.unitId);
  const property = properties.find(p => p.id === lease.propertyId);
  const locale = property?.locale ?? "fr-FR";
  const currency = property?.currencyCode ?? "EUR";
  const lifecycle = getLeaseLifecycleStatus(lease);
  const guarantee = getGuaranteeByLease(lease.id);
  const moveInStatus = getMoveInStatus(lease);
  const moveOutStatus = getMoveOutStatus(lease);

  const totalMonthly = lease.monthlyRent + lease.monthlyCharges;
  const ledger = getLedgerByLease(lease.id).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const paymentHistory = getPaymentsByLease(lease.id).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  const { outstanding, overdue } = getLeaseOutstanding(lease.id);
  const totalPaid = ledger.reduce((s, ll) => s + ll.amountPaid, 0);

  const today = new Date().toISOString().split("T")[0];
  const currentMonth = today.slice(0, 7);
  const thisMonthDue = ledger.filter(ll => ll.periodMonth === currentMonth).reduce((s, ll) => s + ll.amountDue, 0);

  const methodLabels: Record<PaymentMethod, string> = {
    "bank-transfer": "Bank Transfer", cash: "Cash", card: "Card", "direct-debit": "Direct Debit", other: "Other",
  };

  const handleAddPayment = () => {
    if (!formAmount) return;
    addPayment({
      leaseId: lease.id, tenantId: lease.primaryTenantId, paymentDate: formDate,
      amount: parseFloat(formAmount), paymentMethod: formMethod, reference: formRef, notes: formNotes,
    });
    setPaymentSheetOpen(false);
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

  const openNoticeForm = () => {
    setNDate(lease.noticeDate ?? ""); setNMoveOut(lease.intendedMoveOutDate ?? ""); setNReason(lease.terminationReason ?? "");
    setNoticeSheetOpen(true);
  };

  const handleSaveNotice = () => {
    updateLease({ ...lease, noticeGiven: true, noticeDate: nDate || null, intendedMoveOutDate: nMoveOut || null, terminationReason: nReason || null });
    toast({ title: "Notice registered" }); setNoticeSheetOpen(false);
  };

  const handleMarkEnded = () => { updateLease({ ...lease, leaseStatus: "ended" }); toast({ title: "Lease marked as ended" }); };
  const handleMarkTerminated = () => { updateLease({ ...lease, leaseStatus: "terminated" }); toast({ title: "Lease marked as terminated" }); };

  // Move-in handlers
  const openMoveInForm = () => {
    setMiScheduled(lease.moveInScheduledDate ?? ""); setMiMeter(lease.moveInMeterReading ?? ""); setMiKeys(String(lease.keyHandoverCount));
    setMoveInSheetOpen(true);
  };
  const handleScheduleMoveIn = () => {
    updateLease({ ...lease, moveInScheduledDate: miScheduled || null, moveInMeterReading: miMeter || null, keyHandoverCount: parseInt(miKeys) || 0 });
    toast({ title: "Move-in scheduled" }); setMoveInSheetOpen(false);
  };
  const handleConfirmMoveIn = () => {
    updateLease({ ...lease, moveInActualDate: today, moveInScheduledDate: lease.moveInScheduledDate || today, moveInMeterReading: miMeter || lease.moveInMeterReading, keyHandoverCount: parseInt(miKeys) || lease.keyHandoverCount,
      moveInChecklist: { leaseSigned: true, firstPaymentReceived: true, guaranteeConfirmed: true, keysHandedOver: true, meterReadingCaptured: true, tenantDocumentsComplete: true } });
    toast({ title: "Move-in confirmed" }); setMoveInSheetOpen(false);
  };

  // Move-out handlers
  const openMoveOutForm = () => {
    setMoScheduled(lease.moveOutScheduledDate ?? lease.intendedMoveOutDate ?? ""); setMoMeter(lease.moveOutMeterReading ?? ""); setMoNotes(lease.moveOutNotes);
    setMoveOutSheetOpen(true);
  };
  const handleScheduleMoveOut = () => {
    updateLease({ ...lease, moveOutScheduledDate: moScheduled || null, moveOutMeterReading: moMeter || null, moveOutNotes: moNotes });
    toast({ title: "Move-out scheduled" }); setMoveOutSheetOpen(false);
  };
  const handleConfirmMoveOut = () => {
    confirmMoveOut({ ...lease, moveOutScheduledDate: lease.moveOutScheduledDate || today, moveOutMeterReading: moMeter || lease.moveOutMeterReading, moveOutNotes: moNotes || lease.moveOutNotes,
      moveOutChecklist: { noticeConfirmed: true, moveOutDateConfirmed: true, keysReturned: true, moveOutMeterReadingCaptured: true, balanceReviewed: true, guaranteeReviewCompleted: true },
      returnStatus: lease.returnStatus || "pending" });
    toast({ title: "Move-out confirmed. Unit set to vacant." }); setMoveOutSheetOpen(false);
  };

  // Checklist toggle
  const toggleMoveInChecklist = (key: keyof MoveInChecklist) => {
    updateLease({ ...lease, moveInChecklist: { ...lease.moveInChecklist, [key]: !lease.moveInChecklist[key] } });
  };
  const toggleMoveOutChecklist = (key: keyof MoveOutChecklist) => {
    updateLease({ ...lease, moveOutChecklist: { ...lease.moveOutChecklist, [key]: !lease.moveOutChecklist[key] } });
  };

  // Return handlers
  const openReturnForm = () => {
    setRetStatus(lease.returnStatus || "pending"); setRetNotes(lease.returnNotes);
    setReturnSheetOpen(true);
  };
  const handleSaveReturn = () => {
    updateLease({ ...lease, returnStatus: retStatus, returnNotes: retNotes });
    toast({ title: "Return status updated" }); setReturnSheetOpen(false);
  };

  // Keys/meters inline update
  const handleUpdateKeys = (keyHandover: number, keyReturn: number) => {
    updateLease({ ...lease, keyHandoverCount: keyHandover, keyReturnCount: keyReturn });
  };

  const enrichedLedger = ledger.map(ll => {
    let effectiveStatus = ll.status;
    if (ll.remainingBalance > 0 && ll.dueDate < today && (ll.status === "due" || ll.status === "partially-paid")) {
      effectiveStatus = "overdue";
    }
    return { ...ll, effectiveStatus };
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
              <StatusBadge status={lease.leaseStatus} />
              {lifecycle !== lease.leaseStatus && <StatusBadge status={lifecycle} />}
            </div>
            <div className="flex gap-2 mt-1 text-sm text-muted-foreground">
              {tenant && <Link to={`/tenants/${tenant.id}`} className="hover:underline text-primary">{getTenantFullName(tenant)}</Link>}
              <span>·</span>
              {unit && <Link to={`/units/${unit.id}`} className="hover:underline text-primary">{unit.unitCode}</Link>}
              <span>·</span>
              {property && <Link to={`/properties/${property.id}`} className="hover:underline text-primary">{property.name}</Link>}
            </div>
          </div>
          <Button onClick={() => setPaymentSheetOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" />Add Payment</Button>
        </div>
      </div>

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
            This lease is <strong>under notice</strong>.
            {lease.noticeDate && <> Notice given on {formatDate(lease.noticeDate, locale)}.</>}
            {lease.intendedMoveOutDate && <> Intended move-out: {formatDate(lease.intendedMoveOutDate, locale)}.</>}
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
            <div><p className="text-xs text-muted-foreground">{t("leases.monthlyRent")}</p><p className="text-lg font-bold text-foreground">{formatCurrency(lease.monthlyRent, currency, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("leases.monthlyCharges")}</p><p className="text-lg font-bold text-foreground">{formatCurrency(lease.monthlyCharges, currency, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("detail.totalMonthly")}</p><p className="text-lg font-bold text-primary">{formatCurrency(totalMonthly, currency, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("leases.deposit")}</p><p className="text-sm font-medium text-foreground">{lease.depositOrGuaranteeAmount != null ? formatCurrency(lease.depositOrGuaranteeAmount, currency, locale) : "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("leases.noticePeriod")}</p><p className="text-sm font-medium text-foreground">{lease.noticePeriodText || "—"}</p></div>
            {lease.signedDate && <div><p className="text-xs text-muted-foreground">{t("leases.signedDate")}</p><p className="text-sm font-medium text-foreground">{formatDate(lease.signedDate, locale)}</p></div>}
          </div>
        </CardContent>
      </Card>

      {/* Financial Summary */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("detail.financialSummary")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-xs text-muted-foreground">{t("detail.thisMonthDue")}</p><p className="text-lg font-bold text-foreground">{formatCurrency(thisMonthDue, currency, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("detail.totalPaid")}</p><p className="text-lg font-bold text-success">{formatCurrency(totalPaid, currency, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("table.outstanding")}</p><p className="text-lg font-bold text-foreground">{formatCurrency(outstanding, currency, locale)}</p></div>
            <div>
              <p className="text-xs text-muted-foreground">{t("table.overdue")}</p>
              <p className={`text-lg font-bold ${overdue > 0 ? "text-destructive" : "text-foreground"}`}>
                {overdue > 0 && <AlertTriangle className="h-4 w-4 inline mr-1" />}
                {formatCurrency(overdue, currency, locale)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deposit / Guarantee Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5"><Shield className="h-4 w-4" />{t("detail.depositGuarantee")}</CardTitle>
            <Button variant="outline" size="sm" onClick={openGuaranteeForm}>{guarantee ? "Edit Guarantee" : "Add Guarantee"}</Button>
          </div>
        </CardHeader>
        <CardContent>
          {guarantee ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><p className="text-xs text-muted-foreground">Type</p><p className="text-sm font-medium text-foreground">{GUARANTEE_TYPE_LABELS[guarantee.type]}</p></div>
              <div><p className="text-xs text-muted-foreground">Status</p><StatusBadge status={guarantee.status} /></div>
              <div><p className="text-xs text-muted-foreground">Expected</p><p className="text-sm font-medium text-foreground">{formatCurrency(guarantee.expectedAmount, currency, locale)}</p></div>
              <div><p className="text-xs text-muted-foreground">Received</p><p className="text-sm font-medium text-foreground">{formatCurrency(guarantee.receivedAmount, currency, locale)}</p></div>
              {guarantee.receivedDate && <div><p className="text-xs text-muted-foreground">Received Date</p><p className="text-sm font-medium text-foreground">{formatDate(guarantee.receivedDate, locale)}</p></div>}
              {guarantee.releaseDate && <div><p className="text-xs text-muted-foreground">Release Date</p><p className="text-sm font-medium text-foreground">{formatDate(guarantee.releaseDate, locale)}</p></div>}
              {guarantee.retentionAmount != null && guarantee.retentionAmount > 0 && (
                <div><p className="text-xs text-muted-foreground">Retention</p><p className="text-sm font-medium text-destructive">{formatCurrency(guarantee.retentionAmount, currency, locale)}</p></div>
              )}
              {guarantee.notes && <div className="col-span-full"><p className="text-xs text-muted-foreground">Notes</p><p className="text-sm text-foreground">{guarantee.notes}</p></div>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No guarantee record. Click "Add Guarantee" to create one.</p>
          )}
        </CardContent>
      </Card>

      {/* Notice / Lease End Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5"><Bell className="h-4 w-4" />{t("detail.noticeLease")}</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={openNoticeForm}>{lease.noticeGiven ? "Edit Notice" : "Register Notice"}</Button>
              {lease.leaseStatus === "active" && (
                <>
                  <Button variant="outline" size="sm" onClick={handleMarkEnded}>Mark Ended</Button>
                  <Button variant="destructive" size="sm" onClick={handleMarkTerminated}>Terminate</Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className="text-xs text-muted-foreground">Lifecycle</p><StatusBadge status={lifecycle} /></div>
            <div><p className="text-xs text-muted-foreground">Notice Given</p><p className="text-sm font-medium text-foreground">{lease.noticeGiven ? "Yes" : "No"}</p></div>
            {lease.noticeDate && <div><p className="text-xs text-muted-foreground">Notice Date</p><p className="text-sm font-medium text-foreground">{formatDate(lease.noticeDate, locale)}</p></div>}
            {lease.intendedMoveOutDate && <div><p className="text-xs text-muted-foreground">Intended Move-Out</p><p className="text-sm font-medium text-foreground">{formatDate(lease.intendedMoveOutDate, locale)}</p></div>}
            {lease.terminationReason && <div><p className="text-xs text-muted-foreground">Reason</p><p className="text-sm text-foreground">{lease.terminationReason}</p></div>}
            <div><p className="text-xs text-muted-foreground">Notice Period</p><p className="text-sm font-medium text-foreground">{lease.noticePeriodText || "—"}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* ==================== OCCUPANCY OPERATIONS ==================== */}
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
                  {moveInStatus !== "completed" && <Button variant="outline" size="sm" onClick={openMoveInForm}>{moveInStatus === "not-scheduled" ? "Schedule" : "Edit"}</Button>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Scheduled</p><p className="text-sm font-medium text-foreground">{lease.moveInScheduledDate ? formatDate(lease.moveInScheduledDate, locale) : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Actual</p><p className="text-sm font-medium text-foreground">{lease.moveInActualDate ? formatDate(lease.moveInActualDate, locale) : "—"}</p></div>
              </div>
              {/* Checklist */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Checklist</p>
                {(Object.keys(lease.moveInChecklist) as (keyof MoveInChecklist)[]).map(key => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{MOVE_IN_CHECKLIST_LABELS[key]}</span>
                    <Switch checked={lease.moveInChecklist[key]} onCheckedChange={() => toggleMoveInChecklist(key)} disabled={moveInStatus === "completed"} />
                  </div>
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
                  {moveOutStatus !== "completed" && <Button variant="outline" size="sm" onClick={openMoveOutForm}>{moveOutStatus === "not-scheduled" ? "Schedule" : "Edit"}</Button>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Scheduled</p><p className="text-sm font-medium text-foreground">{lease.moveOutScheduledDate ? formatDate(lease.moveOutScheduledDate, locale) : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Actual</p><p className="text-sm font-medium text-foreground">{lease.moveOutActualDate ? formatDate(lease.moveOutActualDate, locale) : "—"}</p></div>
              </div>
              {/* Checklist */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Checklist</p>
                {(Object.keys(lease.moveOutChecklist) as (keyof MoveOutChecklist)[]).map(key => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{MOVE_OUT_CHECKLIST_LABELS[key]}</span>
                    <Switch checked={lease.moveOutChecklist[key]} onCheckedChange={() => toggleMoveOutChecklist(key)} disabled={moveOutStatus === "completed"} />
                  </div>
                ))}
              </div>
              {lease.moveOutNotes && <div><p className="text-xs text-muted-foreground">Notes</p><p className="text-sm text-foreground">{lease.moveOutNotes}</p></div>}
            </CardContent>
          </Card>

          {/* Keys & Meters Panel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5"><Key className="h-4 w-4" />{t("detail.keysMeters")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Keys Handed Over</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Input type="number" min={0} className="w-20 h-8 text-sm" value={lease.keyHandoverCount} onChange={e => handleUpdateKeys(parseInt(e.target.value) || 0, lease.keyReturnCount)} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Keys Returned</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Input type="number" min={0} className="w-20 h-8 text-sm" value={lease.keyReturnCount} onChange={e => handleUpdateKeys(lease.keyHandoverCount, parseInt(e.target.value) || 0)} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Move-In Meter</p>
                  <p className="text-sm font-medium text-foreground">{lease.moveInMeterReading || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Move-Out Meter</p>
                  <p className="text-sm font-medium text-foreground">{lease.moveOutMeterReading || "—"}</p>
                </div>
                {lease.moveInMeterReading && lease.moveOutMeterReading && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Consumption</p>
                    <p className="text-sm font-bold text-foreground">{(parseFloat(lease.moveOutMeterReading) - parseFloat(lease.moveInMeterReading)).toLocaleString()} units</p>
                  </div>
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
                  <Button variant="outline" size="sm" onClick={openReturnForm}>
                    {lease.returnStatus ? "Update" : "Set Status"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {lease.returnStatus ? (
                <div className="space-y-2">
                  <div><p className="text-xs text-muted-foreground">Status</p><StatusBadge status={lease.returnStatus} /></div>
                  {lease.returnNotes && <div><p className="text-xs text-muted-foreground">Notes</p><p className="text-sm text-foreground">{lease.returnNotes}</p></div>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No return status set. This is relevant after move-out to track unit readiness.</p>
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
                <div><p className="text-xs text-muted-foreground">Name</p><Link to={`/tenants/${tenant.id}`} className="text-sm font-medium text-primary hover:underline">{getTenantFullName(tenant)}</Link></div>
                <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm text-foreground">{tenant.email}</p></div>
                <div><p className="text-xs text-muted-foreground">Phone</p><p className="text-sm text-foreground">{tenant.phone || "—"}</p></div>
              </div>
            ) : <p className="text-sm text-muted-foreground">Tenant not found.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("detail.unitProperty")}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {unit && <div><p className="text-xs text-muted-foreground">Unit</p><Link to={`/units/${unit.id}`} className="text-sm font-medium text-primary hover:underline">{unit.unitCode} — {unit.unitLabel}</Link></div>}
              {property && (
                <>
                  <div><p className="text-xs text-muted-foreground">Property</p><Link to={`/properties/${property.id}`} className="text-sm font-medium text-primary hover:underline">{property.name}</Link></div>
                  <div><p className="text-xs text-muted-foreground">City</p><p className="text-sm text-foreground">{property.city}</p></div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ledger */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("detail.ledger")}</CardTitle></CardHeader>
        <CardContent>
          {enrichedLedger.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("detail.noLedgerLines")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Due Date</TableHead>
                  <TableHead className="text-xs text-right">Due</TableHead>
                  <TableHead className="text-xs text-right">Paid</TableHead>
                  <TableHead className="text-xs text-right">Balance</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrichedLedger.map(ll => (
                  <TableRow key={ll.id}>
                    <TableCell className="text-xs text-muted-foreground">{ll.periodMonth}</TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">{ll.type}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(ll.dueDate, locale)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatCurrency(ll.amountDue, currency, locale)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(ll.amountPaid, currency, locale)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{ll.remainingBalance > 0 ? formatCurrency(ll.remainingBalance, currency, locale) : "—"}</TableCell>
                    <TableCell><StatusBadge status={ll.effectiveStatus} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("detail.paymentHistory")}</CardTitle></CardHeader>
        <CardContent>
          {paymentHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("detail.noPaymentsRecorded")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs">Method</TableHead>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentHistory.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(p.paymentDate, locale)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatCurrency(p.amount, currency, locale)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{methodLabels[p.paymentMethod]}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.reference || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {lease.notes && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><StickyNote className="h-4 w-4" />{t("common.notes")}</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{lease.notes}</p></CardContent>
        </Card>
      )}

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Created: {formatDate(lease.createdAt, locale)}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Updated: {formatDate(lease.updatedAt, locale)}</span>
      </div>

      {/* ==================== SHEETS ==================== */}

      {/* Add Payment Sheet */}
      <Sheet open={paymentSheetOpen} onOpenChange={setPaymentSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>Add Payment — {lease.leaseReference}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            {tenant && <div><Label>Tenant</Label><p className="text-sm text-foreground mt-1">{getTenantFullName(tenant)}</p></div>}
            <div><Label>Payment Date</Label><Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} /></div>
            <div><Label>Amount ({currency})</Label><Input type="number" step="0.01" min="0" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" /></div>
            <div>
              <Label>Payment Method</Label>
              <Select value={formMethod} onValueChange={v => setFormMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank-transfer">Bank Transfer</SelectItem>
                  <SelectItem value="direct-debit">Direct Debit</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference</Label><Input value={formRef} onChange={e => setFormRef(e.target.value)} /></div>
            <div><Label>Notes</Label><Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={3} /></div>
            <Button onClick={handleAddPayment} disabled={!formAmount} className="w-full">Record Payment</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Guarantee Sheet */}
      <Sheet open={guaranteeSheetOpen} onOpenChange={setGuaranteeSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{guarantee ? "Edit" : "Add"} Guarantee — {lease.leaseReference}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Type</Label>
              <Select value={gType} onValueChange={v => setGType(v as GuaranteeType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash-deposit">Cash Deposit</SelectItem>
                  <SelectItem value="bank-guarantee">Bank Guarantee</SelectItem>
                  <SelectItem value="insurance-guarantee">Insurance Guarantee</SelectItem>
                  <SelectItem value="corporate-guarantee">Corporate Guarantee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Expected ({currency})</Label><Input type="number" step="0.01" min="0" value={gExpected} onChange={e => setGExpected(e.target.value)} /></div>
              <div><Label>Received ({currency})</Label><Input type="number" step="0.01" min="0" value={gReceived} onChange={e => setGReceived(e.target.value)} /></div>
            </div>
            <div><Label>Received Date</Label><Input type="date" value={gReceivedDate} onChange={e => setGReceivedDate(e.target.value)} /></div>
            <div><Label>Release Date</Label><Input type="date" value={gReleaseDate} onChange={e => setGReleaseDate(e.target.value)} /></div>
            <div><Label>Retention ({currency})</Label><Input type="number" step="0.01" min="0" value={gRetention} onChange={e => setGRetention(e.target.value)} placeholder="0.00" /></div>
            <div><Label>Notes</Label><Textarea value={gNotes} onChange={e => setGNotes(e.target.value)} rows={3} /></div>
            <Button onClick={handleSaveGuarantee} className="w-full">{guarantee ? "Update Guarantee" : "Add Guarantee"}</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Notice Sheet */}
      <Sheet open={noticeSheetOpen} onOpenChange={setNoticeSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{lease.noticeGiven ? "Edit" : "Register"} Notice — {lease.leaseReference}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Notice Date</Label><Input type="date" value={nDate} onChange={e => setNDate(e.target.value)} /></div>
            <div><Label>Intended Move-Out Date</Label><Input type="date" value={nMoveOut} onChange={e => setNMoveOut(e.target.value)} /></div>
            <div><Label>Termination Reason</Label><Textarea value={nReason} onChange={e => setNReason(e.target.value)} rows={3} placeholder="e.g. Relocating, end of contract…" /></div>
            <Button onClick={handleSaveNotice} className="w-full">{lease.noticeGiven ? "Update Notice" : "Register Notice"}</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Move-In Sheet */}
      <Sheet open={moveInSheetOpen} onOpenChange={setMoveInSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{moveInStatus === "not-scheduled" ? "Schedule" : "Edit"} Move-In — {lease.leaseReference}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Scheduled Date</Label><Input type="date" value={miScheduled} onChange={e => setMiScheduled(e.target.value)} /></div>
            <div><Label>Meter Reading</Label><Input value={miMeter} onChange={e => setMiMeter(e.target.value)} placeholder="e.g. 12450" /></div>
            <div><Label>Keys to Hand Over</Label><Input type="number" min={0} value={miKeys} onChange={e => setMiKeys(e.target.value)} /></div>
            <div className="flex gap-2">
              <Button onClick={handleScheduleMoveIn} variant="outline" className="flex-1">Save Schedule</Button>
              <Button onClick={handleConfirmMoveIn} className="flex-1">Confirm Move-In</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Move-Out Sheet */}
      <Sheet open={moveOutSheetOpen} onOpenChange={setMoveOutSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{moveOutStatus === "not-scheduled" ? "Schedule" : "Edit"} Move-Out — {lease.leaseReference}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Scheduled Date</Label><Input type="date" value={moScheduled} onChange={e => setMoScheduled(e.target.value)} /></div>
            <div><Label>Move-Out Meter Reading</Label><Input value={moMeter} onChange={e => setMoMeter(e.target.value)} placeholder="e.g. 14800" /></div>
            <div><Label>Notes</Label><Textarea value={moNotes} onChange={e => setMoNotes(e.target.value)} rows={3} /></div>
            <div className="flex gap-2">
              <Button onClick={handleScheduleMoveOut} variant="outline" className="flex-1">Save Schedule</Button>
              <Button onClick={handleConfirmMoveOut} variant="destructive" className="flex-1">Confirm Move-Out</Button>
            </div>
            <p className="text-xs text-muted-foreground">Confirming move-out will set the unit to vacant and the lease to ended.</p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Return Sheet */}
      <Sheet open={returnSheetOpen} onOpenChange={setReturnSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>Return Status — {lease.leaseReference}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Return Status</Label>
              <Select value={retStatus} onValueChange={v => setRetStatus(v as ReturnStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in-review">In Review</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={retNotes} onChange={e => setRetNotes(e.target.value)} rows={3} placeholder="Inspection notes, repair requirements…" /></div>
            <Button onClick={handleSaveReturn} className="w-full">Update Return Status</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
