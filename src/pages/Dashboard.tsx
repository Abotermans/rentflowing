import { useAppData } from "@/context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Building2, DoorOpen, CheckCircle2, XCircle, Clock, Ban, TrendingUp, CalendarClock, Globe, Landmark, Settings2, FileText, Users, AlertTriangle, CreditCard, Shield, Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, formatCurrency, getCountryName, getPropertyTypeLabel } from "@/lib/formatters";
import { getTenantFullName, getLeaseLifecycleStatus } from "@/types";

export default function Dashboard() {
  const { properties, units, leases, tenants, getPropertyStats, ledgerLines, getTenantOutstanding, guarantees } = useAppData();

  const totalUnits = units.length;
  const occupied = units.filter(u => u.currentStatus === "occupied").length;
  const vacant = units.filter(u => u.currentStatus === "vacant").length;
  const reserved = units.filter(u => u.currentStatus === "reserved").length;
  const unavailable = units.filter(u => u.currentStatus === "unavailable").length;
  const occupancyRate = totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0;

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const activeLeases = leases.filter(l => l.leaseStatus === "active");
  const leasesEndingSoon = activeLeases.filter(l => new Date(l.endDate) <= in90Days && !l.noticeGiven);
  const leasesUnderNotice = activeLeases.filter(l => l.noticeGiven);

  // Financial KPIs
  const totalExpectedMonthlyRent = activeLeases.reduce((s, l) => s + l.monthlyRent + l.monthlyCharges, 0);
  const totalOverdue = ledgerLines.filter(ll => ll.remainingBalance > 0 && ll.dueDate < today).reduce((s, ll) => s + ll.remainingBalance, 0);

  // Guarantee KPIs
  const pendingGuarantees = guarantees.filter(g => g.status === "pending");
  const incompleteGuarantees = guarantees.filter(g => g.status === "incomplete");

  // Overdue tenants
  const activeTenantIds = [...new Set(activeLeases.map(l => l.primaryTenantId))];
  const overdueTenants = activeTenantIds
    .map(tid => {
      const t = tenants.find(x => x.id === tid);
      const { outstanding, overdue } = getTenantOutstanding(tid);
      const lease = activeLeases.find(l => l.primaryTenantId === tid);
      const prop = lease ? properties.find(p => p.id === lease.propertyId) : undefined;
      return { tenant: t, outstanding, overdue, lease, prop };
    })
    .filter(x => x.overdue > 0 && x.tenant);

  const kpis = [
    { label: "Properties", value: properties.length, icon: Building2, color: "text-primary" },
    { label: "Total Units", value: totalUnits, icon: DoorOpen, color: "text-foreground" },
    { label: "Occupied", value: occupied, icon: CheckCircle2, color: "text-success" },
    { label: "Vacant", value: vacant, icon: XCircle, color: "text-warning" },
    { label: "Occupancy Rate", value: `${occupancyRate}%`, icon: TrendingUp, color: "text-success" },
    { label: "Active Leases", value: activeLeases.length, icon: FileText, color: "text-primary" },
    { label: "Ending Soon", value: leasesEndingSoon.length, icon: CalendarClock, color: leasesEndingSoon.length > 0 ? "text-destructive" : "text-foreground" },
    { label: "Under Notice", value: leasesUnderNotice.length, icon: Bell, color: leasesUnderNotice.length > 0 ? "text-warning" : "text-foreground" },
    { label: "Expected Monthly", value: formatCurrency(totalExpectedMonthlyRent), icon: CreditCard, color: "text-primary", isText: true },
    { label: "Total Overdue", value: formatCurrency(totalOverdue), icon: AlertTriangle, color: totalOverdue > 0 ? "text-destructive" : "text-foreground", isText: true },
    { label: "Overdue Tenants", value: overdueTenants.length, icon: Users, color: overdueTenants.length > 0 ? "text-destructive" : "text-foreground" },
    { label: "Pending Guarantees", value: pendingGuarantees.length, icon: Shield, color: pendingGuarantees.length > 0 ? "text-warning" : "text-foreground" },
  ];

  const statusSegments = [
    { status: "occupied" as const, count: occupied, className: "bg-success" },
    { status: "reserved" as const, count: reserved, className: "bg-primary" },
    { status: "vacant" as const, count: vacant, className: "bg-warning" },
    { status: "unavailable" as const, count: unavailable, className: "bg-muted-foreground" },
  ];

  const vacancyOverview = properties.map(p => {
    const stats = getPropertyStats(p.id);
    return { ...p, ...stats };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Portfolio overview</p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{k.label}</p>
                  <p className={`text-2xl font-bold text-foreground mt-1 ${(k as any).isText ? "text-lg" : ""}`}>{k.value}</p>
                </div>
                <k.icon className={`h-5 w-5 ${k.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Units by Status</CardTitle></CardHeader>
        <CardContent>
          {totalUnits > 0 ? (
            <>
              <div className="h-4 rounded-full overflow-hidden flex bg-muted">
                {statusSegments.map(s => s.count > 0 && (
                  <div key={s.status} className={`h-full ${s.className} transition-all`} style={{ width: `${(s.count / totalUnits) * 100}%` }} />
                ))}
              </div>
              <div className="flex gap-4 mt-3 flex-wrap">
                {statusSegments.map(s => (
                  <div key={s.status} className="flex items-center gap-1.5 text-xs">
                    <div className={`h-2.5 w-2.5 rounded-full ${s.className}`} />
                    <span className="text-muted-foreground capitalize">{s.status}</span>
                    <span className="font-medium text-foreground">{s.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No units yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Overdue Tenants */}
      {overdueTenants.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-destructive" />Overdue Tenants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Tenant</TableHead>
                  <TableHead className="text-xs">Lease</TableHead>
                  <TableHead className="text-xs">Property</TableHead>
                  <TableHead className="text-xs text-right">Overdue</TableHead>
                  <TableHead className="text-xs text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdueTenants.map(({ tenant: t, overdue, outstanding, lease: l, prop }) => (
                  <TableRow key={t!.id}>
                    <TableCell className="text-sm font-medium"><Link to={`/tenants/${t!.id}`} className="hover:underline text-foreground">{getTenantFullName(t!)}</Link></TableCell>
                    <TableCell className="font-mono text-xs">{l ? <Link to={`/leases/${l.id}`} className="hover:underline text-foreground">{l.leaseReference}</Link> : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm font-bold text-destructive">{formatCurrency(overdue, prop?.currencyCode, prop?.locale)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(outstanding, prop?.currencyCode, prop?.locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Leases Under Notice */}
      {leasesUnderNotice.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Bell className="h-4 w-4 text-warning" />Leases Under Notice
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Tenant</TableHead>
                  <TableHead className="text-xs">Property</TableHead>
                  <TableHead className="text-xs">Notice Date</TableHead>
                  <TableHead className="text-xs">Intended Move-Out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leasesUnderNotice.map(l => {
                  const tenant = tenants.find(t => t.id === l.primaryTenantId);
                  const prop = properties.find(p => p.id === l.propertyId);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs"><Link to={`/leases/${l.id}`} className="hover:underline text-foreground">{l.leaseReference}</Link></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{tenant ? getTenantFullName(tenant) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.noticeDate ? formatDate(l.noticeDate, prop?.locale) : "—"}</TableCell>
                      <TableCell className="text-xs text-warning font-medium">{l.intendedMoveOutDate ? formatDate(l.intendedMoveOutDate, prop?.locale) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pending / Incomplete Guarantees */}
      {(pendingGuarantees.length > 0 || incompleteGuarantees.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-warning" />Guarantee Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Lease</TableHead>
                  <TableHead className="text-xs">Tenant</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs text-right">Expected</TableHead>
                  <TableHead className="text-xs text-right">Received</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...pendingGuarantees, ...incompleteGuarantees].map(g => {
                  const lease = leases.find(l => l.id === g.leaseId);
                  const tenant = lease ? tenants.find(t => t.id === lease.primaryTenantId) : undefined;
                  const prop = lease ? properties.find(p => p.id === lease.propertyId) : undefined;
                  return (
                    <TableRow key={g.id}>
                      <TableCell className="font-mono text-xs">{lease ? <Link to={`/leases/${lease.id}`} className="hover:underline text-foreground">{lease.leaseReference}</Link> : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{tenant ? getTenantFullName(tenant) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">{g.type.replace(/-/g, " ")}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(g.expectedAmount, prop?.currencyCode, prop?.locale)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(g.receivedAmount, prop?.currencyCode, prop?.locale)}</TableCell>
                      <TableCell><StatusBadge status={g.status} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Active Leases */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Active Leases</CardTitle></CardHeader>
        <CardContent>
          {activeLeases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active leases.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Tenant</TableHead>
                  <TableHead className="text-xs">Property</TableHead>
                  <TableHead className="text-xs">Unit</TableHead>
                  <TableHead className="text-xs">End Date</TableHead>
                  <TableHead className="text-xs text-right">Monthly Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeLeases.map(l => {
                  const tenant = tenants.find(t => t.id === l.primaryTenantId);
                  const prop = properties.find(p => p.id === l.propertyId);
                  const unit = units.find(u => u.id === l.unitId);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs"><Link to={`/leases/${l.id}`} className="hover:underline text-foreground">{l.leaseReference}</Link></TableCell>
                      <TableCell className="text-muted-foreground text-sm">{tenant ? <Link to={`/tenants/${tenant.id}`} className="hover:underline">{getTenantFullName(tenant)}</Link> : "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{prop ? <Link to={`/properties/${prop.id}`} className="hover:underline">{prop.name}</Link> : "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{unit ? <Link to={`/units/${unit.id}`} className="hover:underline">{unit.unitCode}</Link> : "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatDate(l.endDate, prop?.locale)}</TableCell>
                      <TableCell className="text-right font-medium text-foreground">{prop ? formatCurrency(l.monthlyRent + l.monthlyCharges, prop.currencyCode, prop.locale) : `${l.monthlyRent + l.monthlyCharges}`}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Leases Ending Soon */}
      {leasesEndingSoon.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-destructive" />Leases Ending Soon (90 days)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Tenant</TableHead>
                  <TableHead className="text-xs">Property</TableHead>
                  <TableHead className="text-xs">End Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leasesEndingSoon.map(l => {
                  const tenant = tenants.find(t => t.id === l.primaryTenantId);
                  const prop = properties.find(p => p.id === l.propertyId);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs"><Link to={`/leases/${l.id}`} className="hover:underline text-foreground">{l.leaseReference}</Link></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{tenant ? getTenantFullName(tenant) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-destructive font-medium">{formatDate(l.endDate, prop?.locale)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Vacancy Overview by Property */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Vacancy Overview by Property</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Property</TableHead>
                <TableHead className="text-xs text-center">Total</TableHead>
                <TableHead className="text-xs text-center">Occupied</TableHead>
                <TableHead className="text-xs text-center">Vacant</TableHead>
                <TableHead className="text-xs text-right">Occupancy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vacancyOverview.map(v => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">
                    <Link to={`/properties/${v.id}`} className="hover:underline text-foreground">{v.name}</Link>
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">{v.total}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{v.occupied}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{v.vacant}</TableCell>
                  <TableCell className="text-right font-medium text-foreground">{v.occupancyRate}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Portfolio by Country</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(properties.reduce<Record<string, number>>((acc, p) => { acc[p.countryCode] = (acc[p.countryCode] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).map(([code, count]) => (
                <div key={code} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{getCountryName(code)}</span>
                    <span className="text-xs text-muted-foreground font-mono">{code}</span>
                  </div>
                  <span className="text-sm font-bold text-foreground">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Properties by Type</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(properties.reduce<Record<string, number>>((acc, p) => { acc[p.propertyType] = (acc[p.propertyType] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{getPropertyTypeLabel(type)}</span>
                  <span className="text-sm font-bold text-foreground">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Portfolio Configuration</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Currencies</span><span className="text-sm font-medium text-foreground">{[...new Set(properties.map(p => p.currencyCode))].join(", ") || "—"}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Locales</span><span className="text-sm font-medium text-foreground">{[...new Set(properties.map(p => p.locale))].join(", ") || "—"}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Measurement</span><span className="text-sm font-medium text-foreground capitalize">{[...new Set(properties.map(p => p.measurementSystem))].join(", ") || "—"}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
