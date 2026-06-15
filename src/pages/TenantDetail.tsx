import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ArrowLeft, Mail, Phone, Calendar, CreditCard, MapPin, StickyNote, Clock, AlertTriangle, Banknote, MoreVertical, Trash2, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { getTenantFullName, getLeaseStatus, GUARANTEE_TYPE_LABELS } from "@/types";
import { getItemTypeLabel, getSourceTypeLabel } from "@/types/receivables";
import { formatDate, formatCurrency } from "@/lib/formatters";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DeleteDialog } from "@/components/shared/DeleteDialog";
import { useToast } from "@/hooks/use-toast";

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const { tenants, leases, units, properties, deleteTenant, getTenantOutstanding, getTenantUnappliedCredit, getCashReceiptsByTenant, getReceivableItemsByTenant, getGuaranteeByLease } = useAppData();
  const { t } = useSettings();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [contactOpen, setContactOpen] = useState(true);
  const [financialOpen, setFinancialOpen] = useState(true);
  const [receivablesOpen, setReceivablesOpen] = useState(true);
  const [currentLeaseOpen, setCurrentLeaseOpen] = useState(true);
  const [receiptsOpen, setReceiptsOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);

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
  const activeLease = tenantLeases.find(l => l.lifecycleStage === "active");
  const activeUnit = activeLease ? units.find(u => u.id === activeLease.unitId) : null;
  const activeProperty = activeLease ? properties.find(p => p.id === activeLease.propertyId) : null;
  const { outstanding, overdue } = getTenantOutstanding(tenant.id);
  const unappliedCredit = getTenantUnappliedCredit(tenant.id);
  const recentReceipts = getCashReceiptsByTenant(tenant.id).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)).slice(0, 10);
  const openReceivables = getReceivableItemsByTenant(tenant.id).filter(ri => ri.outstandingAmount > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const activeGuarantee = activeLease ? getGuaranteeByLease(activeLease.id) : undefined;
  const activeLifecycle = activeLease ? getLeaseStatus(activeLease) : undefined;
  const today = new Date().toISOString().split("T")[0];

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
            <span className="inline-flex items-center justify-center h-7 w-7">
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", contactOpen && "rotate-180")} />
            </span>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-2"><Mail className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{t("tenants.email")}</p><p className="text-sm font-medium text-foreground">{tenant.email}</p></div></div>
            <div className="flex items-start gap-2"><Phone className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{t("tenants.phone")}</p><p className="text-sm font-medium text-foreground">{tenant.phone || "—"}</p></div></div>
            <div className="flex items-start gap-2"><Calendar className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{t("tenants.dateOfBirth")}</p><p className="text-sm font-medium text-foreground">{tenant.dateOfBirth ? formatDate(tenant.dateOfBirth) : "—"}</p></div></div>
            {tenant.identificationNumber && (
              <div className="flex items-start gap-2"><CreditCard className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{t("detail.idNumber")}</p><p className="text-sm font-medium text-foreground">{tenant.identificationNumber}</p></div></div>
            )}
            {tenant.currentAddress && (
              <div className="flex items-start gap-2 col-span-2"><MapPin className="h-4 w-4 text-muted-foreground mt-0.5" /><div><p className="text-xs text-muted-foreground">{t("tenants.currentAddress")}</p><p className="text-sm font-medium text-foreground">{tenant.currentAddress}</p></div></div>
            )}
          </div>
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      <Collapsible open={financialOpen} onOpenChange={setFinancialOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
            <CardTitle className="text-base font-medium flex-1 justify-start">{t("detail.financialOverview")}</CardTitle>
            <span className="inline-flex items-center justify-center h-7 w-7">
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", financialOpen && "rotate-180")} />
            </span>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">{t("detail.totalOutstanding")}</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(outstanding, activeProperty?.currencyCode, activeProperty?.locale)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("table.overdue")}</p>
              <p className={`text-lg font-bold ${overdue > 0 ? "text-destructive" : "text-foreground"}`}>
                {overdue > 0 && <AlertTriangle className="h-4 w-4 inline mr-1" />}
                {formatCurrency(overdue, activeProperty?.currencyCode, activeProperty?.locale)}
              </p>
            </div>
            {unappliedCredit > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">{t("units.unappliedCredit")}</p>
                <p className="text-lg font-bold text-primary">
                  <Banknote className="h-4 w-4 inline mr-1" />
                  {formatCurrency(unappliedCredit, activeProperty?.currencyCode, activeProperty?.locale)}
                </p>
              </div>
            )}
          </div>
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      {/* Open Receivables */}
      {openReceivables.length > 0 && (
        <Collapsible open={receivablesOpen} onOpenChange={setReceivablesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
              <CardTitle className="text-base font-medium flex-1 justify-start">{t("tenantDetail.openReceivables")}</CardTitle>
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", receivablesOpen && "rotate-180")} />
              </span>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("tenantDetail.dueDate")}</TableHead>
                  <TableHead className="text-xs">{t("table.type")}</TableHead>
                  <TableHead className="text-xs">{t("tenantDetail.label")}</TableHead>
                  <TableHead className="text-xs">{t("tenantDetail.lease")}</TableHead>
                  <TableHead className="text-xs text-right">{t("table.outstanding")}</TableHead>
                  <TableHead className="text-xs">{t("table.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openReceivables.map(ri => {
                  const lease = ri.leaseId ? leases.find(l => l.id === ri.leaseId) : undefined;
                  let effectiveStatus = ri.status;
                  if (ri.outstandingAmount > 0 && ri.dueDate < today && (ri.status === "open" || ri.status === "partially-paid")) effectiveStatus = "overdue";
                  return (
                    <TableRow key={ri.id}>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(ri.dueDate, activeProperty?.locale)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{getItemTypeLabel(t, ri.itemType)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ri.label}</TableCell>
                      <TableCell className="font-mono text-xs">{lease ? <Link to={`/leases/${lease.id}`} className="hover:underline text-foreground">{lease.leaseReference}</Link> : "—"}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(ri.outstandingAmount, ri.currencyCode, activeProperty?.locale)}</TableCell>
                      <TableCell><StatusBadge status={effectiveStatus} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
          </CollapsibleContent>
        </Card>
        </Collapsible>
      )}

      {/* Current Lease Summary */}
      {activeLease && activeProperty && activeUnit && (
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
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><p className="text-xs text-muted-foreground">{t("leases.reference")}</p><Link to={`/leases/${activeLease.id}`} className="text-sm font-medium text-primary hover:underline">{activeLease.leaseReference}</Link></div>
              <div><p className="text-xs text-muted-foreground">{t("table.unit")}</p><Link to={`/units/${activeUnit.id}`} className="text-sm font-medium text-primary hover:underline">{activeUnit.unitCode}</Link></div>
              <div><p className="text-xs text-muted-foreground">{t("table.property")}</p><Link to={`/properties/${activeProperty.id}`} className="text-sm font-medium text-primary hover:underline">{activeProperty.name}</Link></div>
              <div><p className="text-xs text-muted-foreground">{t("leases.period")}</p><p className="text-sm font-medium text-foreground">{formatDate(activeLease.startDate, activeProperty.locale)} — {formatDate(activeLease.endDate, activeProperty.locale)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("leases.monthlyRent")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(activeLease.monthlyRent, activeProperty.currencyCode, activeProperty.locale)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("leases.monthlyCharges")}</p><p className="text-sm font-medium text-foreground">{formatCurrency(activeLease.monthlyCharges, activeProperty.currencyCode, activeProperty.locale)}</p></div>
              {activeGuarantee && (
                <>
                  <div><p className="text-xs text-muted-foreground">{t("detail.guaranteeType")}</p><p className="text-sm font-medium text-foreground">{GUARANTEE_TYPE_LABELS[activeGuarantee.type]}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("detail.guaranteeStatus")}</p><StatusBadge status={activeGuarantee.status} /></div>
                </>
              )}
              {activeLease.noticeGiven && (
                <div><p className="text-xs text-muted-foreground">{t("detail.noticeStatus")}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <StatusBadge status="under-notice" />
                    {activeLease.intendedMoveOutDate && <span className="text-xs text-muted-foreground">{t("detail.moveOutLabel")}: {formatDate(activeLease.intendedMoveOutDate, activeProperty.locale)}</span>}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
          </CollapsibleContent>
        </Card>
        </Collapsible>
      )}

      {/* Recent Cash Receipts */}
      {recentReceipts.length > 0 && (
        <Collapsible open={receiptsOpen} onOpenChange={setReceiptsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
              <CardTitle className="text-base font-medium flex-1 justify-start">{t("tenantDetail.recentCashReceipts")}</CardTitle>
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", receiptsOpen && "rotate-180")} />
              </span>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
          <CardContent>
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

      {/* Notes */}
      {tenant.notes && (
        <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 cursor-pointer flex-row items-center space-y-0">
              <CardTitle className="text-base font-medium flex items-center gap-1.5 flex-1 justify-start"><StickyNote className="h-4 w-4" />{t("common.notes")}</CardTitle>
              <span className="inline-flex items-center justify-center h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", notesOpen && "rotate-180")} />
              </span>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent><p className="text-sm text-muted-foreground">{tenant.notes}</p></CardContent>
          </CollapsibleContent>
        </Card>
        </Collapsible>
      )}

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("tenantDetail.created")}: {formatDate(tenant.createdAt, activeProperty?.locale)}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t("tenantDetail.updated")}: {formatDate(tenant.updatedAt, activeProperty?.locale)}</span>
      </div>
    </div>
  );
}
