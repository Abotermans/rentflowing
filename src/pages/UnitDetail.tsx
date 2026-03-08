import { useParams, Link } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ArrowLeft, Home, Ruler, BedDouble, Bath, Sofa, CalendarClock, StickyNote, Clock, Building2, Globe, Pencil, AlertTriangle, Bell, Truck, Wrench } from "lucide-react";
import { formatCurrency, formatArea, formatDate, getUnitTypeLabel, getCountryName } from "@/lib/formatters";
import { getTenantFullName, getLeaseLifecycleStatus, getMoveInStatus, getMoveOutStatus } from "@/types";
import { MAINTENANCE_CATEGORY_LABELS } from "@/types/maintenance";

export default function UnitDetail() {
  const { id } = useParams<{ id: string }>();
  const { units, properties, getActiveLease, tenants, getLeaseOutstanding, getLedgerByLease, getTicketsByUnit } = useAppData();

  const unit = units.find(u => u.id === id);
  const property = unit ? properties.find(p => p.id === unit.propertyId) : null;

  if (!unit || !property) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Unit not found.</p>
        <Button variant="link" asChild className="mt-2"><Link to="/units">← Back to Units</Link></Button>
      </div>
    );
  }

  const activeLease = getActiveLease(unit.id);
  const tenant = activeLease ? tenants.find(t => t.id === activeLease.primaryTenantId) : null;
  const lifecycle = activeLease ? getLeaseLifecycleStatus(activeLease) : null;
  const moveIn = activeLease ? getMoveInStatus(activeLease) : null;
  const moveOut = activeLease ? getMoveOutStatus(activeLease) : null;

  const leaseFinancials = activeLease ? getLeaseOutstanding(activeLease.id) : null;
  const ledger = activeLease ? getLedgerByLease(activeLease.id) : [];
  const today = new Date().toISOString().split("T")[0];
  const nextDueLine = ledger.filter(ll => ll.remainingBalance > 0 && ll.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  const infoItems = [
    { label: "Type", value: getUnitTypeLabel(unit.unitType), icon: Home },
    { label: "Floor", value: unit.floor != null ? String(unit.floor) : "—", icon: Home },
    { label: "Surface", value: unit.surfaceArea != null ? formatArea(unit.surfaceArea, property.measurementSystem) : "—", icon: Ruler },
    { label: "Bedrooms", value: String(unit.bedrooms), icon: BedDouble },
    { label: "Bathrooms", value: String(unit.bathrooms), icon: Bath },
    { label: "Furnished", value: unit.furnished ? "Yes" : "No", icon: Sofa },
    { label: "Available From", value: unit.availableFrom ? formatDate(unit.availableFrom, property.locale) : "—", icon: CalendarClock },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link to="/units"><ArrowLeft className="h-4 w-4 mr-1" />Units</Link>
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{unit.unitCode}</h1>
              <StatusBadge status={unit.currentStatus} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">{unit.unitLabel}</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Property: <Link to={`/properties/${property.id}`} className="hover:underline text-primary">{property.name}</Link>
              <span className="mx-1 text-muted-foreground">·</span>
              <span className="font-mono text-xs">{property.referenceCode}</span>
              <span className="mx-1 text-muted-foreground">·</span>
              {property.city}, {getCountryName(property.countryCode)}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/units"><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Link>
          </Button>
        </div>
      </div>

      {/* Main Info */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Unit Information</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {infoItems.map(item => (
              <div key={item.label} className="flex items-start gap-2">
                <item.icon className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium text-foreground">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Financial Defaults */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Financial Defaults</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Base Rent</p>
              <p className="text-lg font-bold text-foreground">
                {unit.baseRent != null ? formatCurrency(unit.baseRent, property.currencyCode, property.locale) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Base Charges</p>
              <p className="text-lg font-bold text-foreground">
                {unit.baseCharges != null ? formatCurrency(unit.baseCharges, property.currencyCode, property.locale) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Currency</p>
              <p className="text-lg font-bold text-foreground">{property.currencyCode}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Occupancy */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Occupancy</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <StatusBadge status={unit.currentStatus} />
            {lifecycle && lifecycle !== "active" && lifecycle !== "draft" && <StatusBadge status={lifecycle} />}
            {activeLease && moveIn === "scheduled" && <StatusBadge status="scheduled" />}
            {activeLease && activeLease.returnStatus && activeLease.returnStatus !== "completed" && <StatusBadge status={activeLease.returnStatus} />}
          </div>
          {activeLease && tenant ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Tenant</p>
                <Link to={`/tenants/${tenant.id}`} className="text-sm font-medium text-primary hover:underline">{getTenantFullName(tenant)}</Link>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Lease</p>
                <Link to={`/leases/${activeLease.id}`} className="text-sm font-medium text-primary hover:underline">{activeLease.leaseReference}</Link>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Period</p>
                <p className="text-sm font-medium text-foreground">{formatDate(activeLease.startDate, property.locale)} — {formatDate(activeLease.endDate, property.locale)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Monthly Rent</p>
                <p className="text-sm font-medium text-foreground">{formatCurrency(activeLease.monthlyRent, property.currencyCode, property.locale)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Monthly Charges</p>
                <p className="text-sm font-medium text-foreground">{formatCurrency(activeLease.monthlyCharges, property.currencyCode, property.locale)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Monthly</p>
                <p className="text-sm font-bold text-primary">{formatCurrency(activeLease.monthlyRent + activeLease.monthlyCharges, property.currencyCode, property.locale)}</p>
              </div>

              {/* Move-in/out status */}
              {activeLease.moveInActualDate && (
                <div>
                  <p className="text-xs text-muted-foreground">Moved In</p>
                  <p className="text-sm font-medium text-foreground">{formatDate(activeLease.moveInActualDate, property.locale)}</p>
                </div>
              )}
              {activeLease.moveOutScheduledDate && !activeLease.moveOutActualDate && (
                <div>
                  <p className="text-xs text-muted-foreground">Move-Out Planned</p>
                  <p className="text-sm font-medium text-warning">{formatDate(activeLease.moveOutScheduledDate, property.locale)}</p>
                </div>
              )}

              {/* Under notice indicator */}
              {activeLease.noticeGiven && (
                <div className="col-span-full">
                  <div className="flex items-center gap-2 p-3 rounded-md bg-warning/10 border border-warning/30">
                    <Bell className="h-4 w-4 text-warning" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Under Notice</p>
                      {activeLease.intendedMoveOutDate && (
                        <p className="text-xs text-muted-foreground">
                          Intended move-out: {formatDate(activeLease.intendedMoveOutDate, property.locale)}
                          — Available from {formatDate(activeLease.intendedMoveOutDate, property.locale)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Move-out scheduled but not under notice */}
              {!activeLease.noticeGiven && activeLease.moveOutScheduledDate && !activeLease.moveOutActualDate && (
                <div className="col-span-full">
                  <div className="flex items-center gap-2 p-3 rounded-md bg-primary/10 border border-primary/30">
                    <Truck className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Move-out scheduled</p>
                      <p className="text-xs text-muted-foreground">Available from {formatDate(activeLease.moveOutScheduledDate, property.locale)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Financial balance */}
              {leaseFinancials && leaseFinancials.outstanding > 0 && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Outstanding Balance</p>
                    <p className="text-sm font-bold text-foreground">{formatCurrency(leaseFinancials.outstanding, property.currencyCode, property.locale)}</p>
                  </div>
                  {leaseFinancials.overdue > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Overdue</p>
                      <p className="text-sm font-bold text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                        {formatCurrency(leaseFinancials.overdue, property.currencyCode, property.locale)}
                      </p>
                    </div>
                  )}
                </>
              )}
              {nextDueLine && (
                <div>
                  <p className="text-xs text-muted-foreground">Next Due</p>
                  <p className="text-sm font-medium text-foreground">
                    {formatCurrency(nextDueLine.remainingBalance, property.currencyCode, property.locale)} on {formatDate(nextDueLine.dueDate, property.locale)}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active lease. Tenant and lease management available via the Leases module.</p>
          )}
        </CardContent>
      </Card>

      {/* Property Context */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5"><Building2 className="h-4 w-4" />Property Context</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Property</p>
              <Link to={`/properties/${property.id}`} className="text-sm font-medium text-primary hover:underline">{property.name}</Link>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">City</p>
              <p className="text-sm font-medium text-foreground">{property.city}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Country</p>
              <p className="text-sm font-medium text-foreground">{getCountryName(property.countryCode)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Locale</p>
              <p className="text-sm font-medium text-foreground font-mono">{property.locale}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Measurement</p>
              <p className="text-sm font-medium text-foreground capitalize">{property.measurementSystem}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance */}
      {(() => {
        const unitTickets = getTicketsByUnit(unit.id);
        const openMaintenance = unitTickets.filter(t => t.status !== "completed" && t.status !== "cancelled");
        const historyMaintenance = unitTickets.filter(t => t.status === "completed" || t.status === "cancelled");
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Wrench className="h-4 w-4" />Maintenance ({unitTickets.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {unitTickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No maintenance tickets for this unit.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Title</TableHead>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-xs">Priority</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unitTickets.map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium"><Link to={`/maintenance/${t.id}`} className="hover:underline text-foreground">{t.title}</Link></TableCell>
                        <TableCell className="text-xs">{MAINTENANCE_CATEGORY_LABELS[t.category]}</TableCell>
                        <TableCell><StatusBadge status={t.priority} /></TableCell>
                        <TableCell><StatusBadge status={t.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(t.createdDate, property.locale)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Notes */}
      {unit.notes && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><StickyNote className="h-4 w-4" />Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{unit.notes}</p></CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Created: {formatDate(unit.createdAt, property.locale)}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Updated: {formatDate(unit.updatedAt, property.locale)}</span>
      </div>
    </div>
  );
}
