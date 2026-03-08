import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Wrench, Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Link } from "react-router-dom";
import { formatDate } from "@/lib/formatters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getTenantFullName } from "@/types";
import { MaintenanceTicket, MaintenanceCategory, MaintenancePriority, MaintenanceStatus, MAINTENANCE_CATEGORY_LABELS, MAINTENANCE_PRIORITY_LABELS, MAINTENANCE_STATUS_LABELS } from "@/types/maintenance";
import { useSettings } from "@/context/SettingsContext";

type TicketFormData = Omit<MaintenanceTicket, "id">;

export default function Maintenance() {
  const { tickets, properties, units, tenants, vendors, addTicket, updateTicket, deleteTicket } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterProperty, setFilterProperty] = useState("all");
  const [filterVendor, setFilterVendor] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceTicket | null>(null);

  const emptyForm: TicketFormData = {
    title: "", description: "", propertyId: properties[0]?.id ?? "", unitId: "",
    tenantId: null, category: "general", priority: "medium", status: "open",
    createdDate: new Date().toISOString().split("T")[0], scheduledDate: null,
    completedDate: null, assignedVendorId: null, internalNotes: "", residentVisibleNotes: "",
  };
  const [form, setForm] = useState<TicketFormData>({ ...emptyForm });

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm }); setSheetOpen(true); };
  const openEdit = (t: MaintenanceTicket) => {
    setEditing(t);
    const { id, ...rest } = t;
    setForm(rest);
    setSheetOpen(true);
  };

  const handleSave = () => {
    if (!form.title.trim() || !form.propertyId || !form.unitId) {
      toast({ title: "Validation Error", description: "Title, property, and unit are required.", variant: "destructive" });
      return;
    }
    if (editing) {
      updateTicket({ ...editing, ...form });
      toast({ title: "Ticket updated" });
    } else {
      addTicket(form);
      toast({ title: "Ticket created" });
    }
    setSheetOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteTicket(id);
    toast({ title: "Ticket deleted" });
  };

  const formUnits = units.filter(u => u.propertyId === form.propertyId);

  const filtered = tickets.filter(t => {
    const prop = properties.find(p => p.id === t.propertyId);
    const unit = units.find(u => u.id === t.unitId);
    const q = search.toLowerCase();
    const matchSearch = !q || t.title.toLowerCase().includes(q) || (prop?.name.toLowerCase().includes(q) ?? false) || (unit?.unitCode.toLowerCase().includes(q) ?? false);
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    const matchCategory = filterCategory === "all" || t.category === filterCategory;
    const matchPriority = filterPriority === "all" || t.priority === filterPriority;
    const matchProperty = filterProperty === "all" || t.propertyId === filterProperty;
    const matchVendor = filterVendor === "all" || t.assignedVendorId === filterVendor;
    return matchSearch && matchStatus && matchCategory && matchPriority && matchProperty && matchVendor;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("maintenance.title")}</h1>
          <p className="text-sm text-muted-foreground">{tickets.length} tickets</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />{t("maintenance.add")}</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search tickets…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {(Object.keys(MAINTENANCE_STATUS_LABELS) as MaintenanceStatus[]).map(s => <SelectItem key={s} value={s}>{MAINTENANCE_STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {(Object.keys(MAINTENANCE_CATEGORY_LABELS) as MaintenanceCategory[]).map(c => <SelectItem key={c} value={c}>{MAINTENANCE_CATEGORY_LABELS[c]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {(Object.keys(MAINTENANCE_PRIORITY_LABELS) as MaintenancePriority[]).map(p => <SelectItem key={p} value={p}>{MAINTENANCE_PRIORITY_LABELS[p]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterProperty} onValueChange={setFilterProperty}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Property" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterVendor} onValueChange={setFilterVendor}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Vendor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vendors</SelectItem>
            {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.vendorName}</SelectItem>)}
          </SelectContent>
        </Select>
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
                <TableHead>Title</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(t => {
                const prop = properties.find(p => p.id === t.propertyId);
                const unit = units.find(u => u.id === t.unitId);
                const tenant = t.tenantId ? tenants.find(x => x.id === t.tenantId) : null;
                const vendor = t.assignedVendorId ? vendors.find(v => v.id === t.assignedVendorId) : null;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <Link to={`/maintenance/${t.id}`} className="hover:underline text-foreground">{t.title}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{prop ? <Link to={`/properties/${prop.id}`} className="hover:underline">{prop.name}</Link> : "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{unit ? <Link to={`/units/${unit.id}`} className="hover:underline">{unit.unitCode}</Link> : "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{tenant ? getTenantFullName(tenant) : "—"}</TableCell>
                    <TableCell className="text-xs capitalize">{MAINTENANCE_CATEGORY_LABELS[t.category]}</TableCell>
                    <TableCell><StatusBadge status={t.priority} /></TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{vendor ? <Link to={`/vendors/${vendor.id}`} className="hover:underline">{vendor.vendorName}</Link> : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(t.createdDate)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.scheduledDate ? formatDate(t.scheduledDate) : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild><Link to={`/maintenance/${t.id}`}><Eye className="h-3.5 w-3.5" /></Link></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete ticket?</AlertDialogTitle><AlertDialogDescription>This will permanently delete "{t.title}".</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(t.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
        <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
          <SheetHeader><SheetTitle>{editing ? "Edit Ticket" : "New Ticket"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-6">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Brief description of the issue" /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Property *</Label>
                <Select value={form.propertyId} onValueChange={v => setForm(f => ({ ...f, propertyId: v, unitId: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                  <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Unit *</Label>
                <Select value={form.unitId} onValueChange={v => setForm(f => ({ ...f, unitId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>{formUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.unitCode} — {u.unitLabel}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Tenant (optional)</Label>
              <Select value={form.tenantId ?? "none"} onValueChange={v => setForm(f => ({ ...f, tenantId: v === "none" ? null : v }))}>
                <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {tenants.map(t => <SelectItem key={t.id} value={t.id}>{getTenantFullName(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as MaintenanceCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(MAINTENANCE_CATEGORY_LABELS) as MaintenanceCategory[]).map(c => <SelectItem key={c} value={c}>{MAINTENANCE_CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as MaintenancePriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(MAINTENANCE_PRIORITY_LABELS) as MaintenancePriority[]).map(p => <SelectItem key={p} value={p}>{MAINTENANCE_PRIORITY_LABELS[p]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as MaintenanceStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(MAINTENANCE_STATUS_LABELS) as MaintenanceStatus[]).map(s => <SelectItem key={s} value={s}>{MAINTENANCE_STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Assigned Vendor</Label>
                <Select value={form.assignedVendorId ?? "none"} onValueChange={v => setForm(f => ({ ...f, assignedVendorId: v === "none" ? null : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {vendors.filter(v => v.status === "active").map(v => <SelectItem key={v.id} value={v.id}>{v.vendorName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Scheduled Date</Label><Input type="date" value={form.scheduledDate ?? ""} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value || null }))} /></div>
              <div><Label>Completed Date</Label><Input type="date" value={form.completedDate ?? ""} onChange={e => setForm(f => ({ ...f, completedDate: e.target.value || null }))} /></div>
            </div>
            <div><Label>Internal Notes</Label><Textarea value={form.internalNotes} onChange={e => setForm(f => ({ ...f, internalNotes: e.target.value }))} rows={3} /></div>
            <div><Label>Resident Visible Notes</Label><Textarea value={form.residentVisibleNotes} onChange={e => setForm(f => ({ ...f, residentVisibleNotes: e.target.value }))} rows={2} /></div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? "Save" : "Create Ticket"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
