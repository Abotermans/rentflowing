import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FileText, Plus, Search, Eye, Pencil, Trash2, AlertTriangle, Bell } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Lease, LeaseStatus, getTenantFullName, getLeaseLifecycleStatus, GUARANTEE_TYPE_LABELS } from "@/types";
import { Badge } from "@/components/ui/badge";

const LEASE_STATUSES: { value: LeaseStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
  { value: "terminated", label: "Terminated" },
];

type LeaseFormData = Omit<Lease, "id" | "createdAt" | "updatedAt">;

export default function Leases() {
  const { leases, tenants, units, properties, addLease, updateLease, deleteLease, getActiveLease, getGuaranteeByLease } = useAppData();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProperty, setFilterProperty] = useState("all");
  const [filterEndingSoon, setFilterEndingSoon] = useState(false);
  const [filterUnderNotice, setFilterUnderNotice] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingLease, setEditingLease] = useState<Lease | null>(null);

  const emptyForm: LeaseFormData = {
    leaseReference: "", propertyId: properties[0]?.id ?? "", unitId: "", primaryTenantId: "",
    coTenantIds: [], leaseStatus: "draft", startDate: "", endDate: "",
    monthlyRent: 0, monthlyCharges: 0, dueDayOfMonth: 1,
    depositOrGuaranteeAmount: null, noticePeriodText: "3 months",
    signedDate: null, notes: "",
    noticeGiven: false, noticeDate: null, intendedMoveOutDate: null, terminationReason: null,
    moveInScheduledDate: null, moveInActualDate: null, moveInMeterReading: null,
    moveInChecklist: { leaseSigned: false, firstPaymentReceived: false, guaranteeConfirmed: false, keysHandedOver: false, meterReadingCaptured: false, tenantDocumentsComplete: false },
    moveOutScheduledDate: null, moveOutActualDate: null, moveOutMeterReading: null,
    moveOutChecklist: { noticeConfirmed: false, moveOutDateConfirmed: false, keysReturned: false, moveOutMeterReadingCaptured: false, balanceReviewed: false, guaranteeReviewCompleted: false },
    moveOutNotes: "", keyHandoverCount: 0, keyReturnCount: 0, returnStatus: null, returnNotes: "",
  };
  const [form, setForm] = useState<LeaseFormData>({ ...emptyForm });

  const openAdd = () => { setEditingLease(null); setForm({ ...emptyForm }); setSheetOpen(true); };
  const openEdit = (l: Lease) => {
    setEditingLease(l);
    const { id, createdAt, updatedAt, ...rest } = l;
    setForm(rest);
    setSheetOpen(true);
  };

  const handleSave = () => {
    if (!form.leaseReference.trim() || !form.propertyId || !form.unitId || !form.primaryTenantId || !form.startDate || !form.endDate) {
      toast({ title: "Validation Error", description: "Reference, property, unit, tenant, start date, and end date are required.", variant: "destructive" });
      return;
    }
    if (form.leaseStatus === "active") {
      const existing = getActiveLease(form.unitId);
      if (existing && existing.id !== editingLease?.id) {
        toast({ title: "Conflict", description: `Unit already has an active lease: ${existing.leaseReference}`, variant: "destructive" });
        return;
      }
    }
    if (editingLease) {
      updateLease({ ...editingLease, ...form });
      toast({ title: "Lease updated" });
    } else {
      addLease(form);
      toast({ title: "Lease added" });
    }
    setSheetOpen(false);
  };

  const handleDelete = (lid: string) => {
    deleteLease(lid);
    toast({ title: "Lease deleted" });
  };

  const now = new Date();
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const filtered = leases.filter(l => {
    const tenant = tenants.find(t => t.id === l.primaryTenantId);
    const prop = properties.find(p => p.id === l.propertyId);
    const q = search.toLowerCase();
    const matchSearch = !q || l.leaseReference.toLowerCase().includes(q) ||
      (tenant ? getTenantFullName(tenant).toLowerCase().includes(q) : false) ||
      (prop?.name.toLowerCase().includes(q) ?? false);
    const matchStatus = filterStatus === "all" || l.leaseStatus === filterStatus;
    const matchProperty = filterProperty === "all" || l.propertyId === filterProperty;
    const matchEnding = !filterEndingSoon || (l.leaseStatus === "active" && new Date(l.endDate) <= in90Days);
    const matchNotice = !filterUnderNotice || l.noticeGiven;
    return matchSearch && matchStatus && matchProperty && matchEnding && matchNotice;
  });

  const formUnits = units.filter(u => u.propertyId === form.propertyId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leases</h1>
          <p className="text-sm text-muted-foreground">{leases.length} leases</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Lease</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search reference, tenant, property…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {LEASE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterProperty} onValueChange={setFilterProperty}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Property" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={filterEndingSoon ? "default" : "outline"} size="sm" className="h-9" onClick={() => setFilterEndingSoon(!filterEndingSoon)}>
          Ending Soon
        </Button>
        <Button variant={filterUnderNotice ? "default" : "outline"} size="sm" className="h-9" onClick={() => setFilterUnderNotice(!filterUnderNotice)}>
          <Bell className="h-3.5 w-3.5 mr-1" />Under Notice
        </Button>
      </div>

      {leases.length === 0 ? (
        <EmptyState icon={FileText} title="No leases yet" description="Create your first lease." actionLabel="Add Lease" onAction={openAdd} />
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">No leases match your filters.</p></CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Guarantee</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(l => {
                const tenant = tenants.find(t => t.id === l.primaryTenantId);
                const prop = properties.find(p => p.id === l.propertyId);
                const unit = units.find(u => u.id === l.unitId);
                const guarantee = getGuaranteeByLease(l.id);
                const lifecycle = getLeaseLifecycleStatus(l);
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      <div className="flex items-center gap-1.5">
                        <Link to={`/leases/${l.id}`} className="hover:underline text-foreground">{l.leaseReference}</Link>
                        {l.noticeGiven && <StatusBadge status="under-notice" />}
                        {lifecycle === "ending-soon" && !l.noticeGiven && <StatusBadge status="ending-soon" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tenant ? <Link to={`/tenants/${tenant.id}`} className="hover:underline">{getTenantFullName(tenant)}</Link> : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {prop ? <Link to={`/properties/${prop.id}`} className="hover:underline">{prop.name}</Link> : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {unit ? <Link to={`/units/${unit.id}`} className="hover:underline">{unit.unitCode}</Link> : "—"}
                    </TableCell>
                    <TableCell><StatusBadge status={l.leaseStatus} /></TableCell>
                    <TableCell>
                      {guarantee ? (
                        <StatusBadge status={guarantee.status} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatDate(l.startDate, prop?.locale)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatDate(l.endDate, prop?.locale)}</TableCell>
                    <TableCell className="text-right font-medium text-foreground">{prop ? formatCurrency(l.monthlyRent + l.monthlyCharges, prop.currencyCode, prop.locale) : l.monthlyRent + l.monthlyCharges}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild><Link to={`/leases/${l.id}`}><Eye className="h-3.5 w-3.5" /></Link></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(l)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete lease?</AlertDialogTitle><AlertDialogDescription>This will permanently delete "{l.leaseReference}".</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(l.id)}>Delete</AlertDialogAction></AlertDialogFooter>
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
          <SheetHeader><SheetTitle>{editingLease ? "Edit Lease" : "Add Lease"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-6">
            <div><Label>Lease Reference *</Label><Input value={form.leaseReference} onChange={e => setForm(f => ({ ...f, leaseReference: e.target.value }))} placeholder="e.g. BAIL-PAR-003" /></div>
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
                  <SelectContent>
                    {formUnits.map(u => {
                      const existing = getActiveLease(u.id);
                      const blocked = existing && existing.id !== editingLease?.id;
                      return (
                        <SelectItem key={u.id} value={u.id} disabled={!!blocked}>
                          {u.unitCode} — {u.unitLabel}{blocked ? " (active lease)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Primary Tenant *</Label>
                <Select value={form.primaryTenantId} onValueChange={v => setForm(f => ({ ...f, primaryTenantId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                  <SelectContent>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{getTenantFullName(t)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Status *</Label>
                <Select value={form.leaseStatus} onValueChange={v => setForm(f => ({ ...f, leaseStatus: v as LeaseStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LEASE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Start Date *</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div><Label>End Date *</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Monthly Rent *</Label><Input type="number" min={0} value={form.monthlyRent} onChange={e => setForm(f => ({ ...f, monthlyRent: Number(e.target.value) || 0 }))} /></div>
              <div><Label>Monthly Charges *</Label><Input type="number" min={0} value={form.monthlyCharges} onChange={e => setForm(f => ({ ...f, monthlyCharges: Number(e.target.value) || 0 }))} /></div>
              <div><Label>Due Day</Label><Input type="number" min={1} max={28} value={form.dueDayOfMonth} onChange={e => setForm(f => ({ ...f, dueDayOfMonth: Number(e.target.value) || 1 }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Deposit / Guarantee</Label><Input type="number" min={0} value={form.depositOrGuaranteeAmount ?? ""} onChange={e => setForm(f => ({ ...f, depositOrGuaranteeAmount: e.target.value ? Number(e.target.value) : null }))} /></div>
              <div><Label>Notice Period</Label><Input value={form.noticePeriodText} onChange={e => setForm(f => ({ ...f, noticePeriodText: e.target.value }))} placeholder="e.g. 3 months" /></div>
            </div>
            <div><Label>Signed Date</Label><Input type="date" value={form.signedDate ?? ""} onChange={e => setForm(f => ({ ...f, signedDate: e.target.value || null }))} /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingLease ? "Save" : "Add Lease"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
