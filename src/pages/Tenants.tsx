import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Users, Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { Tenant, TenantStatus, getTenantFullName } from "@/types";
import { useSettings } from "@/context/SettingsContext";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { canChangeTenantStatus } from "@/lib/integrity/tenantIntegrity";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";

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
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

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

  const handleSave = () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      toast({ title: "Validation Error", description: "First name, last name, and email are required.", variant: "destructive" });
      return;
    }
    if (editingTenant && form.status !== editingTenant.status) {
      const validation = canChangeTenantStatus(editingTenant.id, form.status, integrityState);
      if (!validation.allowed) {
        toast({ title: "Status change blocked", description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
        return;
      }
    }
    if (editingTenant) {
      updateTenant({ ...editingTenant, ...form });
      toast({ title: "Tenant updated" });
    } else {
      addTenant(form);
      toast({ title: "Tenant added" });
    }
    setSheetOpen(false);
  };

  const handleDelete = (tid: string) => {
    deleteTenant(tid);
    toast({ title: "Tenant deleted" });
  };

  const filtered = tenants.filter(t => {
    const name = getTenantFullName(t).toLowerCase();
    const q = search.toLowerCase();
    const matchSearch = !q || name.includes(q) || t.email.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const getActiveLease = (tenantId: string) => leases.find(l => l.primaryTenantId === tenantId && l.leaseStatus === "active");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("tenants.title")}</h1>
          <p className="text-sm text-muted-foreground">{tenants.length} {t("tenants.title").toLowerCase()}</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />{t("tenants.add")}</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("tenants.searchPlaceholder")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder={t("filter.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allStatuses")}</SelectItem>
            {TENANT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
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
                <TableHead>{t("tenants.name")}</TableHead>
                <TableHead>{t("tenants.email")}</TableHead>
                <TableHead>{t("tenants.phone")}</TableHead>
                <TableHead>{t("filter.status")}</TableHead>
                <TableHead>{t("leases.unit")}</TableHead>
                <TableHead>{t("leases.title")}</TableHead>
                <TableHead className="text-right">{t("tenants.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(tenant => {
                const activeLease = getActiveLease(tenant.id);
                const unit = activeLease ? units.find(u => u.id === activeLease.unitId) : null;
                return (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">
                      <Link to={`/tenants/${tenant.id}`} className="hover:underline text-foreground">{getTenantFullName(tenant)}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{tenant.email}</TableCell>
                    <TableCell className="text-muted-foreground">{tenant.phone}</TableCell>
                    <TableCell><StatusBadge status={tenant.status} /></TableCell>
                    <TableCell className="text-muted-foreground">
                      {unit ? <Link to={`/units/${unit.id}`} className="hover:underline">{unit.unitCode}</Link> : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {activeLease ? <Link to={`/leases/${activeLease.id}`} className="hover:underline">{activeLease.leaseReference}</Link> : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild><Link to={`/tenants/${tenant.id}`}><Eye className="h-3.5 w-3.5" /></Link></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(tenant)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <DeleteDialog entityType="tenant" entityId={tenant.id} entityLabel="tenant" onDelete={handleDelete} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
           <SheetHeader><SheetTitle>{editingTenant ? t("tenants.edit") : t("tenants.add")}</SheetTitle></SheetHeader>
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
              </div>
            </div>
            <div><Label>{t("tenants.identificationNumber")}</Label><Input value={form.identificationNumber ?? ""} onChange={e => setForm(f => ({ ...f, identificationNumber: e.target.value || null }))} /></div>
            <div><Label>{t("tenants.currentAddress")}</Label><Textarea value={form.currentAddress ?? ""} onChange={e => setForm(f => ({ ...f, currentAddress: e.target.value || null }))} rows={2} /></div>
            <div><Label>{t("common.notes")}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{editingTenant ? t("action.save") : t("tenants.add")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
