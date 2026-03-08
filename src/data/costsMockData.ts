import { CostCategory, CostEntry, AllocationRule, AllocationRuleUnitShare, CostAllocationResult } from "@/types/costs";

export const initialCostCategories: CostCategory[] = [
  {
    id: "cc1", code: "PTAX", name: "Property Tax", nature: "tax", scope: "property",
    recoveryTypeDefault: "owner-only", description: "Annual property tax levied on the building.",
    isActive: true, createdAt: "2024-01-15", updatedAt: "2024-01-15",
  },
  {
    id: "cc2", code: "BINS", name: "Building Insurance", nature: "charge", scope: "property",
    recoveryTypeDefault: "tenant-recoverable", description: "Annual building insurance premium.",
    isActive: true, createdAt: "2024-01-15", updatedAt: "2024-01-15",
  },
  {
    id: "cc3", code: "CMNT", name: "Common Maintenance", nature: "charge", scope: "property",
    recoveryTypeDefault: "tenant-recoverable", description: "Shared maintenance costs for common areas.",
    isActive: true, createdAt: "2024-01-15", updatedAt: "2024-01-15",
  },
  {
    id: "cc4", code: "UREP", name: "Unit Repair", nature: "charge", scope: "unit",
    recoveryTypeDefault: "owner-only", description: "Repair costs specific to a single unit.",
    isActive: true, createdAt: "2024-01-15", updatedAt: "2024-01-15",
  },
  {
    id: "cc5", code: "UTAX", name: "Unit Tax", nature: "tax", scope: "unit",
    recoveryTypeDefault: "owner-only", description: "Tax applied at unit level (e.g. waste tax).",
    isActive: true, createdAt: "2024-01-15", updatedAt: "2024-01-15",
  },
];

export const initialAllocationRules: AllocationRule[] = [
  {
    id: "ar1", propertyId: "p1", name: "Surface Area – Résidence du Parc", method: "surface-area",
    applyOnlyToOccupiedUnits: false, includeUnavailableUnits: false,
    notes: "Allocate by m² for all available units.", createdAt: "2024-01-20", updatedAt: "2024-01-20",
  },
  {
    id: "ar2", propertyId: "p2", name: "Manual Split – Les Terrasses", method: "manual-percentage",
    applyOnlyToOccupiedUnits: false, includeUnavailableUnits: false,
    notes: "Custom percentage split for mixed-use building.", createdAt: "2024-03-25", updatedAt: "2024-03-25",
  },
];

export const initialAllocationRuleUnitShares: AllocationRuleUnitShare[] = [
  // Manual-percentage shares for ar2 (property p2: u5=95m², u6=75m², u7=80m², u8=8m²)
  // Custom split: commerce 40%, appt1 25%, appt2 25%, storage 10%
  { id: "arus1", allocationRuleId: "ar2", unitId: "u5", percentageShare: 40, fixedAmountShare: null, coefficient: null },
  { id: "arus2", allocationRuleId: "ar2", unitId: "u6", percentageShare: 25, fixedAmountShare: null, coefficient: null },
  { id: "arus3", allocationRuleId: "ar2", unitId: "u7", percentageShare: 25, fixedAmountShare: null, coefficient: null },
  { id: "arus4", allocationRuleId: "ar2", unitId: "u8", percentageShare: 10, fixedAmountShare: null, coefficient: null },
];

export const initialCostEntries: CostEntry[] = [
  {
    id: "ce1", categoryId: "cc1", propertyId: "p1", unitId: null,
    label: "Taxe foncière 2025", description: "Annual property tax for Résidence du Parc.",
    frequency: "yearly", startDate: "2025-01-01", endDate: "2025-12-31",
    amount: 4800, currencyCode: "EUR", isTax: true, recoveryType: "owner-only",
    allocationRuleId: "ar1", vendorName: "", invoiceReference: "TF-2025-PAR001",
    status: "active", notes: "", createdAt: "2025-01-10", updatedAt: "2025-01-10",
  },
  {
    id: "ce2", categoryId: "cc2", propertyId: "p1", unitId: null,
    label: "Assurance immeuble 2025", description: "Building insurance premium.",
    frequency: "yearly", startDate: "2025-01-01", endDate: "2025-12-31",
    amount: 3200, currencyCode: "EUR", isTax: false, recoveryType: "tenant-recoverable",
    allocationRuleId: "ar1", vendorName: "AXA Assurances", invoiceReference: "INS-2025-001",
    status: "active", notes: "", createdAt: "2025-01-15", updatedAt: "2025-01-15",
  },
  {
    id: "ce3", categoryId: "cc3", propertyId: "p2", unitId: null,
    label: "Entretien parties communes Q1 2025", description: "Quarterly common area maintenance.",
    frequency: "quarterly", startDate: "2025-01-01", endDate: "2025-03-31",
    amount: 1500, currencyCode: "EUR", isTax: false, recoveryType: "tenant-recoverable",
    allocationRuleId: "ar2", vendorName: "CleanPro Brussels", invoiceReference: "CP-Q1-2025",
    status: "active", notes: "", createdAt: "2025-01-05", updatedAt: "2025-01-05",
  },
  {
    id: "ce4", categoryId: "cc4", propertyId: "p1", unitId: "u1",
    label: "Plumbing repair – Appt 1er", description: "Emergency plumbing repair in kitchen.",
    frequency: "one-off", startDate: "2025-02-15", endDate: null,
    amount: 450, currencyCode: "EUR", isTax: false, recoveryType: "owner-only",
    allocationRuleId: null, vendorName: "Plomberie Martin", invoiceReference: "PM-2025-042",
    status: "active", notes: "Pipe burst under kitchen sink.", createdAt: "2025-02-15", updatedAt: "2025-02-15",
  },
  {
    id: "ce5", categoryId: "cc5", propertyId: "p2", unitId: "u5",
    label: "Waste collection tax – Commerce RDC", description: "Annual waste collection tax for commercial unit.",
    frequency: "yearly", startDate: "2025-01-01", endDate: "2025-12-31",
    amount: 600, currencyCode: "EUR", isTax: true, recoveryType: "owner-only",
    allocationRuleId: null, vendorName: "", invoiceReference: "WCT-2025-BRU",
    status: "active", notes: "", createdAt: "2025-01-10", updatedAt: "2025-01-10",
  },
  {
    id: "ce6", categoryId: "cc1", propertyId: "p2", unitId: null,
    label: "Précompte immobilier 2025", description: "Annual property tax for Les Terrasses de Bruxelles.",
    frequency: "yearly", startDate: "2025-01-01", endDate: "2025-12-31",
    amount: 5200, currencyCode: "EUR", isTax: true, recoveryType: "owner-only",
    allocationRuleId: "ar2", vendorName: "", invoiceReference: "PI-2025-BRU002",
    status: "active", notes: "", createdAt: "2025-01-12", updatedAt: "2025-01-12",
  },
];

// Pre-computed allocation results
// ce1 (4800 EUR, surface-area via ar1, property p1: u1=52m², u2=68m², u3=22m², u4=12m²)
// Total area = 154 m² (u12 excluded – different property)
// u1: 52/154 * 4800 = 1620.78, u2: 68/154 * 4800 = 2118.18, u3: 22/154 * 4800 = 685.71, u4: 12/154 * 4800 = 374.03
// All owner-only
const ts = "2025-01-10";
export const initialCostAllocationResults: CostAllocationResult[] = [
  // ce1 allocations (property tax p1, surface-area)
  { id: "car1", costEntryId: "ce1", propertyId: "p1", unitId: "u1", allocatedAmount: 1620.78, recoveryType: "owner-only", recoverableAmount: 0, ownerBurdenAmount: 1620.78, periodStart: "2025-01-01", periodEnd: "2025-12-31", createdAt: ts, updatedAt: ts },
  { id: "car2", costEntryId: "ce1", propertyId: "p1", unitId: "u2", allocatedAmount: 2118.18, recoveryType: "owner-only", recoverableAmount: 0, ownerBurdenAmount: 2118.18, periodStart: "2025-01-01", periodEnd: "2025-12-31", createdAt: ts, updatedAt: ts },
  { id: "car3", costEntryId: "ce1", propertyId: "p1", unitId: "u3", allocatedAmount: 685.71, recoveryType: "owner-only", recoverableAmount: 0, ownerBurdenAmount: 685.71, periodStart: "2025-01-01", periodEnd: "2025-12-31", createdAt: ts, updatedAt: ts },
  { id: "car4", costEntryId: "ce1", propertyId: "p1", unitId: "u4", allocatedAmount: 375.33, recoveryType: "owner-only", recoverableAmount: 0, ownerBurdenAmount: 375.33, periodStart: "2025-01-01", periodEnd: "2025-12-31", createdAt: ts, updatedAt: ts },

  // ce2 allocations (insurance p1, surface-area, tenant-recoverable)
  { id: "car5", costEntryId: "ce2", propertyId: "p1", unitId: "u1", allocatedAmount: 1080.52, recoveryType: "tenant-recoverable", recoverableAmount: 1080.52, ownerBurdenAmount: 0, periodStart: "2025-01-01", periodEnd: "2025-12-31", createdAt: ts, updatedAt: ts },
  { id: "car6", costEntryId: "ce2", propertyId: "p1", unitId: "u2", allocatedAmount: 1412.12, recoveryType: "tenant-recoverable", recoverableAmount: 1412.12, ownerBurdenAmount: 0, periodStart: "2025-01-01", periodEnd: "2025-12-31", createdAt: ts, updatedAt: ts },
  { id: "car7", costEntryId: "ce2", propertyId: "p1", unitId: "u3", allocatedAmount: 457.14, recoveryType: "tenant-recoverable", recoverableAmount: 457.14, ownerBurdenAmount: 0, periodStart: "2025-01-01", periodEnd: "2025-12-31", createdAt: ts, updatedAt: ts },
  { id: "car8", costEntryId: "ce2", propertyId: "p1", unitId: "u4", allocatedAmount: 250.22, recoveryType: "tenant-recoverable", recoverableAmount: 250.22, ownerBurdenAmount: 0, periodStart: "2025-01-01", periodEnd: "2025-12-31", createdAt: ts, updatedAt: ts },

  // ce3 allocations (common maintenance p2, manual-percentage: u5=40%, u6=25%, u7=25%, u8=10%)
  { id: "car9", costEntryId: "ce3", propertyId: "p2", unitId: "u5", allocatedAmount: 600, recoveryType: "tenant-recoverable", recoverableAmount: 600, ownerBurdenAmount: 0, periodStart: "2025-01-01", periodEnd: "2025-03-31", createdAt: ts, updatedAt: ts },
  { id: "car10", costEntryId: "ce3", propertyId: "p2", unitId: "u6", allocatedAmount: 375, recoveryType: "tenant-recoverable", recoverableAmount: 375, ownerBurdenAmount: 0, periodStart: "2025-01-01", periodEnd: "2025-03-31", createdAt: ts, updatedAt: ts },
  { id: "car11", costEntryId: "ce3", propertyId: "p2", unitId: "u7", allocatedAmount: 375, recoveryType: "tenant-recoverable", recoverableAmount: 375, ownerBurdenAmount: 0, periodStart: "2025-01-01", periodEnd: "2025-03-31", createdAt: ts, updatedAt: ts },
  { id: "car12", costEntryId: "ce3", propertyId: "p2", unitId: "u8", allocatedAmount: 150, recoveryType: "tenant-recoverable", recoverableAmount: 150, ownerBurdenAmount: 0, periodStart: "2025-01-01", periodEnd: "2025-03-31", createdAt: ts, updatedAt: ts },

  // ce6 allocations (property tax p2, manual-percentage)
  { id: "car13", costEntryId: "ce6", propertyId: "p2", unitId: "u5", allocatedAmount: 2080, recoveryType: "owner-only", recoverableAmount: 0, ownerBurdenAmount: 2080, periodStart: "2025-01-01", periodEnd: "2025-12-31", createdAt: ts, updatedAt: ts },
  { id: "car14", costEntryId: "ce6", propertyId: "p2", unitId: "u6", allocatedAmount: 1300, recoveryType: "owner-only", recoverableAmount: 0, ownerBurdenAmount: 1300, periodStart: "2025-01-01", periodEnd: "2025-12-31", createdAt: ts, updatedAt: ts },
  { id: "car15", costEntryId: "ce6", propertyId: "p2", unitId: "u7", allocatedAmount: 1300, recoveryType: "owner-only", recoverableAmount: 0, ownerBurdenAmount: 1300, periodStart: "2025-01-01", periodEnd: "2025-12-31", createdAt: ts, updatedAt: ts },
  { id: "car16", costEntryId: "ce6", propertyId: "p2", unitId: "u8", allocatedAmount: 520, recoveryType: "owner-only", recoverableAmount: 0, ownerBurdenAmount: 520, periodStart: "2025-01-01", periodEnd: "2025-12-31", createdAt: ts, updatedAt: ts },
];
