import { MaintenanceTicket, Vendor } from "@/types/maintenance";

export const initialVendors: Vendor[] = [
  {
    id: "v1", vendorName: "Dupont Plomberie", tradeCategory: "Plumbing",
    contactName: "Pierre Dupont", email: "contact@dupont-plomberie.fr", phone: "+33 1 42 33 44 55",
    address: "8 Rue du Commerce, 75015 Paris", notes: "Reliable, available on short notice.", status: "active",
  },
  {
    id: "v2", vendorName: "ElectroBrux SPRL", tradeCategory: "Electrical",
    contactName: "Marc Janssens", email: "info@electrobrux.be", phone: "+32 2 511 22 33",
    address: "22 Rue Haute, 1000 Bruxelles", notes: "Certified for commercial and residential.", status: "active",
  },
  {
    id: "v3", vendorName: "CleanPro Services", tradeCategory: "Cleaning",
    contactName: "Anna Müller", email: "anna@cleanpro.de", phone: "+49 30 1234 5678",
    address: "Friedrichstraße 90, 10117 Berlin", notes: "End-of-tenancy deep cleaning specialist.", status: "active",
  },
  {
    id: "v4", vendorName: "London Fix-It Ltd", tradeCategory: "General Maintenance",
    contactName: "James Brown", email: "james@londonfixit.co.uk", phone: "+44 20 7946 0958",
    address: "12 Camden Road, London NW1", notes: "Handles minor repairs, painting, carpentry.", status: "active",
  },
];

export const initialTickets: MaintenanceTicket[] = [
  {
    id: "mt1", title: "Leaking kitchen tap", description: "The kitchen tap has been dripping continuously. Tenant reports water pooling under the sink.",
    propertyId: "p1", unitId: "u1", tenantId: "t1", category: "plumbing", priority: "high", status: "assigned",
    createdDate: "2026-02-20", scheduledDate: "2026-03-10", completedDate: null, assignedVendorId: "v1",
    internalNotes: "Vendor confirmed availability for March 10.", residentVisibleNotes: "A plumber has been scheduled.",
  },
  {
    id: "mt2", title: "Faulty light switch in hallway", description: "Light switch in the main hallway sparks occasionally when toggled.",
    propertyId: "p2", unitId: "u6", tenantId: "t2", category: "electrical", priority: "urgent", status: "in-progress",
    createdDate: "2026-03-01", scheduledDate: "2026-03-05", completedDate: null, assignedVendorId: "v2",
    internalNotes: "Electrician on site, parts ordered.", residentVisibleNotes: "Electrician is working on the issue.",
  },
  {
    id: "mt3", title: "Heating not working", description: "Central heating unit not producing warm air. Temperature in the unit is below 16°C.",
    propertyId: "p4", unitId: "u13", tenantId: "t6", category: "heating", priority: "urgent", status: "open",
    createdDate: "2026-03-06", scheduledDate: null, completedDate: null, assignedVendorId: null,
    internalNotes: "Need to find a heating specialist in London.", residentVisibleNotes: "",
  },
  {
    id: "mt4", title: "End-of-tenancy cleaning", description: "Deep cleaning required after tenant Sophie Martin moved out of unit PAR-A02.",
    propertyId: "p1", unitId: "u2", tenantId: null, category: "cleaning", priority: "medium", status: "completed",
    createdDate: "2026-01-05", scheduledDate: "2026-01-10", completedDate: "2026-01-12", assignedVendorId: "v3",
    internalNotes: "Cleaning completed satisfactorily.", residentVisibleNotes: "",
  },
  {
    id: "mt5", title: "Cracked bathroom tile", description: "One floor tile in the bathroom is cracked and needs replacement.",
    propertyId: "p2", unitId: "u6", tenantId: "t2", category: "damage", priority: "low", status: "open",
    createdDate: "2026-03-04", scheduledDate: null, completedDate: null, assignedVendorId: null,
    internalNotes: "", residentVisibleNotes: "",
  },
  {
    id: "mt6", title: "Door lock replacement", description: "Front door lock is stiff and difficult to operate. Replacement recommended.",
    propertyId: "p4", unitId: "u14", tenantId: null, category: "general", priority: "medium", status: "assigned",
    createdDate: "2026-02-28", scheduledDate: "2026-03-15", completedDate: null, assignedVendorId: "v4",
    internalNotes: "Locksmith booked.", residentVisibleNotes: "A locksmith will visit on March 15.",
  },
];
