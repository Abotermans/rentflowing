import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ArrowLeft, StickyNote, Clock, Plus, AlertTriangle } from "lucide-react";
import { getTenantFullName, type PaymentMethod } from "@/types";
import { formatDate, formatCurrency } from "@/lib/formatters";

export default function LeaseDetail() {
  const { id } = useParams<{ id: string }>();
  const { leases, tenants, units, properties, getLedgerByLease, getPaymentsByLease, getLeaseOutstanding, addPayment } = useAppData();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formAmount, setFormAmount] = useState("");
  const [formMethod, setFormMethod] = useState<PaymentMethod>("bank-transfer");
  const [formRef, setFormRef] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const lease = leases.find(l => l.id === id);
  if (!lease) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Lease not found.</p>
        <Button variant="link" asChild className="mt-2"><Link to="/leases">← Back to Leases</Link></Button>
      </div>
    );
  }

  const tenant = tenants.find(t => t.id === lease.primaryTenantId);
  const unit = units.find(u => u.id === lease.unitId);
  const property = properties.find(p => p.id === lease.propertyId);
  const locale = property?.locale ?? "fr-FR";
  const currency = property?.currencyCode ?? "EUR";

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
      leaseId: lease.id,
      tenantId: lease.primaryTenantId,
      paymentDate: formDate,
      amount: parseFloat(formAmount),
      paymentMethod: formMethod,
      reference: formRef,
      notes: formNotes,
    });
    setSheetOpen(false);
    setFormAmount("");
    setFormRef("");
    setFormNotes("");
  };

  // Compute effective status for ledger lines
  const enrichedLedger = ledger.map(ll => {
    let effectiveStatus = ll.status;
    if (ll.remainingBalance > 0 && ll.dueDate < today && (ll.status === "due" || ll.status === "partially-paid")) {
      effectiveStatus = "overdue";
    }
    return { ...ll, effectiveStatus };
  });

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link to="/leases"><ArrowLeft className="h-4 w-4 mr-1" />Leases</Link>
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{lease.leaseReference}</h1>
              <StatusBadge status={lease.leaseStatus} />
            </div>
            <div className="flex gap-2 mt-1 text-sm text-muted-foreground">
              {tenant && <Link to={`/tenants/${tenant.id}`} className="hover:underline text-primary">{getTenantFullName(tenant)}</Link>}
              <span>·</span>
              {unit && <Link to={`/units/${unit.id}`} className="hover:underline text-primary">{unit.unitCode}</Link>}
              <span>·</span>
              {property && <Link to={`/properties/${property.id}`} className="hover:underline text-primary">{property.name}</Link>}
            </div>
          </div>
          <Button onClick={() => setSheetOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" />Add Payment</Button>
        </div>
      </div>

      {/* Lease Summary */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Lease Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className="text-xs text-muted-foreground">Start Date</p><p className="text-sm font-medium text-foreground">{formatDate(lease.startDate, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">End Date</p><p className="text-sm font-medium text-foreground">{formatDate(lease.endDate, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">Due Day</p><p className="text-sm font-medium text-foreground">{lease.dueDayOfMonth}th of each month</p></div>
            <div><p className="text-xs text-muted-foreground">Monthly Rent</p><p className="text-lg font-bold text-foreground">{formatCurrency(lease.monthlyRent, currency, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">Monthly Charges</p><p className="text-lg font-bold text-foreground">{formatCurrency(lease.monthlyCharges, currency, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">Total Monthly</p><p className="text-lg font-bold text-primary">{formatCurrency(totalMonthly, currency, locale)}</p></div>
            <div><p className="text-xs text-muted-foreground">Deposit / Guarantee</p><p className="text-sm font-medium text-foreground">{lease.depositOrGuaranteeAmount != null ? formatCurrency(lease.depositOrGuaranteeAmount, currency, locale) : "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Notice Period</p><p className="text-sm font-medium text-foreground">{lease.noticePeriodText || "—"}</p></div>
            {lease.signedDate && <div><p className="text-xs text-muted-foreground">Signed Date</p><p className="text-sm font-medium text-foreground">{formatDate(lease.signedDate, locale)}</p></div>}
          </div>
        </CardContent>
      </Card>

      {/* Financial Summary */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Financial Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">This Month Due</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(thisMonthDue, currency, locale)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Paid</p>
              <p className="text-lg font-bold text-success">{formatCurrency(totalPaid, currency, locale)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(outstanding, currency, locale)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className={`text-lg font-bold ${overdue > 0 ? "text-destructive" : "text-foreground"}`}>
                {overdue > 0 && <AlertTriangle className="h-4 w-4 inline mr-1" />}
                {formatCurrency(overdue, currency, locale)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tenant & Unit */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Tenant</CardTitle></CardHeader>
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
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Unit & Property</CardTitle></CardHeader>
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
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Ledger</CardTitle></CardHeader>
        <CardContent>
          {enrichedLedger.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ledger lines.</p>
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
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Payment History</CardTitle></CardHeader>
        <CardContent>
          {paymentHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded.</p>
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
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><StickyNote className="h-4 w-4" />Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{lease.notes}</p></CardContent>
        </Card>
      )}

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Created: {formatDate(lease.createdAt, locale)}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Updated: {formatDate(lease.updatedAt, locale)}</span>
      </div>

      {/* Add Payment Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
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
    </div>
  );
}
