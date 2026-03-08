import { useState, useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { getLeaseStatus } from "@/lib/formatters";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Users, Search, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Tenant } from "@/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

export default function Tenants() {
  const { tenants, leases, units, properties, addTenant, updateTenant, deleteTenant } = useAppData();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", emergencyContact: "" });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tenants.filter(t => `${t.firstName} ${t.lastName} ${t.email} ${t.phone}`.toLowerCase().includes(q));
  }, [tenants, search]);

  const getTenantInfo = (tenant: Tenant) => {
    const activeLease = leases.find(l => l.tenantId === tenant.id && getLeaseStatus(l.startDate, l.endDate) === "active");
    const unit = activeLease ? units.find(u => u.id === activeLease.unitId) : null;
    const property = unit ? properties.find(p => p.id === unit.propertyId) : null;
    const leaseStatus = activeLease ? getLeaseStatus(activeLease.startDate, activeLease.endDate) : null;
    return { unit, property, leaseStatus };
  };

  const openAdd = () => { setEditing(null); setForm({ firstName: "", lastName: "", email: "", phone: "", emergencyContact: "" }); setOpen(true); };
  const openEdit = (t: Tenant) => { setEditing(t); setForm({ firstName: t.firstName, lastName: t.lastName, email: t.email, phone: t.phone, emergencyContact: t.emergencyContact }); setOpen(true); };

  const handleSave = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast({ title: "Validation Error", description: "First and last name are required.", variant: "destructive" });
      return;
    }
    if (editing) {
      updateTenant({ ...editing, ...form });
      toast({ title: "Tenant updated" });
    } else {
      addTenant(form);
      toast({ title: "Tenant added" });
    }
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tenants</h1>
          <p className="text-sm text-muted-foreground">{tenants.length} tenants</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Tenant</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search tenants…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {tenants.length === 0 ? (
        <EmptyState icon={Users} title="No tenants yet" description="Add your first tenant to get started." actionLabel="Add Tenant" onAction={openAdd} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Lease Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No tenants match your search.</TableCell></TableRow>
                ) : filtered.map(t => {
                  const { unit, property, leaseStatus } = getTenantInfo(t);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">
                        <Link to={`/tenants/${t.id}`} className="text-primary hover:underline">{t.firstName} {t.lastName}</Link>
                      </TableCell>
                      <TableCell>{t.email}</TableCell>
                      <TableCell>{t.phone}</TableCell>
                      <TableCell>{property?.name ?? "—"}</TableCell>
                      <TableCell>{unit?.unitNumber ?? "—"}</TableCell>
                      <TableCell>{leaseStatus ? <StatusBadge status={leaseStatus} /> : <span className="text-muted-foreground text-sm">No active lease</span>}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="h-3 w-3" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3 w-3" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete tenant?</AlertDialogTitle>
                                <AlertDialogDescription>This will permanently delete {t.firstName} {t.lastName}.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => { deleteTenant(t.id); toast({ title: "Tenant deleted" }); }}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Tenant" : "Add Tenant"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>First Name</Label><Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
              <div><Label>Last Name</Label><Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            </div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label>Emergency Contact</Label><Input value={form.emergencyContact} onChange={e => setForm(f => ({ ...f, emergencyContact: e.target.value }))} placeholder="Name — Phone" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
