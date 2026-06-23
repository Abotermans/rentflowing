import { Building2, DoorOpen, Megaphone } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAppData } from "@/context/AppContext";
import { formatCurrency, formatDate } from "@/lib/formatters";

export default function Listings() {
  const { units, properties, getActiveLeaseAssignmentForUnit } = useAppData();

  const listingRows = units
    .filter((unit) => unit.currentStatus !== "archived" && unit.currentStatus !== "unavailable" && !getActiveLeaseAssignmentForUnit(unit.id))
    .map((unit) => ({
      unit,
      property: properties.find((property) => property.id === unit.propertyId),
    }))
    .sort((a, b) => {
      const propCompare = (a.property?.name ?? "").localeCompare(b.property?.name ?? "");
      return propCompare || a.unit.unitCode.localeCompare(b.unit.unitCode);
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Listings</h1>
        </div>
        <Button asChild>
          <Link to="/units">Manage units</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available units</CardTitle>
          <CardDescription>Units without an active lease assignment and ready for leasing workflows.</CardDescription>
        </CardHeader>
        <CardContent>
          {listingRows.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No available listings right now.
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unit</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Available from</TableHead>
                    <TableHead className="text-right">Rent</TableHead>
                    <TableHead className="text-right">Charges</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listingRows.map(({ unit, property }) => (
                    <TableRow key={unit.id}>
                      <TableCell>
                        <Button variant="link" asChild className="h-auto p-0 font-medium">
                          <Link to={`/units/${unit.id}`}>
                            <DoorOpen className="mr-1.5 h-4 w-4" />
                            {unit.unitCode} - {unit.unitLabel}
                          </Link>
                        </Button>
                      </TableCell>
                      <TableCell>
                        {property ? (
                          <Button variant="link" asChild className="h-auto p-0">
                            <Link to={`/properties/${property.id}`}>
                              <Building2 className="mr-1.5 h-4 w-4" />
                              {property.name}
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">Missing property</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={unit.currentStatus} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {unit.availableFrom ? formatDate(unit.availableFrom, property?.locale) : <Badge variant="outline">Now</Badge>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(unit.baseRent ?? 0, property?.currencyCode, property?.locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(unit.baseCharges ?? 0, property?.currencyCode, property?.locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
