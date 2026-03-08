import { useAppData } from "@/context/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Building2, DoorOpen, CheckCircle2, XCircle, Clock, Ban, TrendingUp, CalendarClock, Globe, Landmark, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, getCountryName, getPropertyTypeLabel, getUnitTypeLabel } from "@/lib/formatters";

export default function Dashboard() {
  const { properties, units, getPropertyStats } = useAppData();

  const totalUnits = units.length;
  const occupied = units.filter(u => u.currentStatus === "occupied").length;
  const vacant = units.filter(u => u.currentStatus === "vacant").length;
  const reserved = units.filter(u => u.currentStatus === "reserved").length;
  const unavailable = units.filter(u => u.currentStatus === "unavailable").length;
  const occupancyRate = totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0;

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const availableSoon = units.filter(u => {
    if (!u.availableFrom) return false;
    const d = new Date(u.availableFrom);
    return d >= now && d <= in30Days;
  }).length;

  const kpis = [
    { label: "Properties", value: properties.length, icon: Building2, color: "text-primary" },
    { label: "Total Units", value: totalUnits, icon: DoorOpen, color: "text-foreground" },
    { label: "Occupied", value: occupied, icon: CheckCircle2, color: "text-success" },
    { label: "Vacant", value: vacant, icon: XCircle, color: "text-warning" },
    { label: "Reserved", value: reserved, icon: Clock, color: "text-primary" },
    { label: "Unavailable", value: unavailable, icon: Ban, color: "text-muted-foreground" },
    { label: "Occupancy Rate", value: `${occupancyRate}%`, icon: TrendingUp, color: "text-success" },
    { label: "Available Soon", value: availableSoon, icon: CalendarClock, color: "text-warning" },
  ];

  const statusSegments = [
    { status: "occupied" as const, count: occupied, className: "bg-success" },
    { status: "reserved" as const, count: reserved, className: "bg-primary" },
    { status: "vacant" as const, count: vacant, className: "bg-warning" },
    { status: "unavailable" as const, count: unavailable, className: "bg-muted-foreground" },
  ];

  // Portfolio by Country
  const countryGroups = properties.reduce<Record<string, number>>((acc, p) => {
    acc[p.countryCode] = (acc[p.countryCode] || 0) + 1;
    return acc;
  }, {});

  // Properties by Type
  const typeGroups = properties.reduce<Record<string, number>>((acc, p) => {
    acc[p.propertyType] = (acc[p.propertyType] || 0) + 1;
    return acc;
  }, {});

  // Configuration Summary
  const uniqueCurrencies = [...new Set(properties.map(p => p.currencyCode))];
  const uniqueLocales = [...new Set(properties.map(p => p.locale))];
  const uniqueMeasurements = [...new Set(properties.map(p => p.measurementSystem))];

  // Recent properties
  const recentProperties = [...properties]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  // Recent units
  const recentUnits = [...units]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);

  // Vacancy overview by property
  const vacancyOverview = properties.map(p => {
    const stats = getPropertyStats(p.id);
    return { ...p, ...stats };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Portfolio overview</p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{k.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{k.value}</p>
                </div>
                <k.icon className={`h-5 w-5 ${k.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Units by Status</CardTitle></CardHeader>
        <CardContent>
          {totalUnits > 0 ? (
            <>
              <div className="h-4 rounded-full overflow-hidden flex bg-muted">
                {statusSegments.map(s => s.count > 0 && (
                  <div key={s.status} className={`h-full ${s.className} transition-all`} style={{ width: `${(s.count / totalUnits) * 100}%` }} />
                ))}
              </div>
              <div className="flex gap-4 mt-3 flex-wrap">
                {statusSegments.map(s => (
                  <div key={s.status} className="flex items-center gap-1.5 text-xs">
                    <div className={`h-2.5 w-2.5 rounded-full ${s.className}`} />
                    <span className="text-muted-foreground capitalize">{s.status}</span>
                    <span className="font-medium text-foreground">{s.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No units yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Vacancy Overview by Property */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Vacancy Overview by Property</CardTitle></CardHeader>
        <CardContent>
          {vacancyOverview.length === 0 ? (
            <p className="text-sm text-muted-foreground">No properties yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Property</TableHead>
                  <TableHead className="text-xs text-center">Total</TableHead>
                  <TableHead className="text-xs text-center">Occupied</TableHead>
                  <TableHead className="text-xs text-center">Vacant</TableHead>
                  <TableHead className="text-xs text-right">Occupancy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vacancyOverview.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">
                      <Link to={`/properties/${v.id}`} className="hover:underline text-foreground">{v.name}</Link>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">{v.total}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{v.occupied}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{v.vacant}</TableCell>
                    <TableCell className="text-right font-medium text-foreground">{v.occupancyRate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Properties */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Recent Properties</CardTitle></CardHeader>
          <CardContent>
            {recentProperties.length === 0 ? (
              <p className="text-sm text-muted-foreground">No properties yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">City</TableHead>
                    <TableHead className="text-xs">Country</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentProperties.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <Link to={`/properties/${p.id}`} className="hover:underline text-foreground">{p.name}</Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.city}</TableCell>
                      <TableCell className="text-muted-foreground">{getCountryName(p.countryCode)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{getPropertyTypeLabel(p.propertyType)}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                      <TableCell className="text-right text-muted-foreground text-xs">{formatDate(p.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Units */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Recent Units</CardTitle></CardHeader>
          <CardContent>
            {recentUnits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No units yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Code</TableHead>
                    <TableHead className="text-xs">Property</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentUnits.map(u => {
                    const prop = properties.find(p => p.id === u.propertyId);
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-mono text-xs font-medium">
                          <Link to={`/units/${u.id}`} className="hover:underline text-foreground">{u.unitCode}</Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{prop?.name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{getUnitTypeLabel(u.unitType)}</TableCell>
                        <TableCell><StatusBadge status={u.currentStatus} /></TableCell>
                        <TableCell className="text-right text-muted-foreground text-xs">{formatDate(u.updatedAt)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Portfolio by Country */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Portfolio by Country</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {Object.keys(countryGroups).length === 0 ? (
              <p className="text-sm text-muted-foreground">No properties yet.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(countryGroups).sort((a, b) => b[1] - a[1]).map(([code, count]) => (
                  <div key={code} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{getCountryName(code)}</span>
                      <span className="text-xs text-muted-foreground font-mono">{code}</span>
                    </div>
                    <span className="text-sm font-bold text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Properties by Type */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Properties by Type</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {Object.keys(typeGroups).length === 0 ? (
              <p className="text-sm text-muted-foreground">No properties yet.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(typeGroups).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{getPropertyTypeLabel(type)}</span>
                    <span className="text-sm font-bold text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Portfolio Configuration Summary */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Portfolio Configuration</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Currencies</span><span className="text-sm font-medium text-foreground">{uniqueCurrencies.join(", ") || "—"}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Locales</span><span className="text-sm font-medium text-foreground">{uniqueLocales.join(", ") || "—"}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Measurement</span><span className="text-sm font-medium text-foreground capitalize">{uniqueMeasurements.join(", ") || "—"}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Countries</span><span className="text-sm font-medium text-foreground">{Object.keys(countryGroups).length}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
