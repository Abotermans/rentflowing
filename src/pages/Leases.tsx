import { useState, useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { getLeaseStatus, formatCurrency, formatDate } from "@/lib/formatters";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Lease } from "@/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

export default function Leases() {
  const { leases, units, tenants, properties, addLease, updateLease, deleteLease } = useAppData();
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Lease | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [form, setForm] = useState({
    unitId: "", tenantId: "", startDate: "", endDate: "", monthlyRent: 0, deposit: 0, terms: "",
  });

  const enriched = useMemo(() => {
    return leases.map(l => {
      const unit = units.find(u => u.id === l.unitId);
      const tenant = tenants.find(t => t.id === l.tenantId);
      const property = unit ? properties.find(p => p.id === unit.propertyId) : null;
      const status = getLeaseStatus(l.startDate, l.endDate);
      return { ...l, unit, tenant, property, status };
    }).sort((a, b) => {
      const order = { active: 0, upcoming: 1, expired: 2 };
      return order[a.status] - order[b.status];
    });
  }, [leases, units, tenants, properties]);

  const filteredUnits = useMemo(() => {
    return selectedPropertyId ? units.filter(u => u.propertyId === selectedPropertyId) : [];
  }, [units, selectedPropertyId]);

  const openAdd = () => {
    setEditing(null);
    setSelectedPropertyId("");
    setForm({ unitId: "", tenantId: "", startDate: "", endDate: "", monthlyRent: 0, deposit: 0, terms: "" });
    setSheetOpen(true);
  };

  const openEdit = (l: Lease) => {
    setEditing(l);
    const unit = units.find(u => u.id === l.unitId);
    setSelectedPropertyId(unit?.propertyId ?? "");
    setForm({ unitId: l.unitId, tenantId: l.tenantId, startDate: l.startDate, endDate: l.endDate, monthlyRent: l.monthlyRent, deposit: l.deposit, terms: l.terms });
    setSheetOpen(true);
  };

  const handleSave = () => {
    if (!form.unitId || !form.tenantId || !form.startDate || !form.endDate) {
      toast({ title: "Validation Error", description: "All required fields must be filled.", variant: "destructive" });
      return;
    }
    if (editing) {
      updateLease({ ...editing, ...form });
      toast({ title: "Lease updated" });
    } else {
      addLease(form);
      toast({ title: "Lease created" });
    }
    setSheetOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leases</h1>
          <p className="text-sm text-muted-foreground">{leases.length} leases</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Create Lease</Button>
      </div>

      {leases.length === 0 ? (
        <EmptyState icon={FileText} title="No leases yet" description="Create your first lease agreement." actionLabel="Create Lease" onAction={openAdd} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead className="text-right">Monthly Rent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enriched.map(l => (
                  <TableRow key={l.id}>
                    <TableCell>{l.property?.name ?? "—"}</TableCell>
                    <TableCell>{l.unit?.unitNumber ?? "—"}</TableCell>
                    <TableCell>
                      {l.tenant ? (
                        <Link to={`/tenants/${l.tenant.id}`} className="text-primary hover:underline">{l.tenant.firstName} {l.tenant.lastName}</Link>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{formatDate(l.startDate)}</TableCell>
                    <TableCell>{formatDate(l.endDate)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(l.monthlyRent)}</TableCell>
                    <TableCell><StatusBadge status={l.status} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(l)}><Pencil className="h-3 w-3" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3 w-3" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete lease?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => { deleteLease(l.id); toast({ title: "Lease deleted" }); }}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editing ? "Edit Lease" : "Create Lease"}</SheetTitle></SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Property</Label>
              <Select value={selectedPropertyId} onValueChange={v => { setSelectedPropertyId(v); setForm(f => ({ ...f, unitId: "" })); }}>
                <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={form.unitId} onValueChange={v => setForm(f => ({ ...f, unitId: v }))} disabled={!selectedPropertyId}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>{filteredUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.unitNumber}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tenant</Label>
              <Select value={form.tenantId} onValueChange={v => setForm(f => ({ ...f, tenantId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Start Date</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div><Label>End Date</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Monthly Rent ($)</Label><Input type="number" min={0} value={form.monthlyRent} onChange={e => setForm(f => ({ ...f, monthlyRent: +e.target.value }))} /></div>
              <div><Label>Deposit ($)</Label><Input type="number" min={0} value={form.deposit} onChange={e => setForm(f => ({ ...f, deposit: +e.target.value }))} /></div>
            </div>
            <div><Label>Terms</Label><Textarea value={form.terms} onChange={e => setForm(f => ({ ...f, terms: e.target.value }))} placeholder="Lease terms and conditions…" /></div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? "Save" : "Create"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
