import { useAppData } from "@/context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DoorOpen, TrendingUp, CalendarClock, AlertTriangle, Shield, Bell, Truck, Wrench, ArrowRightLeft, Banknote } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, formatCurrency } from "@/lib/formatters";
import { getTenantFullName } from "@/types";
import { useSettings } from "@/context/SettingsContext";

export default function Dashboard() {
  const { properties, units, leases, leaseUnitAssignments, tenants, getPropertyStats, receivableItems, cashReceipts, getTenantOutstanding, guarantees, tickets, costEntries, costAllocationResults } = useAppData();
  const { t } = useSettings();

  // Maintenance KPIs
  const openTicketsCount = tickets.filter(tk => tk.status !== "completed" && tk.status !== "cancelled").length;
  const urgentTicketsCount = tickets.filter(tk => (tk.priority === "urgent" || tk.priority === "high") && tk.status !== "completed" && tk.status !== "cancelled").length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const completedThisMonth = tickets.filter(tk => tk.status === "completed" && tk.completedDate?.startsWith(thisMonth)).length;

  const totalUnits = units.length;
  // Mutually exclusive occupancy. Multi-unit lease aware:
  //   - "occupied" counts only PRIMARY assignments (the actual home / main commercial unit)
  //   - ancillary assignments (parking, cellar, storage) are tracked separately
  const todayISO = new Date().toISOString().slice(0, 10);
  const activeAssignmentForUnit = (uid: string) => leaseUnitAssignments.find(a =>
    a.unitId === uid &&
    a.startDate <= todayISO &&
    (!a.endDate || a.endDate >= todayISO) &&
    leases.some(l => l.id === a.leaseId && l.lifecycleStage === "active"),
  );
  let occupied = 0, ancillaryLeased = 0, unavailable = 0, reserved = 0;
  units.forEach(u => {
    const a = activeAssignmentForUnit(u.id);
    if (a && a.isPrimary) { occupied++; }
    else if (a) { ancillaryLeased++; }
    else if (u.currentStatus === "unavailable") { unavailable++; }
    else if (u.currentStatus === "reserved") { reserved++; }
  });
  const vacant = totalUnits - occupied - ancillaryLeased - reserved - unavailable;
  // Occupancy rate computed on units that can be a "home" (exclude ancillaries from denominator).
  const primaryDenominator = totalUnits - ancillaryLeased;
  const occupancyRate = primaryDenominator > 0 ? Math.round((occupied / primaryDenominator) * 100) : 0;

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in30Str = in30Days.toISOString().split("T")[0];

  const activeLeases = leases.filter(l => l.lifecycleStage === "active");
  const leasesEndingSoon = activeLeases.filter(l => new Date(l.endDate) <= in90Days && !l.noticeGiven);
  const leasesUnderNotice = activeLeases.filter(l => l.noticeGiven);

  // Financial KPIs from receivables
  const totalExpectedMonthlyRent = activeLeases.reduce((s, l) => s + l.monthlyRent + l.monthlyCharges, 0);
  const totalOverdue = receivableItems.filter(ri => ri.outstandingAmount > 0 && ri.dueDate < today).reduce((s, ri) => s + ri.outstandingAmount, 0);
  const totalOpenReceivables = receivableItems.filter(ri => ri.outstandingAmount > 0).reduce((s, ri) => s + ri.outstandingAmount, 0);
  const unmatchedReceiptsCount = cashReceipts.filter(cr => cr.unmatchedAmount > 0).length;
  const unappliedCreditTotal = cashReceipts.filter(cr => cr.unmatchedAmount > 0 && cr.tenantId).reduce((s, cr) => s + cr.unmatchedAmount, 0);

  // Guarantee KPIs
  const pendingGuarantees = guarantees.filter(g => g.status === "pending");
  const incompleteGuarantees = guarantees.filter(g => g.status === "incomplete");

  // Move-in/out/return KPIs
  const upcomingMoveIns = leases.filter(l => l.moveInScheduledDate && !l.moveInActualDate && l.moveInScheduledDate >= today);
  const upcomingMoveOuts = leases.filter(l => l.moveOutScheduledDate && !l.moveOutActualDate && l.moveOutScheduledDate >= today);
  const returnsPending = leases.filter(l => l.returnStatus === "pending" || l.returnStatus === "in-review");

  // Overdue tenants
  const activeTenantIds = [...new Set(activeLeases.map(l => l.primaryTenantId))];
  const overdueTenants = activeTenantIds
    .map(tid => {
      const tenant = tenants.find(x => x.id === tid);
      const { outstanding, overdue } = getTenantOutstanding(tid);
      const lease = activeLeases.find(l => l.primaryTenantId === tid);
      const prop = lease ? properties.find(p => p.id === lease.propertyId) : undefined;
      return { tenant, outstanding, overdue, lease, prop };
    })
    .filter(x => x.overdue > 0 && x.tenant);

  // Unmatched receipts for dashboard table
  const unmatchedReceipts = cashReceipts.filter(cr => cr.unmatchedAmount > 0).slice(0, 5);

  // Compact KPI row — the few numbers that actually drive a decision.
  const kpis = [
    { label: t("dashboard.occupancyRate"), value: `${occupancyRate}%`, sub: `${occupied}/${primaryDenominator} ${t("dashboard.occupied").toLowerCase()}`, icon: TrendingUp, tone: occupancyRate >= 80 ? "text-success" : "text-warning" },
    { label: t("dashboard.activeLeases"), value: activeLeases.length, sub: `${vacant} ${t("dashboard.vacantUnits")}`, icon: DoorOpen, tone: "text-foreground" },
    { label: "Open Receivables", value: formatCurrency(totalOpenReceivables), sub: totalOverdue > 0 ? `${formatCurrency(totalOverdue)} overdue` : "no overdue", icon: Banknote, tone: totalOverdue > 0 ? "text-destructive" : "text-foreground" },
    { label: t("dashboard.openTickets"), value: openTicketsCount, sub: urgentTicketsCount > 0 ? `${urgentTicketsCount} urgent` : "—", icon: Wrench, tone: urgentTicketsCount > 0 ? "text-destructive" : "text-foreground" },
  ];

  // Upcoming operations (next 30 days)
  const upcomingOps = [
    ...upcomingMoveIns.filter(l => l.moveInScheduledDate! <= in30Str).map(l => ({ type: "move-in" as const, lease: l, date: l.moveInScheduledDate! })),
    ...upcomingMoveOuts.filter(l => l.moveOutScheduledDate! <= in30Str).map(l => ({ type: "move-out" as const, lease: l, date: l.moveOutScheduledDate! })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">{k.label}</p>
                  <p className="text-xl font-bold mt-1 text-foreground">{k.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{k.sub}</p>
                </div>
                <k.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upcoming Operations */}
      {upcomingOps.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-primary" />{t("dashboard.upcomingOps")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("table.type")}</TableHead>
                  <TableHead className="text-xs">{t("table.reference")}</TableHead>
                  <TableHead className="text-xs">{t("table.tenant")}</TableHead>
                  <TableHead className="text-xs">{t("table.property")}</TableHead>
                  <TableHead className="text-xs">{t("table.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingOps.map(op => {
                  const tenant = tenants.find(tn => tn.id === op.lease.primaryTenantId);
                  const prop = properties.find(p => p.id === op.lease.propertyId);
                  return (
                    <TableRow key={`${op.type}-${op.lease.id}`}>
                      <TableCell><StatusBadge status={op.type === "move-in" ? "scheduled" : "pending"} /></TableCell>
                      <TableCell className="font-mono text-xs"><Link to={`/leases/${op.lease.id}`} className="hover:underline text-foreground">{op.lease.leaseReference}</Link></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{tenant ? getTenantFullName(tenant) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs font-medium text-foreground">{formatDate(op.date, prop?.locale)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Overdue Tenants */}
      {overdueTenants.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-destructive" />{t("dashboard.overdueTenants")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("table.tenant")}</TableHead>
                  <TableHead className="text-xs">{t("table.reference")}</TableHead>
                  <TableHead className="text-xs">{t("table.property")}</TableHead>
                  <TableHead className="text-xs">{t("table.units")}</TableHead>
                  <TableHead className="text-xs text-right">{t("table.overdue")}</TableHead>
                  <TableHead className="text-xs text-right">{t("table.outstanding")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdueTenants.map(({ tenant: tn, overdue, outstanding, lease: l, prop }) => {
                  const unitLabels = l
                    ? leaseUnitAssignments
                        .filter(a => a.leaseId === l.id)
                        .map(a => units.find(u => u.id === a.unitId))
                        .filter((u): u is NonNullable<typeof u> => !!u)
                        .map(u => u.unitCode)
                    : [];
                  return (
                    <TableRow key={tn!.id}>
                      <TableCell className="text-sm font-medium"><Link to={`/tenants/${tn!.id}`} className="hover:underline text-foreground">{getTenantFullName(tn!)}</Link></TableCell>
                      <TableCell className="font-mono text-xs">{l ? <Link to={`/leases/${l.id}`} className="hover:underline text-foreground">{l.leaseReference}</Link> : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{unitLabels.length > 0 ? unitLabels.join(", ") : "—"}</TableCell>
                      <TableCell className="text-right text-sm font-bold text-destructive">{formatCurrency(overdue, prop?.currencyCode, prop?.locale)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(outstanding, prop?.currencyCode, prop?.locale)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Unmatched Receipts */}
      {unmatchedReceipts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <ArrowRightLeft className="h-4 w-4 text-warning" />Unmatched Cash Receipts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Payer</TableHead>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs text-right">Received</TableHead>
                  <TableHead className="text-xs text-right">Unmatched</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedReceipts.map(cr => (
                  <TableRow key={cr.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(cr.paymentDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{cr.payerName ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{cr.reference ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatCurrency(cr.amountReceived, cr.currencyCode)}</TableCell>
                    <TableCell className="text-right text-sm font-bold text-warning">{formatCurrency(cr.unmatchedAmount, cr.currencyCode)}</TableCell>
                    <TableCell><StatusBadge status={cr.status} /></TableCell>
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
              <Bell className="h-4 w-4 text-warning" />{t("dashboard.leasesUnderNotice")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("table.reference")}</TableHead>
                  <TableHead className="text-xs">{t("table.tenant")}</TableHead>
                  <TableHead className="text-xs">{t("table.property")}</TableHead>
                  <TableHead className="text-xs">{t("table.noticeDate")}</TableHead>
                  <TableHead className="text-xs">{t("table.intendedMoveOut")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leasesUnderNotice.map(l => {
                  const tenant = tenants.find(tn => tn.id === l.primaryTenantId);
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

      {/* Returns Pending */}
      {returnsPending.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-warning" />{t("dashboard.returnsPending")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("table.reference")}</TableHead>
                  <TableHead className="text-xs">{t("table.tenant")}</TableHead>
                  <TableHead className="text-xs">{t("table.property")}</TableHead>
                  <TableHead className="text-xs">{t("table.returnStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnsPending.map(l => {
                  const tenant = tenants.find(tn => tn.id === l.primaryTenantId);
                  const prop = properties.find(p => p.id === l.propertyId);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs"><Link to={`/leases/${l.id}`} className="hover:underline text-foreground">{l.leaseReference}</Link></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{tenant ? getTenantFullName(tenant) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={l.returnStatus!} /></TableCell>
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
              <Shield className="h-4 w-4 text-warning" />{t("dashboard.guaranteeIssues")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("table.reference")}</TableHead>
                  <TableHead className="text-xs">{t("table.tenant")}</TableHead>
                  <TableHead className="text-xs">{t("table.type")}</TableHead>
                  <TableHead className="text-xs text-right">{t("table.expected")}</TableHead>
                  <TableHead className="text-xs text-right">{t("table.received")}</TableHead>
                  <TableHead className="text-xs">{t("filter.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...pendingGuarantees, ...incompleteGuarantees].map(g => {
                  const lease = leases.find(l => l.id === g.leaseId);
                  const tenant = lease ? tenants.find(tn => tn.id === lease.primaryTenantId) : undefined;
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

      {/* Leases Ending Soon */}
      {leasesEndingSoon.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-destructive" />{t("dashboard.leasesEndingSoon90")}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("table.reference")}</TableHead>
                  <TableHead className="text-xs">{t("table.tenant")}</TableHead>
                  <TableHead className="text-xs">{t("table.property")}</TableHead>
                  <TableHead className="text-xs">{t("table.endDate")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leasesEndingSoon.map(l => {
                  const tenant = tenants.find(tn => tn.id === l.primaryTenantId);
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
    </div>
  );
}
