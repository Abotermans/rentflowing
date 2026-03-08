import { useState, useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { getPaymentStatus, formatCurrency, formatDate } from "@/lib/formatters";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CreditCard, DollarSign, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getLeaseStatus } from "@/lib/formatters";

export default function Payments() {
  const { payments, leases, tenants, units, properties, addPayment, updatePayment } = useAppData();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [form, setForm] = useState({ leaseId: "", amount: 0, dueDate: "", paidDate: "", method: "transfer" as "cash" | "check" | "transfer" | "card" });

  const enriched = useMemo(() => {
    return payments.map(p => {
      const lease = leases.find(l => l.id === p.leaseId);
      const tenant = lease ? tenants.find(t => t.id === lease.tenantId) : null;
      const unit = lease ? units.find(u => u.id === lease.unitId) : null;
      const property = unit ? properties.find(pr => pr.id === unit.propertyId) : null;
      const status = getPaymentStatus(p.dueDate, p.paidDate);
      return { ...p, lease, tenant, unit, property, status };
    }).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  }, [payments, leases, tenants, units, properties]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return enriched;
    return enriched.filter(p => p.status === statusFilter);
  }, [enriched, statusFilter]);

  const stats = useMemo(() => {
    const paid = enriched.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
    const pending = enriched.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0);
    const overdue = enriched.filter(p => p.status === "overdue").reduce((s, p) => s + p.amount, 0);
    return { paid, pending, overdue };
  }, [enriched]);

  const activeLeases = useMemo(() => {
    return leases.filter(l => getLeaseStatus(l.startDate, l.endDate) === "active").map(l => {
      const tenant = tenants.find(t => t.id === l.tenantId);
      const unit = units.find(u => u.id === l.unitId);
      return { ...l, tenant, unit };
    });
  }, [leases, tenants, units]);

  const openRecord = () => {
    setForm({ leaseId: "", amount: 0, dueDate: new Date().toISOString().split("T")[0], paidDate: new Date().toISOString().split("T")[0], method: "transfer" });
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.leaseId || !form.amount) {
      toast({ title: "Validation Error", description: "Lease and amount are required.", variant: "destructive" });
      return;
    }
    addPayment({
      leaseId: form.leaseId,
      amount: form.amount,
      dueDate: form.dueDate,
      paidDate: form.paidDate || null,
      method: form.paidDate ? form.method : null,
    });
    toast({ title: "Payment recorded" });
    setOpen(false);
  };

  const markAsPaid = (paymentId: string) => {
    const p = payments.find(x => x.id === paymentId);
    if (p) {
      updatePayment({ ...p, paidDate: new Date().toISOString().split("T")[0], method: "transfer" });
      toast({ title: "Payment marked as paid" });
    }
  };

  const summaryCards = [
    { label: "Total Collected", value: formatCurrency(stats.paid), icon: DollarSign, color: "text-success" },
    { label: "Pending", value: formatCurrency(stats.pending), icon: Clock, color: "text-warning" },
    { label: "Overdue", value: formatCurrency(stats.overdue), icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payments</h1>
          <p className="text-sm text-muted-foreground">{payments.length} payment records</p>
        </div>
        <Button onClick={openRecord}><Plus className="h-4 w-4 mr-2" />Record Payment</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {summaryCards.map(c => (
          <Card key={c.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{c.label}</p>
                  <p className="text-2xl font-bold text-foreground">{c.value}</p>
                </div>
                <c.icon className={`h-8 w-8 ${c.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        {["all", "paid", "pending", "overdue"].map(s => (
          <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)} className="capitalize">
            {s === "all" ? "All" : s}
          </Button>
        ))}
      </div>

      {payments.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet" description="Record your first payment." actionLabel="Record Payment" onAction={openRecord} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No payments match filter.</TableCell></TableRow>
                ) : filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.dueDate)}</TableCell>
                    <TableCell className="font-medium">{p.tenant ? `${p.tenant.firstName} ${p.tenant.lastName}` : "—"}</TableCell>
                    <TableCell>{p.property?.name ?? "—"}</TableCell>
                    <TableCell>{p.unit?.unitNumber ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.amount)}</TableCell>
                    <TableCell className="capitalize">{p.method ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell>
                      {(p.status === "pending" || p.status === "overdue") && (
                        <Button variant="outline" size="sm" onClick={() => markAsPaid(p.id)}>Mark Paid</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Lease (Tenant — Unit)</Label>
              <Select value={form.leaseId} onValueChange={v => {
                const lease = activeLeases.find(l => l.id === v);
                setForm(f => ({ ...f, leaseId: v, amount: lease?.monthlyRent ?? 0 }));
              }}>
                <SelectTrigger><SelectValue placeholder="Select lease" /></SelectTrigger>
                <SelectContent>
                  {activeLeases.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.tenant ? `${l.tenant.firstName} ${l.tenant.lastName}` : "?"} — {l.unit?.unitNumber ?? "?"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount ($)</Label><Input type="number" min={0} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: +e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Due Date</Label><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
              <div><Label>Paid Date</Label><Input type="date" value={form.paidDate} onChange={e => setForm(f => ({ ...f, paidDate: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Method</Label>
              <Select value={form.method} onValueChange={v => setForm(f => ({ ...f, method: v as typeof f.method }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
