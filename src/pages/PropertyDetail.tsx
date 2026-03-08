import { useParams, Link } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Ban, TrendingUp, DoorOpen, Info } from "lucide-react";
import { formatCurrency, formatArea, getCountryName, getPropertyTypeLabel, getUnitTypeLabel } from "@/lib/formatters";

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const { properties, units, getPropertyStats } = useAppData();

  const property = properties.find(p => p.id === id);
  const propertyUnits = units.filter(u => u.propertyId === id);
  const stats = id ? getPropertyStats(id) : null;

  if (!property) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Property not found.</p>
        <Button variant="link" asChild className="mt-2"><Link to="/properties">← Back to Properties</Link></Button>
      </div>
    );
  }

  const kpis = [
    { label: "Total", value: stats?.total ?? 0, icon: DoorOpen, color: "text-foreground" },
    { label: "Occupied", value: stats?.occupied ?? 0, icon: CheckCircle2, color: "text-success" },
    { label: "Vacant", value: stats?.vacant ?? 0, icon: XCircle, color: "text-warning" },
    { label: "Reserved", value: stats?.reserved ?? 0, icon: Clock, color: "text-primary" },
    { label: "Unavailable", value: stats?.unavailable ?? 0, icon: Ban, color: "text-muted-foreground" },
    { label: "Occupancy", value: `${stats?.occupancyRate ?? 0}%`, icon: TrendingUp, color: "text-success" },
  ];

  const fullAddress = [
    property.address1,
    property.address2,
    [property.postalCode, property.city].filter(Boolean).join(" "),
    property.regionOrState,
    getCountryName(property.countryCode),
  ].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link to="/properties"><ArrowLeft className="h-4 w-4 mr-1" />Properties</Link>
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{property.name}</h1>
              <StatusBadge status={property.status} />
            </div>
            <p className="text-sm text-muted-foreground mt-1 font-mono">{property.referenceCode}</p>
            <div className="flex gap-2 mt-2">
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{getPropertyTypeLabel(property.propertyType)}</span>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{property.currencyCode}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Overview & Local Settings */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Overview</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Address</span>
              <span className="text-sm font-medium text-foreground text-right max-w-[60%]">{fullAddress}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Owner</span>
              <span className="text-sm font-medium text-foreground">{property.ownerName || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Country</span>
              <span className="text-sm font-medium text-foreground">{getCountryName(property.countryCode)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Type</span>
              <span className="text-sm font-medium text-foreground">{getPropertyTypeLabel(property.propertyType)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <StatusBadge status={property.status} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Local Settings</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Locale</span>
              <span className="text-sm font-medium text-foreground font-mono">{property.locale}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Currency</span>
              <span className="text-sm font-medium text-foreground">{property.currencyCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Measurement</span>
              <span className="text-sm font-medium text-foreground capitalize">{property.measurementSystem}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</p>
                  <p className="text-xl font-bold text-foreground mt-0.5">{k.value}</p>
                </div>
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Description */}
      {property.description && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Description</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{property.description}</p></CardContent>
        </Card>
      )}

      {/* Units (read-only) */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Units</h2>
        {propertyUnits.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No units in this property yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Unit management will be available in the next phase.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Floor</TableHead>
                  <TableHead className="text-right">Surface</TableHead>
                  <TableHead className="text-right">Rent</TableHead>
                  <TableHead className="text-right">Charges</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propertyUnits.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs font-medium text-foreground">{u.unitCode}</TableCell>
                    <TableCell className="text-muted-foreground">{u.unitLabel}</TableCell>
                    <TableCell className="text-muted-foreground">{getUnitTypeLabel(u.unitType)}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{u.floor != null ? u.floor : "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{u.surfaceArea != null ? formatArea(u.surfaceArea, property.measurementSystem) : "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{u.baseRent != null ? formatCurrency(u.baseRent, property.currencyCode, property.locale) : "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{u.baseCharges != null ? formatCurrency(u.baseCharges, property.currencyCode, property.locale) : "—"}</TableCell>
                    <TableCell><StatusBadge status={u.currentStatus} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Phase placeholder */}
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <Info className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium text-muted-foreground">Unit management will be available in the next phase</p>
          <p className="text-xs text-muted-foreground mt-1">Add, edit, and manage units directly from this property.</p>
        </CardContent>
      </Card>
    </div>
  );
}
