import { useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { getLeaseStatus, getPaymentStatus, formatCurrency, formatDate } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Building2, Home, DoorOpen, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { properties, units, tenants, leases, payments } = useAppData();

  const stats = useMemo(() => {
    const activeLeaseUnitIds = leases
      .filter(l => getLeaseStatus(l.startDate, l.endDate) === "active")
      .map(l => l.unitId);
    const occupied = new Set(activeLeaseUnitIds).size;
    const total = units.length;
    const vacant = total - occupied;

    const overduePayments = payments.filter(p => getPaymentStatus(p.dueDate, p.paidDate) === "overdue");
    const overdueAmount = overduePayments.reduce((s, p) => s + p.amount, 0);

    return { total, occupied, vacant, overdueCount: overduePayments.length, overdueAmount };
  }, [units, leases, payments]);

  const occupancyByProperty = useMemo(() => {
    return properties.map(prop => {
      const propUnits = units.filter(u => u.propertyId === prop.id);
      const activeLeaseUnitIds = new Set(
        leases
          .filter(l => getLeaseStatus(l.startDate, l.endDate) === "active" && propUnits.some(u => u.id === l.unitId))
          .map(l => l.unitId)
      );
      return {
        name: prop.name.length > 18 ? prop.name.slice(0, 18) + "…" : prop.name,
        occupied: activeLeaseUnitIds.size,
        vacant: propUnits.length - activeLeaseUnitIds.size,
      };
    });
  }, [properties, units, leases]);

  const recentPayments = useMemo(() => {
    return [...payments]
      .filter(p => p.paidDate)
      .sort((a, b) => new Date(b.paidDate!).getTime() - new Date(a.paidDate!).getTime())
      .slice(0, 8)
      .map(p => {
        const lease = leases.find(l => l.id === p.leaseId);
        const tenant = tenants.find(t => t.id === lease?.tenantId);
        const unit = units.find(u => u.id === lease?.unitId);
        const property = properties.find(pr => pr.id === unit?.propertyId);
        return { ...p, tenant, unit, property };
      });
  }, [payments, leases, tenants, units, properties]);

  const upcomingRent = useMemo(() => {
    return payments
      .filter(p => getPaymentStatus(p.dueDate, p.paidDate) === "pending")
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 8)
      .map(p => {
        const lease = leases.find(l => l.id === p.leaseId);
        const tenant = tenants.find(t => t.id === lease?.tenantId);
        const unit = units.find(u => u.id === lease?.unitId);
        return { ...p, tenant, unit };
      });
  }, [payments, leases, tenants, units]);

  const summaryCards = [
    { label: "Total Units", value: stats.total, icon: Building2, color: "text-primary" },
    { label: "Occupied", value: stats.occupied, icon: Home, color: "text-success" },
    { label: "Vacant", value: stats.vacant, icon: DoorOpen, color: "text-muted-foreground" },
    { label: "Overdue", value: `${stats.overdueCount} (${formatCurrency(stats.overdueAmount)})`, icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your property portfolio</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(card => (
          <Card key={card.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-bold text-foreground">{card.value}</p>
                </div>
                <card.icon className={`h-8 w-8 ${card.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Occupancy by Property</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={occupancyByProperty}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <Tooltip />
                <Bar dataKey="occupied" name="Occupied" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="vacant" name="Vacant" fill="hsl(215, 16%, 80%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Rent Due</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingRent.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No upcoming payments</TableCell></TableRow>
                ) : upcomingRent.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.tenant ? `${p.tenant.firstName} ${p.tenant.lastName}` : "—"}</TableCell>
                    <TableCell>{formatDate(p.dueDate)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Payments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Paid Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentPayments.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No payments recorded</TableCell></TableRow>
              ) : recentPayments.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.tenant ? `${p.tenant.firstName} ${p.tenant.lastName}` : "—"}</TableCell>
                  <TableCell>{p.property?.name ?? "—"}</TableCell>
                  <TableCell>{p.unit?.unitNumber ?? "—"}</TableCell>
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
