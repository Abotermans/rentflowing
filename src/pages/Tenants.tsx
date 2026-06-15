import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Users, Plus, Search, Pencil } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Link } from "react-router-dom";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { TENANT_STATUS_ICONS } from "@/lib/filterIcons";
import { UserCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { Tenant, TenantStatus, getTenantFullName } from "@/types";
import { useSettings } from "@/context/SettingsContext";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { TenantDialog } from "@/components/tenants/TenantDialog";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";

const TENANT_STATUSES: { value: TenantStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "former", label: "Former" },
  { value: "applicant", label: "Applicant" },
];

export default function Tenants() {
  const { tenants, leases, units, deleteTenant } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  type TSortKey = "name" | "email" | "phone" | "status" | "unit" | "lease";
  const { sort, toggle } = useTableSort<TSortKey>();

  const openAdd = () => { setEditingTenant(null); setSheetOpen(true); };
  const openEdit = (tenant: Tenant) => { setEditingTenant(tenant); setSheetOpen(true); };

  const handleDelete = (tid: string) => {
    deleteTenant(tid);
    toast({ title: "Tenant deleted" });
  };

  const filtered = tenants.filter(t => {
    const name = getTenantFullName(t).toLowerCase();
    const q = search.toLowerCase();
    const matchSearch = !q || name.includes(q) || t.email.toLowerCase().includes(q);
    const matchStatus = filterStatus.length === 0 || filterStatus.includes(t.status);
    return matchSearch && matchStatus;
  });

  const getActiveLease = (tenantId: string) => leases.find(l => l.primaryTenantId === tenantId && l.lifecycleStage === "active");

  const sorted = sortRows(filtered, sort, (tenant, key) => {
    const activeLease = getActiveLease(tenant.id);
    const unit = activeLease ? units.find(u => u.id === activeLease.unitId) : null;
    switch (key) {
      case "name": return getTenantFullName(tenant);
      case "email": return tenant.email;
      case "phone": return tenant.phone;
      case "status": return tenant.status;
      case "unit": return unit?.unitCode ?? null;
      case "lease": return activeLease?.leaseReference ?? null;
    }
  });

  const { pageItems, page, pageSize, setPage, setPageSize, total, totalPages, from, to } = usePagination(sorted);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("tenants.title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative inline-flex">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("action.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 min-w-[180px] max-w-[400px] [field-sizing:content]" />
          </div>
          <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-2" />{t("tenants.add")}</Button>
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
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap mt-1.5">
          {filtered.length} {t("tenants.title").toLowerCase()}
        </span>
      </div>

      {tenants.length === 0 ? (
        <EmptyState icon={Users} title={t("tenants.empty")} description={t("tenants.emptyDesc")} actionLabel={t("tenants.add")} onAction={openAdd} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title={t("filter.noResults")} description={t("filter.noResultsDesc")} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="name" sort={sort} onSort={toggle}>{t("tenants.name")}</SortableTableHead>
                <SortableTableHead sortKey="email" sort={sort} onSort={toggle}>{t("tenants.email")}</SortableTableHead>
                <SortableTableHead sortKey="phone" sort={sort} onSort={toggle}>{t("tenants.phone")}</SortableTableHead>
                <SortableTableHead sortKey="status" sort={sort} onSort={toggle}>{t("filter.status")}</SortableTableHead>
                <SortableTableHead sortKey="unit" sort={sort} onSort={toggle}>{t("leases.unit")}</SortableTableHead>
                <SortableTableHead sortKey="lease" sort={sort} onSort={toggle}>{t("leases.title")}</SortableTableHead>
                <TableHead className="text-right">{t("tenants.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map(tenant => {
                const activeLease = getActiveLease(tenant.id);
                const unit = activeLease ? units.find(u => u.id === activeLease.unitId) : null;
                return (
                  <TableRow key={tenant.id} className="cursor-pointer" onClick={() => window.location.href = `/tenants/${tenant.id}`}>
                    <TableCell className="text-muted-foreground">{getTenantFullName(tenant)}</TableCell>
                    <TableCell className="text-muted-foreground">{tenant.email}</TableCell>
                    <TableCell className="text-muted-foreground">{tenant.phone}</TableCell>
                    <TableCell><StatusBadge status={tenant.status} /></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {unit ? <Link to={`/units/${unit.id}`} className="hover:underline" onClick={e => e.stopPropagation()}>{unit.unitCode}</Link> : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {activeLease ? <Link to={`/leases/${activeLease.id}`} className="hover:underline" onClick={e => e.stopPropagation()}>{activeLease.leaseReference}</Link> : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openEdit(tenant); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <DeleteDialog entityType="tenant" entityId={tenant.id} entityLabel="tenant" onDelete={handleDelete} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={pageSize} total={total} totalPages={totalPages} from={from} to={to} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </Card>
      )}

      <TenantDialog open={sheetOpen} onOpenChange={setSheetOpen} editingTenant={editingTenant} />
    </div>
  );
}
