import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { HardHat, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { VENDOR_STATUS_ICONS } from "@/lib/filterIcons";
import { CircleCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Vendor, VendorStatus, TRADE_CATEGORIES } from "@/types/maintenance";
import { useSettings } from "@/context/SettingsContext";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";

type VendorFormData = Omit<Vendor, "id">;

export default function Vendors() {
  const { vendors, addVendor, updateVendor, deleteVendor } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);

  type VSortKey = "name" | "trade" | "contact" | "email" | "phone" | "status";
  const { sort, toggle } = useTableSort<VSortKey>();

  const emptyForm: VendorFormData = {
    vendorName: "", tradeCategory: "General Maintenance", contactName: "",
    email: "", phone: "", address: "", notes: "", status: "active",
  };
  const [form, setForm] = useState<VendorFormData>({ ...emptyForm });

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm }); setSheetOpen(true); };
  const openEdit = (v: Vendor) => { setEditing(v); const { id, ...rest } = v; setForm(rest); setSheetOpen(true); };

  const handleSave = () => {
    if (!form.vendorName.trim()) {
      toast({ title: "Validation Error", description: "Vendor name is required.", variant: "destructive" });
      return;
    }
    if (editing) {
      updateVendor({ ...editing, ...form });
      toast({ title: "Vendor updated" });
    } else {
      addVendor(form);
      toast({ title: "Vendor added" });
    }
    setSheetOpen(false);
  };

  const handleDelete = (id: string) => { deleteVendor(id); toast({ title: "Vendor deleted" }); };

  const filtered = vendors.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || v.vendorName.toLowerCase().includes(q) || v.tradeCategory.toLowerCase().includes(q) || v.contactName.toLowerCase().includes(q);
    const matchStatus = filterStatus.length === 0 || filterStatus.includes(v.status);
    return matchSearch && matchStatus;
  });

  const sorted = sortRows(filtered, sort, (v, key) => {
    switch (key) {
      case "name": return v.vendorName;
      case "trade": return v.tradeCategory;
      case "contact": return v.contactName;
      case "email": return v.email;
      case "phone": return v.phone;
      case "status": return v.status;
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("vendors.title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative inline-flex">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 min-w-[180px] max-w-[400px] [field-sizing:content]" />
          </div>
          <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-2" />{t("vendors.add")}</Button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <MultiSelectFilter
            label="Status"
            icon={CircleCheck}
            values={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: "active", label: "Active", icon: VENDOR_STATUS_ICONS.active },
              { value: "inactive", label: "Inactive", icon: VENDOR_STATUS_ICONS.inactive },
            ]}
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap mt-1.5">
          {filtered.length} {t("vendors.title").toLowerCase()}
        </span>
      </div>

      {vendors.length === 0 ? (
        <EmptyState icon={HardHat} title={t("vendors.empty")} description={t("vendors.emptyDesc")} actionLabel={t("vendors.add")} onAction={openAdd} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title={t("filter.noResults")} description={t("filter.noResultsDesc")} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="name" sort={sort} onSort={toggle}>Vendor Name</SortableTableHead>
                <SortableTableHead sortKey="trade" sort={sort} onSort={toggle}>Trade</SortableTableHead>
                <SortableTableHead sortKey="contact" sort={sort} onSort={toggle}>Contact</SortableTableHead>
                <SortableTableHead sortKey="email" sort={sort} onSort={toggle}>Email</SortableTableHead>
                <SortableTableHead sortKey="phone" sort={sort} onSort={toggle}>Phone</SortableTableHead>
                <SortableTableHead sortKey="status" sort={sort} onSort={toggle}>Status</SortableTableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(v => (
                <TableRow key={v.id} className="cursor-pointer" onClick={() => navigate(`/vendors/${v.id}`)}>
                  <TableCell className="text-sm text-muted-foreground"><Link to={`/vendors/${v.id}`} className="hover:underline" onClick={e => e.stopPropagation()}>{v.vendorName}</Link></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{v.tradeCategory}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{v.contactName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{v.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{v.phone}</TableCell>
                  <TableCell><StatusBadge status={v.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openEdit(v); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={e => e.stopPropagation()}><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete vendor?</AlertDialogTitle><AlertDialogDescription>This will permanently delete "{v.vendorName}".</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(v.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Vendor" : "Add Vendor"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-6">
            <div><Label>Vendor Name *</Label><Input value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} /></div>
            <div><Label>Trade Category</Label>
              <Select value={form.tradeCategory} onValueChange={v => setForm(f => ({ ...f, tradeCategory: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRADE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Contact Name</Label><Input value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div><Label>Address</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as VendorStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? "Save" : "Add Vendor"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}