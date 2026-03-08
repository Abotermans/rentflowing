import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { getTenantFullName, type PaymentMethod } from "@/types";
import { Plus, CreditCard, AlertTriangle, CheckCircle2, Clock, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useSettings } from "@/context/SettingsContext";

export default function Payments() {
  const { t } = useSettings();
  const { ledgerLines, payments, leases, tenants, properties, units, addPayment } = useAppData();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  // Payment form state
  const [formLeaseId, setFormLeaseId] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formAmount, setFormAmount] = useState("");
  const [formMethod, setFormMethod] = useState<PaymentMethod>("bank-transfer");
  const [formRef, setFormRef] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const currentMonth = today.slice(0, 7);

  // KPIs
  const thisMonthLines = ledgerLines.filter(ll => ll.periodMonth === currentMonth);
  const totalDueThisMonth = thisMonthLines.reduce((s, ll) => s + ll.amountDue, 0);
  const totalCollectedThisMonth = thisMonthLines.reduce((s, ll) => s + ll.amountPaid, 0);
  const totalOverdue = ledgerLines.filter(ll => ll.remainingBalance > 0 && ll.dueDate < today).reduce((s, ll) => s + ll.remainingBalance, 0);
  const partiallyPaidCount = ledgerLines.filter(ll => ll.status === "partially-paid").length;

  // Enriched ledger
  const enrichedLedger = ledgerLines.map(ll => {
    const lease = leases.find(l => l.id === ll.leaseId);
    const tenant = lease ? tenants.find(tn => tn.id === lease.primaryTenantId) : undefined;
    const prop = lease ? properties.find(p => p.id === lease.propertyId) : undefined;
    const unit = lease ? units.find(u => u.id === lease.unitId) : undefined;
    let effectiveStatus = ll.status;
    if (ll.remainingBalance > 0 && ll.dueDate < today && (ll.status === "due" || ll.status === "partially-paid")) {
      effectiveStatus = "overdue";
    }
    return { ...ll, lease, tenant, prop, unit, effectiveStatus };
  });

  const filteredLedger = enrichedLedger.filter(ll => {
    if (statusFilter !== "all" && ll.effectiveStatus !== statusFilter) return false;
    if (propertyFilter !== "all" && ll.prop?.id !== propertyFilter) return false;
    if (overdueOnly && ll.effectiveStatus !== "overdue") return false;
    if (search) {
      const q = search.toLowerCase();
      const tenantName = ll.tenant ? getTenantFullName(ll.tenant).toLowerCase() : "";
      const leaseRef = ll.lease?.leaseReference.toLowerCase() ?? "";
      if (!tenantName.includes(q) && !leaseRef.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => b.dueDate.localeCompare(a.dueDate));

  // Enriched payments
  const enrichedPayments = [...payments].map(pay => {
    const lease = leases.find(l => l.id === pay.leaseId);
    const tenant = tenants.find(tn => tn.id === pay.tenantId);
    const prop = lease ? properties.find(pr => pr.id === lease.propertyId) : undefined;
    return { ...pay, lease, tenant, prop };
  }).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

  const activeLeases = leases.filter(l => l.leaseStatus === "active");
  const selectedLease = leases.find(l => l.id === formLeaseId);
  const selectedTenant = selectedLease ? tenants.find(tn => tn.id === selectedLease.primaryTenantId) : undefined;
  const selectedProp = selectedLease ? properties.find(p => p.id === selectedLease.propertyId) : undefined;

  const handleAddPayment = () => {
    if (!formLeaseId || !formAmount || !selectedLease) return;
    addPayment({
      leaseId: formLeaseId,
      tenantId: selectedLease.primaryTenantId,
      paymentDate: formDate,
      amount: parseFloat(formAmount),
      paymentMethod: formMethod,
      reference: formRef,
      notes: formNotes,
    });
    setSheetOpen(false);
    setFormLeaseId("");
    setFormAmount("");
    setFormRef("");
    setFormNotes("");
  };

  const methodLabels: Record<PaymentMethod, string> = {
    "bank-transfer": t("payments.bankTransfer"),
    cash: t("payments.cash"),
    card: t("payments.card"),
    "direct-debit": t("payments.directDebit"),
    other: t("payments.other"),
  };

  const typeLabels: Record<string, string> = {
    rent: t("payments.rent"),
    charges: t("payments.charges"),
    "advance-payment": t("advance.advancePayment"),
  };

  // Determine dominant currency for KPI display
  const activeCurrencies = [...new Set(leases.filter(l => l.leaseStatus === "active").map(l => {
    const prop = properties.find(p => p.id === l.propertyId);
    return prop?.currencyCode ?? "EUR";
  }))];
  const kpiCurrency = activeCurrencies.length === 1 ? activeCurrencies[0] : undefined;
  const kpiLocale = activeCurrencies.length === 1 ? properties.find(p => p.currencyCode === activeCurrencies[0])?.locale : undefined;

  const kpis = [
    { label: t("payments.dueThisMonth"), value: totalDueThisMonth, icon: Clock, color: "text-primary", isCurrency: true },
    { label: t("payments.collectedThisMonth"), value: totalCollectedThisMonth, icon: CheckCircle2, color: "text-success", isCurrency: true },
    { label: t("payments.totalOverdue"), value: totalOverdue, icon: AlertTriangle, color: "text-destructive", isCurrency: true },
    { label: t("payments.partiallyPaid"), value: partiallyPaidCount, icon: CreditCard, color: "text-warning", isCurrency: false },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("payments.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("payments.subtitle")}</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}><Plus className="h-4 w-4 mr-1" />{t("payments.record")}</Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{k.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {k.isCurrency ? formatCurrency(k.value as number, kpiCurrency, kpiLocale) : k.value}
                  </p>
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
          <Input placeholder={t("payments.searchPlaceholder")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder={t("payments.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allStatuses")}</SelectItem>
            <SelectItem value="due">{t("payments.due")}</SelectItem>
            <SelectItem value="paid">{t("payments.paid")}</SelectItem>
            <SelectItem value="partially-paid">{t("payments.partiallyPaid")}</SelectItem>
            <SelectItem value="overdue">{t("payments.overdue")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder={t("payments.property")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allProperties")}</SelectItem>
            {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={overdueOnly ? "default" : "outline"} size="sm" className="h-9" onClick={() => setOverdueOnly(!overdueOnly)}>
          <AlertTriangle className="h-3.5 w-3.5 mr-1" />{t("filter.overdueOnly")}
        </Button>
      </div>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">{t("payments.ledger")} ({filteredLedger.length})</TabsTrigger>
          <TabsTrigger value="payments">{t("payments.allPayments")} ({enrichedPayments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          {filteredLedger.length === 0 ? (
            <EmptyState icon={Search} title={t("filter.noResults")} description={t("filter.noResultsDesc")} />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t("payments.tenant")}</TableHead>
                    <TableHead className="text-xs">{t("payments.lease")}</TableHead>
                    <TableHead className="text-xs">{t("payments.property")}</TableHead>
                    <TableHead className="text-xs">{t("payments.unit")}</TableHead>
                    <TableHead className="text-xs">{t("payments.period")}</TableHead>
                    <TableHead className="text-xs">{t("payments.type")}</TableHead>
                    <TableHead className="text-xs">{t("payments.dueDate")}</TableHead>
                    <TableHead className="text-xs text-right">{t("payments.due")}</TableHead>
                    <TableHead className="text-xs text-right">{t("payments.paid")}</TableHead>
                    <TableHead className="text-xs text-right">{t("payments.balance")}</TableHead>
                    <TableHead className="text-xs">{t("payments.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLedger.map(ll => (
                    <TableRow key={ll.id}>
                      <TableCell className="text-sm">{ll.tenant ? <Link to={`/tenants/${ll.tenant.id}`} className="hover:underline text-foreground">{getTenantFullName(ll.tenant)}</Link> : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{ll.lease ? <Link to={`/leases/${ll.lease.id}`} className="hover:underline text-foreground">{ll.lease.leaseReference}</Link> : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ll.prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ll.unit?.unitCode ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ll.periodMonth}</TableCell>
                      <TableCell className="text-xs capitalize text-muted-foreground">{typeLabels[ll.type] ?? ll.type}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(ll.dueDate, ll.prop?.locale)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(ll.amountDue, ll.prop?.currencyCode, ll.prop?.locale)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(ll.amountPaid, ll.prop?.currencyCode, ll.prop?.locale)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{ll.remainingBalance > 0 ? formatCurrency(ll.remainingBalance, ll.prop?.currencyCode, ll.prop?.locale) : "—"}</TableCell>
                      <TableCell><StatusBadge status={ll.effectiveStatus} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="payments">
          {enrichedPayments.length === 0 ? (
            <EmptyState icon={CreditCard} title={t("payments.noPayments")} description={t("payments.noPaymentsDesc")} />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t("payments.date")}</TableHead>
                    <TableHead className="text-xs">{t("payments.tenant")}</TableHead>
                    <TableHead className="text-xs">{t("payments.lease")}</TableHead>
                    <TableHead className="text-xs text-right">{t("payments.amount")}</TableHead>
                    <TableHead className="text-xs">{t("payments.method")}</TableHead>
                    <TableHead className="text-xs">{t("payments.reference")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrichedPayments.map(pay => (
                    <TableRow key={pay.id}>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(pay.paymentDate, pay.prop?.locale)}</TableCell>
                      <TableCell className="text-sm">{pay.tenant ? <Link to={`/tenants/${pay.tenant.id}`} className="hover:underline text-foreground">{getTenantFullName(pay.tenant)}</Link> : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{pay.lease ? <Link to={`/leases/${pay.lease.id}`} className="hover:underline text-foreground">{pay.lease.leaseReference}</Link> : "—"}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(pay.amount, pay.prop?.currencyCode, pay.prop?.locale)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{methodLabels[pay.paymentMethod]}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{pay.reference || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Payment Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{t("payments.addPayment")}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>{t("payments.lease")}</Label>
              <Select value={formLeaseId} onValueChange={setFormLeaseId}>
                <SelectTrigger><SelectValue placeholder={t("payments.selectLease")} /></SelectTrigger>
                <SelectContent>
                  {activeLeases.map(lease => {
                    const tn = tenants.find(x => x.id === lease.primaryTenantId);
                    return <SelectItem key={lease.id} value={lease.id}>{lease.leaseReference} — {tn ? getTenantFullName(tn) : ""}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            {selectedTenant && (
              <div>
                <Label>{t("payments.tenant")}</Label>
                <p className="text-sm text-foreground mt-1">{getTenantFullName(selectedTenant)}</p>
              </div>
            )}
            <div>
              <Label>{t("payments.paymentDate")}</Label>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </div>
            <div>
              <Label>{t("payments.amount")} ({selectedProp?.currencyCode ?? "EUR"})</Label>
              <Input type="number" step="0.01" min="0" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>{t("payments.paymentMethod")}</Label>
              <Select value={formMethod} onValueChange={v => setFormMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank-transfer">{t("payments.bankTransfer")}</SelectItem>
                  <SelectItem value="direct-debit">{t("payments.directDebit")}</SelectItem>
                  <SelectItem value="card">{t("payments.card")}</SelectItem>
                  <SelectItem value="cash">{t("payments.cash")}</SelectItem>
                  <SelectItem value="other">{t("payments.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("payments.reference")}</Label>
              <Input value={formRef} onChange={e => setFormRef(e.target.value)} placeholder={t("payments.paymentReferencePlaceholder")} />
            </div>
            <div>
              <Label>{t("payments.notes")}</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={3} />
            </div>
            <Button onClick={handleAddPayment} disabled={!formLeaseId || !formAmount} className="w-full">{t("payments.recordPayment")}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
