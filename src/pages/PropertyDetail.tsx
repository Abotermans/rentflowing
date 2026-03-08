import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { getLeaseStatus, formatCurrency, formatDate } from "@/lib/formatters";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, ArrowLeft, MapPin, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Unit } from "@/types";

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const { properties, units, leases, tenants, addUnit, updateUnit, deleteUnit } = useAppData();
  const { toast } = useToast();

  const property = properties.find(p => p.id === id);
  const propUnits = units.filter(u => u.propertyId === id);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [form, setForm] = useState({ unitNumber: "", bedrooms: 0, bathrooms: 1, sqft: 0, rentAmount: 0 });

  if (!property) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Property not found.</p>
        <Link to="/properties" className="text-primary hover:underline text-sm">Back to Properties</Link>
      </div>
    );
  }

  const openAdd = () => { setEditingUnit(null); setForm({ unitNumber: "", bedrooms: 0, bathrooms: 1, sqft: 0, rentAmount: 0 }); setSheetOpen(true); };
  const openEdit = (u: Unit) => { setEditingUnit(u); setForm({ unitNumber: u.unitNumber, bedrooms: u.bedrooms, bathrooms: u.bathrooms, sqft: u.sqft, rentAmount: u.rentAmount }); setSheetOpen(true); };

  const handleSave = () => {
    if (!form.unitNumber.trim()) {
      toast({ title: "Validation Error", description: "Unit number is required.", variant: "destructive" });
      return;
    }
    if (editingUnit) {
      updateUnit({ ...editingUnit, ...form });
      toast({ title: "Unit updated" });
    } else {
      addUnit({ ...form, propertyId: property.id });
      toast({ title: "Unit added" });
    }
    setSheetOpen(false);
  };

  const handleDeleteUnit = (uid: string) => {
    deleteUnit(uid);
    toast({ title: "Unit deleted" });
  };

  const getUnitInfo = (unit: Unit) => {
    const activeLease = leases.find(l => l.unitId === unit.id && getLeaseStatus(l.startDate, l.endDate) === "active");
    const tenant = activeLease ? tenants.find(t => t.id === activeLease.tenantId) : null;
    const isOccupied = !!activeLease;
    return { activeLease, tenant, isOccupied };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/properties">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{property.name}</h1>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span>{property.address}</span>
            <Badge variant="outline" className="ml-2 capitalize">{property.type}</Badge>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Units ({propUnits.length})</h2>
        <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" />Add Unit</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current Tenant</TableHead>
                <TableHead>Bed / Bath</TableHead>
                <TableHead>Sq Ft</TableHead>
                <TableHead className="text-right">Rent</TableHead>
                <TableHead>Lease End</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {propUnits.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No units. Add your first unit.</TableCell></TableRow>
              ) : propUnits.map(u => {
                const { activeLease, tenant, isOccupied } = getUnitInfo(u);
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.unitNumber}</TableCell>
                    <TableCell><StatusBadge status={isOccupied ? "occupied" : "vacant"} /></TableCell>
                    <TableCell>
                      {tenant ? (
                        <Link to={`/tenants/${tenant.id}`} className="text-primary hover:underline">
                          {tenant.firstName} {tenant.lastName}
                        </Link>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{u.bedrooms} / {u.bathrooms}</TableCell>
                    <TableCell>{u.sqft.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatCurrency(u.rentAmount)}</TableCell>
                    <TableCell>{activeLease ? formatDate(activeLease.endDate) : "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)}><Pencil className="h-3 w-3" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3 w-3" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete unit {u.unitNumber}?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteUnit(u.id)}>Delete</AlertDialogAction>
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

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingUnit ? "Edit Unit" : "Add Unit"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div><Label>Unit Number</Label><Input value={form.unitNumber} onChange={e => setForm(f => ({ ...f, unitNumber: e.target.value }))} placeholder="e.g. 101" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Bedrooms</Label><Input type="number" min={0} value={form.bedrooms} onChange={e => setForm(f => ({ ...f, bedrooms: +e.target.value }))} /></div>
              <div><Label>Bathrooms</Label><Input type="number" min={0} value={form.bathrooms} onChange={e => setForm(f => ({ ...f, bathrooms: +e.target.value }))} /></div>
            </div>
            <div><Label>Square Footage</Label><Input type="number" min={0} value={form.sqft} onChange={e => setForm(f => ({ ...f, sqft: +e.target.value }))} /></div>
            <div><Label>Rent Amount ($)</Label><Input type="number" min={0} value={form.rentAmount} onChange={e => setForm(f => ({ ...f, rentAmount: +e.target.value }))} /></div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingUnit ? "Save" : "Add"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
