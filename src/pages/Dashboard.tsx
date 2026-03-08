import { useAppData } from "@/context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Building2, DoorOpen, CheckCircle2, XCircle, Clock, Ban, TrendingUp, CalendarClock, Globe, Landmark, Settings2, FileText, Users, AlertTriangle, CreditCard, Shield, Bell, Truck, Home, PackageCheck, Wrench, ArrowRightLeft, Banknote, Receipt } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, formatCurrency, getCountryName, getPropertyTypeLabel } from "@/lib/formatters";
import { getTenantFullName, getLeaseLifecycleStatus, getMoveInStatus, getMoveOutStatus } from "@/types";
import { useSettings } from "@/context/SettingsContext";
import type { TranslationKey } from "@/i18n/translations";

export default function Dashboard() {
  const { properties, units, leases, tenants, getPropertyStats, receivableItems, cashReceipts, getTenantOutstanding, guarantees, tickets, costEntries, costAllocationResults } = useAppData();
  const { t } = useSettings();

  // Maintenance KPIs
  const openTicketsCount = tickets.filter(tk => tk.status !== "completed" && tk.status !== "cancelled").length;
  const urgentTicketsCount = tickets.filter(tk => (tk.priority === "urgent" || tk.priority === "high") && tk.status !== "completed" && tk.status !== "cancelled").length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const completedThisMonth = tickets.filter(tk => tk.status === "completed" && tk.completedDate?.startsWith(thisMonth)).length;

  const totalUnits = units.length;
  const occupied = units.filter(u => u.currentStatus === "occupied").length;
  const vacant = units.filter(u => u.currentStatus === "vacant").length;
  const reserved = units.filter(u => u.currentStatus === "reserved").length;
  const unavailable = units.filter(u => u.currentStatus === "unavailable").length;
  const occupancyRate = totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0;

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in30Str = in30Days.toISOString().split("T")[0];

  const activeLeases = leases.filter(l => l.leaseStatus === "active");
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

  const kpiSections = [
    {
      title: t("dashboard.portfolio"),
      items: [
        { label: t("dashboard.totalProperties"), value: properties.length, icon: Building2, color: "text-primary" },
        { label: t("dashboard.totalUnits"), value: totalUnits, icon: DoorOpen, color: "text-foreground" },
        { label: t("dashboard.occupied"), value: occupied, icon: CheckCircle2, color: "text-success" },
        { label: t("dashboard.occupancyRate"), value: `${occupancyRate}%`, icon: TrendingUp, color: "text-success" },
      ],
    },
    {
      title: t("dashboard.leasesSection"),
      items: [
        { label: t("dashboard.activeLeases"), value: activeLeases.length, icon: FileText, color: "text-primary" },
        { label: t("dashboard.endingSoon"), value: leasesEndingSoon.length, icon: CalendarClock, color: leasesEndingSoon.length > 0 ? "text-destructive" : "text-foreground" },
        { label: t("dashboard.underNotice"), value: leasesUnderNotice.length, icon: Bell, color: leasesUnderNotice.length > 0 ? "text-warning" : "text-foreground" },
        { label: t("dashboard.vacantUnits"), value: vacant, icon: XCircle, color: "text-warning" },
      ],
    },
    {
      title: t("dashboard.financial"),
      items: [
        { label: "Open Receivables", value: formatCurrency(totalOpenReceivables), icon: FileText, color: "text-primary", isText: true },
        { label: t("dashboard.totalOverdue"), value: formatCurrency(totalOverdue), icon: AlertTriangle, color: totalOverdue > 0 ? "text-destructive" : "text-foreground", isText: true },
        { label: "Unmatched Receipts", value: unmatchedReceiptsCount, icon: ArrowRightLeft, color: unmatchedReceiptsCount > 0 ? "text-warning" : "text-foreground" },
        { label: "Unapplied Credit", value: formatCurrency(unappliedCreditTotal), icon: CreditCard, color: unappliedCreditTotal > 0 ? "text-primary" : "text-foreground", isText: true },
      ],
    },
    {
      title: t("dashboard.operations"),
      items: [
        { label: t("dashboard.openTickets"), value: openTicketsCount, icon: Wrench, color: openTicketsCount > 0 ? "text-warning" : "text-foreground" },
        { label: t("dashboard.urgentTickets"), value: urgentTicketsCount, icon: Wrench, color: urgentTicketsCount > 0 ? "text-destructive" : "text-foreground" },
        { label: t("dashboard.pendingMoveIns"), value: upcomingMoveIns.length, icon: Home, color: upcomingMoveIns.length > 0 ? "text-primary" : "text-foreground" },
        { label: t("dashboard.pendingMoveOuts"), value: upcomingMoveOuts.length, icon: PackageCheck, color: upcomingMoveOuts.length > 0 ? "text-warning" : "text-foreground" },
      ],
    },
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

      {kpiSections.map(section => (
        <div key={section.title}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{section.title}</p>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {section.items.map(k => (
              <Card key={k.label}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{k.label}</p>
                      <p className={`font-bold text-foreground mt-1 ${(k as any).isText ? "text-lg" : "text-2xl"}`}>{k.value}</p>
                    </div>
                    <k.icon className={`h-5 w-5 ${k.color}`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("dashboard.unitsByStatus")}</CardTitle></CardHeader>
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
                    <span className="text-muted-foreground">{t(`status.${s.status}` as TranslationKey)}</span>
                    <span className="font-medium text-foreground">{s.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("dashboard.noUnits")}</p>
          )}
        </CardContent>
      </Card>

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
                  <TableHead className="text-xs text-right">{t("table.overdue")}</TableHead>
                  <TableHead className="text-xs text-right">{t("table.outstanding")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdueTenants.map(({ tenant: tn, overdue, outstanding, lease: l, prop }) => (
                  <TableRow key={tn!.id}>
                    <TableCell className="text-sm font-medium"><Link to={`/tenants/${tn!.id}`} className="hover:underline text-foreground">{getTenantFullName(tn!)}</Link></TableCell>
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

      {/* Active Leases */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("dashboard.activeLeases")}</CardTitle></CardHeader>
        <CardContent>
          {activeLeases.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("dashboard.noActiveLeases")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("table.reference")}</TableHead>
                  <TableHead className="text-xs">{t("table.tenant")}</TableHead>
                  <TableHead className="text-xs">{t("table.property")}</TableHead>
                  <TableHead className="text-xs">{t("table.unit")}</TableHead>
                  <TableHead className="text-xs">{t("table.endDate")}</TableHead>
                  <TableHead className="text-xs text-right">{t("table.monthlyTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeLeases.map(l => {
                  const tenant = tenants.find(tn => tn.id === l.primaryTenantId);
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

      {/* Vacancy Overview by Property */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("dashboard.vacancyOverview")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t("table.property")}</TableHead>
                <TableHead className="text-xs text-center">{t("table.total")}</TableHead>
                <TableHead className="text-xs text-center">{t("table.occupied")}</TableHead>
                <TableHead className="text-xs text-center">{t("table.vacant")}</TableHead>
                <TableHead className="text-xs text-right">{t("properties.occupancy")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vacancyOverview.map(v => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium"><Link to={`/properties/${v.id}`} className="hover:underline text-foreground">{v.name}</Link></TableCell>
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
              <CardTitle className="text-sm font-medium">{t("dashboard.portfolioByCountry")}</CardTitle>
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
              <CardTitle className="text-sm font-medium">{t("dashboard.propertiesByType")}</CardTitle>
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
              <CardTitle className="text-sm font-medium">{t("dashboard.portfolioConfig")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{t("dashboard.currencies")}</span><span className="text-sm font-medium text-foreground">{[...new Set(properties.map(p => p.currencyCode))].join(", ") || "—"}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{t("dashboard.locales")}</span><span className="text-sm font-medium text-foreground">{[...new Set(properties.map(p => p.locale))].join(", ") || "—"}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{t("dashboard.measurementLabel")}</span><span className="text-sm font-medium text-foreground capitalize">{[...new Set(properties.map(p => p.measurementSystem))].join(", ") || "—"}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
