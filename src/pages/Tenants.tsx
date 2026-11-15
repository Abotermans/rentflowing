import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Users, Plus, Search, Pencil, User, Building2 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Link } from "react-router-dom";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { TENANT_STATUS_ICONS } from "@/lib/filterIcons";
import { UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tenant, TenantStatus, TenantKind, getTenantFullName } from "@/types";
import { useSettings } from "@/context/SettingsContext";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { TenantDialog } from "@/components/tenants/TenantDialog";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePortfolioWriteAccess } from "@/hooks/use-portfolio-write-access";

const TENANT_STATUSES: { value: TenantStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "former", label: "Former" },
  { value: "applicant", label: "Applicant" },
];

export default function Tenants() {
  const { tenants, leases, units } = useAppData();
  const { t } = useSettings();
  const canWrite = usePortfolioWriteAccess();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterKind, setFilterKind] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  type TSortKey = "name" | "kind" | "email" | "phone" | "status" | "unit" | "lease";
  const { sort, toggle } = useTableSort<TSortKey>();

  const openAdd = () => { if (!canWrite) return; setEditingTenant(null); setSheetOpen(true); };
  const openEdit = (tenant: Tenant) => { if (!canWrite) return; setEditingTenant(tenant); setSheetOpen(true); };

  const filtered = tenants.filter(tn => {
    const name = getTenantFullName(tn).toLowerCase();
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      name.includes(q) ||
      tn.email.toLowerCase().includes(q) ||
      (tn.companyName ?? "").toLowerCase().includes(q);
    const matchStatus = filterStatus.length === 0 || filterStatus.includes(tn.status);
    const matchKind = filterKind.length === 0 || filterKind.includes(tn.kind);
    return matchSearch && matchStatus && matchKind;
  });

  const getActiveLeases = (tenantId: string) => leases
    .filter(l =>
      l.lifecycleStage === "active"
      && (l.primaryTenantId === tenantId || l.coTenantIds.includes(tenantId)),
    )
    .sort((a, b) => a.leaseReference.localeCompare(b.leaseReference));

  const sorted = sortRows(filtered, sort, (tenant, key) => {
    const activeLease = getActiveLeases(tenant.id)[0];
    const unit = activeLease ? units.find(u => u.id === activeLease.unitId) : null;
    switch (key) {
      case "name": return getTenantFullName(tenant);
      case "kind": return tenant.kind;
      case "email": return tenant.email;
      case "phone": return tenant.phone;
      case "status": return tenant.status;
      case "unit": return unit?.unitCode ?? null;
      case "lease": return activeLease?.leaseReference ?? null;
    }
  });

  const { pageItems, page, pageSize, setPage, setPageSize, total, totalPages, from, to } = usePagination(sorted);

  return (
    <div className="page-shell">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">{t("tenants.title")}</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative flex min-w-0 flex-1 sm:inline-flex sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("action.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 min-w-[180px] max-w-[400px] w-full [field-sizing:content]" />
          </div>
          {canWrite && <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-2" />{t("tenants.add")}</Button>}
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <MultiSelectFilter
            label={t("filter.status")}
            icon={UserCheck}
            values={filterStatus}
            onChange={setFilterStatus}
            options={TENANT_STATUSES.map(s => ({ value: s.value, label: s.label, icon: TENANT_STATUS_ICONS[s.value] }))}
          />
          <MultiSelectFilter
            label={t("filter.type")}
            icon={User}
            values={filterKind}
            onChange={setFilterKind}
            options={[
              { value: "individual", label: t("tenants.kind.individual"), icon: User },
              { value: "corporation", label: t("tenants.kind.corporation"), icon: Building2 },
            ]}
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap mt-1.5">
          {filtered.length} {t("tenants.title").toLowerCase()}
        </span>
      </div>

      {tenants.length === 0 ? (
        <EmptyState icon={Users} title={t("tenants.empty")} description={t("tenants.emptyDesc")} actionLabel={canWrite ? t("tenants.add") : undefined} onAction={canWrite ? openAdd : undefined} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title={t("filter.noResults")} description={t("filter.noResultsDesc")} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead className="w-[1%] whitespace-nowrap" sortKey="name" sort={sort} onSort={toggle}>{t("tenants.name")}</SortableTableHead>
                <SortableTableHead sortKey="kind" sort={sort} onSort={toggle}>{t("tenants.type")}</SortableTableHead>
                <SortableTableHead sortKey="email" sort={sort} onSort={toggle}>{t("tenants.email")}</SortableTableHead>
                <SortableTableHead sortKey="phone" sort={sort} onSort={toggle}>{t("tenants.phone")}</SortableTableHead>
                <SortableTableHead sortKey="status" sort={sort} onSort={toggle}>{t("filter.status")}</SortableTableHead>
                <SortableTableHead sortKey="unit" sort={sort} onSort={toggle}>{t("leases.unit")}</SortableTableHead>
                <SortableTableHead sortKey="lease" sort={sort} onSort={toggle}>{t("leases.title")}</SortableTableHead>
                {canWrite && <TableHead className="text-right">{t("tenants.actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map(tenant => {
                const activeLeases = getActiveLeases(tenant.id);
                const activeLease = activeLeases[0];
                const linkedUnits = Array.from(new Map(
                  activeLeases
                    .map(lease => units.find(unit => unit.id === lease.unitId))
                    .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit))
                    .map(unit => [unit.id, unit]),
                ).values());
                const unit = linkedUnits[0];
                return (
                  <TableRow key={tenant.id} className="cursor-pointer" onClick={() => window.location.href = `/tenants/${tenant.id}`}>
                    <TableCell className="w-[1%] whitespace-nowrap font-medium">{getTenantFullName(tenant)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1 font-normal">
                        {tenant.kind === "corporation"
                          ? <><Building2 className="h-3 w-3" />{t("tenants.kind.corporation")}</>
                          : <><User className="h-3 w-3" />{t("tenants.kind.individual")}</>}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{tenant.email}</TableCell>
                    <TableCell className="text-muted-foreground">{tenant.phone}</TableCell>
                    <TableCell><StatusBadge status={tenant.status} /></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        {unit ? <Link to={`/units/${unit.id}`} className="hover:underline" onClick={e => e.stopPropagation()}>{unit.unitCode}</Link> : "—"}
                        {linkedUnits.length > 1 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help rounded-sm bg-muted px-1.5 py-0.5 font-sans text-xs text-muted-foreground" tabIndex={0}>
                                +{linkedUnits.length - 1}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <div className="space-y-1">
                                {linkedUnits.map(linkedUnit => <div key={linkedUnit.id}>{linkedUnit.unitCode}</div>)}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        {activeLease ? <Link to={`/leases/${activeLease.id}`} className="hover:underline" onClick={e => e.stopPropagation()}>{activeLease.leaseReference}</Link> : "—"}
                        {activeLeases.length > 1 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help rounded-sm bg-muted px-1.5 py-0.5 font-sans text-xs text-muted-foreground" tabIndex={0}>
                                +{activeLeases.length - 1}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <div className="space-y-1">
                                {activeLeases.map(lease => <div key={lease.id}>{lease.leaseReference}</div>)}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    {canWrite && <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${getTenantFullName(tenant)}`} onClick={e => { e.stopPropagation(); openEdit(tenant); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    </TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={pageSize} total={total} totalPages={totalPages} from={from} to={to} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </Card>
      )}

      <TenantDialog open={canWrite && sheetOpen} onOpenChange={setSheetOpen} editingTenant={editingTenant} />
    </div>
  );
}
