import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAppData } from "@/context/AppContext";
import { useSettings } from "@/context/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ArrowLeft, Wrench, Building2, DoorOpen, User, Clock, CalendarClock, HardHat, StickyNote, Pencil } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { getTenantFullName } from "@/types";
import { MAINTENANCE_CATEGORY_LABELS, MAINTENANCE_PRIORITY_LABELS, MAINTENANCE_STATUS_LABELS, MaintenanceTicket, MaintenanceStatus } from "@/types/maintenance";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";

export default function MaintenanceDetail() {
  const { id } = useParams<{ id: string }>();
  const { tickets, properties, units, tenants, vendors, updateTicket } = useAppData();
  const { toast } = useToast();
  const { t } = useSettings();
  const [editOpen, setEditOpen] = useState(false);

  const ticket = tickets.find(t => t.id === id);
  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Ticket not found.</p>
        <Button variant="link" asChild className="mt-2"><Link to="/maintenance">← Back to Maintenance</Link></Button>
      </div>
    );
  }

  const property = properties.find(p => p.id === ticket.propertyId);
  const unit = units.find(u => u.id === ticket.unitId);
  const tenant = ticket.tenantId ? tenants.find(t => t.id === ticket.tenantId) : null;
  const vendor = ticket.assignedVendorId ? vendors.find(v => v.id === ticket.assignedVendorId) : null;

  const quickStatusChange = (status: MaintenanceStatus) => {
    updateTicket({ ...ticket, status, completedDate: status === "completed" ? new Date().toISOString().split("T")[0] : ticket.completedDate });
    toast({ title: `Status changed to ${MAINTENANCE_STATUS_LABELS[status]}` });
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link to="/maintenance"><ArrowLeft className="h-4 w-4 mr-1" />Maintenance</Link>
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{ticket.title}</h1>
              <StatusBadge status={ticket.status} />
              <StatusBadge status={ticket.priority} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">{MAINTENANCE_CATEGORY_LABELS[ticket.category]} · {formatDate(ticket.createdDate, property?.locale)}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Quick Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {ticket.status !== "assigned" && ticket.status !== "completed" && ticket.status !== "cancelled" && (
              <Button size="sm" variant="outline" onClick={() => quickStatusChange("assigned")}>Mark Assigned</Button>
            )}
            {ticket.status !== "in-progress" && ticket.status !== "completed" && ticket.status !== "cancelled" && (
              <Button size="sm" variant="outline" onClick={() => quickStatusChange("in-progress")}>Mark In Progress</Button>
            )}
            {ticket.status !== "completed" && (
              <Button size="sm" onClick={() => quickStatusChange("completed")}>Mark Completed</Button>
            )}
            {ticket.status !== "cancelled" && ticket.status !== "completed" && (
              <Button size="sm" variant="destructive" onClick={() => quickStatusChange("cancelled")}>Cancel</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Context */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Context</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-start gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Property</p>
                {property ? <Link to={`/properties/${property.id}`} className="text-sm font-medium text-primary hover:underline">{property.name}</Link> : <p className="text-sm text-foreground">—</p>}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <DoorOpen className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Unit</p>
                {unit ? <Link to={`/units/${unit.id}`} className="text-sm font-medium text-primary hover:underline">{unit.unitCode}</Link> : <p className="text-sm text-foreground">—</p>}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Tenant</p>
                {tenant ? <Link to={`/tenants/${tenant.id}`} className="text-sm font-medium text-primary hover:underline">{getTenantFullName(tenant)}</Link> : <p className="text-sm text-muted-foreground">—</p>}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <HardHat className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Vendor</p>
                {vendor ? <Link to={`/vendors/${vendor.id}`} className="text-sm font-medium text-primary hover:underline">{vendor.vendorName}</Link> : <p className="text-sm text-muted-foreground">Unassigned</p>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Ticket Details</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-muted-foreground">Category</p>
              <p className="text-sm font-medium text-foreground">{MAINTENANCE_CATEGORY_LABELS[ticket.category]}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Priority</p>
              <StatusBadge status={ticket.priority} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <StatusBadge status={ticket.status} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm font-medium text-foreground">{formatDate(ticket.createdDate, property?.locale)}</p>
            </div>
            {ticket.scheduledDate && (
              <div>
                <p className="text-xs text-muted-foreground">Scheduled</p>
                <p className="text-sm font-medium text-foreground">{formatDate(ticket.scheduledDate, property?.locale)}</p>
              </div>
            )}
            {ticket.completedDate && (
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-sm font-medium text-success">{formatDate(ticket.completedDate, property?.locale)}</p>
              </div>
            )}
          </div>
          {ticket.description && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm text-foreground">{ticket.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {(ticket.internalNotes || ticket.residentVisibleNotes) && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><StickyNote className="h-4 w-4" />Notes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {ticket.internalNotes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Internal Notes</p>
                <p className="text-sm text-foreground">{ticket.internalNotes}</p>
              </div>
            )}
            {ticket.residentVisibleNotes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Resident Visible Notes</p>
                <p className="text-sm text-foreground">{ticket.residentVisibleNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Created: {formatDate(ticket.createdDate, property?.locale)}</span>
        {ticket.scheduledDate && <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" />Scheduled: {formatDate(ticket.scheduledDate, property?.locale)}</span>}
      </div>

      {/* Edit Sheet */}
      <EditTicketSheet ticket={ticket} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

function EditTicketSheet({ ticket, open, onOpenChange }: { ticket: MaintenanceTicket; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { properties, units, tenants, vendors, updateTicket } = useAppData();
  const { toast } = useToast();
  const { id, ...rest } = ticket;
  const [form, setForm] = useState(rest);

  const formUnits = units.filter(u => u.propertyId === form.propertyId);

  const handleSave = () => {
    updateTicket({ ...ticket, ...form });
    toast({ title: "Ticket updated" });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
        <SheetHeader><SheetTitle>Edit Ticket</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-6">
          <div><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Property</Label>
              <Select value={form.propertyId} onValueChange={v => setForm(f => ({ ...f, propertyId: v, unitId: "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Unit</Label>
              <Select value={form.unitId} onValueChange={v => setForm(f => ({ ...f, unitId: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{formUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.unitCode}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(MAINTENANCE_CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(MAINTENANCE_PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(MAINTENANCE_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Vendor</Label>
              <Select value={form.assignedVendorId ?? "none"} onValueChange={v => setForm(f => ({ ...f, assignedVendorId: v === "none" ? null : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {vendors.filter(v => v.status === "active").map(v => <SelectItem key={v.id} value={v.id}>{v.vendorName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Scheduled Date</Label><Input type="date" value={form.scheduledDate ?? ""} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value || null }))} /></div>
            <div><Label>Completed Date</Label><Input type="date" value={form.completedDate ?? ""} onChange={e => setForm(f => ({ ...f, completedDate: e.target.value || null }))} /></div>
          </div>
          <div><Label>Internal Notes</Label><Textarea value={form.internalNotes} onChange={e => setForm(f => ({ ...f, internalNotes: e.target.value }))} rows={3} /></div>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
