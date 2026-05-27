import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { getTenantFullName } from "@/types";
import { ITEM_TYPE_LABELS, SOURCE_TYPE_LABELS, ALLOCATION_TYPE_LABELS } from "@/types/receivables";
import type { CashReceiptSourceType, ReceivableItemType } from "@/types/receivables";
import { Plus, AlertTriangle, CheckCircle2, Clock, Search, ArrowRightLeft, Banknote, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { useSettings } from "@/context/SettingsContext";

export default function Payments() {
  const { t } = useSettings();
  const {
    receivableItems, cashReceipts, allocations,
    leases, tenants, properties, units,
    createCashReceipt, allocateCashReceipt, autoAllocateCashReceipt,
    getReceivableItemsByLease, getReceivableItemsByTenant,
  } = useAppData();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
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

  // KPIs
  const totalOpenReceivables = receivableItems.filter(ri => ri.outstandingAmount > 0).reduce((s, ri) => s + ri.outstandingAmount, 0);
  const totalOverdue = receivableItems.filter(ri => ri.outstandingAmount > 0 && ri.dueDate < today).reduce((s, ri) => s + ri.outstandingAmount, 0);
  const totalUnmatchedReceipts = cashReceipts.filter(cr => cr.unmatchedAmount > 0).reduce((s, cr) => s + cr.unmatchedAmount, 0);
  const unappliedCreditTotal = cashReceipts.filter(cr => cr.unmatchedAmount > 0 && cr.tenantId).reduce((s, cr) => s + cr.unmatchedAmount, 0);

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
    if (statusFilter !== "all" && ri.effectiveStatus !== statusFilter) return false;
    if (propertyFilter !== "all" && ri.prop?.id !== propertyFilter) return false;
    if (typeFilter !== "all" && ri.itemType !== typeFilter) return false;
    if (overdueOnly && ri.effectiveStatus !== "overdue") return false;
    if (search) {
      const q = search.toLowerCase();
      const tenantName = ri.tenant ? getTenantFullName(ri.tenant).toLowerCase() : "";
      const leaseRef = ri.lease?.leaseReference.toLowerCase() ?? "";
      if (!tenantName.includes(q) && !leaseRef.includes(q) && !ri.label.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => b.dueDate.localeCompare(a.dueDate));

  // Enriched receipts
  const enrichedReceipts = cashReceipts.map(cr => {
    const lease = cr.leaseId ? leases.find(l => l.id === cr.leaseId) : undefined;
    const tenant = cr.tenantId ? tenants.find(tn => tn.id === cr.tenantId) : undefined;
    const prop = cr.propertyId ? properties.find(p => p.id === cr.propertyId) : undefined;
    return { ...cr, lease, tenant, prop };
  }).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

  const filteredReceipts = enrichedReceipts.filter(cr => {
    if (statusFilter !== "all" && cr.status !== statusFilter) return false;
    if (propertyFilter !== "all" && cr.prop?.id !== propertyFilter) return false;
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

  // Enriched allocations
  const enrichedAllocations = allocations.map(al => {
    const receipt = cashReceipts.find(cr => cr.id === al.cashReceiptId);
    const ri = receivableItems.find(r => r.id === al.receivableItemId);
    const tenant = ri?.tenantId ? tenants.find(tn => tn.id === ri.tenantId) : undefined;
    return { ...al, receipt, ri, tenant };
  }).sort((a, b) => b.allocationDate.localeCompare(a.allocationDate));

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

  const kpis = [
    { label: "Open Receivables", value: formatCurrency(totalOpenReceivables), icon: FileText, color: "text-primary" },
    { label: "Total Overdue", value: formatCurrency(totalOverdue), icon: AlertTriangle, color: totalOverdue > 0 ? "text-destructive" : "text-foreground" },
    { label: "Unmatched Receipts", value: formatCurrency(totalUnmatchedReceipts), icon: ArrowRightLeft, color: totalUnmatchedReceipts > 0 ? "text-warning" : "text-foreground" },
    { label: "Unapplied Credit", value: formatCurrency(unappliedCreditTotal), icon: Banknote, color: unappliedCreditTotal > 0 ? "text-primary" : "text-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Receivables & Reconciliation</h1>
          <p className="text-sm text-muted-foreground">Manage receivables, cash receipts, and allocations</p>
        </div>
        <Button onClick={() => setAddReceiptOpen(true)}><Plus className="h-4 w-4 mr-1" />Record Cash Receipt</Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{k.label}</p>
                  <p className="text-lg font-bold text-foreground mt-1">{k.value}</p>
                </div>
                <k.icon className={`h-5 w-5 ${k.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search tenant, lease, reference…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Property" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allProperties")}</SelectItem>
            {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="receivables">
        <TabsList>
          <TabsTrigger value="receivables">Receivables ({filteredReceivables.length})</TabsTrigger>
          <TabsTrigger value="receipts">Cash Receipts ({filteredReceipts.length})</TabsTrigger>
          <TabsTrigger value="allocations">Allocations ({enrichedAllocations.length})</TabsTrigger>
        </TabsList>

        {/* ===== TAB 1: RECEIVABLES ===== */}
        <TabsContent value="receivables">
          <div className="flex flex-wrap gap-2 mb-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partially-paid">Partially Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {(Object.keys(ITEM_TYPE_LABELS) as ReceivableItemType[]).map(k => (
                  <SelectItem key={k} value={k}>{ITEM_TYPE_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant={overdueOnly ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setOverdueOnly(!overdueOnly)}>
              <AlertTriangle className="h-3 w-3 mr-1" />Overdue Only
            </Button>
          </div>
          {filteredReceivables.length === 0 ? (
            <EmptyState icon={Search} title="No receivables found" description="Adjust filters or add receivable items." />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Due Date</TableHead>
                    <TableHead className="text-xs">Tenant</TableHead>
                    <TableHead className="text-xs">Lease</TableHead>
                    <TableHead className="text-xs">Property</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Label</TableHead>
                    <TableHead className="text-xs text-right">Expected</TableHead>
                    <TableHead className="text-xs text-right">Allocated</TableHead>
                    <TableHead className="text-xs text-right">Outstanding</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReceivables.map(ri => (
                    <TableRow key={ri.id}>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(ri.dueDate, ri.prop?.locale)}</TableCell>
                      <TableCell className="text-sm">{ri.tenant ? <Link to={`/tenants/${ri.tenant.id}`} className="hover:underline text-foreground">{getTenantFullName(ri.tenant)}</Link> : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{ri.lease ? <Link to={`/leases/${ri.lease.id}`} className="hover:underline text-foreground">{ri.lease.leaseReference}</Link> : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ri.prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ITEM_TYPE_LABELS[ri.itemType]}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ri.label}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(ri.expectedAmount, ri.currencyCode, ri.prop?.locale)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(ri.allocatedAmount, ri.currencyCode, ri.prop?.locale)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{ri.outstandingAmount > 0 ? formatCurrency(ri.outstandingAmount, ri.currencyCode, ri.prop?.locale) : "—"}</TableCell>
                      <TableCell><StatusBadge status={ri.effectiveStatus} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ===== TAB 2: CASH RECEIPTS ===== */}
        <TabsContent value="receipts">
          <div className="flex flex-wrap gap-2 mb-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="matched">Matched</SelectItem>
                <SelectItem value="partially-matched">Partially Matched</SelectItem>
                <SelectItem value="unmatched">Unmatched</SelectItem>
                <SelectItem value="exception">Exception</SelectItem>
              </SelectContent>
            </Select>
            <Button variant={unmatchedOnly ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setUnmatchedOnly(!unmatchedOnly)}>
              <ArrowRightLeft className="h-3 w-3 mr-1" />Unmatched Only
            </Button>
          </div>
          {filteredReceipts.length === 0 ? (
            <EmptyState icon={Banknote} title="No cash receipts found" description="Record a cash receipt to get started." />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Payer</TableHead>
                    <TableHead className="text-xs">Tenant</TableHead>
                    <TableHead className="text-xs">Lease</TableHead>
                    <TableHead className="text-xs text-right">Received</TableHead>
                    <TableHead className="text-xs text-right">Unmatched</TableHead>
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs">Reference</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReceipts.map(cr => (
                    <TableRow key={cr.id}>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(cr.paymentDate, cr.prop?.locale)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{cr.payerName ?? "—"}</TableCell>
                      <TableCell className="text-sm">{cr.tenant ? <Link to={`/tenants/${cr.tenant.id}`} className="hover:underline text-foreground">{getTenantFullName(cr.tenant)}</Link> : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{cr.lease ? <Link to={`/leases/${cr.lease.id}`} className="hover:underline text-foreground">{cr.lease.leaseReference}</Link> : "—"}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(cr.amountReceived, cr.currencyCode, cr.prop?.locale)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{cr.unmatchedAmount > 0 ? formatCurrency(cr.unmatchedAmount, cr.currencyCode, cr.prop?.locale) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{SOURCE_TYPE_LABELS[cr.sourceType]}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{cr.reference ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={cr.status} /></TableCell>
                      <TableCell>
                        {cr.unmatchedAmount > 0 && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setAllocateReceiptId(cr.id); setAllocAmounts({}); }}>
                            Allocate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ===== TAB 3: ALLOCATIONS ===== */}
        <TabsContent value="allocations">
          {enrichedAllocations.length === 0 ? (
            <EmptyState icon={ArrowRightLeft} title="No allocations" description="Allocations are created when cash receipts are matched to receivables." />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Receipt Ref</TableHead>
                    <TableHead className="text-xs">Receivable</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Tenant</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrichedAllocations.map(al => (
                    <TableRow key={al.id}>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(al.allocationDate)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{al.receipt?.reference ?? al.cashReceiptId}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{al.ri?.label ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{al.ri ? ITEM_TYPE_LABELS[al.ri.itemType] : "—"}</TableCell>
                      <TableCell className="text-sm">{al.tenant ? <Link to={`/tenants/${al.tenant.id}`} className="hover:underline text-foreground">{getTenantFullName(al.tenant)}</Link> : "—"}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(al.allocatedAmount)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ALLOCATION_TYPE_LABELS[al.allocationType]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== ADD CASH RECEIPT SHEET ===== */}
      <Dialog open={addReceiptOpen} onOpenChange={setAddReceiptOpen}>
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
            <div>
              <Label>Payment Date</Label>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>
            <div>
              <Label>Amount Received ({selectedProp?.currencyCode ?? "EUR"})</Label>
              <Input type="number" step="0.01" min="0" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Tenant (optional)</Label>
              <Select value={formTenantId || "__none__"} onValueChange={v => setFormTenantId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select tenant…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {tenants.filter(tn => tn.status === "active").map(tn => (
                    <SelectItem key={tn.id} value={tn.id}>{getTenantFullName(tn)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lease (optional)</Label>
              <Select value={formLeaseId || "__none__"} onValueChange={v => setFormLeaseId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select lease…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {leases.filter(l => l.leaseStatus === "active").map(l => {
                    const tn = tenants.find(x => x.id === l.primaryTenantId);
                    return <SelectItem key={l.id} value={l.id}>{l.leaseReference} — {tn ? getTenantFullName(tn) : ""}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference</Label>
              <Input value={formReference} onChange={e => setFormReference(e.target.value)} placeholder="Payment reference" />
            </div>
            <div>
              <Label>Payer Name</Label>
              <Input value={formPayerName} onChange={e => setFormPayerName(e.target.value)} />
            </div>
            <div>
              <Label>Payer IBAN</Label>
              <Input value={formPayerIban} onChange={e => setFormPayerIban(e.target.value)} placeholder="e.g. FR76 3000 …" />
            </div>
            <div>
              <Label>Remittance Information</Label>
              <Input value={formRemittance} onChange={e => setFormRemittance(e.target.value)} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Auto-allocate</Label>
              <Switch checked={formAutoAllocate} onCheckedChange={setFormAutoAllocate} />
            </div>
            <Button onClick={handleAddReceipt} disabled={!formAmount} className="w-full">Record Cash Receipt</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== MANUAL ALLOCATION SHEET ===== */}
      <Dialog open={!!allocateReceiptId} onOpenChange={v => { if (!v) { setAllocateReceiptId(null); setAllocAmounts({}); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Manual Allocation</DialogTitle></DialogHeader>
          {allocReceipt && (
            <div className="space-y-4 mt-4">
              <div className="p-3 bg-muted rounded-md space-y-1">
                <p className="text-xs text-muted-foreground">Receipt: <span className="font-mono font-medium text-foreground">{allocReceipt.reference ?? allocReceipt.id}</span></p>
                <p className="text-xs text-muted-foreground">Amount: <span className="font-medium text-foreground">{formatCurrency(allocReceipt.amountReceived, allocReceipt.currencyCode)}</span></p>
                <p className="text-xs text-muted-foreground">Unmatched: <span className="font-bold text-warning">{formatCurrency(allocReceipt.unmatchedAmount, allocReceipt.currencyCode)}</span></p>
              </div>

              {allocOpenItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open receivable items found for this tenant/lease.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Open Receivable Items</p>
                    {allocOpenItems.map(ri => (
                      <div key={ri.id} className="flex items-center justify-between gap-2 p-2 border rounded-md">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{ri.label}</p>
                          <p className="text-xs text-muted-foreground">{ITEM_TYPE_LABELS[ri.itemType]} · Due {formatDate(ri.dueDate)} · Outstanding {formatCurrency(ri.outstandingAmount, ri.currencyCode)}</p>
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
                          <span className="text-muted-foreground">Total allocating</span>
                          <span className="font-medium text-foreground">{formatCurrency(totalAllocating, allocReceipt.currencyCode)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Remaining unmatched</span>
                          <span className={`font-medium ${remaining < 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(remaining, allocReceipt.currencyCode)}</span>
                        </div>
                        {remaining < 0 && <p className="text-xs text-destructive">Total exceeds available unmatched amount.</p>}
                      </div>
                    );
                  })()}
                </>
              )}

              <div className="flex gap-2">
                <Button onClick={handleManualAllocate} disabled={allocOpenItems.length === 0 || Object.values(allocAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0) <= 0 || Object.values(allocAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0) > allocReceipt.unmatchedAmount} className="flex-1">Apply Manual Allocation</Button>
                <Button variant="outline" onClick={() => { autoAllocateCashReceipt(allocateReceiptId!); setAllocateReceiptId(null); setAllocAmounts({}); }} disabled={allocOpenItems.length === 0}>Auto-Allocate</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
