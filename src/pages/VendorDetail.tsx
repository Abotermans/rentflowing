import { useParams, Link } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityLabel } from "@/components/shared/PriorityLabel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Mail, Phone, MapPin, StickyNote, HardHat } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { MAINTENANCE_CATEGORY_LABELS } from "@/types/maintenance";
import { detailLinkClass } from "@/lib/detailLinks";

export default function VendorDetail() {
  const { id } = useParams<{ id: string }>();
  const { vendors, tickets, properties, units } = useAppData();
  const { t } = useSettings();

  const vendor = vendors.find(v => v.id === id);
  if (!vendor) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("detail.vendorNotFound")}</p>
        <Button variant="link" asChild className="mt-2"><Link to="/vendors">← {t("nav.vendors")}</Link></Button>
      </div>
    );
  }

  const vendorTickets = tickets.filter(t => t.assignedVendorId === vendor.id);
  const openTickets = vendorTickets.filter(t => t.status !== "completed" && t.status !== "cancelled");
  const completedTickets = vendorTickets.filter(t => t.status === "completed");

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link to="/vendors"><ArrowLeft className="h-4 w-4 mr-1" />{t("nav.vendors")}</Link>
        </Button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{vendor.vendorName}</h1>
          <StatusBadge status={vendor.status} />
        </div>
        <p className="text-sm text-muted-foreground mt-1">{vendor.tradeCategory}</p>
      </div>

      {/* Contact Info */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("detail.contactInfo")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-start gap-2">
              <HardHat className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">{t("vendors.contact")}</p>
                <p className="text-sm font-medium text-foreground">{vendor.contactName || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">{t("vendors.email")}</p>
                <p className="text-sm font-medium text-foreground">{vendor.email || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">{t("vendors.phone")}</p>
                <p className="text-sm font-medium text-foreground">{vendor.phone || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">{t("vendors.address")}</p>
                <p className="text-sm font-medium text-foreground">{vendor.address || "—"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("detail.totalTickets")}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{vendorTickets.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("detail.open")}</p>
            <p className="text-2xl font-bold text-warning mt-1">{openTickets.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("status.completed")}</p>
            <p className="text-2xl font-bold text-success mt-1">{completedTickets.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Linked Tickets */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{t("detail.linkedTickets")}</CardTitle></CardHeader>
        <CardContent>
          {vendorTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("detail.noTicketsForVendor")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendorTickets.map(t => {
                  const prop = properties.find(p => p.id === t.propertyId);
                  const unit = units.find(u => u.id === t.unitId);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium"><Link to={`/maintenance/${t.id}`} className={detailLinkClass}>{t.title}</Link></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{prop?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{unit?.unitCode ?? "—"}</TableCell>
                      <TableCell className="text-xs">{MAINTENANCE_CATEGORY_LABELS[t.category]}</TableCell>
                      <TableCell><PriorityLabel priority={t.priority} /></TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(t.createdDate, prop?.locale)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {vendor.notes && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><StickyNote className="h-4 w-4" />{t("common.notes")}</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{vendor.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
