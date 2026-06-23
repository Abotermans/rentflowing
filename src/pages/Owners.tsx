import { Building2, User, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";

export default function Owners() {
  const { propertyOwners, propertyOwnerLinks, properties } = useAppData();
  const { t } = useSettings();

  const rows = propertyOwners
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((owner) => {
      const links = propertyOwnerLinks.filter((link) => link.ownerId === owner.id);
      const linkedProperties = links
        .map((link) => properties.find((property) => property.id === link.propertyId))
        .filter((property): property is typeof properties[number] => !!property)
        .sort((a, b) => a.name.localeCompare(b.name));
      return { owner, linkedProperties };
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Owners</h1>
        </div>
        <Button asChild>
          <Link to="/properties">Manage property owners</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Property owners</CardTitle>
          <CardDescription>Owners linked to properties in this portfolio.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No owners yet. Add owners from a property form.
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("propertyOwners.name")}</TableHead>
                    <TableHead>{t("propertyOwners.type")}</TableHead>
                    <TableHead className="text-right">Properties</TableHead>
                    <TableHead>Linked properties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ owner, linkedProperties }) => {
                    const Icon = owner.type === "corporation" ? Building2 : User;
                    return (
                      <TableRow key={owner.id}>
                        <TableCell className="font-medium">
                          <span className="inline-flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            {owner.name}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {t(owner.type === "corporation" ? "propertyOwners.type.corporation" : "propertyOwners.type.individual")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{linkedProperties.length}</TableCell>
                        <TableCell>
                          {linkedProperties.length === 0 ? (
                            <span className="text-muted-foreground">No linked properties</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {linkedProperties.map((property) => (
                                <Button key={property.id} variant="link" size="sm" asChild className="h-auto p-0">
                                  <Link to={`/properties/${property.id}`}>{property.name}</Link>
                                </Button>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
