import { useState, useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { exportToCSV } from "@/lib/exportCsv";
import { getTenantFullName, getLeaseStatus, GUARANTEE_TYPE_LABELS, isAncillaryUnitType } from "@/types";
import { MAINTENANCE_CATEGORY_LABELS, MAINTENANCE_PRIORITY_LABELS, MAINTENANCE_STATUS_LABELS } from "@/types/maintenance";
import type { MaintenanceCategory, MaintenancePriority, MaintenanceStatus } from "@/types/maintenance";
import { Download, Printer, BarChart3 } from "lucide-react";
import { formatMoneyGroups, sumMoneyByCurrency } from "@/lib/money";

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${accent ? "text-destructive" : "text-foreground"}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ReportToolbar({ count, onExport, label }: { count: number; onExport: () => void; label: string }) {
  return (
    <div className="flex items-center justify-between print:hidden">
      <p className="text-sm text-muted-foreground">{count} {label}</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onExport}><Download className="h-3.5 w-3.5 mr-1" />Export CSV</Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
      </div>
    </div>
  );
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-3 print:hidden">{children}</div>;
}

function PropertyFilter({ value, onChange, properties }: { value: string; onChange: (v: string) => void; properties: { id: string; name: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px] h-9 text-sm"><SelectValue placeholder="All Properties" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Properties</SelectItem>
        {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// ─── Rent Roll ───
function RentRollReport() {
  const { leases, properties, units, tenants, getGuaranteeByLease, getAncillaryLeaseUnits } = useAppData();
  const [propFilter, setPropFilter] = useState("all");

  const data = useMemo(() => {
    const active = leases.filter(l => l.lifecycleStage === "active");
    return (propFilter === "all" ? active : active.filter(l => l.propertyId === propFilter)).map(l => {
      const prop = properties.find(p => p.id === l.propertyId);
      const unit = units.find(u => u.id === l.unitId);
      const tenant = tenants.find(t => t.id === l.primaryTenantId);
      const guarantee = getGuaranteeByLease(l.id);
      const total = l.monthlyRent + l.monthlyCharges;
      const ancillaryCount = getAncillaryLeaseUnits(l.id, { activeOnly: true }).length;
      return { l, prop, unit, tenant, guarantee, total, ancillaryCount };
    });
  }, [leases, properties, units, tenants, getGuaranteeByLease, getAncillaryLeaseUnits, propFilter]);

  const rentGroups = sumMoneyByCurrency(data.map(d => ({ amount: d.l.monthlyRent, currencyCode: d.prop?.currencyCode ?? "EUR", locale: d.prop?.locale })));
  const chargesGroups = sumMoneyByCurrency(data.map(d => ({ amount: d.l.monthlyCharges, currencyCode: d.prop?.currencyCode ?? "EUR", locale: d.prop?.locale })));
  const incomeGroups = sumMoneyByCurrency(data.map(d => ({ amount: d.total, currencyCode: d.prop?.currencyCode ?? "EUR", locale: d.prop?.locale })));

  const doExport = () => exportToCSV("rent-roll", ["Reference", "Property", "Unit", "Tenant", "Rent", "Charges", "Total", "Guarantee Status"], data.map(d => [
    d.l.leaseReference, d.prop?.name ?? "", d.unit?.unitCode ?? "", d.tenant ? getTenantFullName(d.tenant) : "",
    formatCurrency(d.l.monthlyRent, d.prop?.currencyCode, d.prop?.locale),
    formatCurrency(d.l.monthlyCharges, d.prop?.currencyCode, d.prop?.locale),
    formatCurrency(d.total, d.prop?.currencyCode, d.prop?.locale),
    d.guarantee?.status ?? "none",
  ]));

  return (
    <div className="space-y-4">
      <FilterBar><PropertyFilter value={propFilter} onChange={setPropFilter} properties={properties} /></FilterBar>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active Leases" value={String(data.length)} />
        <KpiCard label="Total Monthly Rent" value={formatMoneyGroups(rentGroups)} />
        <KpiCard label="Total Monthly Charges" value={formatMoneyGroups(chargesGroups)} />
        <KpiCard label="Total Monthly Income" value={formatMoneyGroups(incomeGroups)} />
      </div>
      <ReportToolbar count={data.length} onExport={doExport} label="leases" />
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">Reference</TableHead><TableHead className="text-xs">Property</TableHead>
            <TableHead className="text-xs">Unit</TableHead><TableHead className="text-xs">Tenant</TableHead>
            <TableHead className="text-xs text-right">Rent</TableHead><TableHead className="text-xs text-right">Charges</TableHead>
            <TableHead className="text-xs text-right">Total</TableHead><TableHead className="text-xs">Guarantee Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No active leases found.</TableCell></TableRow>
            ) : data.map(d => (
              <TableRow key={d.l.id}>
                <TableCell className="font-mono text-xs text-muted-foreground"><Link to={`/leases/${d.l.id}`} className="hover:underline">{d.l.leaseReference}</Link></TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.prop?.name ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {d.unit?.unitCode ?? "—"}
                  {d.ancillaryCount > 0 && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      +{d.ancillaryCount}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.tenant ? <Link to={`/tenants/${d.tenant.id}`} className="hover:underline">{getTenantFullName(d.tenant)}</Link> : "—"}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(d.l.monthlyRent, d.prop?.currencyCode, d.prop?.locale)}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(d.l.monthlyCharges, d.prop?.currencyCode, d.prop?.locale)}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(d.total, d.prop?.currencyCode, d.prop?.locale)}</TableCell>
                <TableCell><StatusBadge status={d.guarantee?.status ?? "none"} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ─── Occupancy ───
function OccupancyReport() {
  const { units, properties, tenants, getActiveLease, getActiveLeaseAssignmentForUnit } = useAppData();
  const { t } = useSettings();
  const [propFilter, setPropFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const data = useMemo(() => {
    let filtered = units;
    if (propFilter !== "all") filtered = filtered.filter(u => u.propertyId === propFilter);
    const rows = filtered.map(u => {
      const prop = properties.find(p => p.id === u.propertyId);
      const a = getActiveLeaseAssignmentForUnit(u.id);
      const lease = a?.lease ?? getActiveLease(u.id);
      const tenant = lease ? tenants.find(t => t.id === lease.primaryTenantId) : null;
      const role: "primary" | "ancillary" | null = a ? (isAncillaryUnitType(u.unitType) ? "ancillary" : "primary") : null;
      const displayStatus = role ? "occupied" : (u.currentStatus === "reserved" || u.currentStatus === "unavailable" || u.currentStatus === "archived" ? u.currentStatus : "vacant");
      return { u, prop, lease, tenant, role, displayStatus };
    });
    return statusFilter === "all" ? rows : rows.filter(d => d.displayStatus === statusFilter);
  }, [units, properties, tenants, getActiveLease, getActiveLeaseAssignmentForUnit, propFilter, statusFilter]);

  const occupiedPrimary = data.filter(d => d.role === "primary").length;
  const occupiedAncillary = data.filter(d => d.role === "ancillary").length;
  const vacant = data.filter(d => d.displayStatus === "vacant").length;
  const rate = data.length > 0 ? Math.round((occupiedPrimary / data.length) * 100) : 0;

  const doExport = () => exportToCSV("occupancy", ["Unit", "Property", "Type", "Status", "Tenant", "Rent"], data.map(d => [
    d.u.unitCode, d.prop?.name ?? "", d.u.unitType, d.displayStatus,
    d.tenant ? getTenantFullName(d.tenant) : "",
    d.lease ? formatCurrency(d.lease.monthlyRent, d.prop?.currencyCode, d.prop?.locale) : "",
  ]));

  return (
    <div className="space-y-4">
      <FilterBar>
        <PropertyFilter value={propFilter} onChange={setPropFilter} properties={properties} />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="occupied">Occupied</SelectItem>
            <SelectItem value="vacant">Vacant</SelectItem>
            <SelectItem value="reserved">Reserved</SelectItem>
            <SelectItem value="unavailable">Unavailable</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Units" value={String(data.length)} />
        <KpiCard label={t("reports.occupiedPrimary")} value={String(occupiedPrimary)} />
        <KpiCard label={t("reports.ancillaryLeased")} value={String(occupiedAncillary)} />
        <KpiCard label="Vacant" value={String(vacant)} />
        <KpiCard label="Occupancy Rate" value={`${rate}%`} />
      </div>
      <ReportToolbar count={data.length} onExport={doExport} label="units" />
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">Unit</TableHead><TableHead className="text-xs">Property</TableHead>
            <TableHead className="text-xs">Type</TableHead><TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Tenant</TableHead><TableHead className="text-xs text-right">Rent</TableHead>
            <TableHead className="text-xs">Available From</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No units found.</TableCell></TableRow>
            ) : data.map(d => (
              <TableRow key={d.u.id}>
                <TableCell className="font-mono text-xs text-muted-foreground"><Link to={`/units/${d.u.id}`} className="hover:underline">{d.u.unitCode}</Link></TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.prop?.name ?? "—"}</TableCell>
                <TableCell className="text-xs capitalize text-muted-foreground">{d.u.unitType.replace(/-/g, " ")}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={d.displayStatus} />
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.tenant ? <Link to={`/tenants/${d.tenant.id}`} className="hover:underline">{getTenantFullName(d.tenant)}</Link> : "—"}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{d.lease ? formatCurrency(d.lease.monthlyRent, d.prop?.currencyCode, d.prop?.locale) : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{d.u.availableFrom ? formatDate(d.u.availableFrom, d.prop?.locale) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ─── Overdue ───
function OverdueReport() {
  const { leases, properties, tenants, receivableItems } = useAppData();
  const [propFilter, setPropFilter] = useState("all");

  const data = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const activeLeases = leases.filter(l => l.lifecycleStage === "active");
    const tenantIds = [...new Set(receivableItems.filter(ri => ri.tenantId).map(ri => ri.tenantId as string))];
    return tenantIds.map(tid => {
      const tenant = tenants.find(t => t.id === tid);
      const relevant = receivableItems.filter(ri =>
        ri.tenantId === tid &&
        ri.outstandingAmount > 0 &&
        (propFilter === "all" || ri.propertyId === propFilter),
      );
      const overdueItems = relevant.filter(ri => ri.dueDate < today);
      const overdueGroups = sumMoneyByCurrency(overdueItems.map(ri => ({ amount: ri.outstandingAmount, currencyCode: ri.currencyCode })));
      const outstandingGroups = sumMoneyByCurrency(relevant.map(ri => ({ amount: ri.outstandingAmount, currencyCode: ri.currencyCode })));
      const overdueSort = overdueItems.reduce((s, ri) => s + ri.outstandingAmount, 0);
      const lease = activeLeases.find(l => l.primaryTenantId === tid);
      const prop = lease ? properties.find(p => p.id === lease.propertyId) : undefined;
      return { tenant, overdueGroups, outstandingGroups, overdueSort, lease, prop };
    }).filter(d => d.overdueSort > 0 && d.tenant);
  }, [leases, properties, tenants, receivableItems, propFilter]);

  const totalOverdueGroups = sumMoneyByCurrency(data.flatMap(d => d.overdueGroups.map(g => ({ amount: g.amount, currencyCode: g.currencyCode, locale: g.locale }))));
  const totalOutstandingGroups = sumMoneyByCurrency(data.flatMap(d => d.outstandingGroups.map(g => ({ amount: g.amount, currencyCode: g.currencyCode, locale: g.locale }))));

  const doExport = () => exportToCSV("overdue", ["Tenant", "Lease", "Property", "Overdue", "Outstanding"], data.map(d => [
    d.tenant ? getTenantFullName(d.tenant) : "", d.lease?.leaseReference ?? "", d.prop?.name ?? "",
    formatMoneyGroups(d.overdueGroups),
    formatMoneyGroups(d.outstandingGroups),
  ]));

  return (
    <div className="space-y-4">
      <FilterBar><PropertyFilter value={propFilter} onChange={setPropFilter} properties={properties} /></FilterBar>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Overdue Tenants" value={String(data.length)} />
        <KpiCard label="Total Overdue" value={formatMoneyGroups(totalOverdueGroups)} accent />
        <KpiCard label="Total Outstanding" value={formatMoneyGroups(totalOutstandingGroups)} />
      </div>
      <ReportToolbar count={data.length} onExport={doExport} label="tenants" />
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">Tenant</TableHead><TableHead className="text-xs">Lease</TableHead>
            <TableHead className="text-xs">Property</TableHead>
            <TableHead className="text-xs text-right">Overdue</TableHead><TableHead className="text-xs text-right">Outstanding</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No overdue tenants.</TableCell></TableRow>
            ) : data.map(d => (
              <TableRow key={d.tenant!.id}>
                <TableCell className="text-sm text-muted-foreground"><Link to={`/tenants/${d.tenant!.id}`} className="hover:underline">{getTenantFullName(d.tenant!)}</Link></TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{d.lease ? <Link to={`/leases/${d.lease.id}`} className="hover:underline">{d.lease.leaseReference}</Link> : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.prop?.name ?? "—"}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{formatMoneyGroups(d.overdueGroups)}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{formatMoneyGroups(d.outstandingGroups)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ─── Lease Expiry ───
function LeaseExpiryReport() {
  const { leases, properties, tenants } = useAppData();
  const [propFilter, setPropFilter] = useState("all");
  const [range, setRange] = useState("90");

  const data = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + Number(range) * 24 * 60 * 60 * 1000);
    return leases
      .filter(l => l.lifecycleStage === "active" && new Date(l.endDate) <= cutoff)
      .filter(l => propFilter === "all" || l.propertyId === propFilter)
      .sort((a, b) => a.endDate.localeCompare(b.endDate))
      .map(l => {
        const prop = properties.find(p => p.id === l.propertyId);
        const tenant = tenants.find(t => t.id === l.primaryTenantId);
        const lifecycle = getLeaseStatus(l);
        const daysLeft = Math.ceil((new Date(l.endDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        return { l, prop, tenant, lifecycle, daysLeft };
      });
  }, [leases, properties, tenants, propFilter, range]);

  const underNotice = data.filter(d => d.l.noticeGiven).length;

  const doExport = () => exportToCSV("lease-expiry", ["Reference", "Tenant", "Property", "End Date", "Days Left", "Status", "Notice Given"], data.map(d => [
    d.l.leaseReference, d.tenant ? getTenantFullName(d.tenant) : "", d.prop?.name ?? "",
    d.l.endDate, String(d.daysLeft), d.lifecycle, d.l.noticeGiven ? "Yes" : "No",
  ]));

  return (
    <div className="space-y-4">
      <FilterBar>
        <PropertyFilter value={propFilter} onChange={setPropFilter} properties={properties} />
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Next 30 days</SelectItem>
            <SelectItem value="60">Next 60 days</SelectItem>
            <SelectItem value="90">Next 90 days</SelectItem>
            <SelectItem value="180">Next 180 days</SelectItem>
            <SelectItem value="365">Next 365 days</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Leases Expiring" value={String(data.length)} />
        <KpiCard label="Under Notice" value={String(underNotice)} />
        <KpiCard label="No Notice Yet" value={String(data.length - underNotice)} accent={data.length - underNotice > 0} />
      </div>
      <ReportToolbar count={data.length} onExport={doExport} label="leases" />
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">Reference</TableHead><TableHead className="text-xs">Tenant</TableHead>
            <TableHead className="text-xs">Property</TableHead><TableHead className="text-xs">End Date</TableHead>
            <TableHead className="text-xs text-right">Days Left</TableHead><TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Notice</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No leases expiring in this period.</TableCell></TableRow>
            ) : data.map(d => (
              <TableRow key={d.l.id}>
                <TableCell className="font-mono text-xs text-muted-foreground"><Link to={`/leases/${d.l.id}`} className="hover:underline">{d.l.leaseReference}</Link></TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.tenant ? getTenantFullName(d.tenant) : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.prop?.name ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(d.l.endDate, d.prop?.locale)}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{d.daysLeft}</TableCell>
                <TableCell><StatusBadge status={d.lifecycle} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{d.l.noticeGiven ? "Yes" : "No"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ─── Deposits & Guarantees ───
function DepositsReport() {
  const { guarantees, leases, properties, tenants } = useAppData();
  const [propFilter, setPropFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const data = useMemo(() => {
    return guarantees
      .map(g => {
        const lease = leases.find(l => l.id === g.leaseId);
        const prop = lease ? properties.find(p => p.id === lease.propertyId) : undefined;
        const tenant = lease ? tenants.find(t => t.id === lease.primaryTenantId) : undefined;
        return { g, lease, prop, tenant };
      })
      .filter(d => propFilter === "all" || d.prop?.id === propFilter)
      .filter(d => statusFilter === "all" || d.g.status === statusFilter);
  }, [guarantees, leases, properties, tenants, propFilter, statusFilter]);

  const expectedGroups = sumMoneyByCurrency(data.map(d => ({ amount: d.g.expectedAmount, currencyCode: d.prop?.currencyCode ?? "EUR", locale: d.prop?.locale })));
  const receivedGroups = sumMoneyByCurrency(data.map(d => ({ amount: d.g.receivedAmount, currencyCode: d.prop?.currencyCode ?? "EUR", locale: d.prop?.locale })));
  const pending = data.filter(d => d.g.status === "pending" || d.g.status === "incomplete").length;

  const doExport = () => exportToCSV("deposits", ["Lease", "Tenant", "Property", "Type", "Expected", "Received", "Status"], data.map(d => [
    d.lease?.leaseReference ?? "", d.tenant ? getTenantFullName(d.tenant) : "", d.prop?.name ?? "",
    GUARANTEE_TYPE_LABELS[d.g.type],
    formatCurrency(d.g.expectedAmount, d.prop?.currencyCode, d.prop?.locale),
    formatCurrency(d.g.receivedAmount, d.prop?.currencyCode, d.prop?.locale),
    d.g.status,
  ]));

  return (
    <div className="space-y-4">
      <FilterBar>
        <PropertyFilter value={propFilter} onChange={setPropFilter} properties={properties} />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="incomplete">Incomplete</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="released">Released</SelectItem>
            <SelectItem value="partially-retained">Partially Retained</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Guarantees" value={String(data.length)} />
        <KpiCard label="Expected" value={formatMoneyGroups(expectedGroups)} />
        <KpiCard label="Received" value={formatMoneyGroups(receivedGroups)} />
        <KpiCard label="Pending / Incomplete" value={String(pending)} accent={pending > 0} />
      </div>
      <ReportToolbar count={data.length} onExport={doExport} label="guarantees" />
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">Lease</TableHead><TableHead className="text-xs">Tenant</TableHead>
            <TableHead className="text-xs">Property</TableHead><TableHead className="text-xs">Type</TableHead>
            <TableHead className="text-xs text-right">Expected</TableHead><TableHead className="text-xs text-right">Received</TableHead>
            <TableHead className="text-xs">Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No guarantees found.</TableCell></TableRow>
            ) : data.map(d => (
              <TableRow key={d.g.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{d.lease ? <Link to={`/leases/${d.lease.id}`} className="hover:underline">{d.lease.leaseReference}</Link> : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.tenant ? getTenantFullName(d.tenant) : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.prop?.name ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{GUARANTEE_TYPE_LABELS[d.g.type]}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(d.g.expectedAmount, d.prop?.currencyCode, d.prop?.locale)}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(d.g.receivedAmount, d.prop?.currencyCode, d.prop?.locale)}</TableCell>
                <TableCell><StatusBadge status={d.g.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ─── Maintenance Backlog ───
function MaintenanceBacklogReport() {
  const { tickets, properties, units, vendors } = useAppData();
  const [propFilter, setPropFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [prioFilter, setPrioFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const data = useMemo(() => {
    const now = new Date();
    return tickets
      .filter(t => propFilter === "all" || t.propertyId === propFilter)
      .filter(t => catFilter === "all" || t.category === catFilter)
      .filter(t => prioFilter === "all" || t.priority === prioFilter)
      .filter(t => statusFilter === "all" || t.status === statusFilter)
      .map(t => {
        const prop = properties.find(p => p.id === t.propertyId);
        const unit = units.find(u => u.id === t.unitId);
        const vendor = t.assignedVendorId ? vendors.find(v => v.id === t.assignedVendorId) : null;
        const ageDays = Math.ceil((now.getTime() - new Date(t.createdDate).getTime()) / (24 * 60 * 60 * 1000));
        return { t, prop, unit, vendor, ageDays };
      })
      .sort((a, b) => {
        const prioOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (prioOrder[a.t.priority] ?? 3) - (prioOrder[b.t.priority] ?? 3);
      });
  }, [tickets, properties, units, vendors, propFilter, catFilter, prioFilter, statusFilter]);

  const urgent = data.filter(d => d.t.priority === "urgent" || d.t.priority === "high").length;
  const unassigned = data.filter(d => !d.t.assignedVendorId).length;
  const avgAge = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.ageDays, 0) / data.length) : 0;

  const doExport = () => exportToCSV("maintenance-backlog", ["Title", "Property", "Unit", "Category", "Priority", "Status", "Vendor", "Age (days)", "Created"], data.map(d => [
    d.t.title, d.prop?.name ?? "", d.unit?.unitCode ?? "",
    MAINTENANCE_CATEGORY_LABELS[d.t.category], MAINTENANCE_PRIORITY_LABELS[d.t.priority], MAINTENANCE_STATUS_LABELS[d.t.status],
    d.vendor?.vendorName ?? "", String(d.ageDays), d.t.createdDate,
  ]));

  return (
    <div className="space-y-4">
      <FilterBar>
        <PropertyFilter value={propFilter} onChange={setPropFilter} properties={properties} />
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {(Object.entries(MAINTENANCE_CATEGORY_LABELS) as [MaintenanceCategory, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={prioFilter} onValueChange={setPrioFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder="All Priorities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {(Object.entries(MAINTENANCE_PRIORITY_LABELS) as [MaintenancePriority, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {(Object.entries(MAINTENANCE_STATUS_LABELS) as [MaintenanceStatus, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Open Tickets" value={String(data.length)} />
        <KpiCard label="High / Urgent" value={String(urgent)} accent={urgent > 0} />
        <KpiCard label="Unassigned" value={String(unassigned)} accent={unassigned > 0} />
        <KpiCard label="Avg. Age (days)" value={String(avgAge)} />
      </div>
      <ReportToolbar count={data.length} onExport={doExport} label="tickets" />
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">Title</TableHead><TableHead className="text-xs">Property</TableHead>
            <TableHead className="text-xs">Unit</TableHead><TableHead className="text-xs">Category</TableHead>
            <TableHead className="text-xs">Priority</TableHead><TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Vendor</TableHead><TableHead className="text-xs text-right">Age</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No open tickets.</TableCell></TableRow>
            ) : data.map(d => (
              <TableRow key={d.t.id}>
                <TableCell className="text-sm text-muted-foreground"><Link to={`/maintenance/${d.t.id}`} className="hover:underline">{d.t.title}</Link></TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.prop?.name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{d.unit?.unitCode ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{MAINTENANCE_CATEGORY_LABELS[d.t.category]}</TableCell>
                <TableCell><StatusBadge status={d.t.priority} /></TableCell>
                <TableCell><StatusBadge status={d.t.status} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.vendor ? <Link to={`/vendors/${d.vendor.id}`} className="hover:underline">{d.vendor.vendorName}</Link> : "—"}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{d.ageDays}d</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ─── Main ───
export default function Reports() {
  const { t } = useSettings();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("reports.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("reports.subtitle")}</p>
      </div>

      <Tabs defaultValue="rent-roll" className="space-y-4">
        <TabsList className="print:hidden">
          <TabsTrigger value="rent-roll">{t("reports.rentRoll")}</TabsTrigger>
          <TabsTrigger value="occupancy">{t("reports.occupancy")}</TabsTrigger>
          <TabsTrigger value="overdue">{t("reports.overdue")}</TabsTrigger>
          <TabsTrigger value="lease-expiry">{t("reports.leaseExpiry")}</TabsTrigger>
          <TabsTrigger value="deposits">{t("reports.deposits")}</TabsTrigger>
          <TabsTrigger value="maintenance">{t("maintenance.title")}</TabsTrigger>
        </TabsList>

        <TabsContent value="rent-roll"><RentRollReport /></TabsContent>
        <TabsContent value="occupancy"><OccupancyReport /></TabsContent>
        <TabsContent value="overdue"><OverdueReport /></TabsContent>
        <TabsContent value="lease-expiry"><LeaseExpiryReport /></TabsContent>
        <TabsContent value="deposits"><DepositsReport /></TabsContent>
        <TabsContent value="maintenance"><MaintenanceBacklogReport /></TabsContent>
      </Tabs>
    </div>
  );
}
