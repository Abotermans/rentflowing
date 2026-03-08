import { useState, useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FileText, Plus, Search, Eye, Pencil, Trash2, Bell } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { Lease, LeaseStatus, getTenantFullName, getLeaseLifecycleStatus, getMoveInStatus, getMoveOutStatus, GUARANTEE_TYPE_LABELS } from "@/types";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/context/SettingsContext";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { canChangeLeaseStatus } from "@/lib/integrity/leaseIntegrity";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";

const LEASE_STATUSES: { value: LeaseStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
  { value: "terminated", label: "Terminated" },
];

type LeaseFormData = Omit<Lease, "id" | "createdAt" | "updatedAt">;

const ALLOWED_TRANSITIONS: Record<LeaseStatus, LeaseStatus[]> = {
  draft: ["draft", "active"],
  active: ["active", "ended", "terminated"],
  ended: ["ended"],
  terminated: ["terminated"],
};

export default function Leases() {
  const { leases, tenants, units, properties, addLease, updateLease, deleteLease, getActiveLease, getGuaranteeByLease } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const integrityState = useIntegrityState();
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
    hasAdvancePayment: false, advancePaymentAmount: null, advancePaymentDate: null,
    advanceAllocationMethod: null, advanceAppliedTo: null, advanceAllocationStartDate: null,
    advanceAllocationDurationMonths: null, fixedMonthlyReductionAmount: null,
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
          <h1 className="text-2xl font-bold text-foreground">{t("leases.title")}</h1>
          <p className="text-sm text-muted-foreground">{leases.length} {t("leases.title").toLowerCase()}</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />{t("leases.add")}</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("leases.searchPlaceholder")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder={t("filter.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allStatuses")}</SelectItem>
            {LEASE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterProperty} onValueChange={setFilterProperty}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder={t("filter.property")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allProperties")}</SelectItem>
            {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={filterEndingSoon ? "default" : "outline"} size="sm" className="h-9" onClick={() => setFilterEndingSoon(!filterEndingSoon)}>
          {t("filter.endingSoon")}
        </Button>
        <Button variant={filterUnderNotice ? "default" : "outline"} size="sm" className="h-9" onClick={() => setFilterUnderNotice(!filterUnderNotice)}>
          <Bell className="h-3.5 w-3.5 mr-1" />{t("filter.underNotice")}
        </Button>
      </div>

      {leases.length === 0 ? (
        <EmptyState icon={FileText} title={t("leases.empty")} description={t("leases.emptyDesc")} actionLabel={t("leases.add")} onAction={openAdd} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title={t("filter.noResults")} description={t("filter.noResultsDesc")} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("leases.reference")}</TableHead>
                <TableHead>{t("leases.tenant")}</TableHead>
                <TableHead>{t("leases.property")}</TableHead>
                <TableHead>{t("leases.unit")}</TableHead>
                <TableHead>{t("leases.status")}</TableHead>
                <TableHead>{t("leases.guarantee")}</TableHead>
                <TableHead>{t("leases.start")}</TableHead>
                <TableHead>{t("leases.end")}</TableHead>
                <TableHead className="text-right">{t("leases.total")}</TableHead>
                <TableHead className="text-right">{t("leases.actions")}</TableHead>
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
                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        <StatusBadge status={l.leaseStatus} />
                        {getMoveInStatus(l) === "scheduled" && <StatusBadge status="scheduled" />}
                        {getMoveOutStatus(l) === "scheduled" && !l.moveOutActualDate && <StatusBadge status="scheduled" />}
                        {l.returnStatus && l.returnStatus !== "completed" && <StatusBadge status={l.returnStatus} />}
                      </div>
                    </TableCell>
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
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild><Link to={`/leases/${l.id}`}><Eye className="h-3.5 w-3.5" /></Link></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(l)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <DeleteDialog entityType="lease" entityId={l.id} entityLabel="lease" onDelete={handleDelete} />
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
          <SheetHeader><SheetTitle>{editingLease ? t("leases.edit") : t("leases.add")}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-6">
            <div><Label>{t("leases.leaseReference")} *</Label><Input value={form.leaseReference} onChange={e => setForm(f => ({ ...f, leaseReference: e.target.value }))} placeholder="e.g. BAIL-PAR-003" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("leases.property")} *</Label>
                <Select value={form.propertyId} onValueChange={v => setForm(f => ({ ...f, propertyId: v, unitId: "" }))}>
                  <SelectTrigger><SelectValue placeholder={t("leases.selectProperty")} /></SelectTrigger>
                  <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("leases.unit")} *</Label>
                <Select value={form.unitId} onValueChange={v => setForm(f => ({ ...f, unitId: v }))}>
                  <SelectTrigger><SelectValue placeholder={t("leases.selectUnit")} /></SelectTrigger>
                  <SelectContent>
                    {formUnits.map(u => {
                      const existing = getActiveLease(u.id);
                      const blocked = existing && existing.id !== editingLease?.id;
                      return (
                        <SelectItem key={u.id} value={u.id} disabled={!!blocked}>
                          {u.unitCode} — {u.unitLabel}{blocked ? ` (${t("leases.activeLease")})` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("leases.primaryTenant")} *</Label>
                <Select value={form.primaryTenantId} onValueChange={v => setForm(f => ({ ...f, primaryTenantId: v }))}>
                  <SelectTrigger><SelectValue placeholder={t("leases.selectTenant")} /></SelectTrigger>
                  <SelectContent>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{getTenantFullName(t)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("leases.status")} *</Label>
                <Select value={form.leaseStatus} onValueChange={v => setForm(f => ({ ...f, leaseStatus: v as LeaseStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LEASE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("leases.startDate")} *</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div><Label>{t("leases.endDate")} *</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>{t("leases.monthlyRent")} *</Label><Input type="number" min={0} value={form.monthlyRent} onChange={e => setForm(f => ({ ...f, monthlyRent: Number(e.target.value) || 0 }))} /></div>
              <div><Label>{t("leases.monthlyCharges")} *</Label><Input type="number" min={0} value={form.monthlyCharges} onChange={e => setForm(f => ({ ...f, monthlyCharges: Number(e.target.value) || 0 }))} /></div>
              <div><Label>{t("leases.dueDay")}</Label><Input type="number" min={1} max={28} value={form.dueDayOfMonth} onChange={e => setForm(f => ({ ...f, dueDayOfMonth: Number(e.target.value) || 1 }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("leases.deposit")}</Label><Input type="number" min={0} value={form.depositOrGuaranteeAmount ?? ""} onChange={e => setForm(f => ({ ...f, depositOrGuaranteeAmount: e.target.value ? Number(e.target.value) : null }))} /></div>
              <div><Label>{t("leases.noticePeriod")}</Label><Input value={form.noticePeriodText} onChange={e => setForm(f => ({ ...f, noticePeriodText: e.target.value }))} /></div>
            </div>
            <div><Label>{t("leases.signedDate")}</Label><Input type="date" value={form.signedDate ?? ""} onChange={e => setForm(f => ({ ...f, signedDate: e.target.value || null }))} /></div>
            <div><Label>{t("common.notes")}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{editingLease ? t("action.save") : t("leases.add")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
