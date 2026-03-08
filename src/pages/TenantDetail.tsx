import { useParams, Link } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ArrowLeft, Mail, Phone, Calendar, CreditCard, MapPin, StickyNote, Clock, AlertTriangle, Shield, Bell, Banknote } from "lucide-react";
import { getTenantFullName, getLeaseLifecycleStatus, GUARANTEE_TYPE_LABELS } from "@/types";
import { ITEM_TYPE_LABELS, SOURCE_TYPE_LABELS } from "@/types/receivables";
import { formatDate, formatCurrency } from "@/lib/formatters";
import { useIntegrityState } from "@/hooks/use-integrity-state";
import { canDeleteTenant, canChangeTenantStatus } from "@/lib/integrity/tenantIntegrity";
import { IntegritySummaryPanel } from "@/components/shared/IntegritySummaryPanel";

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const { tenants, leases, units, properties, getTenantOutstanding, getTenantUnappliedCredit, getCashReceiptsByTenant, getReceivableItemsByTenant, getGuaranteeByLease } = useAppData();
  const { t } = useSettings();

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
  const activeLease = tenantLeases.find(l => l.leaseStatus === "active");
  const activeUnit = activeLease ? units.find(u => u.id === activeLease.unitId) : null;
  const activeProperty = activeLease ? properties.find(p => p.id === activeLease.propertyId) : null;
  const { outstanding, overdue } = getTenantOutstanding(tenant.id);
  const unappliedCredit = getTenantUnappliedCredit(tenant.id);
  const recentReceipts = getCashReceiptsByTenant(tenant.id).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)).slice(0, 10);
  const openReceivables = getReceivableItemsByTenant(tenant.id).filter(ri => ri.outstandingAmount > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const activeGuarantee = activeLease ? getGuaranteeByLease(activeLease.id) : undefined;
  const activeLifecycle = activeLease ? getLeaseLifecycleStatus(activeLease) : undefined;
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link to="/tenants"><ArrowLeft className="h-4 w-4 mr-1" />{t("nav.tenants")}</Link>
        </Button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{getTenantFullName(tenant)}</h1>
          <StatusBadge status={tenant.status} />
        </div>
      </div>

      {/* Contact Info */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("detail.contactInfo")}</CardTitle></CardHeader>
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
      </Card>

      {/* Financial Overview */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("detail.financialOverview")}</CardTitle></CardHeader>
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
                <p className="text-xs text-muted-foreground">Unapplied Credit</p>
                <p className="text-lg font-bold text-primary">
                  <Banknote className="h-4 w-4 inline mr-1" />
                  {formatCurrency(unappliedCredit, activeProperty?.currencyCode, activeProperty?.locale)}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Open Receivables */}
      {openReceivables.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Open Receivables</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Due Date</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Label</TableHead>
                  <TableHead className="text-xs">Lease</TableHead>
                  <TableHead className="text-xs text-right">Outstanding</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
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
                      <TableCell className="text-xs text-muted-foreground">{ITEM_TYPE_LABELS[ri.itemType]}</TableCell>
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
        </Card>
      )}

      {/* Current Lease Summary */}
      {activeLease && activeProperty && activeUnit && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("detail.currentLease")}</CardTitle></CardHeader>
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
        </Card>
      )}

      {/* Recent Cash Receipts */}
      {recentReceipts.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Recent Cash Receipts</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Lease</TableHead>
                  <TableHead className="text-xs text-right">Received</TableHead>
                  <TableHead className="text-xs text-right">Unmatched</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
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
                      <TableCell className="text-xs text-muted-foreground">{SOURCE_TYPE_LABELS[cr.sourceType]}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{cr.reference || "—"}</TableCell>
                      <TableCell><StatusBadge status={cr.status} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Lease History */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("detail.leaseHistory")}</CardTitle></CardHeader>
        <CardContent>
          {tenantLeases.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("detail.noLeases")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Property</TableHead>
                  <TableHead className="text-xs">Unit</TableHead>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
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
                      <TableCell><StatusBadge status={l.leaseStatus} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {tenant.notes && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><StickyNote className="h-4 w-4" />{t("common.notes")}</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{tenant.notes}</p></CardContent>
        </Card>
      )}

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Created: {formatDate(tenant.createdAt, activeProperty?.locale)}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Updated: {formatDate(tenant.updatedAt, activeProperty?.locale)}</span>
      </div>
    </div>
  );
}
