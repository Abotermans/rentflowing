import { Property, Unit, Tenant, Lease, Payment } from "@/types";

export const initialProperties: Property[] = [
  { id: "p1", name: "Sunset Apartments", address: "1420 Sunset Blvd, Los Angeles, CA 90026", type: "residential", createdAt: "2023-01-15" },
  { id: "p2", name: "Harbor View Condos", address: "88 Harbor Dr, San Diego, CA 92101", type: "residential", createdAt: "2023-03-20" },
  { id: "p3", name: "Downtown Business Center", address: "500 Market St, San Francisco, CA 94105", type: "commercial", createdAt: "2023-06-01" },
];

export const initialUnits: Unit[] = [
  { id: "u1", propertyId: "p1", unitNumber: "101", bedrooms: 1, bathrooms: 1, sqft: 650, rentAmount: 1800 },
  { id: "u2", propertyId: "p1", unitNumber: "102", bedrooms: 2, bathrooms: 1, sqft: 900, rentAmount: 2400 },
  { id: "u3", propertyId: "p1", unitNumber: "201", bedrooms: 2, bathrooms: 2, sqft: 1050, rentAmount: 2800 },
  { id: "u4", propertyId: "p1", unitNumber: "202", bedrooms: 3, bathrooms: 2, sqft: 1300, rentAmount: 3200 },
  { id: "u5", propertyId: "p2", unitNumber: "A1", bedrooms: 1, bathrooms: 1, sqft: 700, rentAmount: 2000 },
  { id: "u6", propertyId: "p2", unitNumber: "A2", bedrooms: 2, bathrooms: 2, sqft: 1100, rentAmount: 2900 },
  { id: "u7", propertyId: "p2", unitNumber: "B1", bedrooms: 3, bathrooms: 2, sqft: 1400, rentAmount: 3500 },
  { id: "u8", propertyId: "p3", unitNumber: "Suite 100", bedrooms: 0, bathrooms: 1, sqft: 800, rentAmount: 2500 },
  { id: "u9", propertyId: "p3", unitNumber: "Suite 200", bedrooms: 0, bathrooms: 1, sqft: 1200, rentAmount: 3800 },
  { id: "u10", propertyId: "p3", unitNumber: "Suite 300", bedrooms: 0, bathrooms: 2, sqft: 2000, rentAmount: 5500 },
];

export const initialTenants: Tenant[] = [
  { id: "t1", firstName: "Maria", lastName: "Garcia", email: "maria.garcia@email.com", phone: "(310) 555-0101", emergencyContact: "Carlos Garcia — (310) 555-0102", createdAt: "2023-02-01" },
  { id: "t2", firstName: "James", lastName: "Chen", email: "james.chen@email.com", phone: "(619) 555-0201", emergencyContact: "Linda Chen — (619) 555-0202", createdAt: "2023-04-10" },
  { id: "t3", firstName: "Sarah", lastName: "Williams", email: "sarah.w@email.com", phone: "(415) 555-0301", emergencyContact: "Tom Williams — (415) 555-0302", createdAt: "2023-05-15" },
  { id: "t4", firstName: "Robert", lastName: "Johnson", email: "r.johnson@email.com", phone: "(310) 555-0401", emergencyContact: "Amy Johnson — (310) 555-0402", createdAt: "2023-07-20" },
  { id: "t5", firstName: "Emily", lastName: "Davis", email: "emily.d@email.com", phone: "(619) 555-0501", emergencyContact: "Mark Davis — (619) 555-0502", createdAt: "2023-08-01" },
  { id: "t6", firstName: "Michael", lastName: "Brown", email: "m.brown@email.com", phone: "(415) 555-0601", emergencyContact: "Jessica Brown — (415) 555-0602", createdAt: "2023-09-10" },
  { id: "t7", firstName: "Lisa", lastName: "Martinez", email: "lisa.m@email.com", phone: "(310) 555-0701", emergencyContact: "David Martinez — (310) 555-0702", createdAt: "2024-01-05" },
  { id: "t8", firstName: "Daniel", lastName: "Taylor", email: "d.taylor@email.com", phone: "(619) 555-0801", emergencyContact: "Karen Taylor — (619) 555-0802", createdAt: "2024-03-15" },
];

export const initialLeases: Lease[] = [
  { id: "l1", unitId: "u1", tenantId: "t1", startDate: "2024-03-01", endDate: "2025-02-28", monthlyRent: 1800, deposit: 3600, terms: "12-month lease. No pets. Utilities not included." },
  { id: "l2", unitId: "u2", tenantId: "t4", startDate: "2024-06-01", endDate: "2025-05-31", monthlyRent: 2400, deposit: 4800, terms: "12-month lease. Small pets allowed with deposit. Water included." },
  { id: "l3", unitId: "u3", tenantId: "t7", startDate: "2025-01-01", endDate: "2025-12-31", monthlyRent: 2800, deposit: 5600, terms: "12-month lease. No smoking. All utilities included." },
  { id: "l4", unitId: "u5", tenantId: "t2", startDate: "2024-05-01", endDate: "2025-04-30", monthlyRent: 2000, deposit: 4000, terms: "12-month lease. Parking space included." },
  { id: "l5", unitId: "u6", tenantId: "t5", startDate: "2024-09-01", endDate: "2025-08-31", monthlyRent: 2900, deposit: 5800, terms: "12-month lease. Pool access included." },
  { id: "l6", unitId: "u7", tenantId: "t8", startDate: "2025-04-01", endDate: "2026-03-31", monthlyRent: 3500, deposit: 7000, terms: "12-month lease. Ocean view unit. Pets allowed." },
  { id: "l7", unitId: "u8", tenantId: "t3", startDate: "2024-07-01", endDate: "2025-06-30", monthlyRent: 2500, deposit: 5000, terms: "Commercial lease. Office use only. Cleaning included." },
  { id: "l8", unitId: "u9", tenantId: "t6", startDate: "2024-10-01", endDate: "2025-09-30", monthlyRent: 3800, deposit: 7600, terms: "Commercial lease. 24/7 building access. Conference room usage." },
  // Expired lease
  { id: "l9", unitId: "u4", tenantId: "t1", startDate: "2023-06-01", endDate: "2024-05-31", monthlyRent: 3000, deposit: 6000, terms: "12-month lease. Expired." },
];

function generatePayments(): Payment[] {
  const payments: Payment[] = [];
  let pid = 1;

  // Generate payments for active leases — a few months of history
  const activeLeases = ["l1", "l2", "l3", "l4", "l5", "l7", "l8"];
  const leaseRentMap: Record<string, number> = {
    l1: 1800, l2: 2400, l3: 2800, l4: 2000, l5: 2900, l7: 2500, l8: 3800,
  };

  for (const leaseId of activeLeases) {
    const rent = leaseRentMap[leaseId];
    // Past months: paid
    for (let m = 0; m < 3; m++) {
      const month = new Date(2025, 0 + m, 1);
      payments.push({
        id: `pay${pid++}`,
        leaseId,
        amount: rent,
        dueDate: month.toISOString().split("T")[0],
        paidDate: new Date(2025, 0 + m, Math.floor(Math.random() * 3) + 1).toISOString().split("T")[0],
        method: (["transfer", "card", "check", "cash"] as const)[Math.floor(Math.random() * 4)],
      });
    }
    // Current month (March 2026) — due
    payments.push({
      id: `pay${pid++}`,
      leaseId,
      amount: rent,
      dueDate: "2026-03-01",
      paidDate: null,
      method: null,
    });
  }

  // Overdue payment for l4
  payments.push({
    id: `pay${pid++}`,
    leaseId: "l4",
    amount: 2000,
    dueDate: "2026-02-01",
    paidDate: null,
    method: null,
  });

  // Overdue payment for l1
  payments.push({
    id: `pay${pid++}`,
    leaseId: "l1",
    amount: 1800,
    dueDate: "2026-02-01",
    paidDate: null,
    method: null,
  });

  return payments;
}

export const initialPayments: Payment[] = generatePayments();
