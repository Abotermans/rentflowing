import { useState, useEffect } from "react";
import { useAppData } from "@/context/AppContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityLabel } from "@/components/shared/PriorityLabel";
import { Wrench, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Link } from "react-router-dom";
import { formatDate } from "@/lib/formatters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import {
  MAINTENANCE_STATUS_ICONS, MAINTENANCE_CATEGORY_ICONS, PRIORITY_ICONS, PRIORITY_CLASSES,
  PROPERTY_ICON, VENDOR_ICON,
} from "@/lib/filterIcons";
import { CircleDot, Tag, AlertTriangle as AlertTriangleIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { MaintenanceTicketDialog } from "@/components/maintenance/MaintenanceTicketDialog";
import { useToast } from "@/hooks/use-toast";
import { getTenantFullName } from "@/types";
import { MaintenanceTicket, MaintenanceCategory, MaintenancePriority, MaintenanceStatus, MAINTENANCE_CATEGORY_KEYS, MAINTENANCE_PRIORITY_KEYS, MAINTENANCE_STATUS_KEYS } from "@/types/maintenance";
import { useSettings } from "@/context/SettingsContext";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";

export default function Maintenance() {
  const { tickets, properties, units, tenants, vendors, deleteTicket } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterPriority, setFilterPriority] = useState<string[]>([]);
  const [filterProperty, setFilterProperty] = useState<string[]>([]);
  const [filterVendor, setFilterVendor] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceTicket | null>(null);
  const [prefillPropertyId, setPrefillPropertyId] = useState<string | undefined>(undefined);
  const [prefillUnitId, setPrefillUnitId] = useState<string | undefined>(undefined);

  type MSortKey = "title" | "property" | "unit" | "tenant" | "category" | "priority" | "status" | "vendor" | "created" | "scheduled";
  const { sort, toggle } = useTableSort<MSortKey>();

  const openAdd = () => { setEditing(null); setPrefillPropertyId(undefined); setPrefillUnitId(undefined); setSheetOpen(true); };

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      const propertyId = searchParams.get("propertyId") ?? undefined;
      const unitId = searchParams.get("unitId") ?? undefined;
      setEditing(null);
      setPrefillPropertyId(propertyId);
      setPrefillUnitId(unitId);
      setSheetOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("create");
      next.delete("propertyId");
      next.delete("unitId");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const openEdit = (ticket: MaintenanceTicket) => {
    setEditing(ticket);
    setPrefillPropertyId(undefined);
    setPrefillUnitId(undefined);
    setSheetOpen(true);
  };

  const handleDelete = (id: string) => {
    deleteTicket(id);
    toast({ title: t("maintenance.toastDeleted") });
  };

  const filtered = tickets.filter(ticket => {
    const prop = properties.find(p => p.id === ticket.propertyId);
    const unit = units.find(u => u.id === ticket.unitId);
    const q = search.toLowerCase();
    const matchSearch = !q || ticket.title.toLowerCase().includes(q) || (prop?.name.toLowerCase().includes(q) ?? false) || (unit?.unitCode.toLowerCase().includes(q) ?? false);
    const matchStatus = filterStatus.length === 0 || filterStatus.includes(ticket.status);
    const matchCategory = filterCategory.length === 0 || filterCategory.includes(ticket.category);
    const matchPriority = filterPriority.length === 0 || filterPriority.includes(ticket.priority);
    const matchProperty = filterProperty.length === 0 || filterProperty.includes(ticket.propertyId);
    const matchVendor = filterVendor.length === 0 || (ticket.assignedVendorId ? filterVendor.includes(ticket.assignedVendorId) : false);
    return matchSearch && matchStatus && matchCategory && matchPriority && matchProperty && matchVendor;
  });

  const PRIORITY_ORDER: Record<MaintenancePriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sorted = sortRows(filtered, sort, (ticket, key) => {
    const prop = properties.find(p => p.id === ticket.propertyId);
    const unit = units.find(u => u.id === ticket.unitId);
    const tenant = ticket.tenantId ? tenants.find(x => x.id === ticket.tenantId) : null;
    const vendor = ticket.assignedVendorId ? vendors.find(v => v.id === ticket.assignedVendorId) : null;
    switch (key) {
      case "title": return ticket.title;
      case "property": return prop?.name ?? "";
      case "unit": return unit?.unitCode ?? "";
      case "tenant": return tenant ? getTenantFullName(tenant) : "";
      case "category": return t(MAINTENANCE_CATEGORY_KEYS[ticket.category]);
      case "priority": return PRIORITY_ORDER[ticket.priority];
      case "status": return ticket.status;
      case "vendor": return vendor?.vendorName ?? "";
      case "created": return ticket.createdDate;
      case "scheduled": return ticket.scheduledDate;
    }
  });

  const { pageItems, page, pageSize, setPage, setPageSize, total, totalPages, from, to } = usePagination(sorted);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("maintenance.title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative inline-flex">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("action.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 min-w-[180px] max-w-[400px] [field-sizing:content]" />
          </div>
          <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-2" />{t("maintenance.add")}</Button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <MultiSelectFilter
            label={t("filter.status")}
            icon={CircleDot}
            values={filterStatus}
            onChange={setFilterStatus}
            options={(Object.keys(MAINTENANCE_STATUS_KEYS) as MaintenanceStatus[]).map(s => ({
              value: s, label: t(MAINTENANCE_STATUS_KEYS[s]), icon: MAINTENANCE_STATUS_ICONS[s],
            }))}
          />
          <MultiSelectFilter
            label={t("maintenance.category")}
            icon={Tag}
            values={filterCategory}
            onChange={setFilterCategory}
            options={(Object.keys(MAINTENANCE_CATEGORY_KEYS) as MaintenanceCategory[]).map(c => ({
              value: c, label: t(MAINTENANCE_CATEGORY_KEYS[c]), icon: MAINTENANCE_CATEGORY_ICONS[c],
            }))}
          />
          <MultiSelectFilter
            label={t("maintenance.priority")}
            icon={AlertTriangleIcon}
            values={filterPriority}
            onChange={setFilterPriority}
            options={(Object.keys(MAINTENANCE_PRIORITY_KEYS) as MaintenancePriority[]).map(p => ({
              value: p, label: t(MAINTENANCE_PRIORITY_KEYS[p]), icon: PRIORITY_ICONS[p], iconClassName: PRIORITY_CLASSES[p],
            }))}
          />
          <MultiSelectFilter
            label={t("maintenance.property")}
            icon={PROPERTY_ICON}
            values={filterProperty}
            onChange={setFilterProperty}
            options={properties.map(p => ({ value: p.id, label: p.name, icon: PROPERTY_ICON }))}
          />
          <MultiSelectFilter
            label={t("maintenance.vendor")}
            icon={VENDOR_ICON}
            values={filterVendor}
            onChange={setFilterVendor}
            options={vendors.map(v => ({ value: v.id, label: v.vendorName, icon: VENDOR_ICON }))}
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap mt-1.5">
          {filtered.length} {t("maintenance.tickets")}
        </span>
      </div>

      {tickets.length === 0 ? (
        <EmptyState icon={Wrench} title={t("maintenance.empty")} description={t("maintenance.emptyDesc")} actionLabel={t("maintenance.add")} onAction={openAdd} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title={t("filter.noResults")} description={t("filter.noResultsDesc")} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="title" sort={sort} onSort={toggle}>{t("maintenance.titleField")}</SortableTableHead>
                <SortableTableHead sortKey="property" sort={sort} onSort={toggle}>{t("maintenance.property")}</SortableTableHead>
                <SortableTableHead sortKey="unit" sort={sort} onSort={toggle}>{t("maintenance.unit")}</SortableTableHead>
                <SortableTableHead sortKey="tenant" sort={sort} onSort={toggle}>{t("maintenance.tenant")}</SortableTableHead>
                <SortableTableHead sortKey="category" sort={sort} onSort={toggle}>{t("maintenance.category")}</SortableTableHead>
                <SortableTableHead sortKey="priority" sort={sort} onSort={toggle}>{t("maintenance.priority")}</SortableTableHead>
                <SortableTableHead sortKey="status" sort={sort} onSort={toggle}>{t("filter.status")}</SortableTableHead>
                <SortableTableHead sortKey="vendor" sort={sort} onSort={toggle}>{t("maintenance.vendor")}</SortableTableHead>
                <SortableTableHead sortKey="created" sort={sort} onSort={toggle}>{t("maintenance.created")}</SortableTableHead>
                <SortableTableHead sortKey="scheduled" sort={sort} onSort={toggle}>{t("maintenance.scheduled")}</SortableTableHead>
                <TableHead className="text-right">{t("maintenance.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map(ticket => {
                const prop = properties.find(p => p.id === ticket.propertyId);
                const unit = units.find(u => u.id === ticket.unitId);
                const tenant = ticket.tenantId ? tenants.find(x => x.id === ticket.tenantId) : null;
                const vendor = ticket.assignedVendorId ? vendors.find(v => v.id === ticket.assignedVendorId) : null;
                return (
                  <TableRow key={ticket.id} className="cursor-pointer" onClick={() => navigate(`/maintenance/${ticket.id}`)}>
                    <TableCell className="text-sm text-muted-foreground">
                      <Link to={`/maintenance/${ticket.id}`} className="hover:underline" onClick={e => e.stopPropagation()}>{ticket.title}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{prop ? <Link to={`/properties/${prop.id}`} className="hover:underline" onClick={e => e.stopPropagation()}>{prop.name}</Link> : "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{unit ? <Link to={`/units/${unit.id}`} className="hover:underline" onClick={e => e.stopPropagation()}>{unit.unitCode}</Link> : "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{tenant ? getTenantFullName(tenant) : "—"}</TableCell>
                    <TableCell className="text-xs">{t(MAINTENANCE_CATEGORY_KEYS[ticket.category])}</TableCell>
                    <TableCell><PriorityLabel priority={ticket.priority} /></TableCell>
                    <TableCell><StatusBadge status={ticket.status} /></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{vendor ? <Link to={`/vendors/${vendor.id}`} className="hover:underline" onClick={e => e.stopPropagation()}>{vendor.vendorName}</Link> : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(ticket.createdDate)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ticket.scheduledDate ? formatDate(ticket.scheduledDate) : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(ticket)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>{t("maintenance.deleteTitle")}</AlertDialogTitle><AlertDialogDescription>{t("maintenance.deleteItemDesc")}</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>{t("action.cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(ticket.id)}>{t("action.delete")}</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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

      <MaintenanceTicketDialog
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editing={editing}
        prefillPropertyId={prefillPropertyId}
        prefillUnitId={prefillUnitId}
      />
    </div>
  );
}
