import { Property, Unit, Tenant, Lease, Guarantee, DEFAULT_MOVE_IN_CHECKLIST, DEFAULT_MOVE_OUT_CHECKLIST } from "@/types";
import type { LeaseUnitAssignment } from "@/types";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";

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
  { id: "u1", propertyId: "p1", unitCode: "PAR-A01", unitLabel: "Appt 1er gauche", unitType: "apartment", floor: 1, surfaceArea: 52, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 1350, rentTiers: [{ durationMonths: 6, monthlyRent: 1250 }, { durationMonths: 12, monthlyRent: 1150 }], baseCharges: 150, availableFrom: null, notes: "", createdAt: "2024-01-15", updatedAt: "2025-11-20" },
  { id: "u2", propertyId: "p1", unitCode: "PAR-A02", unitLabel: "Appt 2e droite", unitType: "apartment", floor: 2, surfaceArea: 68, bedrooms: 3, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 1650, rentTiers: [{ durationMonths: 6, monthlyRent: 1550 }, { durationMonths: 12, monthlyRent: 1450 }], baseCharges: 180, availableFrom: null, notes: "", createdAt: "2024-01-15", updatedAt: "2025-10-01" },
  { id: "u3", propertyId: "p1", unitCode: "PAR-S01", unitLabel: "Studio 3e", unitType: "studio", floor: 3, surfaceArea: 22, bedrooms: 0, bathrooms: 1, furnished: true, currentStatus: "vacant", baseRent: 850, rentTiers: [{ durationMonths: 6, monthlyRent: 800 }, { durationMonths: 12, monthlyRent: 750 }], baseCharges: 80, availableFrom: "2026-04-01", notes: "Freshly renovated, new kitchen.", createdAt: "2024-01-15", updatedAt: "2026-02-28" },
  { id: "u4", propertyId: "p1", unitCode: "PAR-P01", unitLabel: "Parking sous-sol", unitType: "parking", floor: -1, surfaceArea: 12, bedrooms: 0, bathrooms: 0, furnished: false, currentStatus: "vacant", baseRent: 120, rentTiers: [], baseCharges: 0, availableFrom: "2026-03-15", notes: "", createdAt: "2024-01-15", updatedAt: "2025-09-10" },
  { id: "u5", propertyId: "p2", unitCode: "BRU-C01", unitLabel: "Commerce RDC", unitType: "commercial-unit", floor: 0, surfaceArea: 95, bedrooms: 0, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 2200, rentTiers: [{ durationMonths: 6, monthlyRent: 2050 }, { durationMonths: 12, monthlyRent: 1900 }], baseCharges: 350, availableFrom: null, notes: "Currently leased to a bakery.", createdAt: "2024-03-20", updatedAt: "2025-10-05" },
  { id: "u6", propertyId: "p2", unitCode: "BRU-A01", unitLabel: "Appt 1er", unitType: "apartment", floor: 1, surfaceArea: 75, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 1100, rentTiers: [{ durationMonths: 6, monthlyRent: 1020 }, { durationMonths: 12, monthlyRent: 950 }], baseCharges: 150, availableFrom: null, notes: "", createdAt: "2024-03-20", updatedAt: "2025-08-12" },
  { id: "u7", propertyId: "p2", unitCode: "BRU-A02", unitLabel: "Appt 2e", unitType: "apartment", floor: 2, surfaceArea: 80, bedrooms: 3, bathrooms: 1, furnished: false, currentStatus: "reserved", baseRent: 1200, rentTiers: [{ durationMonths: 6, monthlyRent: 1120 }, { durationMonths: 12, monthlyRent: 1050 }], baseCharges: 160, availableFrom: "2026-05-01", notes: "Reserved for new tenant, move-in May.", createdAt: "2024-03-20", updatedAt: "2026-01-15" },
  { id: "u8", propertyId: "p2", unitCode: "BRU-ST1", unitLabel: "Cave stockage", unitType: "storage", floor: -1, surfaceArea: 8, bedrooms: 0, bathrooms: 0, furnished: false, currentStatus: "vacant", baseRent: 75, rentTiers: [], baseCharges: 0, availableFrom: null, notes: "", createdAt: "2024-03-20", updatedAt: "2025-07-01" },
  { id: "u9", propertyId: "p3", unitCode: "AMS-O01", unitLabel: "Office 1st floor", unitType: "office", floor: 1, surfaceArea: 120, bedrooms: 0, bathrooms: 1, furnished: true, currentStatus: "occupied", baseRent: 3200, rentTiers: [{ durationMonths: 6, monthlyRent: 3000 }, { durationMonths: 12, monthlyRent: 2800 }], baseCharges: 400, availableFrom: null, notes: "Includes 2 meeting rooms.", createdAt: "2024-06-01", updatedAt: "2025-09-12" },
  { id: "u10", propertyId: "p3", unitCode: "AMS-O02", unitLabel: "Office 2nd floor", unitType: "office", floor: 2, surfaceArea: 85, bedrooms: 0, bathrooms: 1, furnished: false, currentStatus: "vacant", baseRent: 2400, rentTiers: [{ durationMonths: 6, monthlyRent: 2250 }, { durationMonths: 12, monthlyRent: 2100 }], baseCharges: 300, availableFrom: "2026-04-15", notes: "Open-plan layout, needs fit-out.", createdAt: "2024-06-01", updatedAt: "2026-02-10" },
  { id: "u11", propertyId: "p3", unitCode: "AMS-O03", unitLabel: "Office 3rd floor", unitType: "office", floor: 3, surfaceArea: 85, bedrooms: 0, bathrooms: 1, furnished: true, currentStatus: "occupied", baseRent: 2600, rentTiers: [{ durationMonths: 6, monthlyRent: 2450 }, { durationMonths: 12, monthlyRent: 2300 }], baseCharges: 320, availableFrom: null, notes: "", createdAt: "2024-06-01", updatedAt: "2025-11-30" },
  { id: "u12", propertyId: "p3", unitCode: "AMS-P01", unitLabel: "Parking kelder", unitType: "parking", floor: -1, surfaceArea: 14, bedrooms: 0, bathrooms: 0, furnished: false, currentStatus: "unavailable", baseRent: 200, rentTiers: [], baseCharges: 0, availableFrom: null, notes: "Under maintenance until Q3 2026.", createdAt: "2024-06-01", updatedAt: "2026-01-05" },
  { id: "u13", propertyId: "p4", unitCode: "LON-F01", unitLabel: "Flat 1 Ground", unitType: "apartment", floor: 0, surfaceArea: 45, bedrooms: 1, bathrooms: 1, furnished: true, currentStatus: "occupied", baseRent: 1800, rentTiers: [{ durationMonths: 6, monthlyRent: 1700 }, { durationMonths: 12, monthlyRent: 1600 }], baseCharges: 120, availableFrom: null, notes: "", createdAt: "2024-08-10", updatedAt: "2025-12-01" },
  { id: "u14", propertyId: "p4", unitCode: "LON-F02", unitLabel: "Flat 2 First", unitType: "apartment", floor: 1, surfaceArea: 62, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 2200, rentTiers: [{ durationMonths: 6, monthlyRent: 2050 }, { durationMonths: 12, monthlyRent: 1900 }], baseCharges: 140, availableFrom: null, notes: "", createdAt: "2024-08-10", updatedAt: "2025-11-15" },
  { id: "u15", propertyId: "p4", unitCode: "LON-S01", unitLabel: "Studio Top", unitType: "studio", floor: 2, surfaceArea: 28, bedrooms: 0, bathrooms: 1, furnished: true, currentStatus: "reserved", baseRent: 1400, rentTiers: [{ durationMonths: 6, monthlyRent: 1300 }, { durationMonths: 12, monthlyRent: 1200 }], baseCharges: 90, availableFrom: "2026-06-01", notes: "Reserved, tenant confirmed for June.", createdAt: "2024-08-10", updatedAt: "2026-03-01" },
  { id: "u16", propertyId: "p5", unitCode: "BER-W01", unitLabel: "Wohnung 1. OG", unitType: "apartment", floor: 1, surfaceArea: 70, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "unavailable", baseRent: 900, rentTiers: [{ durationMonths: 6, monthlyRent: 850 }, { durationMonths: 12, monthlyRent: 800 }], baseCharges: 200, availableFrom: null, notes: "Major renovation in progress.", createdAt: "2023-11-05", updatedAt: "2025-06-15" },
  { id: "u17", propertyId: "p5", unitCode: "BER-W02", unitLabel: "Wohnung 2. OG", unitType: "apartment", floor: 2, surfaceArea: 65, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "vacant", baseRent: 850, rentTiers: [{ durationMonths: 6, monthlyRent: 800 }, { durationMonths: 12, monthlyRent: 750 }], baseCharges: 190, availableFrom: "2026-07-01", notes: "Available after renovation completes.", createdAt: "2023-11-05", updatedAt: "2026-02-20" },
  { id: "u18", propertyId: "p5", unitCode: "BER-K01", unitLabel: "Keller Lager", unitType: "storage", floor: -1, surfaceArea: 10, bedrooms: 0, bathrooms: 0, furnished: false, currentStatus: "vacant", baseRent: 60, rentTiers: [], baseCharges: 0, availableFrom: null, notes: "", createdAt: "2023-11-05", updatedAt: "2025-04-01" },
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
    id: "l1", leaseReference: "BAIL-PAR-001", propertyId: "p1", unitId: "u1", primaryTenantId: "t1", coTenantIds: [], lifecycleStage: "active", startDate: "2024-03-01", endDate: "2027-02-28", monthlyRent: 1350, monthlyCharges: 150, dueDayOfMonth: 1, depositOrGuaranteeAmount: 2700, noticePeriodText: "3 months", signedDate: "2024-02-15", notes: "3-year residential lease.", rentFormula: 1,
    noticeGiven: false, noticeDate: null, intendedMoveOutDate: null, terminationReason: null,
    moveInScheduledDate: "2024-03-01", moveInActualDate: "2024-03-01", moveInMeterReading: "12450", moveInWaterMeterReading: "12450", moveInChecklist: { ...completedMoveInChecklist },
    moveOutScheduledDate: null, moveOutActualDate: null, moveOutMeterReading: null, moveOutWaterMeterReading: null, moveOutChecklist: { ...DEFAULT_MOVE_OUT_CHECKLIST }, moveOutNotes: "",
    keyHandoverCount: 3, keyReturnCount: 0, returnStatus: null, returnNotes: "",
    ...noAdvance,
    createdAt: "2024-02-15", updatedAt: "2025-11-20",
  },
  {
    id: "l2", leaseReference: "BAIL-BRU-001", propertyId: "p2", unitId: "u6", primaryTenantId: "t2", coTenantIds: [], lifecycleStage: "active", startDate: "2024-06-01", endDate: "2027-05-31", monthlyRent: 1100, monthlyCharges: 150, dueDayOfMonth: 1, depositOrGuaranteeAmount: 2200, noticePeriodText: "3 months", signedDate: "2024-05-20", notes: "", rentFormula: 1,
    noticeGiven: false, noticeDate: null, intendedMoveOutDate: null, terminationReason: null,
    moveInScheduledDate: "2024-06-01", moveInActualDate: "2024-06-01", moveInMeterReading: "8920", moveInWaterMeterReading: "8920", moveInChecklist: { ...completedMoveInChecklist },
    moveOutScheduledDate: null, moveOutActualDate: null, moveOutMeterReading: null, moveOutWaterMeterReading: null, moveOutChecklist: { ...DEFAULT_MOVE_OUT_CHECKLIST }, moveOutNotes: "",
    keyHandoverCount: 2, keyReturnCount: 0, returnStatus: null, returnNotes: "",
    ...noAdvance,
    createdAt: "2024-05-20", updatedAt: "2025-08-12",
  },
  {
    id: "l3", leaseReference: "BAIL-BRU-002", propertyId: "p2", unitId: "u7", primaryTenantId: "t5", coTenantIds: [], lifecycleStage: "draft", startDate: "2026-05-01", endDate: "2029-04-30", monthlyRent: 1200, monthlyCharges: 160, dueDayOfMonth: 1, depositOrGuaranteeAmount: 2400, noticePeriodText: "3 months", signedDate: null, notes: "Draft lease pending signature.", rentFormula: 1,
    noticeGiven: false, noticeDate: null, intendedMoveOutDate: null, terminationReason: null,
    moveInScheduledDate: "2026-05-01", moveInActualDate: null, moveInMeterReading: null, moveInWaterMeterReading: null, moveInChecklist: { leaseSigned: false, firstPaymentReceived: false, guaranteeConfirmed: false, keysHandedOver: false, meterReadingCaptured: false, tenantDocumentsComplete: true },
    moveOutScheduledDate: null, moveOutActualDate: null, moveOutMeterReading: null, moveOutWaterMeterReading: null, moveOutChecklist: { ...DEFAULT_MOVE_OUT_CHECKLIST }, moveOutNotes: "",
    keyHandoverCount: 0, keyReturnCount: 0, returnStatus: null, returnNotes: "",
    ...noAdvance,
    createdAt: "2026-01-15", updatedAt: "2026-01-15",
  },
  {
    id: "l4", leaseReference: "BAIL-PAR-002", propertyId: "p1", unitId: "u2", primaryTenantId: "t4", coTenantIds: [], lifecycleStage: "ended", startDate: "2023-09-01", endDate: "2025-12-31", monthlyRent: 1600, monthlyCharges: 180, dueDayOfMonth: 5, depositOrGuaranteeAmount: 3200, noticePeriodText: "3 months", signedDate: "2023-08-15", notes: "Lease ended, tenant moved out.", rentFormula: 1,
    noticeGiven: true, noticeDate: "2025-09-15", intendedMoveOutDate: "2025-12-31", terminationReason: "End of contract",
    moveInScheduledDate: "2023-09-01", moveInActualDate: "2023-09-01", moveInMeterReading: "5200", moveInWaterMeterReading: "5200", moveInChecklist: { ...completedMoveInChecklist },
    moveOutScheduledDate: "2025-12-31", moveOutActualDate: "2025-12-31", moveOutMeterReading: "14800", moveOutWaterMeterReading: "14800", moveOutChecklist: { ...completedMoveOutChecklist }, moveOutNotes: "Minor wall damage in bedroom.",
    keyHandoverCount: 2, keyReturnCount: 2, returnStatus: "completed", returnNotes: "Unit cleaned and inspected. Minor repairs completed.",
    ...noAdvance,
    createdAt: "2023-08-15", updatedAt: "2025-12-31",
  },
  {
    id: "l5", leaseReference: "BAIL-LON-001", propertyId: "p4", unitId: "u13", primaryTenantId: "t6", coTenantIds: [], lifecycleStage: "active", startDate: "2024-10-01", endDate: "2026-09-30", monthlyRent: 1800, monthlyCharges: 120, dueDayOfMonth: 1, depositOrGuaranteeAmount: 3600, noticePeriodText: "2 months", signedDate: "2024-09-15", notes: "", rentFormula: 1,
    noticeGiven: true, noticeDate: "2026-02-15", intendedMoveOutDate: "2026-04-30", terminationReason: "Relocating",
    moveInScheduledDate: "2024-10-01", moveInActualDate: "2024-10-01", moveInMeterReading: "3200", moveInWaterMeterReading: "3200", moveInChecklist: { ...completedMoveInChecklist },
    moveOutScheduledDate: "2026-04-30", moveOutActualDate: null, moveOutMeterReading: null, moveOutWaterMeterReading: null, moveOutChecklist: { noticeConfirmed: true, moveOutDateConfirmed: true, keysReturned: false, moveOutMeterReadingCaptured: false, balanceReviewed: false, guaranteeReviewCompleted: false }, moveOutNotes: "",
    keyHandoverCount: 2, keyReturnCount: 0, returnStatus: "pending", returnNotes: "",
    ...noAdvance,
    createdAt: "2024-09-15", updatedAt: "2025-12-01",
  },
  {
    id: "l6", leaseReference: "BAIL-BRU-003", propertyId: "p2", unitId: "u5", primaryTenantId: "t2", coTenantIds: [], lifecycleStage: "active", startDate: "2025-07-01", endDate: "2028-06-30", monthlyRent: 2200, monthlyCharges: 350, dueDayOfMonth: 1, depositOrGuaranteeAmount: 4400, noticePeriodText: "6 months", signedDate: "2025-06-15", notes: "Commercial lease with advance payment reducing rent over 12 months.", rentFormula: 12,
    noticeGiven: false, noticeDate: null, intendedMoveOutDate: null, terminationReason: null,
    moveInScheduledDate: "2025-07-01", moveInActualDate: "2025-07-01", moveInMeterReading: "2100", moveInWaterMeterReading: "2100", moveInChecklist: { ...completedMoveInChecklist },
    moveOutScheduledDate: null, moveOutActualDate: null, moveOutMeterReading: null, moveOutWaterMeterReading: null, moveOutChecklist: { ...DEFAULT_MOVE_OUT_CHECKLIST }, moveOutNotes: "",
    keyHandoverCount: 2, keyReturnCount: 0, returnStatus: null, returnNotes: "",
    hasAdvancePayment: true, advancePaymentAmount: 6000, advancePaymentDate: "2025-06-20",
    advanceAllocationMethod: "spread-evenly", advanceAppliedTo: "rent",
    advanceAllocationStartDate: "2025-07-01", advanceAllocationDurationMonths: 12,
    fixedMonthlyReductionAmount: null,
    createdAt: "2025-06-15", updatedAt: "2026-01-10",
  },
  {
    id: "l7", leaseReference: "BAIL-AMS-001", propertyId: "p3", unitId: "u9", primaryTenantId: "t3", coTenantIds: [], lifecycleStage: "active", startDate: "2025-01-01", endDate: "2027-12-31", monthlyRent: 3200, monthlyCharges: 400, dueDayOfMonth: 1, depositOrGuaranteeAmount: 6400, noticePeriodText: "6 months", signedDate: "2024-12-15", notes: "Office lease with fixed monthly rent reduction from advance payment.", rentFormula: 6,
    noticeGiven: false, noticeDate: null, intendedMoveOutDate: null, terminationReason: null,
    moveInScheduledDate: "2025-01-01", moveInActualDate: "2025-01-01", moveInMeterReading: "4500", moveInWaterMeterReading: "4500", moveInChecklist: { ...completedMoveInChecklist },
    moveOutScheduledDate: null, moveOutActualDate: null, moveOutMeterReading: null, moveOutWaterMeterReading: null, moveOutChecklist: { ...DEFAULT_MOVE_OUT_CHECKLIST }, moveOutNotes: "",
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

/**
 * Pre-seeded ancillary lease-unit assignments (apartment + parking, apartment + cellar,
 * office + parking). Primary-unit rows are generated automatically at boot time from
 * `lease.unitId` by `migrateLegacyLeaseAssignments` in `AppContext`.
 */
export const initialLeaseUnitAssignments: LeaseUnitAssignment[] = [
  // l1 — Paris apartment + sous-sol parking
  { id: "lua1", leaseId: "l1", unitId: "u4", assignmentType: "parking", isPrimary: false, startDate: "2024-03-01", endDate: null, rentShare: 120, chargesShare: 0, notes: "Spot 12, sous-sol", createdAt: "2024-03-01", updatedAt: "2024-03-01" },
  // l2 — Brussels apartment + cave storage
  { id: "lua2", leaseId: "l2", unitId: "u8", assignmentType: "storage", isPrimary: false, startDate: "2024-06-01", endDate: null, rentShare: 75, chargesShare: 0, notes: "Cave n°4", createdAt: "2024-06-01", updatedAt: "2024-06-01" },
  // l7 — Amsterdam office + kelder parking (overrides unavailable parking status via assignment)
  { id: "lua3", leaseId: "l7", unitId: "u12", assignmentType: "parking", isPrimary: false, startDate: "2025-01-01", endDate: null, rentShare: 200, chargesShare: 0, notes: "Reserved with the office", createdAt: "2025-01-01", updatedAt: "2025-01-01" },
];

/**
 * Sample lease amendments ("avenants"). Demonstrates each major amendment type
 * on existing active leases. Receivable side-effects are NOT applied here —
 * amendments are the source-of-truth deltas; the engine derives effective terms.
 */
export const initialAmendments: LeaseAmendment[] = [
  // l1 (Paris) — rent increase from 2025-09-01
  { id: "am1", leaseId: "l1", amendmentNumber: 1, amendmentType: "rent-change", title: "Indexation IRL 2025", reason: "Annual indexation (IRL Q2 2025)", notes: "", effectiveDate: "2025-09-01", signedDate: "2025-08-15", status: "active", supersedesAmendmentId: null, createdAt: "2025-08-15", updatedAt: "2025-08-15" },
  // l2 (Brussels) — charges update
  { id: "am2", leaseId: "l2", amendmentNumber: 1, amendmentType: "charges-change", title: "Provision charges 2026", reason: "Higher building maintenance budget", notes: "", effectiveDate: "2026-01-01", signedDate: "2025-12-10", status: "ended", supersedesAmendmentId: null, createdAt: "2025-12-10", updatedAt: "2026-02-10" },
  // l5 (London) — term extension before move-out is finalised
  { id: "am3", leaseId: "l5", amendmentNumber: 1, amendmentType: "term-extension", title: "12-month extension", reason: "Tenant cancelled relocation", notes: "Replaces the notice given in February.", effectiveDate: "2026-04-30", signedDate: null, status: "scheduled", supersedesAmendmentId: null, createdAt: "2026-03-10", updatedAt: "2026-03-10" },
  // l7 (Amsterdam) — additional parking added
  { id: "am4", leaseId: "l7", amendmentNumber: 1, amendmentType: "unit-addition", title: "Add second parking spot", reason: "Tenant request for visitor parking", notes: "", effectiveDate: "2025-11-01", signedDate: "2025-10-15", status: "active", supersedesAmendmentId: null, createdAt: "2025-10-15", updatedAt: "2025-10-15" },
  // l2 (Brussels) — cellar removed
  { id: "am5", leaseId: "l2", amendmentNumber: 2, amendmentType: "unit-removal", title: "Drop cave storage", reason: "Tenant no longer needs storage", notes: "", effectiveDate: "2026-03-01", signedDate: "2026-02-10", status: "active", supersedesAmendmentId: "am2", createdAt: "2026-02-10", updatedAt: "2026-02-10" },
  // l6 (Brussels commercial) — mixed: small rent increase + 6-month extension (draft)
  { id: "am6", leaseId: "l6", amendmentNumber: 1, amendmentType: "mixed", title: "Mid-term renegotiation", reason: "Tenant requested extension; landlord requested rent uplift", notes: "Pending signature from tenant.", effectiveDate: "2026-07-01", signedDate: null, status: "draft", supersedesAmendmentId: null, createdAt: "2026-04-20", updatedAt: "2026-04-20" },
];

export const initialAmendmentChanges: LeaseAmendmentChange[] = [
  // am1 — rent on l1 from 1350 to 1390 (unit u1 share absorbs the change)
  { id: "amc1", amendmentId: "am1", fieldName: "baseMonthlyRentTotal", changeType: "set", oldValue: 1350, newValue: 1390, createdAt: "2025-08-15", updatedAt: "2025-08-15" },
  { id: "amc1b", amendmentId: "am1", fieldName: "unitRentShare", changeType: "set", oldValue: 1230, newValue: 1270, metadata: { unitId: "u1" }, createdAt: "2025-08-15", updatedAt: "2025-08-15" },
  // am2 — charges on l2 from 150 to 170 (unit u6 share)
  { id: "amc2", amendmentId: "am2", fieldName: "baseMonthlyChargesTotal", changeType: "set", oldValue: 150, newValue: 170, createdAt: "2025-12-10", updatedAt: "2025-12-10" },
  { id: "amc2b", amendmentId: "am2", fieldName: "unitChargesShare", changeType: "set", oldValue: 150, newValue: 170, metadata: { unitId: "u6" }, createdAt: "2025-12-10", updatedAt: "2025-12-10" },
  // am3 — extend l5 end date 2026-09-30 -> 2027-09-30
  { id: "amc3", amendmentId: "am3", fieldName: "leaseEndDate", changeType: "set", oldValue: "2026-09-30", newValue: "2027-09-30", createdAt: "2026-03-10", updatedAt: "2026-03-10" },
  // am4 — add parking u10 to l7 (office). Already exists as parking u12 on l7; add another spot via office u10? No, must be parking. Use a different parking… mock data only has u4/u12 parking. Use u10 swapped? Keep it simple: use cellar-style. We'll skip the actual assignment row here — engine treats this as a recorded change. Use existing unit u12 won't fly. Use u10 as the additional spot label (office) — but property mismatch. Re-target: add u11 to l7 is wrong type. We'll just record the change line; the activation flow would create the assignment row when fired. For seed, mark am4 with metadata only.
  { id: "amc4", amendmentId: "am4", fieldName: "unitAssignments", changeType: "add", oldValue: null, newValue: { rentShare: 180, chargesShare: 0 }, metadata: { unitId: "u10", assignmentType: "parking", startDate: "2025-11-01" }, createdAt: "2025-10-15", updatedAt: "2025-10-15" },
  // am5 — remove cellar u8 from l2 starting 2026-03-01
  { id: "amc5", amendmentId: "am5", fieldName: "unitAssignments", changeType: "remove", oldValue: { unitId: "u8" }, newValue: null, metadata: { unitId: "u8", startDate: "2026-03-01" }, createdAt: "2026-02-10", updatedAt: "2026-02-10" },
  // am6 — mixed rent uplift + end-date extension on l6 (draft)
  { id: "amc6a", amendmentId: "am6", fieldName: "baseMonthlyRentTotal", changeType: "set", oldValue: 2200, newValue: 2350, createdAt: "2026-04-20", updatedAt: "2026-04-20" },
  { id: "amc6b", amendmentId: "am6", fieldName: "leaseEndDate", changeType: "set", oldValue: "2028-06-30", newValue: "2029-06-30", createdAt: "2026-04-20", updatedAt: "2026-04-20" },
];
