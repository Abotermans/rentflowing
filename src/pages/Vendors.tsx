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
import { FormField } from "@/components/shared/FormField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { VENDOR_STATUS_ICONS } from "@/lib/filterIcons";
import { CircleCheck } from "lucide-react";
import { Dialog, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { FormDialogContent as DialogContent, FormDialogFooter as DialogFooter } from "@/components/shared/FormDialog";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { useToast } from "@/hooks/use-toast";
import { Vendor, VendorStatus, TRADE_CATEGORIES } from "@/types/maintenance";
import { useSettings } from "@/context/SettingsContext";
import { useTableSort, sortRows } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { usePagination } from "@/hooks/use-pagination";
import { TablePagination } from "@/components/common/TablePagination";
import { isValidEmail } from "@/lib/validation";
import { usePortfolioWriteAccess } from "@/hooks/use-portfolio-write-access";

type VendorFormData = Omit<Vendor, "id">;

export default function Vendors() {
  const { vendors, addVendorPersisted, updateVendor, deleteVendor } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const canWrite = usePortfolioWriteAccess();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [errors, setErrors] = useState<Partial<Record<"vendorName" | "email", string>>>({});

  type VSortKey = "name" | "trade" | "contact" | "email" | "phone" | "status";
  const { sort, toggle } = useTableSort<VSortKey>();

  const emptyForm: VendorFormData = {
    vendorName: "", tradeCategory: "General Maintenance", contactName: "",
    email: "", phone: "", address: "", notes: "", status: "active",
  };
  const [form, setForm] = useState<VendorFormData>({ ...emptyForm });

  const openAdd = () => { if (!canWrite) return; setEditing(null); setForm({ ...emptyForm }); setErrors({}); setSheetOpen(true); };
  const openEdit = (v: Vendor) => { if (!canWrite) return; setEditing(v); const { id, ...rest } = v; setForm(rest); setErrors({}); setSheetOpen(true); };

  const handleSave = async () => {
    if (!canWrite) return;
    const nextErrors: Partial<Record<"vendorName" | "email", string>> = {};
    if (!form.vendorName.trim()) nextErrors.vendorName = t("common.mandatoryField");
    if (form.email.trim() && !isValidEmail(form.email)) nextErrors.email = t("common.invalidEmail");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast({ title: t("common.validationError"), description: t("common.fixHighlightedFields"), variant: "destructive" });
      return;
    }
    try {
      if (editing) {
        await updateVendor({ ...editing, ...form });
        toast({ title: "Vendor updated" });
      } else {
        await addVendorPersisted(form);
        toast({ title: "Vendor added" });
      }
    } catch (err) {
      toast({ title: "Validation Error", description: err instanceof Error ? err.message : "Vendor could not be saved.", variant: "destructive" });
      return;
    }
    setSheetOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteVendor(id);
    toast({ title: t("vendors.toastDeleted") });
  };

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

  const { pageItems, page, pageSize, setPage, setPageSize, total, totalPages, from, to } = usePagination(sorted);

  return (
    <div className="page-shell">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">{t("vendors.title")}</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative flex min-w-0 flex-1 sm:inline-flex sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 min-w-[180px] max-w-[400px] w-full [field-sizing:content]" />
          </div>
          {canWrite && <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-2" />{t("vendors.add")}</Button>}
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
        <EmptyState icon={HardHat} title={t("vendors.empty")} description={t("vendors.emptyDesc")} actionLabel={canWrite ? t("vendors.add") : undefined} onAction={canWrite ? openAdd : undefined} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title={t("filter.noResults")} description={t("filter.noResultsDesc")} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="name" sort={sort} onSort={toggle}>{t("vendors.vendorName")}</SortableTableHead>
                <SortableTableHead sortKey="trade" sort={sort} onSort={toggle}>{t("vendors.trade")}</SortableTableHead>
                <SortableTableHead sortKey="contact" sort={sort} onSort={toggle}>{t("vendors.contact")}</SortableTableHead>
                <SortableTableHead sortKey="email" sort={sort} onSort={toggle}>{t("vendors.email")}</SortableTableHead>
                <SortableTableHead sortKey="phone" sort={sort} onSort={toggle}>{t("vendors.phone")}</SortableTableHead>
                <SortableTableHead sortKey="status" sort={sort} onSort={toggle}>{t("vendors.status")}</SortableTableHead>
                {canWrite && <TableHead className="text-right">{t("vendors.actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map(v => (
                <TableRow key={v.id} className="cursor-pointer" onClick={() => navigate(`/vendors/${v.id}`)}>
                  <TableCell className="text-muted-foreground"><Link to={`/vendors/${v.id}`} className="hover:underline" onClick={e => e.stopPropagation()}>{v.vendorName}</Link></TableCell>
                  <TableCell className="text-muted-foreground">{v.tradeCategory}</TableCell>
                  <TableCell className="text-muted-foreground">{v.contactName}</TableCell>
                  <TableCell className="text-muted-foreground">{v.email}</TableCell>
                  <TableCell className="text-muted-foreground">{v.phone}</TableCell>
                  <TableCell><StatusBadge status={v.status} /></TableCell>
                  {canWrite && <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${v.vendorName}`} title={`Edit ${v.vendorName}`} onClick={e => { e.stopPropagation(); openEdit(v); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <DeleteDialog
                        entityType="vendor"
                        entityId={v.id}
                        entityLabel={v.vendorName}
                        onDelete={handleDelete}
                        title={t("vendors.deleteTitle")}
                        description={t("vendors.deleteItemDesc")}
                        cancelLabel={t("action.cancel")}
                        confirmLabel={t("action.delete")}
                        pendingLabel={t("action.deleting")}
                        trigger={<Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`${t("action.delete")} ${v.vendorName}`} title={`${t("action.delete")} ${v.vendorName}`} onClick={e => e.stopPropagation()}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      />
                    </div>
                  </TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={page} pageSize={pageSize} total={total} totalPages={totalPages} from={from} to={to} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </Card>
      )}

      <Dialog open={canWrite && sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Vendor" : "Add Vendor"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-6">
            <FormField label="Vendor Name" required error={errors.vendorName}>
              <Input value={form.vendorName} aria-invalid={!!errors.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} />
            </FormField>
            <div><Label>Trade Category</Label>
              <Select value={form.tradeCategory} onValueChange={v => setForm(f => ({ ...f, tradeCategory: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRADE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Contact Name</Label><Input value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Email" error={errors.email}>
                <Input type="email" value={form.email} aria-invalid={!!errors.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </FormField>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? "Save" : "Add Vendor"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
