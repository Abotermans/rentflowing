import { useParams, Link } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ArrowLeft, Home, Ruler, BedDouble, Bath, Sofa, CalendarClock, StickyNote, Clock, Building2, Globe, Pencil, AlertTriangle } from "lucide-react";
import { formatCurrency, formatArea, formatDate, getUnitTypeLabel, getCountryName } from "@/lib/formatters";
import { getTenantFullName } from "@/types";

export default function UnitDetail() {
  const { id } = useParams<{ id: string }>();
  const { units, properties, getActiveLease, tenants, getLeaseOutstanding, getLedgerByLease } = useAppData();

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

  // Financial info for active lease
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
          <div className="flex items-center gap-2 mb-3">
            <StatusBadge status={unit.currentStatus} />
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
