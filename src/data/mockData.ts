import { Property, Unit, Tenant, Lease, Guarantee, DEFAULT_MOVE_IN_CHECKLIST, DEFAULT_MOVE_OUT_CHECKLIST } from "@/types";

// initialProperties, initialUnits, initialTenants arrays stay identical

export const initialProperties: Property[] = [
  {
    id: "p1", name: "Résidence du Parc", referenceCode: "PAR-001",
    address1: "12 Rue de Rivoli", address2: "Bâtiment A", city: "Paris", postalCode: "75001",
    regionOrState: "Île-de-France", countryCode: "FR", locale: "fr-FR", currencyCode: "EUR",
    measurementSystem: "metric", propertyType: "residential", ownerName: "SCI Rivoli Patrimoine",
    description: "Immeuble résidentiel de standing au centre de Paris, proche métro Châtelet.",
    status: "active", createdAt: "2024-01-15", updatedAt: "2025-11-20",
  },
  {
    id: "p2", name: "Les Terrasses de Bruxelles", referenceCode: "BRU-002",
    address1: "45 Avenue Louise", address2: "", city: "Bruxelles", postalCode: "1050",
    regionOrState: "Bruxelles-Capitale", countryCode: "BE", locale: "fr-BE", currencyCode: "EUR",
    measurementSystem: "metric", propertyType: "mixed-use", ownerName: "Immo Terrasses SA",
    description: "Immeuble mixte avec commerces au rez-de-chaussée et appartements aux étages.",
    status: "active", createdAt: "2024-03-20", updatedAt: "2025-10-05",
  },
  {
    id: "p3", name: "Keizersgracht Office Hub", referenceCode: "AMS-003",
    address1: "Keizersgracht 520", address2: "", city: "Amsterdam", postalCode: "1017 EJ",
    regionOrState: "Noord-Holland", countryCode: "NL", locale: "nl-NL", currencyCode: "EUR",
    measurementSystem: "metric", propertyType: "commercial", ownerName: "Keizersgracht BV",
    description: "Kantoorruimte in een historisch pand aan de grachten.",
    status: "active", createdAt: "2024-06-01", updatedAt: "2025-09-12",
  },
  {
    id: "p4", name: "Camden Mews Residences", referenceCode: "LON-004",
    address1: "18 Camden High Street", address2: "Unit 3-7", city: "London", postalCode: "NW1 0JH",
    regionOrState: "Greater London", countryCode: "GB", locale: "en-GB", currencyCode: "GBP",
    measurementSystem: "metric", propertyType: "residential", ownerName: "Camden Property Ltd",
    description: "Victorian conversion with modern apartments in Camden Town.",
    status: "active", createdAt: "2024-08-10", updatedAt: "2025-12-01",
  },
  {
    id: "p5", name: "Friedrichstraße Wohnhaus", referenceCode: "BER-005",
    address1: "Friedrichstraße 112", address2: "Hinterhaus", city: "Berlin", postalCode: "10117",
    regionOrState: "Berlin", countryCode: "DE", locale: "de-DE", currencyCode: "EUR",
    measurementSystem: "metric", propertyType: "residential", ownerName: "Friedrichstraße Verwaltung GmbH",
    description: "Altbau-Wohnhaus in Berlin-Mitte mit sanierten Wohnungen.",
    status: "inactive", createdAt: "2023-11-05", updatedAt: "2025-06-15",
  },
];

export const initialUnits: Unit[] = [
  { id: "u1", propertyId: "p1", unitCode: "PAR-A01", unitLabel: "Appt 1er gauche", unitType: "apartment", floor: 1, surfaceArea: 52, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 1350, baseRentSixMonths: 1250, baseRentYearly: 1150, baseCharges: 150, availableFrom: null, notes: "", createdAt: "2024-01-15", updatedAt: "2025-11-20" },
  { id: "u2", propertyId: "p1", unitCode: "PAR-A02", unitLabel: "Appt 2e droite", unitType: "apartment", floor: 2, surfaceArea: 68, bedrooms: 3, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 1650, baseRentSixMonths: 1550, baseRentYearly: 1450, baseCharges: 180, availableFrom: null, notes: "", createdAt: "2024-01-15", updatedAt: "2025-10-01" },
  { id: "u3", propertyId: "p1", unitCode: "PAR-S01", unitLabel: "Studio 3e", unitType: "studio", floor: 3, surfaceArea: 22, bedrooms: 0, bathrooms: 1, furnished: true, currentStatus: "vacant", baseRent: 850, baseRentSixMonths: 800, baseRentYearly: 750, baseCharges: 80, availableFrom: "2026-04-01", notes: "Freshly renovated, new kitchen.", createdAt: "2024-01-15", updatedAt: "2026-02-28" },
  { id: "u4", propertyId: "p1", unitCode: "PAR-P01", unitLabel: "Parking sous-sol", unitType: "parking", floor: -1, surfaceArea: 12, bedrooms: 0, bathrooms: 0, furnished: false, currentStatus: "vacant", baseRent: 120, baseRentSixMonths: null, baseRentYearly: null, baseCharges: 0, availableFrom: "2026-03-15", notes: "", createdAt: "2024-01-15", updatedAt: "2025-09-10" },
  { id: "u5", propertyId: "p2", unitCode: "BRU-C01", unitLabel: "Commerce RDC", unitType: "commercial-unit", floor: 0, surfaceArea: 95, bedrooms: 0, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 2200, baseRentSixMonths: 2050, baseRentYearly: 1900, baseCharges: 350, availableFrom: null, notes: "Currently leased to a bakery.", createdAt: "2024-03-20", updatedAt: "2025-10-05" },
  { id: "u6", propertyId: "p2", unitCode: "BRU-A01", unitLabel: "Appt 1er", unitType: "apartment", floor: 1, surfaceArea: 75, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 1100, baseRentSixMonths: 1020, baseRentYearly: 950, baseCharges: 150, availableFrom: null, notes: "", createdAt: "2024-03-20", updatedAt: "2025-08-12" },
  { id: "u7", propertyId: "p2", unitCode: "BRU-A02", unitLabel: "Appt 2e", unitType: "apartment", floor: 2, surfaceArea: 80, bedrooms: 3, bathrooms: 1, furnished: false, currentStatus: "reserved", baseRent: 1200, baseRentSixMonths: 1120, baseRentYearly: 1050, baseCharges: 160, availableFrom: "2026-05-01", notes: "Reserved for new tenant, move-in May.", createdAt: "2024-03-20", updatedAt: "2026-01-15" },
  { id: "u8", propertyId: "p2", unitCode: "BRU-ST1", unitLabel: "Cave stockage", unitType: "storage", floor: -1, surfaceArea: 8, bedrooms: 0, bathrooms: 0, furnished: false, currentStatus: "vacant", baseRent: 75, baseRentSixMonths: null, baseRentYearly: null, baseCharges: 0, availableFrom: null, notes: "", createdAt: "2024-03-20", updatedAt: "2025-07-01" },
  { id: "u9", propertyId: "p3", unitCode: "AMS-O01", unitLabel: "Office 1st floor", unitType: "office", floor: 1, surfaceArea: 120, bedrooms: 0, bathrooms: 1, furnished: true, currentStatus: "occupied", baseRent: 3200, baseRentSixMonths: 3000, baseRentYearly: 2800, baseCharges: 400, availableFrom: null, notes: "Includes 2 meeting rooms.", createdAt: "2024-06-01", updatedAt: "2025-09-12" },
  { id: "u10", propertyId: "p3", unitCode: "AMS-O02", unitLabel: "Office 2nd floor", unitType: "office", floor: 2, surfaceArea: 85, bedrooms: 0, bathrooms: 1, furnished: false, currentStatus: "vacant", baseRent: 2400, baseRentSixMonths: 2250, baseRentYearly: 2100, baseCharges: 300, availableFrom: "2026-04-15", notes: "Open-plan layout, needs fit-out.", createdAt: "2024-06-01", updatedAt: "2026-02-10" },
  { id: "u11", propertyId: "p3", unitCode: "AMS-O03", unitLabel: "Office 3rd floor", unitType: "office", floor: 3, surfaceArea: 85, bedrooms: 0, bathrooms: 1, furnished: true, currentStatus: "occupied", baseRent: 2600, baseRentSixMonths: 2450, baseRentYearly: 2300, baseCharges: 320, availableFrom: null, notes: "", createdAt: "2024-06-01", updatedAt: "2025-11-30" },
  { id: "u12", propertyId: "p3", unitCode: "AMS-P01", unitLabel: "Parking kelder", unitType: "parking", floor: -1, surfaceArea: 14, bedrooms: 0, bathrooms: 0, furnished: false, currentStatus: "unavailable", baseRent: 200, baseRentSixMonths: null, baseRentYearly: null, baseCharges: 0, availableFrom: null, notes: "Under maintenance until Q3 2026.", createdAt: "2024-06-01", updatedAt: "2026-01-05" },
  { id: "u13", propertyId: "p4", unitCode: "LON-F01", unitLabel: "Flat 1 Ground", unitType: "apartment", floor: 0, surfaceArea: 45, bedrooms: 1, bathrooms: 1, furnished: true, currentStatus: "occupied", baseRent: 1800, baseRentSixMonths: 1700, baseRentYearly: 1600, baseCharges: 120, availableFrom: null, notes: "", createdAt: "2024-08-10", updatedAt: "2025-12-01" },
  { id: "u14", propertyId: "p4", unitCode: "LON-F02", unitLabel: "Flat 2 First", unitType: "apartment", floor: 1, surfaceArea: 62, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 2200, baseRentSixMonths: 2050, baseRentYearly: 1900, baseCharges: 140, availableFrom: null, notes: "", createdAt: "2024-08-10", updatedAt: "2025-11-15" },
  { id: "u15", propertyId: "p4", unitCode: "LON-S01", unitLabel: "Studio Top", unitType: "studio", floor: 2, surfaceArea: 28, bedrooms: 0, bathrooms: 1, furnished: true, currentStatus: "reserved", baseRent: 1400, baseRentSixMonths: 1300, baseRentYearly: 1200, baseCharges: 90, availableFrom: "2026-06-01", notes: "Reserved, tenant confirmed for June.", createdAt: "2024-08-10", updatedAt: "2026-03-01" },
  { id: "u16", propertyId: "p5", unitCode: "BER-W01", unitLabel: "Wohnung 1. OG", unitType: "apartment", floor: 1, surfaceArea: 70, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "unavailable", baseRent: 900, baseRentSixMonths: 850, baseRentYearly: 800, baseCharges: 200, availableFrom: null, notes: "Major renovation in progress.", createdAt: "2023-11-05", updatedAt: "2025-06-15" },
  { id: "u17", propertyId: "p5", unitCode: "BER-W02", unitLabel: "Wohnung 2. OG", unitType: "apartment", floor: 2, surfaceArea: 65, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "vacant", baseRent: 850, baseRentSixMonths: 800, baseRentYearly: 750, baseCharges: 190, availableFrom: "2026-07-01", notes: "Available after renovation completes.", createdAt: "2023-11-05", updatedAt: "2026-02-20" },
  { id: "u18", propertyId: "p5", unitCode: "BER-K01", unitLabel: "Keller Lager", unitType: "storage", floor: -1, surfaceArea: 10, bedrooms: 0, bathrooms: 0, furnished: false, currentStatus: "vacant", baseRent: 60, baseRentSixMonths: null, baseRentYearly: null, baseCharges: 0, availableFrom: null, notes: "", createdAt: "2023-11-05", updatedAt: "2025-04-01" },
];

export const initialTenants: Tenant[] = [
  { id: "t1", firstName: "Marie", lastName: "Dupont", email: "marie.dupont@email.fr", phone: "+33 6 12 34 56 78", dateOfBirth: "1985-03-12", identificationNumber: null, currentAddress: "12 Rue de Rivoli, Appt 1, 75001 Paris", status: "active", notes: "Long-term tenant, always pays on time.", createdAt: "2024-02-01", updatedAt: "2025-11-20" },
  { id: "t2", firstName: "Jan", lastName: "De Vries", email: "jan.devries@email.be", phone: "+32 470 12 34 56", dateOfBirth: "1990-07-22", identificationNumber: null, currentAddress: "45 Avenue Louise, Appt 1er, 1050 Bruxelles", status: "active", notes: "", createdAt: "2024-04-10", updatedAt: "2025-08-12" },
  { id: "t3", firstName: "Fatima", lastName: "El Amrani", email: "fatima.elamrani@email.nl", phone: "+31 6 98 76 54 32", dateOfBirth: "1988-11-05", identificationNumber: null, currentAddress: "Keizersgracht 520, 1st floor, Amsterdam", status: "active", notes: "Office lease, company representative.", createdAt: "2024-07-15", updatedAt: "2025-09-12" },
  { id: "t4", firstName: "Sophie", lastName: "Martin", email: "sophie.martin@email.fr", phone: "+33 6 55 44 33 22", dateOfBirth: "1992-01-30", identificationNumber: null, currentAddress: null, status: "former", notes: "Left unit PAR-A02 in December 2025.", createdAt: "2023-06-01", updatedAt: "2025-12-31" },
  { id: "t5", firstName: "Luca", lastName: "Bianchi", email: "luca.bianchi@email.be", phone: "+32 489 11 22 33", dateOfBirth: "1995-09-14", identificationNumber: null, currentAddress: null, status: "applicant", notes: "Applicant for BRU-A02, move-in planned May 2026.", createdAt: "2026-01-10", updatedAt: "2026-01-15" },
  { id: "t6", firstName: "Emma", lastName: "Williams", email: "emma.williams@email.co.uk", phone: "+44 7700 900123", dateOfBirth: "1987-06-18", identificationNumber: null, currentAddress: "18 Camden High St, Flat 1, London NW1", status: "active", notes: "", createdAt: "2024-09-01", updatedAt: "2025-12-01" },
];

const noAdvance = {
  hasAdvancePayment: false as boolean,
  advancePaymentAmount: null as number | null,
  advancePaymentDate: null as string | null,
  advanceAllocationMethod: null as Lease["advanceAllocationMethod"],
  advanceAppliedTo: null as Lease["advanceAppliedTo"],
  advanceAllocationStartDate: null as string | null,
  advanceAllocationDurationMonths: null as number | null,
  fixedMonthlyReductionAmount: null as number | null,
};

const completedMoveInChecklist = {
  leaseSigned: true, firstPaymentReceived: true, guaranteeConfirmed: true,
  keysHandedOver: true, meterReadingCaptured: true, tenantDocumentsComplete: true,
};

const completedMoveOutChecklist = {
  noticeConfirmed: true, moveOutDateConfirmed: true, keysReturned: true,
  moveOutMeterReadingCaptured: true, balanceReviewed: true, guaranteeReviewCompleted: true,
};

export const initialLeases: Lease[] = [
  {
    id: "l1", leaseReference: "BAIL-PAR-001", propertyId: "p1", unitId: "u1", primaryTenantId: "t1", coTenantIds: [], leaseStatus: "active", startDate: "2024-03-01", endDate: "2027-02-28", monthlyRent: 1350, monthlyCharges: 150, dueDayOfMonth: 1, depositOrGuaranteeAmount: 2700, noticePeriodText: "3 months", signedDate: "2024-02-15", notes: "3-year residential lease.",
    noticeGiven: false, noticeDate: null, intendedMoveOutDate: null, terminationReason: null,
    moveInScheduledDate: "2024-03-01", moveInActualDate: "2024-03-01", moveInMeterReading: "12450", moveInChecklist: { ...completedMoveInChecklist },
    moveOutScheduledDate: null, moveOutActualDate: null, moveOutMeterReading: null, moveOutChecklist: { ...DEFAULT_MOVE_OUT_CHECKLIST }, moveOutNotes: "",
    keyHandoverCount: 3, keyReturnCount: 0, returnStatus: null, returnNotes: "",
    ...noAdvance,
    createdAt: "2024-02-15", updatedAt: "2025-11-20",
  },
  {
    id: "l2", leaseReference: "BAIL-BRU-001", propertyId: "p2", unitId: "u6", primaryTenantId: "t2", coTenantIds: [], leaseStatus: "active", startDate: "2024-06-01", endDate: "2027-05-31", monthlyRent: 1100, monthlyCharges: 150, dueDayOfMonth: 1, depositOrGuaranteeAmount: 2200, noticePeriodText: "3 months", signedDate: "2024-05-20", notes: "",
    noticeGiven: false, noticeDate: null, intendedMoveOutDate: null, terminationReason: null,
    moveInScheduledDate: "2024-06-01", moveInActualDate: "2024-06-01", moveInMeterReading: "8920", moveInChecklist: { ...completedMoveInChecklist },
    moveOutScheduledDate: null, moveOutActualDate: null, moveOutMeterReading: null, moveOutChecklist: { ...DEFAULT_MOVE_OUT_CHECKLIST }, moveOutNotes: "",
    keyHandoverCount: 2, keyReturnCount: 0, returnStatus: null, returnNotes: "",
    ...noAdvance,
    createdAt: "2024-05-20", updatedAt: "2025-08-12",
  },
  {
    id: "l3", leaseReference: "BAIL-BRU-002", propertyId: "p2", unitId: "u7", primaryTenantId: "t5", coTenantIds: [], leaseStatus: "draft", startDate: "2026-05-01", endDate: "2029-04-30", monthlyRent: 1200, monthlyCharges: 160, dueDayOfMonth: 1, depositOrGuaranteeAmount: 2400, noticePeriodText: "3 months", signedDate: null, notes: "Draft lease pending signature.",
    noticeGiven: false, noticeDate: null, intendedMoveOutDate: null, terminationReason: null,
    moveInScheduledDate: "2026-05-01", moveInActualDate: null, moveInMeterReading: null, moveInChecklist: { leaseSigned: false, firstPaymentReceived: false, guaranteeConfirmed: false, keysHandedOver: false, meterReadingCaptured: false, tenantDocumentsComplete: true },
    moveOutScheduledDate: null, moveOutActualDate: null, moveOutMeterReading: null, moveOutChecklist: { ...DEFAULT_MOVE_OUT_CHECKLIST }, moveOutNotes: "",
    keyHandoverCount: 0, keyReturnCount: 0, returnStatus: null, returnNotes: "",
    ...noAdvance,
    createdAt: "2026-01-15", updatedAt: "2026-01-15",
  },
  {
    id: "l4", leaseReference: "BAIL-PAR-002", propertyId: "p1", unitId: "u2", primaryTenantId: "t4", coTenantIds: [], leaseStatus: "ended", startDate: "2023-09-01", endDate: "2025-12-31", monthlyRent: 1600, monthlyCharges: 180, dueDayOfMonth: 5, depositOrGuaranteeAmount: 3200, noticePeriodText: "3 months", signedDate: "2023-08-15", notes: "Lease ended, tenant moved out.",
    noticeGiven: true, noticeDate: "2025-09-15", intendedMoveOutDate: "2025-12-31", terminationReason: "End of contract",
    moveInScheduledDate: "2023-09-01", moveInActualDate: "2023-09-01", moveInMeterReading: "5200", moveInChecklist: { ...completedMoveInChecklist },
    moveOutScheduledDate: "2025-12-31", moveOutActualDate: "2025-12-31", moveOutMeterReading: "14800", moveOutChecklist: { ...completedMoveOutChecklist }, moveOutNotes: "Minor wall damage in bedroom.",
    keyHandoverCount: 2, keyReturnCount: 2, returnStatus: "completed", returnNotes: "Unit cleaned and inspected. Minor repairs completed.",
    ...noAdvance,
    createdAt: "2023-08-15", updatedAt: "2025-12-31",
  },
  {
    id: "l5", leaseReference: "BAIL-LON-001", propertyId: "p4", unitId: "u13", primaryTenantId: "t6", coTenantIds: [], leaseStatus: "active", startDate: "2024-10-01", endDate: "2026-09-30", monthlyRent: 1800, monthlyCharges: 120, dueDayOfMonth: 1, depositOrGuaranteeAmount: 3600, noticePeriodText: "2 months", signedDate: "2024-09-15", notes: "",
    noticeGiven: true, noticeDate: "2026-02-15", intendedMoveOutDate: "2026-04-30", terminationReason: "Relocating",
    moveInScheduledDate: "2024-10-01", moveInActualDate: "2024-10-01", moveInMeterReading: "3200", moveInChecklist: { ...completedMoveInChecklist },
    moveOutScheduledDate: "2026-04-30", moveOutActualDate: null, moveOutMeterReading: null, moveOutChecklist: { noticeConfirmed: true, moveOutDateConfirmed: true, keysReturned: false, moveOutMeterReadingCaptured: false, balanceReviewed: false, guaranteeReviewCompleted: false }, moveOutNotes: "",
    keyHandoverCount: 2, keyReturnCount: 0, returnStatus: "pending", returnNotes: "",
    ...noAdvance,
    createdAt: "2024-09-15", updatedAt: "2025-12-01",
  },
  {
    id: "l6", leaseReference: "BAIL-BRU-003", propertyId: "p2", unitId: "u5", primaryTenantId: "t2", coTenantIds: [], leaseStatus: "active", startDate: "2025-07-01", endDate: "2028-06-30", monthlyRent: 2200, monthlyCharges: 350, dueDayOfMonth: 1, depositOrGuaranteeAmount: 4400, noticePeriodText: "6 months", signedDate: "2025-06-15", notes: "Commercial lease with advance payment reducing rent over 12 months.",
    noticeGiven: false, noticeDate: null, intendedMoveOutDate: null, terminationReason: null,
    moveInScheduledDate: "2025-07-01", moveInActualDate: "2025-07-01", moveInMeterReading: "2100", moveInChecklist: { ...completedMoveInChecklist },
    moveOutScheduledDate: null, moveOutActualDate: null, moveOutMeterReading: null, moveOutChecklist: { ...DEFAULT_MOVE_OUT_CHECKLIST }, moveOutNotes: "",
    keyHandoverCount: 2, keyReturnCount: 0, returnStatus: null, returnNotes: "",
    hasAdvancePayment: true, advancePaymentAmount: 6000, advancePaymentDate: "2025-06-20",
    advanceAllocationMethod: "spread-evenly", advanceAppliedTo: "rent",
    advanceAllocationStartDate: "2025-07-01", advanceAllocationDurationMonths: 12,
    fixedMonthlyReductionAmount: null,
    createdAt: "2025-06-15", updatedAt: "2026-01-10",
  },
  {
    id: "l7", leaseReference: "BAIL-AMS-001", propertyId: "p3", unitId: "u9", primaryTenantId: "t3", coTenantIds: [], leaseStatus: "active", startDate: "2025-01-01", endDate: "2027-12-31", monthlyRent: 3200, monthlyCharges: 400, dueDayOfMonth: 1, depositOrGuaranteeAmount: 6400, noticePeriodText: "6 months", signedDate: "2024-12-15", notes: "Office lease with fixed monthly rent reduction from advance payment.",
    noticeGiven: false, noticeDate: null, intendedMoveOutDate: null, terminationReason: null,
    moveInScheduledDate: "2025-01-01", moveInActualDate: "2025-01-01", moveInMeterReading: "4500", moveInChecklist: { ...completedMoveInChecklist },
    moveOutScheduledDate: null, moveOutActualDate: null, moveOutMeterReading: null, moveOutChecklist: { ...DEFAULT_MOVE_OUT_CHECKLIST }, moveOutNotes: "",
    keyHandoverCount: 3, keyReturnCount: 0, returnStatus: null, returnNotes: "",
    hasAdvancePayment: true, advancePaymentAmount: 3600, advancePaymentDate: "2024-12-20",
    advanceAllocationMethod: "fixed-monthly-reduction", advanceAppliedTo: "rent-and-charges",
    advanceAllocationStartDate: "2025-01-01", advanceAllocationDurationMonths: null,
    fixedMonthlyReductionAmount: 150,
    createdAt: "2024-12-15", updatedAt: "2026-01-05",
  },
];

export const initialGuarantees: Guarantee[] = [
  { id: "g1", leaseId: "l1", type: "cash-deposit", expectedAmount: 2700, receivedAmount: 2700, status: "active", receivedDate: "2024-02-20", releaseDate: null, retentionAmount: null, notes: "Deposit received in full." },
  { id: "g2", leaseId: "l2", type: "bank-guarantee", expectedAmount: 2200, receivedAmount: 0, status: "pending", receivedDate: null, releaseDate: null, retentionAmount: null, notes: "Bank guarantee requested, awaiting confirmation." },
  { id: "g3", leaseId: "l5", type: "cash-deposit", expectedAmount: 3600, receivedAmount: 3600, status: "active", receivedDate: "2024-09-20", releaseDate: null, retentionAmount: null, notes: "" },
  { id: "g4", leaseId: "l4", type: "cash-deposit", expectedAmount: 3200, receivedAmount: 3200, status: "partially-retained", receivedDate: "2023-08-20", releaseDate: "2026-01-15", retentionAmount: 500, notes: "€500 retained for cleaning and minor repairs." },
  { id: "g5", leaseId: "l6", type: "cash-deposit", expectedAmount: 4400, receivedAmount: 4400, status: "active", receivedDate: "2025-06-25", releaseDate: null, retentionAmount: null, notes: "Commercial deposit received in full." },
  { id: "g6", leaseId: "l7", type: "cash-deposit", expectedAmount: 6400, receivedAmount: 6400, status: "active", receivedDate: "2024-12-22", releaseDate: null, retentionAmount: null, notes: "Office lease deposit." },
];
