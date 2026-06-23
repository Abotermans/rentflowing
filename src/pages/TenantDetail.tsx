import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ArrowLeft, Mail, Phone, Calendar, CreditCard, MapPin, Clock, MoreVertical, Trash2, ChevronDown, Pencil, Plus, Building2, User, Briefcase, Hash, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { getTenantFullName, getLeaseStatus, GUARANTEE_TYPE_LABELS } from "@/types";
import { getItemTypeLabel, getSourceTypeLabel } from "@/types/receivables";
import { formatDate, formatCurrency, formatPeriodMonth } from "@/lib/formatters";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { useTableSort, useSortedRows } from "@/hooks/use-table-sort";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { TenantDialog } from "@/components/tenants/TenantDialog";
import { CashReceiptDialog } from "@/components/payments/CashReceiptDialog";
import { useToast } from "@/hooks/use-toast";
import { formatMoneyGroups, sumMoneyByCurrency } from "@/lib/money";

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const { tenants, leases, units, properties, deleteTenant, updateTenant, getTenantUnappliedCredit, getCashReceiptsByTenant, getReceivableItemsByTenant, getGuaranteeByLease } = useAppData();
  const { t } = useSettings();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [contactOpen, setContactOpen] = useState(true);
  const [receivablesOpen, setReceivablesOpen] = useState(true);
  const [currentLeaseOpen, setCurrentLeaseOpen] = useState(true);
  const [receiptsOpen, setReceiptsOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const [editTenantOpen, setEditTenantOpen] = useState(false);
  const [recordReceiptOpen, setRecordReceiptOpen] = useState(false);
  const [editNotesOpen, setEditNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  const tenant = tenants.find(tn => tn.id === id);
  if (!tenant) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("detail.tenantNotFound")}</p>
        <Button variant="link" asChild className="mt-2"><Link to="/tenants">← {t("nav.tenants")}</Link></Button>
      </div>
    );
  }

  const tenantLeases = leases.filter(l => l.primaryTenantId === tenant.id || l.coTenantIds.includes(tenant.id));
  const activeLeases = tenantLeases.filter(l => l.lifecycleStage === "active");
  const activeLease = activeLeases[0];
  const activeProperty = activeLease ? properties.find(p => p.id === activeLease.propertyId) : null;
  const unappliedCredit = getTenantUnappliedCredit(tenant.id);
  const recentReceipts = getCashReceiptsByTenant(tenant.id).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)).slice(0, 10);
  const tenantReceivables = getReceivableItemsByTenant(tenant.id);
  const today = new Date().toISOString().split("T")[0];

  const recvLocale = activeProperty?.locale;

  const enrichedReceivables = tenantReceivables.map(ri => {
    let effectiveStatus = ri.status;
    if (ri.outstandingAmount > 0 && ri.dueDate < today && (ri.status === "open" || ri.status === "partially-paid")) effectiveStatus = "overdue";
    const lease = ri.leaseId ? leases.find(l => l.id === ri.leaseId) : undefined;
    const unit = ri.unitId ? units.find(u => u.id === ri.unitId) : undefined;
    return { ...ri, effectiveStatus, leaseRef: lease?.leaseReference ?? "", unitCode: unit?.unitCode ?? "", lease, unit };
  });

  const rentCollectedGroups = sumMoneyByCurrency(tenantReceivables
    .filter(ri => ri.itemType === "rent")
    .map(ri => ({ amount: ri.allocatedAmount, currencyCode: ri.currencyCode, locale: recvLocale })));
  const chargesCollectedGroups = sumMoneyByCurrency(tenantReceivables
    .filter(ri => ri.itemType === "charges" || ri.itemType === "charges-adjustment")
    .map(ri => ({ amount: ri.allocatedAmount, currencyCode: ri.currencyCode, locale: recvLocale })));
  const outstandingGroups = sumMoneyByCurrency(tenantReceivables
    .filter(ri => ri.outstandingAmount > 0)
    .map(ri => ({ amount: ri.outstandingAmount, currencyCode: ri.currencyCode, locale: recvLocale })));
  const overdueGroups = sumMoneyByCurrency(tenantReceivables
    .filter(ri => ri.outstandingAmount > 0 && ri.dueDate < today)
    .map(ri => ({ amount: ri.outstandingAmount, currencyCode: ri.currencyCode, locale: recvLocale })));
  const totalExpectedGroups = sumMoneyByCurrency(tenantReceivables.map(ri => ({ amount: ri.expectedAmount, currencyCode: ri.currencyCode, locale: recvLocale })));
  const totalAllocatedGroups = sumMoneyByCurrency(tenantReceivables.map(ri => ({ amount: ri.allocatedAmount, currencyCode: ri.currencyCode, locale: recvLocale })));
  const totalOutstandingGroups = outstandingGroups;
  const overdueTotal = overdueGroups.reduce((s, g) => s + g.amount, 0);

  type RecvSortKey = "period" | "type" | "dueDate" | "lease" | "unit" | "expected" | "allocated" | "outstanding" | "status";
  const { sort: recvSort, toggle: toggleRecvSort } = useTableSort<RecvSortKey>("dueDate", "desc");
  const sortedReceivables = useSortedRows(enrichedReceivables, recvSort, (ri, key) => {
    switch (key) {
      case "period": return ri.periodMonth ?? "";
      case "type": return getItemTypeLabel(t, ri.itemType);
      case "dueDate": return ri.dueDate;
      case "lease": return ri.leaseRef;
      case "unit": return ri.unitCode;
      case "expected": return ri.expectedAmount;
      case "allocated": return ri.allocatedAmount;
      case "outstanding": return ri.outstandingAmount;
      case "status": return ri.effectiveStatus;
    }
  });

  const handleDeleteTenant = (tid: string) => {
    deleteTenant(tid);
    toast({ title: t("tenantDetail.toastDeleted") });
    navigate("/tenants");
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link to="/tenants"><ArrowLeft className="h-4 w-4 mr-1" />{t("nav.tenants")}</Link>
        </Button>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{getTenantFullName(tenant)}</h1>
            <Badge variant="outline" className="gap-1 font-normal">
              {tenant.kind === "corporation"
                ? <><Building2 className="h-3 w-3" />{t("tenants.kind.corporation")}</>
                : <><User className="h-3 w-3" />{t("tenants.kind.individual")}</>}
            </Badge>
            <StatusBadge status={tenant.status} />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t("tenantDetail.moreActions")}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DeleteDialog
                entityType="tenant"
                entityId={tenant.id}
                entityLabel={getTenantFullName(tenant)}
                onDelete={handleDeleteTenant}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />{t("action.delete")}
                  </DropdownMenuItem>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Contact Info */}
      <Collapsible open={contactOpen} onOpenChange={setContactOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex-1 justify-start">{t("detail.contactInfo")}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 gap-1" onClick={(e) => { e.stopPropagation(); setEditTenantOpen(true); }}>
                <Pencil className="h-3.5 w-3.5" />{t("action.edit")}
              </Button>
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", contactOpen && "rotate-180")} />
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {tenant.kind === "corporation" && (
              <>
                <div className="flex items-start gap-2"><Building2 className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{t("tenants.companyName")}</p><p className="text-sm font-medium text-foreground">{tenant.companyName || "—"}</p></div></div>
                {tenant.legalForm && (
                  <div className="flex items-start gap-2"><Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{t("tenants.legalForm")}</p><p className="text-sm font-medium text-foreground">{tenant.legalForm}</p></div></div>
                )}
                {tenant.registrationNumber && (
                  <div className="flex items-start gap-2"><Hash className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{t("tenants.registrationNumber")}</p><p className="text-sm font-medium text-foreground">{tenant.registrationNumber}</p></div></div>
                )}
                {tenant.vatNumber && (
                  <div className="flex items-start gap-2"><Receipt className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{t("tenants.vatNumber")}</p><p className="text-sm font-medium text-foreground">{tenant.vatNumber}</p></div></div>
                )}
                {(tenant.contactFirstName || tenant.contactLastName) && (
                  <div className="flex items-start gap-2"><User className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{t("tenants.mainContact")}</p><p className="text-sm font-medium text-foreground">{`${tenant.contactFirstName ?? ""} ${tenant.contactLastName ?? ""}`.trim()}{tenant.contactRole ? ` — ${tenant.contactRole}` : ""}</p></div></div>
                )}
              </>
            )}
            <div className="flex items-start gap-2"><Mail className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{t("tenants.email")}</p><p className="text-sm font-medium text-foreground">{tenant.email}</p></div></div>
            <div className="flex items-start gap-2"><Phone className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{t("tenants.phone")}</p><p className="text-sm font-medium text-foreground">{tenant.phone || "—"}</p></div></div>
            {tenant.kind === "individual" && (
              <div className="flex items-start gap-2"><Calendar className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{t("tenants.dateOfBirth")}</p><p className="text-sm font-medium text-foreground">{tenant.dateOfBirth ? formatDate(tenant.dateOfBirth) : "—"}</p></div></div>
            )}
            {tenant.kind === "individual" && tenant.identificationNumber && (
              <div className="flex items-start gap-2"><CreditCard className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{t("detail.idNumber")}</p><p className="text-sm font-medium text-foreground">{tenant.identificationNumber}</p></div></div>
            )}
            {tenant.currentAddress && (
              <div className="flex items-start gap-2 col-span-2"><MapPin className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{tenant.kind === "corporation" ? t("tenants.registeredAddress") : t("tenants.currentAddress")}</p><p className="text-sm font-medium text-foreground">{tenant.currentAddress}</p></div></div>
            )}
          </div>
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      {/* Current Lease Summary */}
      {activeLeases.length > 0 && (
        <Collapsible open={currentLeaseOpen} onOpenChange={setCurrentLeaseOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
              <CardTitle className="text-base font-medium flex-1 justify-start">{t("detail.currentLease")}</CardTitle>
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", currentLeaseOpen && "rotate-180")} />
              </span>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
          <CardContent className="space-y-5">
            {activeLeases.map((lease) => {
              const leaseUnit = units.find(u => u.id === lease.unitId);
              const leaseProperty = properties.find(p => p.id === lease.propertyId);
              const guarantee = getGuaranteeByLease(lease.id);
              if (!leaseProperty || !leaseUnit) return null;
              return (
                <div key={lease.id} className="grid grid-cols-2 md:grid-cols-3 gap-4 border-b pb-4 last:border-b-0 last:pb-0">
                  <div><p className="text-xs text-muted-foreground">{t("leases.reference")}</p><Link to={`/leases/${lease.id}`} className="text-sm font-medium text-primary hover:underline">{lease.leaseReference}</Link></div>
                  <div><p className="text-xs text-muted-foreground">{t("table.unit")}</p><Link to={`/units/${leaseUnit.id}`} className="text-sm font-medium text-primary hover:underline">{leaseUnit.unitCode}</Link></div>
                  <div><p className="text-xs text-muted-foreground">{t("table.property")}</p><Link to={`/properties/${leaseProperty.id}`} className="text-sm font-medium text-primary hover:underline">{leaseProperty.name}</Link></div>
                  <div><p className="text-xs text-muted-foreground">{t("leases.period")}</p><p className="text-sm font-medium text-foreground">{formatDate(lease.startDate, leaseProperty.locale)} — {formatDate(lease.endDate, leaseProperty.locale)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("leases.monthlyRent")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(lease.monthlyRent, leaseProperty.currencyCode, leaseProperty.locale)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("leases.monthlyCharges")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(lease.monthlyCharges, leaseProperty.currencyCode, leaseProperty.locale)}</p></div>
                  {guarantee && (
                    <>
                      <div><p className="text-xs text-muted-foreground">{t("detail.guaranteeType")}</p><p className="text-sm font-medium text-foreground">{GUARANTEE_TYPE_LABELS[guarantee.type]}</p></div>
                      <div><p className="text-xs text-muted-foreground">{t("detail.guaranteeStatus")}</p><StatusBadge status={guarantee.status} /></div>
                    </>
                  )}
                  {lease.noticeGiven && (
                    <div><p className="text-xs text-muted-foreground">{t("detail.noticeStatus")}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <StatusBadge status="under-notice" />
                        {lease.intendedMoveOutDate && <span className="text-xs text-muted-foreground">{t("detail.moveOutLabel")}: {formatDate(lease.intendedMoveOutDate, leaseProperty.locale)}</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
          </CollapsibleContent>
        </Card>
        </Collapsible>
      )}

      {/* Lease History */}
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex-1 justify-start">{t("detail.leaseHistory")}</CardTitle>
            <span className="inline-flex items-center justify-center h-7 w-7">
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", historyOpen && "rotate-180")} />
            </span>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
        <CardContent>
          {tenantLeases.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("detail.noLeases")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("table.reference")}</TableHead>
                  <TableHead className="text-xs">{t("table.property")}</TableHead>
                  <TableHead className="text-xs">{t("table.unit")}</TableHead>
                  <TableHead className="text-xs">{t("tenantDetail.period")}</TableHead>
                  <TableHead className="text-xs">{t("table.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantLeases.map(l => {
                  const prop = properties.find(p => p.id === l.propertyId);
                  const unit = units.find(u => u.id === l.unitId);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs"><Link to={`/leases/${l.id}`} className="hover:underline text-foreground">{l.leaseReference}</Link></TableCell>
                      <TableCell className="text-muted-foreground text-sm">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{unit?.unitCode ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatDate(l.startDate, prop?.locale)} — {formatDate(l.endDate, prop?.locale)}</TableCell>
                      <TableCell><StatusBadge status={getLeaseStatus(l)} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      {/* Receivables (KPI strip + sortable scrollable table with sticky totals) */}
      <Collapsible open={receivablesOpen} onOpenChange={setReceivablesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
              <CardTitle className="text-base font-medium flex-1 text-left">{t("leaseDetail.receivables")}</CardTitle>
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", receivablesOpen && "rotate-180")} />
              </span>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-b pb-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t("leaseDetail.rentCollected")}</p>
                  <p className="text-lg font-bold text-success">{formatMoneyGroups(rentCollectedGroups)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("leaseDetail.chargesCollected")}</p>
                  <p className="text-lg font-bold text-success">{formatMoneyGroups(chargesCollectedGroups)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("table.outstanding")}</p>
                  <p className="text-lg font-bold text-foreground">{formatMoneyGroups(outstandingGroups)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("table.overdue")}</p>
                  <p className={`text-lg font-bold ${overdueTotal > 0 ? "text-destructive" : "text-foreground"}`}>
                    
                    {formatMoneyGroups(overdueGroups)}
                  </p>
                </div>
                {unappliedCredit > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t("leaseDetail.unappliedCredit")}</p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(unappliedCredit, activeProperty?.currencyCode, recvLocale)}</p>
                  </div>
                )}
              </div>
              {enrichedReceivables.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("leaseDetail.noReceivables")}</p>
              ) : (
                <div className="max-h-[480px] overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <SortableTableHead sortKey="period" sort={recvSort} onSort={toggleRecvSort} className="text-xs">{t("leaseDetail.period")}</SortableTableHead>
                        <SortableTableHead sortKey="type" sort={recvSort} onSort={toggleRecvSort} className="text-xs">{t("table.type")}</SortableTableHead>
                        <SortableTableHead sortKey="dueDate" sort={recvSort} onSort={toggleRecvSort} className="text-xs">{t("payments.table.dueDate")}</SortableTableHead>
                        <SortableTableHead sortKey="lease" sort={recvSort} onSort={toggleRecvSort} className="text-xs">{t("tenantDetail.lease")}</SortableTableHead>
                        <SortableTableHead sortKey="unit" sort={recvSort} onSort={toggleRecvSort} className="text-xs">{t("table.unit")}</SortableTableHead>
                        <SortableTableHead sortKey="expected" sort={recvSort} onSort={toggleRecvSort} align="right" className="text-xs">{t("payments.table.expected")}</SortableTableHead>
                        <SortableTableHead sortKey="allocated" sort={recvSort} onSort={toggleRecvSort} align="right" className="text-xs">{t("payments.table.allocated")}</SortableTableHead>
                        <SortableTableHead sortKey="outstanding" sort={recvSort} onSort={toggleRecvSort} align="right" className="text-xs">{t("payments.table.outstanding")}</SortableTableHead>
                        <SortableTableHead sortKey="status" sort={recvSort} onSort={toggleRecvSort} className="text-xs">{t("payments.table.status")}</SortableTableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedReceivables.map(ri => (
                        <TableRow key={ri.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {ri.cycleEndDate && (ri.itemType === "rent" || ri.itemType === "charges") && ri.periodMonth
                              ? `${formatPeriodMonth(ri.periodMonth)} → ${formatPeriodMonth(ri.cycleEndDate.slice(0, 7))}`
                              : formatPeriodMonth(ri.periodMonth)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{getItemTypeLabel(t, ri.itemType)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(ri.dueDate, recvLocale)}</TableCell>
                          <TableCell className="font-mono text-xs">{ri.lease ? <Link to={`/leases/${ri.lease.id}`} className="hover:underline text-foreground">{ri.lease.leaseReference}</Link> : "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{ri.unit ? <Link to={`/units/${ri.unit.id}`} className="hover:underline text-foreground">{ri.unit.unitCode}</Link> : "—"}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatCurrency(ri.expectedAmount, ri.currencyCode, recvLocale)}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(ri.allocatedAmount, ri.currencyCode, recvLocale)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{ri.outstandingAmount > 0 ? formatCurrency(ri.outstandingAmount, ri.currencyCode, recvLocale) : "—"}</TableCell>
                          <TableCell><StatusBadge status={ri.effectiveStatus} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter className="sticky bottom-0">
                      <TableRow>
                        <TableCell className="text-xs font-medium" colSpan={5}>{t("leaseDetail.total")}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{formatMoneyGroups(totalExpectedGroups)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{formatMoneyGroups(totalAllocatedGroups)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{formatMoneyGroups(totalOutstandingGroups)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Recent Cash Receipts */}
      <Collapsible open={receiptsOpen} onOpenChange={setReceiptsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
              <CardTitle className="text-base font-medium flex-1 justify-start">{t("tenantDetail.recentCashReceipts")}</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1" onClick={(e) => { e.stopPropagation(); setRecordReceiptOpen(true); }}>
                  <Plus className="h-4 w-4" />{t("payments.recordCashReceipt")}
                </Button>
                <span className="inline-flex items-center justify-center h-7 w-7">
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", receiptsOpen && "rotate-180")} />
                </span>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
          <CardContent>
            {recentReceipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("leaseDetail.noCashReceipts")}</p>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("common.date")}</TableHead>
                  <TableHead className="text-xs">{t("tenantDetail.lease")}</TableHead>
                  <TableHead className="text-xs text-right">{t("table.received")}</TableHead>
                  <TableHead className="text-xs text-right">{t("tenantDetail.unmatched")}</TableHead>
                  <TableHead className="text-xs">{t("tenantDetail.source")}</TableHead>
                  <TableHead className="text-xs">{t("table.reference")}</TableHead>
                  <TableHead className="text-xs">{t("table.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentReceipts.map(cr => {
                  const lease = cr.leaseId ? leases.find(l => l.id === cr.leaseId) : undefined;
                  const prop = lease ? properties.find(pr => pr.id === lease.propertyId) : undefined;
                  return (
                    <TableRow key={cr.id}>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(cr.paymentDate, prop?.locale)}</TableCell>
                      <TableCell className="font-mono text-xs">{lease ? <Link to={`/leases/${lease.id}`} className="hover:underline text-foreground">{lease.leaseReference}</Link> : "—"}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(cr.amountReceived, cr.currencyCode, prop?.locale)}</TableCell>
                      <TableCell className="text-right text-sm">{cr.unmatchedAmount > 0 ? formatCurrency(cr.unmatchedAmount, cr.currencyCode, prop?.locale) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{getSourceTypeLabel(t, cr.sourceType)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{cr.reference || "—"}</TableCell>
                      <TableCell><StatusBadge status={cr.status} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            )}
          </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Notes */}
      <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex-1 justify-start">{t("common.notes")}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 gap-1" onClick={(e) => { e.stopPropagation(); setNotesDraft(tenant.notes ?? ""); setEditNotesOpen(true); }}>
                <Pencil className="h-3.5 w-3.5" />{t("action.edit")}
              </Button>
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", notesOpen && "rotate-180")} />
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            {tenant.notes
              ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{tenant.notes}</p>
              : <p className="text-sm text-muted-foreground italic">—</p>}
          </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      <TenantDialog open={editTenantOpen} onOpenChange={setEditTenantOpen} editingTenant={tenant} />
      <CashReceiptDialog
        open={recordReceiptOpen}
        onOpenChange={setRecordReceiptOpen}
        prefillTenantId={tenant.id}
        prefillLeaseId={activeLease?.id}
        lockTenant
      />

      <Dialog open={editNotesOpen} onOpenChange={setEditNotesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.notes")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tenant-notes">{t("common.notes")}</Label>
            <Textarea id="tenant-notes" rows={6} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNotesOpen(false)}>{t("action.cancel")}</Button>
            <Button onClick={() => { updateTenant({ ...tenant, notes: notesDraft, updatedAt: new Date().toISOString() }); setEditNotesOpen(false); }}>{t("action.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("tenantDetail.created")}: {formatDate(tenant.createdAt, activeProperty?.locale)}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("tenantDetail.updated")}: {formatDate(tenant.updatedAt, activeProperty?.locale)}</span>
      </div>
    </div>
  );
}
