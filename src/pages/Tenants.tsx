import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Users, Plus, Search, Pencil } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { TENANT_STATUS_ICONS } from "@/lib/filterIcons";
import { UserCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { Tenant, TenantStatus, getTenantFullName } from "@/types";
import { useSettings } from "@/context/SettingsContext";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { canChangeTenantStatus } from "@/lib/integrity/tenantIntegrity";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";
import { OverrideConfirmDialog } from "@/components/shared/OverrideConfirmDialog";
import { useOverrideHistory } from "@/context/OverrideContext";
import type { ValidationResult } from "@/lib/integrity/types";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";

const TENANT_STATUSES: { value: TenantStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "former", label: "Former" },
  { value: "applicant", label: "Applicant" },
];

type TenantFormData = Omit<Tenant, "id" | "createdAt" | "updatedAt">;

export default function Tenants() {
  const { tenants, leases, units, properties, addTenant, updateTenant, deleteTenant } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverrideValidation, setPendingOverrideValidation] = useState<ValidationResult | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  type TSortKey = "name" | "email" | "phone" | "status" | "unit" | "lease";
  const { sort, toggle } = useTableSort<TSortKey>();

  const emptyForm: TenantFormData = {
    firstName: "", lastName: "", email: "", phone: "",
    dateOfBirth: null, identificationNumber: null, currentAddress: null,
    status: "active", notes: "",
  };
  const [form, setForm] = useState<TenantFormData>({ ...emptyForm });

  const openAdd = () => { setEditingTenant(null); setForm({ ...emptyForm }); setSheetOpen(true); };
  const openEdit = (t: Tenant) => {
    setEditingTenant(t);
    const { id, createdAt, updatedAt, ...rest } = t;
    setForm(rest);
    setSheetOpen(true);
  };

  const tenantStatusValidation = (() => {
    if (!editingTenant || form.status === editingTenant.status) return null;
    return canChangeTenantStatus(editingTenant.id, form.status, integrityState);
  })();

  const executeTenantSave = () => {
    if (editingTenant) {
      updateTenant({ ...editingTenant, ...form });
      toast({ title: "Tenant updated" });
    } else {
      addTenant(form);
      toast({ title: "Tenant added" });
    }
    setSheetOpen(false);
  };

  const handleSave = () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      toast({ title: "Validation Error", description: "First name, last name, and email are required.", variant: "destructive" });
      return;
    }
    if (editingTenant && form.status !== editingTenant.status) {
      const validation = canChangeTenantStatus(editingTenant.id, form.status, integrityState);
      if (!validation.allowed) {
        if (validation.overrideAllowed) {
          setPendingOverrideValidation(validation);
          setOverrideDialogOpen(true);
          return;
        }
        toast({ title: "Status change blocked", description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
        return;
      }
    }
    executeTenantSave();
  };

  const handleTenantOverrideConfirm = (reason: string) => {
    if (!editingTenant || !pendingOverrideValidation) return;
    addOverride({
      entityType: "tenant",
      entityId: editingTenant.id,
      action: `status_change:${form.status}`,
      blockerCodes: pendingOverrideValidation.blockers.map(b => b.code),
      reason,
    });
    updateTenant({ ...editingTenant, ...form });
    setSheetOpen(false);
    toast({ title: "Tenant updated (overridden)", description: `Override reason: ${reason}` });
    setPendingOverrideValidation(null);
  };
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

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
           <DialogHeader><DialogTitle>{editingTenant ? t("tenants.edit") : t("tenants.add")}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-6">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("tenants.firstName")} *</Label><Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
              <div><Label>{t("tenants.lastName")} *</Label><Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            </div>
            <div><Label>{t("tenants.email")} *</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>{t("tenants.phone")}</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("tenants.dateOfBirth")}</Label><Input type="date" value={form.dateOfBirth ?? ""} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value || null }))} /></div>
              <div><Label>{t("filter.status")} *</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as TenantStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TENANT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
                <StatusTransitionAlert validation={tenantStatusValidation} />
              </div>
            </div>
            <div><Label>{t("tenants.identificationNumber")}</Label><Input value={form.identificationNumber ?? ""} onChange={e => setForm(f => ({ ...f, identificationNumber: e.target.value || null }))} /></div>
            <div><Label>{t("tenants.currentAddress")}</Label><Textarea value={form.currentAddress ?? ""} onChange={e => setForm(f => ({ ...f, currentAddress: e.target.value || null }))} rows={2} /></div>
            <div><Label>{t("common.notes")}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{editingTenant ? t("action.save") : t("tenants.add")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override Confirm Dialog */}
      {pendingOverrideValidation && (
        <OverrideConfirmDialog
          open={overrideDialogOpen}
          onOpenChange={(v) => { setOverrideDialogOpen(v); if (!v) setPendingOverrideValidation(null); }}
          validation={pendingOverrideValidation}
          actionLabel="Override and Save"
          onOverride={handleTenantOverrideConfirm}
        />
      )}
    </div>
  );
}
