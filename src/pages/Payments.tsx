import { useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { getTenantFullName } from "@/types";
import { getItemTypeLabel, getSourceTypeLabel, getAllocationTypeLabel } from "@/types/receivables";
import type { CashReceiptSourceType, ReceivableItemType } from "@/types/receivables";
import { Plus, AlertTriangle, CheckCircle2, Clock, Search, ArrowRightLeft, Banknote } from "lucide-react";
import { Link } from "react-router-dom";
import { useSettings } from "@/context/SettingsContext";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";

export default function Payments() {
  const { t } = useSettings();
  const {
    receivableItems, cashReceipts, allocations,
    leases, tenants, properties, units,
    createCashReceipt, allocateCashReceipt, autoAllocateCashReceipt,
    getReceivableItemsByLease, getReceivableItemsByTenant,
  } = useAppData();

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [propertyFilter, setPropertyFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [addReceiptOpen, setAddReceiptOpen] = useState(false);
  const [allocateReceiptId, setAllocateReceiptId] = useState<string | null>(null);

  // Add receipt form
  const [formSourceType, setFormSourceType] = useState<CashReceiptSourceType>("bank-transfer");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formAmount, setFormAmount] = useState("");
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

  const today = new Date().toISOString().split("T")[0];

  type RvSortKey = "dueDate" | "tenant" | "lease" | "property" | "type" | "label" | "expected" | "allocated" | "outstanding" | "status";
  const { sort: rvSort, toggle: rvToggle } = useTableSort<RvSortKey>("dueDate", "desc");

  type CrSortKey = "date" | "payer" | "tenant" | "lease" | "received" | "unmatched" | "source" | "reference" | "status";
  const { sort: crSort, toggle: crToggle } = useTableSort<CrSortKey>("date", "desc");

  // KPIs

  // Enriched receivables
  const enrichedReceivables = receivableItems.map(ri => {
    const lease = ri.leaseId ? leases.find(l => l.id === ri.leaseId) : undefined;
    const tenant = ri.tenantId ? tenants.find(tn => tn.id === ri.tenantId) : undefined;
    const prop = ri.propertyId ? properties.find(p => p.id === ri.propertyId) : undefined;
    const unit = ri.unitId ? units.find(u => u.id === ri.unitId) : undefined;
    let effectiveStatus = ri.status;
    if (ri.outstandingAmount > 0 && ri.dueDate < today && (ri.status === "open" || ri.status === "partially-paid")) {
      effectiveStatus = "overdue";
    }
    return { ...ri, lease, tenant, prop, unit, effectiveStatus };
  });

  const filteredReceivables = enrichedReceivables.filter(ri => {
    if (statusFilter.length > 0 && !statusFilter.includes(ri.effectiveStatus)) return false;
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
    if (statusFilter.length > 0 && !statusFilter.includes(cr.status)) return false;
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
  }).sort((a, b) => b.allocationDate.localeCompare(a.allocationDate));

  const rvPg = usePagination(sortedReceivables);
  const crPg = usePagination(sortedReceipts);
  const alPg = usePagination(enrichedAllocations);

  const selectedLease = formLeaseId ? leases.find(l => l.id === formLeaseId) : undefined;
  const selectedProp = selectedLease ? properties.find(p => p.id === selectedLease.propertyId) : undefined;

  const handleAddReceipt = () => {
    if (!formAmount) return;
    const amt = parseFloat(formAmount);
    const propId = selectedLease ? selectedLease.propertyId : null;
    const unitId = selectedLease ? selectedLease.unitId : null;
    createCashReceipt({
      tenantId: formTenantId || null,
      leaseId: formLeaseId || null,
      propertyId: propId,
      unitId,
      sourceType: formSourceType,
      paymentDate: formDate,
      bookingDate: null,
      valueDate: null,
      amountReceived: amt,
      currencyCode: selectedProp?.currencyCode ?? "EUR",
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
    setAddReceiptOpen(false);
    setFormAmount(""); setFormReference(""); setFormNotes(""); setFormPayerName(""); setFormPayerIban(""); setFormRemittance("");
    setFormTenantId(""); setFormLeaseId("");
  };

  // Manual allocation
  const allocReceipt = allocateReceiptId ? cashReceipts.find(r => r.id === allocateReceiptId) : null;
  const allocOpenItems = allocReceipt ? receivableItems.filter(ri => {
    if (ri.outstandingAmount <= 0) return false;
    if (allocReceipt.leaseId && ri.leaseId === allocReceipt.leaseId) return true;
    if (allocReceipt.tenantId && ri.tenantId === allocReceipt.tenantId) return true;
    return false;
  }) : [];

  const handleManualAllocate = () => {
    if (!allocateReceiptId) return;
    const manualAllocs = Object.entries(allocAmounts)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([riId, v]) => ({ receivableItemId: riId, amount: parseFloat(v) }));
    if (manualAllocs.length === 0) return;
    allocateCashReceipt(allocateReceiptId, manualAllocs);
    setAllocateReceiptId(null);
    setAllocAmounts({});
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("payments.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("payments.pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative inline-flex">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("action.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 min-w-[180px] max-w-[400px] [field-sizing:content]" />
          </div>
          <Button onClick={() => setAddReceiptOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" />{t("payments.recordCashReceipt")}</Button>
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
              values={statusFilter}
              onChange={setStatusFilter}
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
          </div>
          {filteredReceivables.length === 0 ? (
            <EmptyState icon={Search} title={t("payments.empty.receivables")} description={t("payments.empty.receivablesDesc")} />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortKey="dueDate" sort={rvSort} onSort={rvToggle} className="text-xs">{t("payments.table.dueDate")}</SortableTableHead>
                    <SortableTableHead sortKey="tenant" sort={rvSort} onSort={rvToggle} className="text-xs">{t("payments.table.tenant")}</SortableTableHead>
                    <SortableTableHead sortKey="lease" sort={rvSort} onSort={rvToggle} className="text-xs">{t("payments.table.lease")}</SortableTableHead>
                    <SortableTableHead sortKey="property" sort={rvSort} onSort={rvToggle} className="text-xs">{t("payments.table.property")}</SortableTableHead>
                    <SortableTableHead sortKey="type" sort={rvSort} onSort={rvToggle} className="text-xs">{t("payments.table.type")}</SortableTableHead>
                    <SortableTableHead sortKey="label" sort={rvSort} onSort={rvToggle} className="text-xs">{t("payments.table.label")}</SortableTableHead>
                    <SortableTableHead sortKey="expected" sort={rvSort} onSort={rvToggle} align="right" className="text-xs">{t("payments.table.expected")}</SortableTableHead>
                    <SortableTableHead sortKey="allocated" sort={rvSort} onSort={rvToggle} align="right" className="text-xs">{t("payments.table.allocated")}</SortableTableHead>
                    <SortableTableHead sortKey="outstanding" sort={rvSort} onSort={rvToggle} align="right" className="text-xs">{t("payments.table.outstanding")}</SortableTableHead>
                    <SortableTableHead sortKey="status" sort={rvSort} onSort={rvToggle} className="text-xs">{t("payments.table.status")}</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rvPg.pageItems.map(ri => (
                    <TableRow key={ri.id}>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(ri.dueDate, ri.prop?.locale)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ri.tenant ? <Link to={`/tenants/${ri.tenant.id}`} className="hover:underline">{getTenantFullName(ri.tenant)}</Link> : "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{ri.lease ? <Link to={`/leases/${ri.lease.id}`} className="hover:underline">{ri.lease.leaseReference}</Link> : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ri.prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{getItemTypeLabel(t, ri.itemType)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ri.label}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(ri.expectedAmount, ri.currencyCode, ri.prop?.locale)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(ri.allocatedAmount, ri.currencyCode, ri.prop?.locale)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{ri.outstandingAmount > 0 ? formatCurrency(ri.outstandingAmount, ri.currencyCode, ri.prop?.locale) : "—"}</TableCell>
                      <TableCell><StatusBadge status={ri.effectiveStatus} /></TableCell>
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
              values={statusFilter}
              onChange={setStatusFilter}
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
                    <SortableTableHead sortKey="date" sort={crSort} onSort={crToggle} className="text-xs">{t("payments.table.date")}</SortableTableHead>
                    <SortableTableHead sortKey="payer" sort={crSort} onSort={crToggle} className="text-xs">{t("payments.table.payer")}</SortableTableHead>
                    <SortableTableHead sortKey="tenant" sort={crSort} onSort={crToggle} className="text-xs">{t("payments.table.tenant")}</SortableTableHead>
                    <SortableTableHead sortKey="lease" sort={crSort} onSort={crToggle} className="text-xs">{t("payments.table.lease")}</SortableTableHead>
                    <SortableTableHead sortKey="received" sort={crSort} onSort={crToggle} align="right" className="text-xs">{t("payments.table.received")}</SortableTableHead>
                    <SortableTableHead sortKey="unmatched" sort={crSort} onSort={crToggle} align="right" className="text-xs">{t("payments.table.unmatched")}</SortableTableHead>
                    <SortableTableHead sortKey="source" sort={crSort} onSort={crToggle} className="text-xs">{t("payments.table.source")}</SortableTableHead>
                    <SortableTableHead sortKey="reference" sort={crSort} onSort={crToggle} className="text-xs">{t("payments.table.reference")}</SortableTableHead>
                    <SortableTableHead sortKey="status" sort={crSort} onSort={crToggle} className="text-xs">{t("payments.table.status")}</SortableTableHead>
                    <TableHead className="text-xs">{t("table.action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crPg.pageItems.map(cr => (
                    <TableRow key={cr.id}>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(cr.paymentDate, cr.prop?.locale)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{cr.payerName ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{cr.tenant ? <Link to={`/tenants/${cr.tenant.id}`} className="hover:underline">{getTenantFullName(cr.tenant)}</Link> : "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{cr.lease ? <Link to={`/leases/${cr.lease.id}`} className="hover:underline">{cr.lease.leaseReference}</Link> : "—"}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(cr.amountReceived, cr.currencyCode, cr.prop?.locale)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{cr.unmatchedAmount > 0 ? formatCurrency(cr.unmatchedAmount, cr.currencyCode, cr.prop?.locale) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{getSourceTypeLabel(t, cr.sourceType)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{cr.reference ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={cr.status} /></TableCell>
                      <TableCell>
                        {cr.unmatchedAmount > 0 ? (
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setAllocateReceiptId(cr.id); setAllocAmounts({}); }}>
                            <ArrowRightLeft className="h-3 w-3" />{t("payments.action.allocate")}
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
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
                    <TableHead className="text-xs">{t("payments.table.date")}</TableHead>
                    <TableHead className="text-xs">{t("payments.table.receiptRef")}</TableHead>
                    <TableHead className="text-xs">{t("payments.table.receivable")}</TableHead>
                    <TableHead className="text-xs">{t("payments.table.type")}</TableHead>
                    <TableHead className="text-xs">{t("payments.table.tenant")}</TableHead>
                    <TableHead className="text-xs text-right">{t("payments.table.amount")}</TableHead>
                    <TableHead className="text-xs">{t("payments.table.method")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alPg.pageItems.map(al => (
                    <TableRow key={al.id}>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(al.allocationDate)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{al.receipt?.reference ?? al.cashReceiptId}</TableCell>
                      <TableCell className="text-xs">
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
                              <Link to={href} className="hover:underline text-foreground">{al.ri.label}</Link>
                            ) : (
                              <span className="text-muted-foreground">{al.ri.label}</span>
                            );
                          })()
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{al.ri ? getItemTypeLabel(t, al.ri.itemType) : "—"}</TableCell>
                      <TableCell className="text-sm">{al.tenant ? <Link to={`/tenants/${al.tenant.id}`} className="hover:underline text-foreground">{getTenantFullName(al.tenant)}</Link> : "—"}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(al.allocatedAmount)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{getAllocationTypeLabel(t, al.allocationType)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={alPg.page} pageSize={alPg.pageSize} total={alPg.total} totalPages={alPg.totalPages} from={alPg.from} to={alPg.to} onPageChange={alPg.setPage} onPageSizeChange={alPg.setPageSize} />
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== ADD CASH RECEIPT SHEET ===== */}
      <Dialog open={addReceiptOpen} onOpenChange={setAddReceiptOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>
            <div>
              <Label>{t("payments.dialog.amountReceived")} ({selectedProp?.currencyCode ?? "EUR"})</Label>
              <Input type="number" step="0.01" min="0" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>{t("payments.dialog.tenantOptional")}</Label>
              <Select value={formTenantId || "__none__"} onValueChange={v => setFormTenantId(v === "__none__" ? "" : v)}>
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
              <Select value={formLeaseId || "__none__"} onValueChange={v => setFormLeaseId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder={t("payments.dialog.selectLease")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("payments.dialog.none")}</SelectItem>
                  {leases.filter(l => l.lifecycleStage === "active").map(l => {
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
            <Button onClick={handleAddReceipt} disabled={!formAmount} className="w-full">{t("payments.recordCashReceipt")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== MANUAL ALLOCATION SHEET ===== */}
      <Dialog open={!!allocateReceiptId} onOpenChange={v => { if (!v) { setAllocateReceiptId(null); setAllocAmounts({}); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                    {allocOpenItems.map(ri => (
                      <div key={ri.id} className="flex items-center justify-between gap-2 p-2 border rounded-md">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{ri.label}</p>
                          <p className="text-xs text-muted-foreground">{getItemTypeLabel(t, ri.itemType)} · {t("payments.dialog.dueShort")} {formatDate(ri.dueDate)} · {t("payments.dialog.outstandingShort")} {formatCurrency(ri.outstandingAmount, ri.currencyCode)}</p>
                        </div>
                        <Input
                          type="number" step="0.01" min="0"
                          max={Math.min(ri.outstandingAmount, allocReceipt.unmatchedAmount)}
                          className="w-24 h-8 text-sm"
                          value={allocAmounts[ri.id] ?? ""}
                          onChange={e => setAllocAmounts(prev => ({ ...prev, [ri.id]: e.target.value }))}
                          placeholder="0.00"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Allocation summary */}
                  {(() => {
                    const totalAllocating = Object.values(allocAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
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
                      </div>
                    );
                  })()}
                </>
              )}

              <div className="flex gap-2">
                <Button onClick={handleManualAllocate} disabled={allocOpenItems.length === 0 || Object.values(allocAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0) <= 0 || Object.values(allocAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0) > allocReceipt.unmatchedAmount} className="flex-1">{t("payments.dialog.applyManual")}</Button>
                <Button variant="outline" onClick={() => { autoAllocateCashReceipt(allocateReceiptId!); setAllocateReceiptId(null); setAllocAmounts({}); }} disabled={allocOpenItems.length === 0}>{t("payments.dialog.autoAllocateBtn")}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
