import { useState, useMemo } from "react";
import { calendarDaysBetweenISO } from "@/lib/calendarToday";
import { propertyBusinessDateISO } from "@/lib/businessTimeZone";
import { getOccupancyRate } from "@/lib/occupancy";
import { useBusinessNow } from "@/hooks/use-business-now";
import { isLeaseEndingWithinDays } from "@/lib/leaseExpiry";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { exportToCSV } from "@/lib/exportCsv";
import { getTenantFullName, getLeaseStatus, isAncillaryUnitType, type GuaranteeStatus, type GuaranteeType, type LeaseStatus, type UnitStatus, type UnitType } from "@/types";
import { MAINTENANCE_CATEGORY_KEYS, MAINTENANCE_PRIORITY_KEYS, MAINTENANCE_STATUS_KEYS } from "@/types/maintenance";
import type { MaintenanceCategory, MaintenancePriority, MaintenanceStatus } from "@/types/maintenance";
import type { TranslationKey } from "@/i18n/translations";
import { AlertTriangle, Download, Printer, BarChart3 } from "lucide-react";
import { formatMoneyGroups, sumMoneyByCurrency } from "@/lib/money";
import { getCurrentUnitRentShares, getIndexedMonthlyRent } from "@/lib/leaseIndexation";
import { hasContractualCharges } from "@/lib/leasePricing";
import { isReceivableOutstanding } from "@/types/receivables";

const unitTypeKeys: Record<UnitType, TranslationKey> = {
  apartment: "units.apartment", studio: "units.studio", office: "units.office",
  parking: "units.parking", storage: "units.storage", house: "units.house",
  "commercial-unit": "units.commercialUnit",
};
const guaranteeTypeKeys: Record<GuaranteeType, TranslationKey> = {
  "cash-deposit": "guarantee.type.cashDeposit",
  "bank-guarantee": "guarantee.type.bankGuarantee",
  "insurance-guarantee": "guarantee.type.insuranceGuarantee",
  "corporate-guarantee": "guarantee.type.corporateGuarantee",
};
const guaranteeStatusKeys: Record<GuaranteeStatus | "none", TranslationKey> = {
  pending: "status.pending", incomplete: "status.incomplete", active: "status.active",
  released: "status.released", "partially-retained": "status.partiallyRetained",
  none: "status.none",
};
const unitStatusKeys: Record<UnitStatus, TranslationKey> = {
  occupied: "status.occupied", vacant: "status.vacant",
  reserved: "status.reserved", unavailable: "status.unavailable",
  archived: "status.archived",
};
const leaseStatusKeys: Record<LeaseStatus, TranslationKey> = {
  draft: "status.draft", "pending-signature": "status.pendingSignature",
  signed: "status.signed", active: "status.active",
  "under-notice": "status.underNotice", "overdue-end": "status.overdueEnd",
  ended: "status.ended", terminated: "status.terminated",
};

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

function ReportToolbar({ count, onExport, singular, plural }: {
  count: number; onExport: () => void; singular: TranslationKey; plural: TranslationKey;
}) {
  const { t } = useSettings();
  return (
    <div className="flex items-center justify-between print:hidden">
      <p className="text-sm text-muted-foreground">{count} {t(count === 1 ? singular : plural)}</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onExport}><Download className="h-3.5 w-3.5 mr-1" />{t("action.export")}</Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" />{t("action.print")}</Button>
      </div>
    </div>
  );
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-3 print:hidden">{children}</div>;
}

function PropertyFilter({ value, onChange, properties }: { value: string; onChange: (v: string) => void; properties: { id: string; name: string }[] }) {
  const { t } = useSettings();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px] h-9 text-sm"><SelectValue placeholder={t("filter.allProperties")} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("filter.allProperties")}</SelectItem>
        {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// ─── Rent Roll ───
function RentRollReport() {
  const { leases, properties, tenants, getGuaranteeByLease, getLeaseAssignedUnits } = useAppData();
  const { t } = useSettings();
  const now = useBusinessNow();
  const [propFilter, setPropFilter] = useState("all");

  const { data, missingAssignmentLeases } = useMemo(() => {
    const missingAssignmentLeases: { id: string; leaseReference: string }[] = [];
    const data = leases.flatMap(l => {
      if (propFilter !== "all" && l.propertyId !== propFilter) return [];
      const prop = properties.find(p => p.id === l.propertyId);
      const onDate = propertyBusinessDateISO(prop, now);
      const status = getLeaseStatus(l, onDate);
      if (status !== "active" && status !== "under-notice") return [];
      const assignedUnits = getLeaseAssignedUnits(l.id, { activeOnly: true, onDate });
      if (assignedUnits.length === 0) {
        missingAssignmentLeases.push({ id: l.id, leaseReference: l.leaseReference });
        return [];
      }
      const unit = assignedUnits[0].unit;
      const tenant = tenants.find(t => t.id === l.primaryTenantId);
      const guarantee = getGuaranteeByLease(l.id);
      const currentRent = getIndexedMonthlyRent(l, onDate);
      const contractualCharges = hasContractualCharges(l) ? l.monthlyCharges : 0;
      const total = currentRent + contractualCharges;
      const additionalUnitCount = assignedUnits.length - 1;
      return [{ l, prop, unit, tenant, guarantee, currentRent, contractualCharges, total, additionalUnitCount }];
    });
    return { data, missingAssignmentLeases };
  }, [leases, properties, tenants, getGuaranteeByLease, getLeaseAssignedUnits, propFilter, now]);

  const rentGroups = sumMoneyByCurrency(data.map(d => ({ amount: d.currentRent, currencyCode: d.prop?.currencyCode ?? "EUR", locale: d.prop?.locale })));
  const chargesGroups = sumMoneyByCurrency(data.map(d => ({ amount: d.contractualCharges, currencyCode: d.prop?.currencyCode ?? "EUR", locale: d.prop?.locale })));
  const incomeGroups = sumMoneyByCurrency(data.map(d => ({ amount: d.total, currencyCode: d.prop?.currencyCode ?? "EUR", locale: d.prop?.locale })));

  const doExport = () => exportToCSV("rent-roll", [t("reports.reference"), t("reports.property"), t("reports.unit"), t("reports.tenant"), t("reports.rent"), t("reports.charges"), t("reports.total"), t("reports.guaranteeStatus")], data.map(d => [
    d.l.leaseReference, d.prop?.name ?? "", d.unit?.unitCode ?? "", d.tenant ? getTenantFullName(d.tenant) : "",
    formatCurrency(d.currentRent, d.prop?.currencyCode, d.prop?.locale),
    formatCurrency(d.contractualCharges, d.prop?.currencyCode, d.prop?.locale),
    formatCurrency(d.total, d.prop?.currencyCode, d.prop?.locale),
    t(guaranteeStatusKeys[d.guarantee?.status ?? "none"]),
  ]));

  return (
    <div className="space-y-4">
      <FilterBar><PropertyFilter value={propFilter} onChange={setPropFilter} properties={properties} /></FilterBar>
      {missingAssignmentLeases.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            {t("reports.rentRollMissingAssignments")}{" "}
            {missingAssignmentLeases.map((lease, index) => (
              <span key={lease.id}>
                {index > 0 && ", "}
                <Link to={`/leases/${lease.id}`} className="font-medium underline hover:text-foreground">{lease.leaseReference}</Link>
              </span>
            ))}
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t("reports.activeLeases")} value={String(data.length)} />
        <KpiCard label={t("reports.totalMonthlyRent")} value={formatMoneyGroups(rentGroups)} />
        <KpiCard label={t("reports.totalMonthlyCharges")} value={formatMoneyGroups(chargesGroups)} />
        <KpiCard label={t("reports.totalMonthlyIncome")} value={formatMoneyGroups(incomeGroups)} />
      </div>
      <ReportToolbar count={data.length} onExport={doExport} singular="reports.countLease" plural="reports.countLeases" />
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">{t("reports.reference")}</TableHead><TableHead className="text-xs">{t("reports.property")}</TableHead>
            <TableHead className="text-xs">{t("reports.unit")}</TableHead><TableHead className="text-xs">{t("reports.tenant")}</TableHead>
            <TableHead className="text-xs text-right">{t("reports.rent")}</TableHead><TableHead className="text-xs text-right">{t("reports.charges")}</TableHead>
            <TableHead className="text-xs text-right">{t("reports.total")}</TableHead><TableHead className="text-xs">{t("reports.guaranteeStatus")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{t("reports.noActiveLeases")}</TableCell></TableRow>
            ) : data.map(d => (
              <TableRow key={d.l.id}>
                <TableCell className="font-mono text-xs text-muted-foreground"><Link to={`/leases/${d.l.id}`} className="hover:underline">{d.l.leaseReference}</Link></TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.prop?.name ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {d.unit?.unitCode ?? "—"}
                  {d.additionalUnitCount > 0 && (
                    <span className="ml-1.5 text-xs uppercase text-muted-foreground">
                      +{d.additionalUnitCount}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.tenant ? <Link to={`/tenants/${d.tenant.id}`} className="hover:underline">{getTenantFullName(d.tenant)}</Link> : "—"}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(d.currentRent, d.prop?.currencyCode, d.prop?.locale)}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(d.contractualCharges, d.prop?.currencyCode, d.prop?.locale)}</TableCell>
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
  const { units, properties, tenants, getActiveLease, getActiveLeaseAssignmentForUnit, getLeaseAssignedUnits } = useAppData();
  const { t } = useSettings();
  const now = useBusinessNow();
  const [propFilter, setPropFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const data = useMemo(() => {
    let filtered = units;
    if (propFilter !== "all") filtered = filtered.filter(u => u.propertyId === propFilter);
    const rentSharesByLease = new Map<string, Map<string, number> | null>();
    const rows = filtered.map(u => {
      const prop = properties.find(p => p.id === u.propertyId);
      const onDate = propertyBusinessDateISO(prop, now);
      const a = getActiveLeaseAssignmentForUnit(u.id, onDate);
      const lease = a?.lease ?? getActiveLease(u.id, onDate);
      if (lease && !rentSharesByLease.has(lease.id)) {
        rentSharesByLease.set(lease.id, getCurrentUnitRentShares(
          lease,
          getLeaseAssignedUnits(lease.id, { activeOnly: true, onDate }).map(row => row.assignment),
          onDate,
        ));
      }
      const rent = lease ? rentSharesByLease.get(lease.id)?.get(u.id) : undefined;
      const tenant = lease ? tenants.find(t => t.id === lease.primaryTenantId) : null;
      const role: "primary" | "ancillary" | null = a ? (isAncillaryUnitType(u.unitType) ? "ancillary" : "primary") : null;
      const displayStatus: UnitStatus = role ? "occupied" : (u.currentStatus === "reserved" || u.currentStatus === "unavailable" || u.currentStatus === "archived" ? u.currentStatus : "vacant");
      return { u, prop, lease, tenant, role, displayStatus, rent };
    });
    return statusFilter === "all" ? rows : rows.filter(d => d.displayStatus === statusFilter);
  }, [units, properties, tenants, getActiveLease, getActiveLeaseAssignmentForUnit, getLeaseAssignedUnits, propFilter, statusFilter, now]);

  const occupiedPrimary = data.filter(d => d.role === "primary").length;
  const occupiedAncillary = data.filter(d => d.role === "ancillary").length;
  const vacant = data.filter(d => d.displayStatus === "vacant").length;
  const rate = getOccupancyRate(occupiedPrimary, occupiedAncillary, data.length);

  const doExport = () => exportToCSV("occupancy", [t("reports.unit"), t("reports.property"), t("reports.type"), t("reports.status"), t("reports.tenant"), t("reports.rent")], data.map(d => [
    d.u.unitCode, d.prop?.name ?? "", t(unitTypeKeys[d.u.unitType]), t(unitStatusKeys[d.displayStatus]),
    d.tenant ? getTenantFullName(d.tenant) : "",
    d.rent === undefined ? "" : formatCurrency(d.rent, d.prop?.currencyCode, d.prop?.locale),
  ]));

  return (
    <div className="space-y-4">
      <FilterBar>
        <PropertyFilter value={propFilter} onChange={setPropFilter} properties={properties} />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue placeholder={t("filter.allStatuses")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allStatuses")}</SelectItem>
            <SelectItem value="occupied">{t("status.occupied")}</SelectItem>
            <SelectItem value="vacant">{t("status.vacant")}</SelectItem>
            <SelectItem value="reserved">{t("status.reserved")}</SelectItem>
            <SelectItem value="unavailable">{t("status.unavailable")}</SelectItem>
            <SelectItem value="archived">{t("status.archived")}</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t("reports.totalUnits")} value={String(data.length)} />
        <KpiCard label={t("reports.occupiedPrimary")} value={String(occupiedPrimary)} />
        <KpiCard label={t("reports.ancillaryLeased")} value={String(occupiedAncillary)} />
        <KpiCard label={t("reports.vacant")} value={String(vacant)} />
        <KpiCard label={t("reports.occupancyRate")} value={`${rate}%`} />
      </div>
      <ReportToolbar count={data.length} onExport={doExport} singular="reports.countUnit" plural="reports.countUnits" />
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">{t("reports.unit")}</TableHead><TableHead className="text-xs">{t("reports.property")}</TableHead>
            <TableHead className="text-xs">{t("reports.type")}</TableHead><TableHead className="text-xs">{t("reports.status")}</TableHead>
            <TableHead className="text-xs">{t("reports.tenant")}</TableHead><TableHead className="text-xs text-right">{t("reports.rent")}</TableHead>
            <TableHead className="text-xs">{t("reports.availableFrom")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t("reports.noUnits")}</TableCell></TableRow>
            ) : data.map(d => (
              <TableRow key={d.u.id}>
                <TableCell className="font-mono text-xs text-muted-foreground"><Link to={`/units/${d.u.id}`} className="hover:underline">{d.u.unitCode}</Link></TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.prop?.name ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t(unitTypeKeys[d.u.unitType])}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={d.displayStatus} />
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.tenant ? <Link to={`/tenants/${d.tenant.id}`} className="hover:underline">{getTenantFullName(d.tenant)}</Link> : "—"}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{d.rent === undefined ? "—" : formatCurrency(d.rent, d.prop?.currencyCode, d.prop?.locale)}</TableCell>
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
  const { t } = useSettings();
  const [propFilter, setPropFilter] = useState("all");
  const now = useBusinessNow();

  const data = useMemo(() => {
    const groups = new Map<string, typeof receivableItems>();
    for (const item of receivableItems) {
      if (!item.tenantId || !isReceivableOutstanding(item) ||
          (propFilter !== "all" && item.propertyId !== propFilter)) continue;
      const key = JSON.stringify([item.tenantId, item.leaseId, item.propertyId]);
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }
    return [...groups.values()].map(relevant => {
      const first = relevant[0];
      const tenant = tenants.find(t => t.id === first.tenantId);
      const lease = leases.find(l => l.id === first.leaseId);
      const prop = properties.find(p => p.id === first.propertyId);
      const overdueItems = relevant.filter(ri => ri.dueDate < propertyBusinessDateISO(prop, now));
      const overdueGroups = sumMoneyByCurrency(overdueItems.map(ri => ({ amount: ri.outstandingAmount, currencyCode: ri.currencyCode })));
      const outstandingGroups = sumMoneyByCurrency(relevant.map(ri => ({ amount: ri.outstandingAmount, currencyCode: ri.currencyCode })));
      return { tenant, overdueGroups, outstandingGroups, hasOverdue: overdueItems.length > 0, lease, prop, key: JSON.stringify([first.tenantId, first.leaseId, first.propertyId]) };
    }).filter(d => d.hasOverdue && d.tenant);
  }, [leases, properties, tenants, receivableItems, propFilter, now]);

  const overdueTenantCount = new Set(data.map(d => d.tenant!.id)).size;
  const totalOverdueGroups = sumMoneyByCurrency(data.flatMap(d => d.overdueGroups.map(g => ({ amount: g.amount, currencyCode: g.currencyCode, locale: g.locale }))));
  const totalOutstandingGroups = sumMoneyByCurrency(data.flatMap(d => d.outstandingGroups.map(g => ({ amount: g.amount, currencyCode: g.currencyCode, locale: g.locale }))));

  const doExport = () => exportToCSV("overdue", [t("reports.tenant"), t("reports.lease"), t("reports.property"), t("reports.overdueAmount"), t("reports.outstandingAmount")], data.map(d => [
    d.tenant ? getTenantFullName(d.tenant) : "", d.lease?.leaseReference ?? "", d.prop?.name ?? "",
    formatMoneyGroups(d.overdueGroups),
    formatMoneyGroups(d.outstandingGroups),
  ]));

  return (
    <div className="space-y-4">
      <FilterBar><PropertyFilter value={propFilter} onChange={setPropFilter} properties={properties} /></FilterBar>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <KpiCard label={t("reports.overdueTenants")} value={String(overdueTenantCount)} />
        <KpiCard label={t("reports.totalOverdue")} value={formatMoneyGroups(totalOverdueGroups)} accent />
        <KpiCard label={t("reports.totalOutstanding")} value={formatMoneyGroups(totalOutstandingGroups)} />
      </div>
      <ReportToolbar count={data.length} onExport={doExport} singular="reports.countBalance" plural="reports.countBalances" />
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">{t("reports.tenant")}</TableHead><TableHead className="text-xs">{t("reports.lease")}</TableHead>
            <TableHead className="text-xs">{t("reports.property")}</TableHead>
            <TableHead className="text-xs text-right">{t("reports.overdueAmount")}</TableHead><TableHead className="text-xs text-right">{t("reports.outstandingAmount")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t("reports.noOverdueTenants")}</TableCell></TableRow>
            ) : data.map(d => (
              <TableRow key={d.key}>
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
  const { t } = useSettings();
  const [propFilter, setPropFilter] = useState("all");
  const [range, setRange] = useState("90");
  const now = useBusinessNow();

  const data = useMemo(() => {
    return leases
      .filter(l => isLeaseEndingWithinDays(l,
        propertyBusinessDateISO(properties.find(property => property.id === l.propertyId), now), Number(range)))
      .filter(l => propFilter === "all" || l.propertyId === propFilter)
      .sort((a, b) => a.endDate.localeCompare(b.endDate))
      .map(l => {
        const prop = properties.find(p => p.id === l.propertyId);
        const tenant = tenants.find(t => t.id === l.primaryTenantId);
        const propertyToday = propertyBusinessDateISO(prop, now);
        const lifecycle = getLeaseStatus(l, propertyToday);
        const daysLeft = calendarDaysBetweenISO(propertyToday, l.endDate);
        return { l, prop, tenant, lifecycle, daysLeft };
      });
  }, [leases, properties, tenants, propFilter, range, now]);

  const underNotice = data.filter(d => d.l.noticeGiven).length;

  const doExport = () => exportToCSV("lease-expiry", [t("reports.reference"), t("reports.tenant"), t("reports.property"), t("reports.endDate"), t("reports.daysLeft"), t("reports.status"), t("reports.noticeGiven")], data.map(d => [
    d.l.leaseReference, d.tenant ? getTenantFullName(d.tenant) : "", d.prop?.name ?? "",
    formatDate(d.l.endDate, d.prop?.locale), String(d.daysLeft), t(leaseStatusKeys[d.lifecycle]), d.l.noticeGiven ? t("reports.yes") : t("reports.no"),
  ]));

  return (
    <div className="space-y-4">
      <FilterBar>
        <PropertyFilter value={propFilter} onChange={setPropFilter} properties={properties} />
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">{t("reports.next30Days")}</SelectItem>
            <SelectItem value="60">{t("reports.next60Days")}</SelectItem>
            <SelectItem value="90">{t("reports.next90Days")}</SelectItem>
            <SelectItem value="180">{t("reports.next180Days")}</SelectItem>
            <SelectItem value="365">{t("reports.next365Days")}</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <KpiCard label={t("reports.leasesExpiring")} value={String(data.length)} />
        <KpiCard label={t("reports.underNotice")} value={String(underNotice)} />
        <KpiCard label={t("reports.noNoticeYet")} value={String(data.length - underNotice)} accent={data.length - underNotice > 0} />
      </div>
      <ReportToolbar count={data.length} onExport={doExport} singular="reports.countLease" plural="reports.countLeases" />
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">{t("reports.reference")}</TableHead><TableHead className="text-xs">{t("reports.tenant")}</TableHead>
            <TableHead className="text-xs">{t("reports.property")}</TableHead><TableHead className="text-xs">{t("reports.endDate")}</TableHead>
            <TableHead className="text-xs text-right">{t("reports.daysLeft")}</TableHead><TableHead className="text-xs">{t("reports.status")}</TableHead>
            <TableHead className="text-xs">{t("reports.notice")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t("reports.noExpiringLeases")}</TableCell></TableRow>
            ) : data.map(d => (
              <TableRow key={d.l.id}>
                <TableCell className="font-mono text-xs text-muted-foreground"><Link to={`/leases/${d.l.id}`} className="hover:underline">{d.l.leaseReference}</Link></TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.tenant ? getTenantFullName(d.tenant) : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.prop?.name ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(d.l.endDate, d.prop?.locale)}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{d.daysLeft}</TableCell>
                <TableCell><StatusBadge status={d.lifecycle} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{d.l.noticeGiven ? t("reports.yes") : t("reports.no")}</TableCell>
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
  const { t } = useSettings();
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

  const doExport = () => exportToCSV("deposits", [t("reports.lease"), t("reports.tenant"), t("reports.property"), t("reports.type"), t("reports.expected"), t("reports.received"), t("reports.status")], data.map(d => [
    d.lease?.leaseReference ?? "", d.tenant ? getTenantFullName(d.tenant) : "", d.prop?.name ?? "",
    t(guaranteeTypeKeys[d.g.type]),
    formatCurrency(d.g.expectedAmount, d.prop?.currencyCode, d.prop?.locale),
    formatCurrency(d.g.receivedAmount, d.prop?.currencyCode, d.prop?.locale),
    t(guaranteeStatusKeys[d.g.status]),
  ]));

  return (
    <div className="space-y-4">
      <FilterBar>
        <PropertyFilter value={propFilter} onChange={setPropFilter} properties={properties} />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue placeholder={t("filter.allStatuses")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allStatuses")}</SelectItem>
            <SelectItem value="pending">{t("status.pending")}</SelectItem>
            <SelectItem value="incomplete">{t("status.incomplete")}</SelectItem>
            <SelectItem value="active">{t("status.active")}</SelectItem>
            <SelectItem value="released">{t("status.released")}</SelectItem>
            <SelectItem value="partially-retained">{t("status.partiallyRetained")}</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t("reports.totalGuarantees")} value={String(data.length)} />
        <KpiCard label={t("reports.expected")} value={formatMoneyGroups(expectedGroups)} />
        <KpiCard label={t("reports.received")} value={formatMoneyGroups(receivedGroups)} />
        <KpiCard label={t("reports.pendingIncomplete")} value={String(pending)} accent={pending > 0} />
      </div>
      <ReportToolbar count={data.length} onExport={doExport} singular="reports.countGuarantee" plural="reports.countGuarantees" />
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">{t("reports.lease")}</TableHead><TableHead className="text-xs">{t("reports.tenant")}</TableHead>
            <TableHead className="text-xs">{t("reports.property")}</TableHead><TableHead className="text-xs">{t("reports.type")}</TableHead>
            <TableHead className="text-xs text-right">{t("reports.expected")}</TableHead><TableHead className="text-xs text-right">{t("reports.received")}</TableHead>
            <TableHead className="text-xs">{t("reports.status")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t("reports.noGuarantees")}</TableCell></TableRow>
            ) : data.map(d => (
              <TableRow key={d.g.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{d.lease ? <Link to={`/leases/${d.lease.id}`} className="hover:underline">{d.lease.leaseReference}</Link> : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.tenant ? getTenantFullName(d.tenant) : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.prop?.name ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t(guaranteeTypeKeys[d.g.type])}</TableCell>
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
  const { t } = useSettings();
  const now = useBusinessNow();
  const [propFilter, setPropFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [prioFilter, setPrioFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("backlog");

  const data = useMemo(() => {
    return tickets
      .filter(t => propFilter === "all" || t.propertyId === propFilter)
      .filter(t => catFilter === "all" || t.category === catFilter)
      .filter(t => prioFilter === "all" || t.priority === prioFilter)
      .filter(t => statusFilter === "all" || (statusFilter === "backlog"
        ? t.status !== "completed" && t.status !== "cancelled"
        : t.status === statusFilter))
      .map(t => {
        const prop = properties.find(p => p.id === t.propertyId);
        const unit = units.find(u => u.id === t.unitId);
        const vendor = t.assignedVendorId ? vendors.find(v => v.id === t.assignedVendorId) : null;
        const ageDays = Math.max(0, calendarDaysBetweenISO(t.createdDate, propertyBusinessDateISO(prop, now)));
        return { t, prop, unit, vendor, ageDays };
      })
      .sort((a, b) => {
        const prioOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (prioOrder[a.t.priority] ?? 3) - (prioOrder[b.t.priority] ?? 3);
      });
  }, [tickets, properties, units, vendors, propFilter, catFilter, prioFilter, statusFilter, now]);

  const urgent = data.filter(d => d.t.priority === "urgent" || d.t.priority === "high").length;
  const unassigned = data.filter(d => !d.t.assignedVendorId).length;
  const avgAge = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.ageDays, 0) / data.length) : 0;

  const doExport = () => exportToCSV("maintenance-backlog", [t("reports.titleColumn"), t("reports.property"), t("reports.unit"), t("reports.category"), t("reports.priority"), t("reports.status"), t("reports.vendor"), t("reports.ageDays"), t("reports.created")], data.map(d => [
    d.t.title, d.prop?.name ?? "", d.unit?.unitCode ?? "",
    t(MAINTENANCE_CATEGORY_KEYS[d.t.category]), t(MAINTENANCE_PRIORITY_KEYS[d.t.priority]), t(MAINTENANCE_STATUS_KEYS[d.t.status]),
    d.vendor?.vendorName ?? "", String(d.ageDays), formatDate(d.t.createdDate, d.prop?.locale),
  ]));

  return (
    <div className="space-y-4">
      <FilterBar>
        <PropertyFilter value={propFilter} onChange={setPropFilter} properties={properties} />
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder={t("filter.allCategories")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allCategories")}</SelectItem>
            {(Object.keys(MAINTENANCE_CATEGORY_KEYS) as MaintenanceCategory[]).map(k => <SelectItem key={k} value={k}>{t(MAINTENANCE_CATEGORY_KEYS[k])}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={prioFilter} onValueChange={setPrioFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder={t("filter.allPriorities")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allPriorities")}</SelectItem>
            {(Object.keys(MAINTENANCE_PRIORITY_KEYS) as MaintenancePriority[]).map(k => <SelectItem key={k} value={k}>{t(MAINTENANCE_PRIORITY_KEYS[k])}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder={t("filter.allStatuses")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="backlog">{t("reports.openBacklog")}</SelectItem>
            <SelectItem value="all">{t("filter.allStatuses")}</SelectItem>
            {(Object.keys(MAINTENANCE_STATUS_KEYS) as MaintenanceStatus[]).map(k => <SelectItem key={k} value={k}>{t(MAINTENANCE_STATUS_KEYS[k])}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t(statusFilter === "backlog" ? "reports.openTickets" : "reports.tickets")} value={String(data.length)} />
        <KpiCard label={t("reports.highUrgent")} value={String(urgent)} accent={urgent > 0} />
        <KpiCard label={t("reports.unassigned")} value={String(unassigned)} accent={unassigned > 0} />
        <KpiCard label={t("reports.averageAgeDays")} value={String(avgAge)} />
      </div>
      <ReportToolbar count={data.length} onExport={doExport} singular="reports.countTicket" plural="reports.countTickets" />
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">{t("reports.titleColumn")}</TableHead><TableHead className="text-xs">{t("reports.property")}</TableHead>
            <TableHead className="text-xs">{t("reports.unit")}</TableHead><TableHead className="text-xs">{t("reports.category")}</TableHead>
            <TableHead className="text-xs">{t("reports.priority")}</TableHead><TableHead className="text-xs">{t("reports.status")}</TableHead>
            <TableHead className="text-xs">{t("reports.vendor")}</TableHead><TableHead className="text-xs text-right">{t("reports.ageDays")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{t("reports.noOpenTickets")}</TableCell></TableRow>
            ) : data.map(d => (
              <TableRow key={d.t.id}>
                <TableCell className="text-sm text-muted-foreground"><Link to={`/maintenance/${d.t.id}`} className="hover:underline">{d.t.title}</Link></TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.prop?.name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{d.unit?.unitCode ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t(MAINTENANCE_CATEGORY_KEYS[d.t.category])}</TableCell>
                <TableCell><StatusBadge status={d.t.priority} /></TableCell>
                <TableCell><StatusBadge status={d.t.status} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.vendor ? <Link to={`/vendors/${d.vendor.id}`} className="hover:underline">{d.vendor.vendorName}</Link> : "—"}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{d.ageDays}</TableCell>
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
    <div className="page-shell">
      <div>
        <h1 className="page-title">{t("reports.title")}</h1>
        <p className="page-description">{t("reports.subtitle")}</p>
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
