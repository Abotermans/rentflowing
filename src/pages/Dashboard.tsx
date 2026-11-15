import { useState, type ReactNode } from "react";
import { addCalendarDaysISO, calendarDateISO } from "@/lib/calendarToday";
import { useBusinessNow } from "@/hooks/use-business-now";
import { propertyBusinessDateISO } from "@/lib/businessTimeZone";
import { classifyUnitOccupancy, getOccupancyRate } from "@/lib/occupancy";
import { leaseOccupiesOn } from "@/lib/leaseAssignments";
import { isLeaseEndingWithinDays } from "@/lib/leaseExpiry";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DoorOpen, TrendingUp, CalendarClock, AlertTriangle, Shield, Bell, Truck, Wrench, ArrowRightLeft, Banknote, ChevronDown, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, formatCurrency } from "@/lib/formatters";
import { getTenantFullName, type Unit } from "@/types";
import { useSettings } from "@/context/SettingsContext";
import { isReceivableOutstanding, isReceiptAllocatable } from "@/types/receivables";
import { formatMoneyGroups, sumMoneyByCurrency } from "@/lib/money";
import { usePortfolio } from "@/context/PortfolioContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface DashboardSectionProps {
  title: ReactNode;
  icon: LucideIcon;
  iconClassName?: string;
  children: ReactNode;
}

function DashboardSection({ title, icon: Icon, iconClassName, children }: DashboardSectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="min-w-0">
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex-1 text-left">
              <span className="inline-flex items-center gap-1.5">
                <Icon className={cn("h-4 w-4", iconClassName)} />
                {title}
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="min-w-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function Dashboard() {
  const { properties, units, leases, leaseUnitAssignments, tenants, receivableItems, cashReceipts, guarantees, tickets, getLeaseOutstanding } = useAppData();
  const { t } = useSettings();
  const { currentPortfolio } = usePortfolio();
  const showOccupancyOps = !!currentPortfolio?.show_occupancy_operations;

  // Maintenance KPIs
  const openTicketsCount = tickets.filter(tk => tk.status !== "completed" && tk.status !== "cancelled").length;
  const urgentTicketsCount = tickets.filter(tk => (tk.priority === "urgent" || tk.priority === "high") && tk.status !== "completed" && tk.status !== "cancelled").length;
  const businessNow = useBusinessNow();
  const todayISO = calendarDateISO(businessNow);
  const todayForProperty = (propertyId: string) => propertyBusinessDateISO(
    properties.find(property => property.id === propertyId), businessNow,
  );
  const todayForLease = (lease: { propertyId: string }) => todayForProperty(lease.propertyId);
  const thisMonth = todayISO.slice(0, 7);
  const completedThisMonth = tickets.filter(tk => tk.status === "completed" && tk.completedDate?.startsWith(thisMonth)).length;

  const totalUnits = units.length;
  const isActiveLeaseToday = (lease: typeof leases[number]) => leaseOccupiesOn(lease, todayForLease(lease));
  const activeAssignmentForUnit = (unit: Unit) => {
    const today = todayForProperty(unit.propertyId);
    return leaseUnitAssignments.find(a =>
      a.unitId === unit.id &&
      a.startDate <= today &&
      (!a.endDate || a.endDate >= today) &&
      leases.some(l => l.id === a.leaseId && isActiveLeaseToday(l)),
    );
  };
  const occupancyCounts = { occupied: 0, ancillaryLeased: 0, vacant: 0, reserved: 0, unavailable: 0, archived: 0 };
  units.forEach(u => {
    occupancyCounts[classifyUnitOccupancy(u, Boolean(activeAssignmentForUnit(u)))]++;
  });
  const { occupied, ancillaryLeased, vacant } = occupancyCounts;
  const leasedUnits = occupied + ancillaryLeased;
  const occupancyRate = getOccupancyRate(occupied, ancillaryLeased, totalUnits);

  const activeLeases = leases.filter(isActiveLeaseToday);
  const leasesEndingSoon = activeLeases.filter(l => isLeaseEndingWithinDays(l, todayForLease(l), 90) && !l.noticeGiven);
  const leasesUnderNotice = activeLeases.filter(l => l.noticeGiven);

  // Financial KPIs from receivables
  const overdueReceivables = receivableItems.filter(ri =>
    isReceivableOutstanding(ri) && ri.dueDate < todayForProperty(ri.propertyId));
  const openReceivables = receivableItems.filter(isReceivableOutstanding);
  const overdueGroups = sumMoneyByCurrency(overdueReceivables.map(ri => ({ amount: ri.outstandingAmount, currencyCode: ri.currencyCode })));
  const openReceivableGroups = sumMoneyByCurrency(openReceivables.map(ri => ({ amount: ri.outstandingAmount, currencyCode: ri.currencyCode })));

  // Guarantee KPIs
  const pendingGuarantees = guarantees.filter(g => g.status === "pending");
  const incompleteGuarantees = guarantees.filter(g => g.status === "incomplete");

  // Move-in/out/return KPIs
  const upcomingMoveIns = showOccupancyOps
    ? leases.filter(l => l.moveInScheduledDate && !l.moveInActualDate && l.moveInScheduledDate >= todayForLease(l))
    : [];
  const upcomingMoveOuts = showOccupancyOps
    ? leases.filter(l => l.moveOutScheduledDate && !l.moveOutActualDate && l.moveOutScheduledDate >= todayForLease(l))
    : [];
  const upcomingLeaseStarts = showOccupancyOps
    ? leases.filter(l =>
        l.lifecycleStage === "signed" &&
        l.startDate >= todayForLease(l) &&
        l.startDate <= addCalendarDaysISO(todayForLease(l), 30) &&
        !l.moveInScheduledDate,
      )
    : [];
  const returnsPending = showOccupancyOps
    ? leases.filter(l => l.returnStatus === "pending" || l.returnStatus === "in-review")
    : [];

  // Overdue tenants
  const overdueTenants = activeLeases
    .map(lease => {
      const tenant = tenants.find(x => x.id === lease.primaryTenantId);
      const prop = properties.find(p => p.id === lease.propertyId);
      const { outstanding, overdue } = getLeaseOutstanding(lease.id);
      return { tenant, outstanding, overdue, lease, prop };
    })
    .filter(x => x.overdue.length > 0 && x.tenant);

  // Unmatched receipts for dashboard table
  const unmatchedReceipts = cashReceipts.filter(isReceiptAllocatable).slice(0, 5);
  // Compact KPI row — the few numbers that actually drive a decision.
  const kpis = [
    { label: t("dashboard.occupancyRate"), value: `${occupancyRate}%`, sub: `${leasedUnits}/${totalUnits} ${t("dashboard.occupied").toLowerCase()}`, icon: TrendingUp, tone: occupancyRate >= 80 ? "text-success" : "text-warning" },
    { label: t("dashboard.activeLeases"), value: activeLeases.length, sub: `${vacant} ${t("dashboard.vacantUnits")}`, icon: DoorOpen, tone: "text-foreground" },
    { label: t("dashboard.openReceivables"), value: formatMoneyGroups(openReceivableGroups), sub: overdueGroups.length > 0 ? `${formatMoneyGroups(overdueGroups)} ${t("dashboard.overdueSuffix")}` : t("dashboard.noOverdueShort"), icon: Banknote, tone: overdueGroups.length > 0 ? "text-destructive" : "text-foreground" },
    { label: t("dashboard.openTickets"), value: openTicketsCount, sub: urgentTicketsCount > 0 ? `${urgentTicketsCount} ${t("dashboard.urgentSuffix")}` : "—", icon: Wrench, tone: urgentTicketsCount > 0 ? "text-destructive" : "text-foreground" },
  ];

  // Upcoming operations (next 30 days)
  const upcomingOps = [
    ...upcomingMoveIns.filter(l => l.moveInScheduledDate! <= addCalendarDaysISO(todayForLease(l), 30)).map(l => ({ type: "move-in" as const, lease: l, date: l.moveInScheduledDate! })),
    ...upcomingMoveOuts.filter(l => l.moveOutScheduledDate! <= addCalendarDaysISO(todayForLease(l), 30)).map(l => ({ type: "move-out" as const, lease: l, date: l.moveOutScheduledDate! })),
    ...upcomingLeaseStarts.map(l => ({ type: "lease-start" as const, lease: l, date: l.startDate })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="page-shell">
      <div>
        <h1 className="page-title">{t("dashboard.title")}</h1>
        <p className="page-description">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(k => (
          <Card key={k.label} className="min-w-0">
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{k.label}</p>
                  <p className="mt-1 break-words text-xl font-bold text-foreground">{k.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{k.sub}</p>
                </div>
                <k.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upcoming Operations */}
      {upcomingOps.length > 0 && (
        <DashboardSection title={t("dashboard.upcomingOps")} icon={Truck} iconClassName="text-primary">
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
        </DashboardSection>
      )}

      {/* Overdue Tenants */}
      {overdueTenants.length > 0 && (
        <DashboardSection title={t("dashboard.overdueTenants")} icon={AlertTriangle} iconClassName="text-destructive">
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
                    <TableRow key={l.id}>
                      <TableCell className="text-sm font-medium"><Link to={`/tenants/${tn!.id}`} className="hover:underline text-foreground">{getTenantFullName(tn!)}</Link></TableCell>
                      <TableCell className="font-mono text-xs">{l ? <Link to={`/leases/${l.id}`} className="hover:underline text-foreground">{l.leaseReference}</Link> : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{unitLabels.length > 0 ? unitLabels.join(", ") : "—"}</TableCell>
                      <TableCell className="text-right text-sm font-bold text-destructive">{formatMoneyGroups(overdue)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatMoneyGroups(outstanding)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
        </DashboardSection>
      )}

      {/* Unmatched Receipts */}
      {unmatchedReceipts.length > 0 && (
        <DashboardSection title={t("dashboard.unmatchedReceipts")} icon={ArrowRightLeft} iconClassName="text-warning">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("table.date")}</TableHead>
                  <TableHead className="text-xs">{t("table.payer")}</TableHead>
                  <TableHead className="text-xs">{t("table.reference")}</TableHead>
                  <TableHead className="text-xs text-right">{t("table.received")}</TableHead>
                  <TableHead className="text-xs text-right">{t("dashboard.unmatched")}</TableHead>
                  <TableHead className="text-xs">{t("filter.status")}</TableHead>
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
        </DashboardSection>
      )}

      {/* Leases Under Notice */}
      {leasesUnderNotice.length > 0 && (
        <DashboardSection title={t("dashboard.leasesUnderNotice")} icon={Bell} iconClassName="text-warning">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("table.reference")}</TableHead>
                  <TableHead className="text-xs">{t("table.tenant")}</TableHead>
                  <TableHead className="text-xs">{t("table.property")}</TableHead>
                  <TableHead className="text-xs">{t("table.units")}</TableHead>
                  <TableHead className="text-xs">{t("table.noticeDate")}</TableHead>
                  <TableHead className="text-xs">{t("table.intendedMoveOut")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leasesUnderNotice.map(l => {
                  const tenant = tenants.find(tn => tn.id === l.primaryTenantId);
                  const prop = properties.find(p => p.id === l.propertyId);
                  const unitLabels = leaseUnitAssignments
                    .filter(a => a.leaseId === l.id)
                    .map(a => units.find(u => u.id === a.unitId))
                    .filter((u): u is NonNullable<typeof u> => !!u)
                    .map(u => u.unitCode);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs"><Link to={`/leases/${l.id}`} className="hover:underline text-foreground">{l.leaseReference}</Link></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{tenant ? getTenantFullName(tenant) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{unitLabels.length > 0 ? unitLabels.join(", ") : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.noticeDate ? formatDate(l.noticeDate, prop?.locale) : "—"}</TableCell>
                      <TableCell className="text-xs text-warning font-medium">{l.intendedMoveOutDate ? formatDate(l.intendedMoveOutDate, prop?.locale) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
        </DashboardSection>
      )}

      {/* Returns Pending */}
      {returnsPending.length > 0 && (
        <DashboardSection title={t("dashboard.returnsPending")} icon={Truck} iconClassName="text-warning">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("table.reference")}</TableHead>
                  <TableHead className="text-xs">{t("table.tenant")}</TableHead>
                  <TableHead className="text-xs">{t("table.property")}</TableHead>
                  <TableHead className="text-xs">{t("table.units")}</TableHead>
                  <TableHead className="text-xs">{t("table.returnStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnsPending.map(l => {
                  const tenant = tenants.find(tn => tn.id === l.primaryTenantId);
                  const prop = properties.find(p => p.id === l.propertyId);
                  const unitLabels = leaseUnitAssignments
                    .filter(a => a.leaseId === l.id)
                    .map(a => units.find(u => u.id === a.unitId))
                    .filter((u): u is NonNullable<typeof u> => !!u)
                    .map(u => u.unitCode);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs"><Link to={`/leases/${l.id}`} className="hover:underline text-foreground">{l.leaseReference}</Link></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{tenant ? getTenantFullName(tenant) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{unitLabels.length > 0 ? unitLabels.join(", ") : "—"}</TableCell>
                      <TableCell><StatusBadge status={l.returnStatus!} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
        </DashboardSection>
      )}

      {/* Pending / Incomplete Guarantees */}
      {(pendingGuarantees.length > 0 || incompleteGuarantees.length > 0) && (
        <DashboardSection title={t("dashboard.guaranteeIssues")} icon={Shield} iconClassName="text-warning">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("table.reference")}</TableHead>
                  <TableHead className="text-xs">{t("table.tenant")}</TableHead>
                  <TableHead className="text-xs">{t("table.property")}</TableHead>
                  <TableHead className="text-xs">{t("table.units")}</TableHead>
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
                  const unitLabels = lease
                    ? leaseUnitAssignments
                        .filter(a => a.leaseId === lease.id)
                        .map(a => units.find(u => u.id === a.unitId))
                        .filter((u): u is NonNullable<typeof u> => !!u)
                        .map(u => u.unitCode)
                    : [];
                  return (
                    <TableRow key={g.id}>
                      <TableCell className="font-mono text-xs">{lease ? <Link to={`/leases/${lease.id}`} className="hover:underline text-foreground">{lease.leaseReference}</Link> : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{tenant ? getTenantFullName(tenant) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{unitLabels.length > 0 ? unitLabels.join(", ") : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">{g.type.replace(/-/g, " ")}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(g.expectedAmount, prop?.currencyCode, prop?.locale)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(g.receivedAmount, prop?.currencyCode, prop?.locale)}</TableCell>
                      <TableCell><StatusBadge status={g.status} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
        </DashboardSection>
      )}

      {/* Leases Ending Soon */}
      {leasesEndingSoon.length > 0 && (
        <DashboardSection title={t("dashboard.leasesEndingSoon90")} icon={CalendarClock} iconClassName="text-destructive">
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
        </DashboardSection>
      )}
    </div>
  );
}
