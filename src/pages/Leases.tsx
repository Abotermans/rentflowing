import { useState, useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FileText, Plus, Search, Pencil, Trash2, Bell, Clock, CheckCircle2, Undo2, AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Link, useNavigate } from "react-router-dom";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { LEASE_STATUS_ICONS, PROPERTY_ICON } from "@/lib/filterIcons";
import { FileCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { Lease, LifecycleStage, LeaseStatus, RentFormula, GuaranteeStatus, getTenantFullName, getLeaseStatus, getMoveInStatus, getMoveOutStatus, GUARANTEE_TYPE_LABELS } from "@/types";
import type { TranslationKey } from "@/i18n/translations";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/context/SettingsContext";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { canChangeLeaseStatus } from "@/lib/integrity/leaseIntegrity";
import { StatusTransitionAlert } from "@/components/shared/StatusTransitionAlert";
import { OverrideConfirmDialog } from "@/components/shared/OverrideConfirmDialog";
import { useOverrideHistory } from "@/context/OverrideContext";
import type { ValidationResult } from "@/lib/integrity/types";
import { getAllRentTiers, getMonthlyRentForMonths } from "@/lib/rentTiers";
import { formatCurrency as fmtCurrency } from "@/lib/formatters";

const LEASE_STAGES: { value: LifecycleStage; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
  { value: "terminated", label: "Terminated" },
];

const LEASE_STATUS_FILTERS: { value: LeaseStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "under-notice", label: "Under notice" },
  { value: "overdue-end", label: "Overdue end" },
  { value: "ended", label: "Ended" },
  { value: "terminated", label: "Terminated" },
];

type LeaseFormData = Omit<Lease, "id" | "createdAt" | "updatedAt">;

const ALLOWED_TRANSITIONS: Record<LifecycleStage, LifecycleStage[]> = {
  draft: ["draft", "active"],
  active: ["active", "ended", "terminated"],
  ended: ["ended"],
  terminated: ["terminated"],
};

export default function Leases() {
  const navigate = useNavigate();
  const { leases, tenants, units, properties, addLease, updateLease, deleteLease, getActiveLease, getGuaranteeByLease } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const integrityState = useIntegrityState();
  const { addOverride } = useOverrideHistory();
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverrideValidation, setPendingOverrideValidation] = useState<ValidationResult | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterProperty, setFilterProperty] = useState<string[]>([]);
  const [filterEndingSoon, setFilterEndingSoon] = useState(false);
  const [filterUnderNotice, setFilterUnderNotice] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingLease, setEditingLease] = useState<Lease | null>(null);

  const emptyForm: LeaseFormData = {
    leaseReference: "", propertyId: properties[0]?.id ?? "", unitId: "", primaryTenantId: "",
    coTenantIds: [], lifecycleStage: "draft", startDate: "", endDate: "",
    monthlyRent: 0, monthlyCharges: 0, dueDayOfMonth: 1,
    depositOrGuaranteeAmount: null, noticePeriodText: "3 months",
    signedDate: null, notes: "", rentFormula: 1,
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

  // Status transition validation for the form
  const statusValidation = useMemo(() => {
    if (!editingLease || form.lifecycleStage === editingLease.lifecycleStage) return null;
    return canChangeLeaseStatus(editingLease.id, form.lifecycleStage, integrityState);
  }, [editingLease, form.lifecycleStage, integrityState]);

  const availableStatuses = useMemo(() => {
    if (!editingLease) return LEASE_STAGES; // new lease: all stages
    const allowed = ALLOWED_TRANSITIONS[editingLease.lifecycleStage] || [editingLease.lifecycleStage];
    return LEASE_STAGES.filter(s => allowed.includes(s.value));
  }, [editingLease]);

  const executeLeaseSave = () => {
    if (editingLease) {
      updateLease({ ...editingLease, ...form });
      toast({ title: "Lease updated" });
    } else {
      addLease(form);
      toast({ title: "Lease added" });
    }
    setSheetOpen(false);
  };

  const handleSave = () => {
    if (!form.leaseReference.trim() || !form.propertyId || !form.unitId || !form.primaryTenantId || !form.startDate || !form.endDate) {
      toast({ title: "Validation Error", description: "Reference, property, unit, tenant, start date, and end date are required.", variant: "destructive" });
      return;
    }
    const unitForSave = units.find(u => u.id === form.unitId);
    const tierValue = unitForSave ? getMonthlyRentForMonths(unitForSave, form.rentFormula) : null;
    if (tierValue == null) {
      toast({ title: "Validation Error", description: "Selected rent tier is not available for this unit.", variant: "destructive" });
      return;
    }
    // Validate status transition
    if (editingLease && form.lifecycleStage !== editingLease.lifecycleStage) {
      const validation = canChangeLeaseStatus(editingLease.id, form.lifecycleStage, integrityState);
      if (!validation.allowed) {
        if (validation.overrideAllowed) {
          setPendingOverrideValidation(validation);
          setOverrideDialogOpen(true);
          return;
        }
        toast({ title: "Status change blocked", description: validation.blockers.map(b => b.message).join(". "), variant: "destructive" });
        return;
      }
      // Show warning toast if allowed but has warnings
      if (validation.warnings.length > 0) {
        toast({ title: "Lease saved with warnings", description: validation.warnings.map(w => w.message).join(". ") });
      }
    }
    if (form.lifecycleStage === "active") {
      const existing = getActiveLease(form.unitId);
      if (existing && existing.id !== editingLease?.id) {
        toast({ title: "Conflict", description: `Unit already has an active lease: ${existing.leaseReference}`, variant: "destructive" });
        return;
      }
    }
    executeLeaseSave();
  };

  const handleLeaseOverrideConfirm = (reason: string) => {
    if (!editingLease || !pendingOverrideValidation) return;
    addOverride({
      entityType: "lease",
      entityId: editingLease.id,
      action: `status_change:${form.lifecycleStage}`,
      blockerCodes: pendingOverrideValidation.blockers.map(b => b.code),
      reason,
    });
    updateLease({ ...editingLease, ...form });
    setSheetOpen(false);
    toast({ title: "Lease updated (overridden)", description: `Override reason: ${reason}` });
    setPendingOverrideValidation(null);
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
    const matchStatus = filterStatus.length === 0 || filterStatus.includes(getLeaseStatus(l));
    const matchProperty = filterProperty.length === 0 || filterProperty.includes(l.propertyId);
    const matchEnding = !filterEndingSoon || (l.lifecycleStage === "active" && new Date(l.endDate) <= in90Days);
    const matchNotice = !filterUnderNotice || l.noticeGiven;
    return matchSearch && matchStatus && matchProperty && matchEnding && matchNotice;
  });

  const formUnits = units.filter(u => u.propertyId === form.propertyId);

  const selectedUnit = useMemo(() => units.find(u => u.id === form.unitId), [units, form.unitId]);
  const availableTiers = useMemo(
    () => (selectedUnit ? getAllRentTiers(selectedUnit) : []),
    [selectedUnit],
  );
  const selectedProperty = useMemo(
    () => properties.find(p => p.id === form.propertyId),
    [properties, form.propertyId],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("leases.title")}</h1>
          <p className="text-sm text-muted-foreground">{leases.length} {t("leases.title").toLowerCase()}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative inline-flex">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("action.search")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 min-w-[180px] max-w-[400px] [field-sizing:content]" />
          </div>
          <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-2" />{t("leases.add")}</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <MultiSelectFilter
          label={t("filter.status")}
          icon={FileCheck}
          values={filterStatus}
          onChange={setFilterStatus}
          options={LEASE_STATUS_FILTERS.map(s => ({ value: s.value, label: s.label, icon: LEASE_STATUS_ICONS[s.value] }))}
        />
        <MultiSelectFilter
          label={t("filter.property")}
          icon={PROPERTY_ICON}
          values={filterProperty}
          onChange={setFilterProperty}
          options={properties.map(p => ({ value: p.id, label: p.name, icon: PROPERTY_ICON }))}
        />
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
                <TableHead>{t("leases.formula")}</TableHead>
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
                return (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/leases/${l.id}`)}>
                    <TableCell className="font-mono text-xs font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="text-foreground">{l.leaseReference}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tenant ? <Link to={`/tenants/${tenant.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{getTenantFullName(tenant)}</Link> : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {prop ? <Link to={`/properties/${prop.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{prop.name}</Link> : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {unit ? <Link to={`/units/${unit.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{unit.unitCode}</Link> : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.rentFormula === 1 ? "outline" : l.rentFormula >= 12 ? "default" : "secondary"}>
                        {l.rentFormula === 1
                          ? t("leases.formula.monthly")
                          : `${l.rentFormula} ${t("units.advancePeriodMonths").toLowerCase().replace(/\s*\(.*\)/, "")}`}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        <StatusBadge status={getLeaseStatus(l)} />
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
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(l); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <div onClick={(e) => e.stopPropagation()}>
                          <DeleteDialog entityType="lease" entityId={l.id} entityLabel="lease" onDelete={handleDelete} />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingLease ? t("leases.edit") : t("leases.add")}</DialogTitle></DialogHeader>
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
                <Select value={form.unitId} onValueChange={v => {
                  const newUnit = units.find(u => u.id === v);
                  setForm(f => {
                    const next: LeaseFormData = { ...f, unitId: v };
                    const rent = newUnit ? getMonthlyRentForMonths(newUnit, f.rentFormula) : null;
                    if (rent == null) {
                      // Selected duration not available on this unit — fall back to 1 month.
                      return {
                        ...next,
                        rentFormula: 1,
                        monthlyRent: newUnit?.baseRent ?? f.monthlyRent,
                        hasAdvancePayment: false, advancePaymentAmount: null, advancePaymentDate: null,
                        advanceAllocationMethod: null, advanceAppliedTo: null,
                        advanceAllocationStartDate: null, advanceAllocationDurationMonths: null,
                        fixedMonthlyReductionAmount: null,
                      };
                    }
                    return { ...next, monthlyRent: rent };
                  });
                }}>
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
                <Select value={form.lifecycleStage} onValueChange={v => setForm(f => ({ ...f, lifecycleStage: v as LifecycleStage }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{availableStatuses.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
                <StatusTransitionAlert validation={statusValidation} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("leases.startDate")} *</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div><Label>{t("leases.endDate")} *</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            <div>
              <Label>{t("leases.formula")} *</Label>
              <Select
                value={String(form.rentFormula)}
                onValueChange={(raw) => {
                  const months = Number(raw) as RentFormula;
                  const rent = selectedUnit ? getMonthlyRentForMonths(selectedUnit, months) : null;
                  const effectiveRent = rent ?? selectedUnit?.baseRent ?? form.monthlyRent;
                  if (months === 1) {
                    setForm(f => ({
                      ...f, rentFormula: months, monthlyRent: effectiveRent,
                      hasAdvancePayment: false, advancePaymentAmount: null, advancePaymentDate: null,
                      advanceAllocationMethod: null, advanceAppliedTo: null,
                      advanceAllocationStartDate: null, advanceAllocationDurationMonths: null,
                      fixedMonthlyReductionAmount: null,
                    }));
                  } else {
                    setForm(f => ({
                      ...f, rentFormula: months, monthlyRent: effectiveRent,
                      hasAdvancePayment: true, advancePaymentAmount: effectiveRent * months,
                      advanceAllocationMethod: 'spread-evenly', advanceAppliedTo: 'rent',
                      advanceAllocationStartDate: f.startDate || null,
                      advanceAllocationDurationMonths: months, fixedMonthlyReductionAmount: null,
                    }));
                  }
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableTiers.length === 0 && (
                    <SelectItem value="1" disabled>{t("leases.formula.notAvailable")}</SelectItem>
                  )}
                  {availableTiers.map(tier => (
                    <SelectItem key={tier.durationMonths} value={String(tier.durationMonths)}>
                      {tier.durationMonths === 1
                        ? t("leases.formula.monthly")
                        : `${tier.durationMonths} months`}
                      {selectedProperty
                        ? ` — ${fmtCurrency(tier.monthlyRent, selectedProperty.currencyCode, selectedProperty.locale)}/mo`
                        : ` — ${tier.monthlyRent}/mo`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.rentFormula !== 1 && form.advancePaymentAmount != null && (
                <p className="text-xs text-muted-foreground mt-1">
                  Advance: {form.advancePaymentAmount.toLocaleString()} ({form.advanceAllocationDurationMonths} months)
                </p>
              )}
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
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={handleSave}>{editingLease ? t("action.save") : t("leases.add")}</Button>
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
          onOverride={handleLeaseOverrideConfirm}
        />
      )}
    </div>
  );
}
