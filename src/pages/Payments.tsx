import { useState } from "react";
import { localTodayISO } from "@/lib/calendarToday";
import { useBusinessNow } from "@/hooks/use-business-now";
import { propertyBusinessDateISO } from "@/lib/businessTimeZone";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  PROPERTY_ICON, RECEIVABLE_STATUS_ICONS, RECEIVABLE_TYPE_ICONS, RECEIPT_STATUS_ICONS,
} from "@/lib/filterIcons";
import { CircleDot, Tag } from "lucide-react";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { DateInput } from "@/components/shared/DateInput";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { getTenantFullName } from "@/types";
import { computeReceivableStatus, getItemTypeLabel, getSourceTypeLabel, getAllocationTypeLabel, isReceiptAllocatable } from "@/types/receivables";
import type { CashReceiptSourceType, ReceivableItemType } from "@/types/receivables";
import { Plus, AlertTriangle, CheckCircle2, Clock, Search, ArrowRightLeft, Banknote, CircleDollarSign } from "lucide-react";
import { Link } from "react-router-dom";
import { useSettings } from "@/context/SettingsContext";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";
import { QuickPayReceivableDialog } from "@/components/payments/QuickPayReceivableDialog";
import { useToast } from "@/hooks/use-toast";
import { positiveNumber } from "@/lib/validation";
import { receiptCurrencyChoices } from "@/lib/currencies";
import { isReceivableAllocatable, leaseIncludesTenant, receiptMatchesReceivable } from "@/lib/reconciliation";
import { reviewManualAllocationDraft } from "@/lib/manualAllocationDraft";
import { reviewScheduledReceivableDuplicates } from "@/lib/receivableDuplicates";
import { getLeaseBillingSlotKey } from "@/lib/leaseReceivables";
import { usePortfolio } from "@/context/PortfolioContext";
import { usePortfolioWriteAccess } from "@/hooks/use-portfolio-write-access";
import { deleteDuplicateLeaseReceivables } from "@/lib/repo";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Payments() {
  const { t } = useSettings();
  const { toast } = useToast();
  const { currentPortfolio } = usePortfolio();
  const canWrite = usePortfolioWriteAccess();
  const {
    retryLoad,
    receivableItems, cashReceipts, allocations,
    leases, tenants, properties, units,
    createCashReceiptPersisted, allocateCashReceipt, autoAllocateCashReceipt,
    getReceivableItemsByLease, getReceivableItemsByTenant,
  } = useAppData();

  const [receivableStatusFilter, setReceivableStatusFilter] = useState<string[]>([]);
  const [receiptStatusFilter, setReceiptStatusFilter] = useState<string[]>([]);
  const [propertyFilter, setPropertyFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [addReceiptOpen, setAddReceiptOpen] = useState(false);
  const [allocateReceiptId, setAllocateReceiptId] = useState<string | null>(null);
  const [quickPayRiId, setQuickPayRiId] = useState<string | null>(null);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateCleanupBusy, setDuplicateCleanupBusy] = useState(false);
  const duplicateReview = reviewScheduledReceivableDuplicates(receivableItems, allocations);
  const canCleanDuplicates = currentPortfolio?.role === "owner" || currentPortfolio?.role === "admin";

  const cleanDuplicateReceivables = async () => {
    if (!canCleanDuplicates || duplicateCleanupBusy || !currentPortfolio) return;
    const items = reviewScheduledReceivableDuplicates(receivableItems, allocations).removable;
    if (items.length === 0) return;
    setDuplicateCleanupBusy(true);
    try {
      const deleted = await deleteDuplicateLeaseReceivables(currentPortfolio.id, items);
      toast({ title: t("payments.duplicates.cleaned"), description: `${deleted} ${t("payments.duplicates.rows")}` });
      setDuplicateDialogOpen(false);
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      retryLoad();
      setDuplicateCleanupBusy(false);
    }
  };

  // Add receipt form
  const [formSourceType, setFormSourceType] = useState<CashReceiptSourceType>("bank-transfer");
  const [formDate, setFormDate] = useState(localTodayISO());
  const [formAmount, setFormAmount] = useState("");
  const [formCurrencyCode, setFormCurrencyCode] = useState("");
  const [formCurrencyError, setFormCurrencyError] = useState(false);
  const [formTenantId, setFormTenantId] = useState("");
  const [formLeaseId, setFormLeaseId] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formRemittance, setFormRemittance] = useState("");
  const [formPayerName, setFormPayerName] = useState("");
  const [formPayerIban, setFormPayerIban] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formAutoAllocate, setFormAutoAllocate] = useState(true);

  // Manual allocation form
  const [allocAmounts, setAllocAmounts] = useState<Record<string, string>>({});
  const [allocationSaving, setAllocationSaving] = useState(false);

  const businessNow = useBusinessNow();

  type RvSortKey = "dueDate" | "tenant" | "lease" | "property" | "type" | "label" | "expected" | "allocated" | "outstanding" | "status";
  const { sort: rvSort, toggle: rvToggle } = useTableSort<RvSortKey>("dueDate", "desc");

  type CrSortKey = "date" | "payer" | "tenant" | "lease" | "received" | "unmatched" | "source" | "reference" | "status";
  const { sort: crSort, toggle: crToggle } = useTableSort<CrSortKey>("date", "desc");

  type AlSortKey = "date" | "receiptRef" | "receivable" | "type" | "tenant" | "amount" | "method";
  const { sort: alSort, toggle: alToggle } = useTableSort<AlSortKey>("date", "desc");

  // KPIs

  // Enriched receivables
  const enrichedReceivables = receivableItems.map(ri => {
    const lease = ri.leaseId ? leases.find(l => l.id === ri.leaseId) : undefined;
    const tenant = ri.tenantId ? tenants.find(tn => tn.id === ri.tenantId) : undefined;
    const prop = ri.propertyId ? properties.find(p => p.id === ri.propertyId) : undefined;
    const unit = ri.unitId ? units.find(u => u.id === ri.unitId) : undefined;
    const effectiveStatus = computeReceivableStatus(ri, propertyBusinessDateISO(prop, businessNow));
    return { ...ri, lease, tenant, prop, unit, effectiveStatus };
  });

  const filteredReceivables = enrichedReceivables.filter(ri => {
    if (receivableStatusFilter.length > 0 && !receivableStatusFilter.includes(ri.effectiveStatus)) return false;
    if (propertyFilter.length > 0 && (!ri.prop?.id || !propertyFilter.includes(ri.prop.id))) return false;
    if (typeFilter.length > 0 && !typeFilter.includes(ri.itemType)) return false;
    if (overdueOnly && ri.effectiveStatus !== "overdue") return false;
    if (search) {
      const q = search.toLowerCase();
      const tenantName = ri.tenant ? getTenantFullName(ri.tenant).toLowerCase() : "";
      const leaseRef = ri.lease?.leaseReference.toLowerCase() ?? "";
      if (!tenantName.includes(q) && !leaseRef.includes(q) && !ri.label.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => b.dueDate.localeCompare(a.dueDate));

  const sortedReceivables = sortRows(filteredReceivables, rvSort, (ri, key) => {
    switch (key) {
      case "dueDate": return ri.dueDate;
      case "tenant": return ri.tenant ? getTenantFullName(ri.tenant) : "";
      case "lease": return ri.lease?.leaseReference ?? "";
      case "property": return ri.prop?.name ?? "";
      case "type": return ri.itemType;
      case "label": return ri.label;
      case "expected": return ri.expectedAmount;
      case "allocated": return ri.allocatedAmount;
      case "outstanding": return ri.outstandingAmount;
      case "status": return ri.effectiveStatus;
    }
  });

  // Enriched receipts
  const enrichedReceipts = cashReceipts.map(cr => {
    const lease = cr.leaseId ? leases.find(l => l.id === cr.leaseId) : undefined;
    const tenant = cr.tenantId ? tenants.find(tn => tn.id === cr.tenantId) : undefined;
    const prop = cr.propertyId ? properties.find(p => p.id === cr.propertyId) : undefined;
    return { ...cr, lease, tenant, prop };
  }).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

  const filteredReceipts = enrichedReceipts.filter(cr => {
    if (receiptStatusFilter.length > 0 && !receiptStatusFilter.includes(cr.status)) return false;
    if (propertyFilter.length > 0 && (!cr.prop?.id || !propertyFilter.includes(cr.prop.id))) return false;
    if (unmatchedOnly && cr.unmatchedAmount <= 0) return false;
    if (search) {
      const q = search.toLowerCase();
      const tenantName = cr.tenant ? getTenantFullName(cr.tenant).toLowerCase() : "";
      const payerName = cr.payerName?.toLowerCase() ?? "";
      const ref = cr.reference?.toLowerCase() ?? "";
      if (!tenantName.includes(q) && !payerName.includes(q) && !ref.includes(q)) return false;
    }
    return true;
  });

  const sortedReceipts = sortRows(filteredReceipts, crSort, (cr, key) => {
    switch (key) {
      case "date": return cr.paymentDate;
      case "payer": return cr.payerName ?? "";
      case "tenant": return cr.tenant ? getTenantFullName(cr.tenant) : "";
      case "lease": return cr.lease?.leaseReference ?? "";
      case "received": return cr.amountReceived;
      case "unmatched": return cr.unmatchedAmount;
      case "source": return cr.sourceType;
      case "reference": return cr.reference ?? "";
      case "status": return cr.status;
    }
  });

  // Enriched allocations
  const enrichedAllocations = allocations.map(al => {
    const receipt = cashReceipts.find(cr => cr.id === al.cashReceiptId);
    const ri = receivableItems.find(r => r.id === al.receivableItemId);
    const tenant = ri?.tenantId ? tenants.find(tn => tn.id === ri.tenantId) : undefined;
    return { ...al, receipt, ri, tenant };
  });

  const sortedAllocations = sortRows(enrichedAllocations, alSort, (al, key) => {
    switch (key) {
      case "date": return al.allocationDate;
      case "receiptRef": return al.receipt?.reference ?? al.cashReceiptId;
      case "receivable": return al.ri?.label ?? "";
      case "type": return al.ri?.itemType ?? "";
      case "tenant": return al.tenant ? getTenantFullName(al.tenant) : "";
      case "amount": return al.allocatedAmount;
      case "method": return al.allocationType;
    }
  });

  const rvPg = usePagination(sortedReceivables);
  const crPg = usePagination(sortedReceipts);
  const alPg = usePagination(sortedAllocations);

  const selectedLease = formLeaseId ? leases.find(l => l.id === formLeaseId) : undefined;
  const selectedProp = selectedLease ? properties.find(p => p.id === selectedLease.propertyId) : undefined;
  const { options: currencyOptions, defaultCurrency } = receiptCurrencyChoices(properties);
  const receiptCurrency = formCurrencyCode || selectedProp?.currencyCode || defaultCurrency;

  const handleAddReceipt = async () => {
    if (!canWrite) return;
    if (!positiveNumber(formAmount)) {
      toast({ title: t("common.validationError"), description: "Receipt amount must be greater than zero.", variant: "destructive" });
      return;
    }
    if (!receiptCurrency) {
      setFormCurrencyError(true);
      toast({ title: t("common.validationError"), description: t("payments.dialog.currencyRequired"), variant: "destructive" });
      return;
    }
    const amt = parseFloat(formAmount);
    const propId = selectedLease ? selectedLease.propertyId : null;
    const unitId = selectedLease ? selectedLease.unitId : null;
    try {
      await createCashReceiptPersisted({
      tenantId: formTenantId || null,
      leaseId: formLeaseId || null,
      propertyId: propId,
      unitId,
      sourceType: formSourceType,
      paymentDate: formDate,
      bookingDate: null,
      valueDate: null,
      amountReceived: amt,
      currencyCode: receiptCurrency,
      payerName: formPayerName || null,
      payerIban: formPayerIban || null,
      payerBic: null,
      reference: formReference || null,
      remittanceInformation: formRemittance || null,
      endToEndReference: null,
      status: "unmatched",
      unmatchedAmount: amt,
      notes: formNotes,
      importBatchId: null,
      rawBankTransactionId: null,
      }, formAutoAllocate);
    } catch (err) {
      toast({
        title: t("common.validationError"),
        description: err instanceof Error ? err.message : "Cash receipt could not be saved.",
        variant: "destructive",
      });
      return;
    }
    setAddReceiptOpen(false);
    setFormAmount(""); setFormCurrencyCode(""); setFormCurrencyError(false); setFormReference(""); setFormNotes(""); setFormPayerName(""); setFormPayerIban(""); setFormRemittance("");
    setFormTenantId(""); setFormLeaseId("");
  };

  // Manual allocation
  const allocReceipt = allocateReceiptId ? cashReceipts.find(r => r.id === allocateReceiptId) : null;
  const allocOpenItems = allocReceipt ? receivableItems.filter(ri => {
    if (!isReceivableAllocatable(ri)) return false;
    return receiptMatchesReceivable(allocReceipt, ri);
  }) : [];
  const allocationDraft = reviewManualAllocationDraft(allocAmounts, allocOpenItems);

  const handleManualAllocate = async () => {
    if (!canWrite) return;
    if (!allocateReceiptId || allocationSaving) return;
    if (allocationDraft.issues.size > 0) {
      toast({ title: t("common.validationError"), description: t("payments.dialog.invalidAmount"), variant: "destructive" });
      return;
    }
    const manualAllocs = allocationDraft.allocations;
    if (manualAllocs.length === 0) return;
    if (allocReceipt && allocationDraft.total > allocReceipt.unmatchedAmount) {
      toast({ title: t("common.validationError"), description: "Allocation total cannot exceed the receipt unmatched amount.", variant: "destructive" });
      return;
    }
    const invalidLine = manualAllocs.find(a => {
      const ri = allocOpenItems.find(item => item.id === a.receivableItemId);
      return !ri || a.amount > ri.outstandingAmount || a.amount <= 0 || ri.currencyCode !== allocReceipt?.currencyCode;
    });
    if (invalidLine) {
      toast({ title: t("common.validationError"), description: "Each allocation must match the receipt currency and stay within the receivable outstanding amount.", variant: "destructive" });
      return;
    }
    setAllocationSaving(true);
    try {
      await allocateCashReceipt(allocateReceiptId, manualAllocs);
      setAllocateReceiptId(null);
      setAllocAmounts({});
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setAllocationSaving(false);
    }
  };

  const handleAutoAllocate = async () => {
    if (!canWrite) return;
    if (!allocateReceiptId || allocationSaving) return;
    setAllocationSaving(true);
    try {
      await autoAllocateCashReceipt(allocateReceiptId);
      setAllocateReceiptId(null);
      setAllocAmounts({});
    } catch (error) {
      toast({ title: t("settings.saveFailed"), description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setAllocationSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">{t("payments.pageTitle")}</h1>
          <p className="page-description">{t("payments.pageSubtitle")}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative flex min-w-0 flex-1 sm:inline-flex sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("action.search")} value={search} onChange={e => setSearch(e.target.value)} className="h-9 min-w-[180px] max-w-[400px] pl-9 sm:w-auto" />
          </div>
          {canWrite && <Button onClick={() => setAddReceiptOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" />{t("payments.recordCashReceipt")}</Button>}
        </div>
      </div>

      <Tabs defaultValue="receivables">
        <TabsList>
          <TabsTrigger value="receivables">{t("payments.tab.receivables")} ({filteredReceivables.length})</TabsTrigger>
          <TabsTrigger value="receipts">{t("payments.tab.cashReceipts")} ({filteredReceipts.length})</TabsTrigger>
          <TabsTrigger value="allocations">{t("payments.tab.allocations")} ({enrichedAllocations.length})</TabsTrigger>
        </TabsList>

        {/* ===== TAB 1: RECEIVABLES ===== */}
        <TabsContent value="receivables">
          <div className="flex flex-wrap gap-2 mb-3">
            <MultiSelectFilter
              label={t("payments.filter.property")}
              icon={PROPERTY_ICON}
              values={propertyFilter}
              onChange={setPropertyFilter}
              options={properties.map(p => ({ value: p.id, label: p.name, icon: PROPERTY_ICON }))}
            />
            <MultiSelectFilter
              label={t("payments.filter.status")}
              icon={CircleDot}
              values={receivableStatusFilter}
              onChange={setReceivableStatusFilter}
              options={[
                { value: "open", label: t("payments.filter.open"), icon: RECEIVABLE_STATUS_ICONS.open },
                { value: "paid", label: t("payments.filter.paid"), icon: RECEIVABLE_STATUS_ICONS.paid },
                { value: "partially-paid", label: t("payments.filter.partiallyPaid"), icon: RECEIVABLE_STATUS_ICONS["partially-paid"] },
                { value: "overdue", label: t("payments.filter.overdue"), icon: RECEIVABLE_STATUS_ICONS.overdue },
              ]}
            />
            <MultiSelectFilter
              label={t("payments.filter.type")}
              icon={Tag}
              values={typeFilter}
              onChange={setTypeFilter}
              options={(["rent","charges","deposit","guarantee","advance-payment","adjustment","late-fee","repair-recharge","credit-note","other"] as ReceivableItemType[]).map(k => ({
                value: k, label: getItemTypeLabel(t, k), icon: RECEIVABLE_TYPE_ICONS[k],
              }))}
            />
            <Button variant={overdueOnly ? "default" : "outline"} size="sm" className="h-9 font-normal" onClick={() => setOverdueOnly(!overdueOnly)}>
              <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground mr-1.5" />{t("payments.filter.overdueOnly")}
            </Button>
            {canCleanDuplicates && (duplicateReview.removable.length > 0 || duplicateReview.ambiguousGroups.length > 0) && (
              <Button variant="outline" size="sm" className="h-9" onClick={() => setDuplicateDialogOpen(true)}>
                <AlertTriangle className="mr-1.5 h-4 w-4" />
                {t("payments.duplicates.review")} ({duplicateReview.removable.length || duplicateReview.ambiguousGroups.length})
              </Button>
            )}
          </div>
          {filteredReceivables.length === 0 ? (
            <EmptyState icon={Search} title={t("payments.empty.receivables")} description={t("payments.empty.receivablesDesc")} />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortKey="dueDate" sort={rvSort} onSort={rvToggle}>{t("payments.table.dueDate")}</SortableTableHead>
                    <SortableTableHead sortKey="tenant" sort={rvSort} onSort={rvToggle}>{t("payments.table.tenant")}</SortableTableHead>
                    <SortableTableHead sortKey="lease" sort={rvSort} onSort={rvToggle}>{t("payments.table.lease")}</SortableTableHead>
                    <SortableTableHead sortKey="property" sort={rvSort} onSort={rvToggle}>{t("payments.table.property")}</SortableTableHead>
                    <SortableTableHead sortKey="type" sort={rvSort} onSort={rvToggle}>{t("payments.table.type")}</SortableTableHead>
                    <SortableTableHead sortKey="label" sort={rvSort} onSort={rvToggle}>{t("payments.table.label")}</SortableTableHead>
                    <SortableTableHead sortKey="expected" sort={rvSort} onSort={rvToggle} align="right">{t("payments.table.expected")}</SortableTableHead>
                    <SortableTableHead sortKey="allocated" sort={rvSort} onSort={rvToggle} align="right">{t("payments.table.allocated")}</SortableTableHead>
                    <SortableTableHead sortKey="outstanding" sort={rvSort} onSort={rvToggle} align="right">{t("payments.table.outstanding")}</SortableTableHead>
                    <SortableTableHead sortKey="status" sort={rvSort} onSort={rvToggle}>{t("payments.table.status")}</SortableTableHead>
                    {canWrite && <TableHead className="text-right">{t("table.action")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rvPg.pageItems.map(ri => (
                    <TableRow key={ri.id}>
                      <TableCell className="text-muted-foreground">{formatDate(ri.dueDate, ri.prop?.locale)}</TableCell>
                      <TableCell className="text-muted-foreground">{ri.tenant ? <a href={`/tenants/${ri.tenant.id}`} className="hover:underline">{getTenantFullName(ri.tenant)}</a> : "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{ri.lease ? <a href={`/leases/${ri.lease.id}`} className="hover:underline">{ri.lease.leaseReference}</a> : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{ri.prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{getItemTypeLabel(t, ri.itemType)}</TableCell>
                      <TableCell className="text-muted-foreground">{ri.label}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCurrency(ri.expectedAmount, ri.currencyCode, ri.prop?.locale)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCurrency(ri.allocatedAmount, ri.currencyCode, ri.prop?.locale)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{ri.outstandingAmount > 0 ? formatCurrency(ri.outstandingAmount, ri.currencyCode, ri.prop?.locale) : "—"}</TableCell>
                      <TableCell><StatusBadge status={ri.effectiveStatus} /></TableCell>
                      {canWrite && <TableCell className="text-right">
                        {ri.outstandingAmount > 0 && ri.status !== "cancelled" && ri.status !== "disputed" && ri.status !== "written-off" ? (
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setQuickPayRiId(ri.id)}>
                            <CircleDollarSign className="h-3 w-3" />{t("payments.action.markPaid")}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={rvPg.page} pageSize={rvPg.pageSize} total={rvPg.total} totalPages={rvPg.totalPages} from={rvPg.from} to={rvPg.to} onPageChange={rvPg.setPage} onPageSizeChange={rvPg.setPageSize} />
            </Card>
          )}
        </TabsContent>

        {/* ===== TAB 2: CASH RECEIPTS ===== */}
        <TabsContent value="receipts">
          <div className="flex flex-wrap gap-2 mb-3">
            <MultiSelectFilter
              label={t("payments.filter.property")}
              icon={PROPERTY_ICON}
              values={propertyFilter}
              onChange={setPropertyFilter}
              options={properties.map(p => ({ value: p.id, label: p.name, icon: PROPERTY_ICON }))}
            />
            <MultiSelectFilter
              label={t("payments.filter.status")}
              icon={CircleDot}
              values={receiptStatusFilter}
              onChange={setReceiptStatusFilter}
              options={[
                { value: "matched", label: t("payments.filter.matched"), icon: RECEIPT_STATUS_ICONS.matched },
                { value: "partially-matched", label: t("payments.filter.partiallyMatched"), icon: RECEIPT_STATUS_ICONS["partially-matched"] },
                { value: "unmatched", label: t("payments.filter.unmatched"), icon: RECEIPT_STATUS_ICONS.unmatched },
                { value: "exception", label: t("payments.filter.exception"), icon: RECEIPT_STATUS_ICONS.exception },
              ]}
            />
            <Button variant={unmatchedOnly ? "default" : "outline"} size="sm" className="h-9 font-normal" onClick={() => setUnmatchedOnly(!unmatchedOnly)}>
              <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground mr-1.5" />{t("payments.filter.unmatchedOnly")}
            </Button>
          </div>
          {filteredReceipts.length === 0 ? (
            <EmptyState icon={Banknote} title={t("payments.empty.cashReceipts")} description={t("payments.empty.cashReceiptsDesc")} />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortKey="date" sort={crSort} onSort={crToggle}>{t("payments.table.date")}</SortableTableHead>
                    <SortableTableHead sortKey="payer" sort={crSort} onSort={crToggle}>{t("payments.table.payer")}</SortableTableHead>
                    <SortableTableHead sortKey="tenant" sort={crSort} onSort={crToggle}>{t("payments.table.tenant")}</SortableTableHead>
                    <SortableTableHead sortKey="lease" sort={crSort} onSort={crToggle}>{t("payments.table.lease")}</SortableTableHead>
                    <SortableTableHead sortKey="received" sort={crSort} onSort={crToggle} align="right">{t("payments.table.received")}</SortableTableHead>
                    <SortableTableHead sortKey="unmatched" sort={crSort} onSort={crToggle} align="right">{t("payments.table.unmatched")}</SortableTableHead>
                    <SortableTableHead sortKey="source" sort={crSort} onSort={crToggle}>{t("payments.table.source")}</SortableTableHead>
                    <SortableTableHead sortKey="reference" sort={crSort} onSort={crToggle}>{t("payments.table.reference")}</SortableTableHead>
                    <SortableTableHead sortKey="status" sort={crSort} onSort={crToggle}>{t("payments.table.status")}</SortableTableHead>
                    {canWrite && <TableHead className="text-right">{t("table.action")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crPg.pageItems.map(cr => (
                    <TableRow key={cr.id}>
                      <TableCell className="text-muted-foreground">{formatDate(cr.paymentDate, cr.prop?.locale)}</TableCell>
                      <TableCell className="text-muted-foreground">{cr.payerName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{cr.tenant ? <a href={`/tenants/${cr.tenant.id}`} className="hover:underline">{getTenantFullName(cr.tenant)}</a> : "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{cr.lease ? <a href={`/leases/${cr.lease.id}`} className="hover:underline">{cr.lease.leaseReference}</a> : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCurrency(cr.amountReceived, cr.currencyCode, cr.prop?.locale)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{cr.unmatchedAmount > 0 ? formatCurrency(cr.unmatchedAmount, cr.currencyCode, cr.prop?.locale) : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{getSourceTypeLabel(t, cr.sourceType)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{cr.reference ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={cr.status} /></TableCell>
                      {canWrite && <TableCell>
                        {isReceiptAllocatable(cr) ? (
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setAllocateReceiptId(cr.id); setAllocAmounts({}); }}>
                            <ArrowRightLeft className="h-3 w-3" />{t("payments.action.allocate")}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={crPg.page} pageSize={crPg.pageSize} total={crPg.total} totalPages={crPg.totalPages} from={crPg.from} to={crPg.to} onPageChange={crPg.setPage} onPageSizeChange={crPg.setPageSize} />
            </Card>
          )}
        </TabsContent>

        {/* ===== TAB 3: ALLOCATIONS ===== */}
        <TabsContent value="allocations">
          {enrichedAllocations.length === 0 ? (
            <EmptyState icon={ArrowRightLeft} title={t("payments.empty.allocations")} description={t("payments.empty.allocationsDesc")} />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortKey="date" sort={alSort} onSort={alToggle}>{t("payments.table.date")}</SortableTableHead>
                    <SortableTableHead sortKey="receiptRef" sort={alSort} onSort={alToggle}>{t("payments.table.receiptRef")}</SortableTableHead>
                    <SortableTableHead sortKey="receivable" sort={alSort} onSort={alToggle}>{t("payments.table.receivable")}</SortableTableHead>
                    <SortableTableHead sortKey="type" sort={alSort} onSort={alToggle}>{t("payments.table.type")}</SortableTableHead>
                    <SortableTableHead sortKey="tenant" sort={alSort} onSort={alToggle}>{t("payments.table.tenant")}</SortableTableHead>
                    <SortableTableHead sortKey="amount" sort={alSort} onSort={alToggle} align="right">{t("payments.table.amount")}</SortableTableHead>
                    <SortableTableHead sortKey="method" sort={alSort} onSort={alToggle}>{t("payments.table.method")}</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alPg.pageItems.map(al => (
                    <TableRow key={al.id}>
                      <TableCell className="text-muted-foreground">{formatDate(al.allocationDate)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{al.receipt?.reference ?? al.cashReceiptId}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {al.ri ? (
                          (() => {
                            const href = al.ri.leaseId
                              ? `/leases/${al.ri.leaseId}`
                              : al.ri.unitId
                              ? `/units/${al.ri.unitId}`
                              : al.ri.tenantId
                              ? `/tenants/${al.ri.tenantId}`
                              : null;
                            return href ? (
                              <a href={href} className="hover:underline text-foreground">{al.ri.label}</a>
                            ) : (
                              <span className="text-muted-foreground">{al.ri.label}</span>
                            );
                          })()
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{al.ri ? getItemTypeLabel(t, al.ri.itemType) : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{al.tenant ? <a href={`/tenants/${al.tenant.id}`} className="hover:underline text-foreground">{getTenantFullName(al.tenant)}</a> : "—"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCurrency(al.allocatedAmount, al.ri?.currencyCode ?? al.receipt?.currencyCode)}</TableCell>
                      <TableCell className="text-muted-foreground">{getAllocationTypeLabel(t, al.allocationType)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={alPg.page} pageSize={alPg.pageSize} total={alPg.total} totalPages={alPg.totalPages} from={alPg.from} to={alPg.to} onPageChange={alPg.setPage} onPageSizeChange={alPg.setPageSize} />
            </Card>
          )}
        </TabsContent>
      </Tabs>
      <AlertDialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{duplicateReview.removable.length > 0 ? t("payments.duplicates.title") : t("payments.duplicates.review")}</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateReview.removable.length > 0
                ? `${duplicateReview.removable.length} ${t("payments.duplicates.description")}`
                : t("payments.duplicates.reviewOnly")}
              {duplicateReview.ambiguousGroups.length > 0 && ` ${duplicateReview.ambiguousGroups.length} ${t("payments.duplicates.ambiguous")}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {duplicateReview.ambiguousGroups.length > 0 && (
            <ul className="max-h-64 space-y-3 overflow-y-auto text-sm text-muted-foreground">
              {duplicateReview.ambiguousGroups.map(group => {
                const first = group[0];
                const reference = leases.find(lease => lease.id === first.leaseId)?.leaseReference ?? first.leaseId;
                return <li key={getLeaseBillingSlotKey(first)} className="border-b pb-2 last:border-0">
                  <div className="font-medium text-foreground">
                    <Link to={`/leases/${first.leaseId}`} className="hover:text-primary hover:underline" onClick={() => setDuplicateDialogOpen(false)}>{reference}</Link>
                    {" · "}{formatDate(first.dueDate)}{" · "}{getItemTypeLabel(t, first.itemType)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {group.map(item => (
                      <span key={item.id} className="inline-flex items-center gap-1.5">
                        {units.find(unit => unit.id === item.unitId)?.unitCode ?? "—"}
                        {formatCurrency(item.expectedAmount, item.currencyCode)}
                        <StatusBadge status={item.status} />
                      </span>
                    ))}
                  </div>
                </li>;
              })}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={duplicateCleanupBusy}>
              {t(duplicateReview.removable.length > 0 ? "action.cancel" : "action.close")}
            </AlertDialogCancel>
            {duplicateReview.removable.length > 0 && (
              <AlertDialogAction disabled={duplicateCleanupBusy} onClick={event => { event.preventDefault(); void cleanDuplicateReceivables(); }}>
                {t("payments.duplicates.delete")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== ADD CASH RECEIPT SHEET ===== */}
      <Dialog open={canWrite && addReceiptOpen} onOpenChange={setAddReceiptOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("payments.dialog.recordTitle")}</DialogTitle></DialogHeader>
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
            <div>
              <Label>{t("payments.dialog.paymentDate")}</Label>
              <DateInput value={formDate} onChange={setFormDate} />
            </div>
            <div>
              <Label>{t("payments.dialog.amountReceived")}{receiptCurrency ? ` (${receiptCurrency})` : ""}</Label>
              <Input type="number" step="0.01" min="0" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" />
            </div>
              <div>
                <Label>{t("properties.currency")} *</Label>
                <Select value={receiptCurrency} onValueChange={value => { setFormCurrencyCode(value); setFormCurrencyError(false); }}>
                  <SelectTrigger className={formCurrencyError ? "border-destructive" : undefined}><SelectValue placeholder={t("payments.dialog.selectCurrency")} /></SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                  </SelectContent>
                </Select>
                {formCurrencyError && <p className="text-xs text-destructive mt-1">{t("payments.dialog.currencyRequired")}</p>}
                {selectedProp && receiptCurrency && receiptCurrency !== selectedProp.currencyCode && (
                  <p className="text-xs text-warning mt-1">{t("payments.dialog.currencyMismatchWarning")}</p>
                )}
              </div>
            <div>
              <Label>{t("payments.dialog.tenantOptional")}</Label>
              <Select value={formTenantId || "__none__"} onValueChange={v => { setFormTenantId(v === "__none__" ? "" : v); setFormLeaseId(""); setFormCurrencyCode(""); }}>
                <SelectTrigger><SelectValue placeholder={t("payments.dialog.selectTenant")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("payments.dialog.none")}</SelectItem>
                  {tenants.filter(tn => tn.status === "active").map(tn => (
                    <SelectItem key={tn.id} value={tn.id}>{getTenantFullName(tn)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("payments.dialog.leaseOptional")}</Label>
              <Select value={formLeaseId || "__none__"} onValueChange={v => { setFormLeaseId(v === "__none__" ? "" : v); setFormCurrencyCode(""); }}>
                <SelectTrigger><SelectValue placeholder={t("payments.dialog.selectLease")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("payments.dialog.none")}</SelectItem>
                  {leases.filter(l => !formTenantId || leaseIncludesTenant(l, formTenantId)).map(l => {
                    const tn = tenants.find(x => x.id === l.primaryTenantId);
                    return <SelectItem key={l.id} value={l.id}>{l.leaseReference} — {tn ? getTenantFullName(tn) : ""}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("payments.dialog.reference")}</Label>
              <Input value={formReference} onChange={e => setFormReference(e.target.value)} placeholder={t("payments.dialog.referencePh")} />
            </div>
            <div>
              <Label>{t("payments.dialog.payerName")}</Label>
              <Input value={formPayerName} onChange={e => setFormPayerName(e.target.value)} />
            </div>
            <div>
              <Label>{t("payments.dialog.payerIban")}</Label>
              <Input value={formPayerIban} onChange={e => setFormPayerIban(e.target.value)} placeholder={t("payments.dialog.ibanPh")} />
            </div>
            <div>
              <Label>{t("payments.dialog.remittance")}</Label>
              <Input value={formRemittance} onChange={e => setFormRemittance(e.target.value)} />
            </div>
            <div>
              <Label>{t("payments.dialog.notes")}</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("payments.dialog.autoAllocate")}</Label>
              <Switch checked={formAutoAllocate} onCheckedChange={setFormAutoAllocate} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddReceiptOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleAddReceipt} disabled={!positiveNumber(formAmount)}>{t("payments.recordCashReceipt")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== MANUAL ALLOCATION SHEET ===== */}
      <Dialog open={canWrite && !!allocateReceiptId} onOpenChange={v => { if (!v) { setAllocateReceiptId(null); setAllocAmounts({}); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("payments.dialog.manualTitle")}</DialogTitle></DialogHeader>
          {allocReceipt && (
            <div className="space-y-4 mt-4">
              <div className="p-3 bg-muted rounded-md space-y-1">
                <p className="text-xs text-muted-foreground">{t("payments.dialog.receipt")}: <span className="font-mono font-medium text-foreground">{allocReceipt.reference ?? allocReceipt.id}</span></p>
                <p className="text-xs text-muted-foreground">{t("payments.dialog.amount")}: <span className="font-medium text-foreground">{formatCurrency(allocReceipt.amountReceived, allocReceipt.currencyCode)}</span></p>
                <p className="text-xs text-muted-foreground">{t("payments.dialog.unmatched")}: <span className="font-bold text-warning">{formatCurrency(allocReceipt.unmatchedAmount, allocReceipt.currencyCode)}</span></p>
              </div>

              {allocOpenItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("payments.dialog.noOpenItems")}</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">{t("payments.dialog.openItems")}</p>
                    {allocOpenItems.map(ri => {
                      const issue = allocationDraft.issues.get(ri.id);
                      return <div key={ri.id} className="flex items-center justify-between gap-2 p-2 border rounded-md">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{ri.label}</p>
                          <p className="text-xs text-muted-foreground">{getItemTypeLabel(t, ri.itemType)} · {t("payments.dialog.dueShort")} {formatDate(ri.dueDate)} · {t("payments.dialog.outstandingShort")} {formatCurrency(ri.outstandingAmount, ri.currencyCode)}</p>
                        </div>
                        <div className="w-28 shrink-0">
                          <Input
                            type="text" inputMode="decimal"
                            aria-label={`${ri.label} ${t("payments.dialog.amount")}`}
                            aria-invalid={!!issue}
                            aria-describedby={issue ? `allocation-error-${ri.id}` : undefined}
                            className={`h-8 text-sm ${issue ? "border-destructive focus-visible:ring-destructive" : ""}`}
                            value={allocAmounts[ri.id] ?? ""}
                            onChange={e => setAllocAmounts(prev => ({ ...prev, [ri.id]: e.target.value }))}
                            placeholder="0.00"
                          />
                          {issue && <p id={`allocation-error-${ri.id}`} className="mt-1 text-xs text-destructive">
                            {t(issue === "exceeds" ? "payments.dialog.exceedsReceivable" : "payments.dialog.invalidAmount")}
                          </p>}
                        </div>
                      </div>;
                    })}
                  </div>

                  {/* Allocation summary */}
                  {(() => {
                    const totalAllocating = allocationDraft.total;
                    const remaining = Math.round((allocReceipt.unmatchedAmount - totalAllocating) * 100) / 100;
                    return (
                      <div className="p-3 bg-muted/50 rounded-md space-y-1 border">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{t("payments.dialog.totalAllocating")}</span>
                          <span className="font-medium text-foreground">{formatCurrency(totalAllocating, allocReceipt.currencyCode)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{t("payments.dialog.remainingUnmatched")}</span>
                          <span className={`font-medium ${remaining < 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(remaining, allocReceipt.currencyCode)}</span>
                        </div>
                        {remaining < 0 && <p className="text-xs text-destructive">{t("payments.dialog.exceedsUnmatched")}</p>}
                        {[...allocationDraft.issues.values()].includes("stale") && <p className="text-xs text-destructive">{t("payments.dialog.staleSelection")}</p>}
                      </div>
                    );
                  })()}
                </>
              )}

            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAllocateReceiptId(null); setAllocAmounts({}); }} disabled={allocationSaving}>{t("action.cancel")}</Button>
            <Button variant="outline" onClick={handleAutoAllocate} disabled={allocationSaving || allocOpenItems.length === 0}>{t("payments.dialog.autoAllocateBtn")}</Button>
            <Button onClick={handleManualAllocate} disabled={allocationSaving || allocOpenItems.length === 0 || allocationDraft.issues.size > 0 || allocationDraft.total <= 0 || allocationDraft.total > (allocReceipt?.unmatchedAmount ?? 0)}>{t("payments.dialog.applyManual")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== QUICK PAY RECEIVABLE ===== */}
      <QuickPayReceivableDialog
        receivableItemId={canWrite ? quickPayRiId : null}
        onOpenChange={(open) => { if (!open) setQuickPayRiId(null); }}
      />
    </div>
  );
}
