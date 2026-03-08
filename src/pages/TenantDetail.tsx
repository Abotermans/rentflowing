import { useParams, Link } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { getLeaseStatus, getPaymentStatus, formatCurrency, formatDate } from "@/lib/formatters";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, Phone, AlertCircle, User } from "lucide-react";

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const { tenants, leases, units, properties, payments } = useAppData();

  const tenant = tenants.find(t => t.id === id);
  if (!tenant) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Tenant not found.</p>
        <Link to="/tenants" className="text-primary hover:underline text-sm">Back to Tenants</Link>
      </div>
    );
  }

  const tenantLeases = leases.filter(l => l.tenantId === tenant.id);
  const activeLease = tenantLeases.find(l => getLeaseStatus(l.startDate, l.endDate) === "active");
  const activeUnit = activeLease ? units.find(u => u.id === activeLease.unitId) : null;
  const activeProperty = activeUnit ? properties.find(p => p.id === activeUnit.propertyId) : null;

  const tenantPayments = payments
    .filter(p => tenantLeases.some(l => l.id === p.leaseId))
    .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/tenants"><Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold text-foreground">{tenant.firstName} {tenant.lastName}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Contact Information</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /><span>{tenant.email}</span></div>
            <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /><span>{tenant.phone}</span></div>
            <div className="flex items-center gap-2 text-sm"><AlertCircle className="h-4 w-4 text-muted-foreground" /><span>Emergency: {tenant.emergencyContact}</span></div>
            <div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" /><span>Since {formatDate(tenant.createdAt)}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Current Lease</CardTitle></CardHeader>
          <CardContent>
            {activeLease ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Property</span><Link to={`/properties/${activeProperty?.id}`} className="text-primary hover:underline">{activeProperty?.name}</Link></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Unit</span><span>{activeUnit?.unitNumber}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Period</span><span>{formatDate(activeLease.startDate)} — {formatDate(activeLease.endDate)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Monthly Rent</span><span className="font-medium">{formatCurrency(activeLease.monthlyRent)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status="active" /></div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active lease.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Payment History</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Due Date</TableHead>
                <TableHead>Paid Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenantPayments.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No payments recorded.</TableCell></TableRow>
              ) : tenantPayments.map(p => (
                <TableRow key={p.id}>
                  <TableCell>{formatDate(p.dueDate)}</TableCell>
                  <TableCell>{p.paidDate ? formatDate(p.paidDate) : "—"}</TableCell>
                  <TableCell className="capitalize">{p.method ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.amount)}</TableCell>
                  <TableCell><StatusBadge status={getPaymentStatus(p.dueDate, p.paidDate)} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
