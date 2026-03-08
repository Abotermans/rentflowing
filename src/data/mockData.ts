import { Property, Unit } from "@/types";

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
  // Paris — Résidence du Parc (p1)
  { id: "u1", propertyId: "p1", unitCode: "PAR-A01", unitLabel: "Appt 1er gauche", unitType: "apartment", floor: 1, surfaceArea: 52, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 1350, baseCharges: 150, availableFrom: null, notes: "", createdAt: "2024-01-15", updatedAt: "2025-11-20" },
  { id: "u2", propertyId: "p1", unitCode: "PAR-A02", unitLabel: "Appt 2e droite", unitType: "apartment", floor: 2, surfaceArea: 68, bedrooms: 3, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 1650, baseCharges: 180, availableFrom: null, notes: "", createdAt: "2024-01-15", updatedAt: "2025-10-01" },
  { id: "u3", propertyId: "p1", unitCode: "PAR-S01", unitLabel: "Studio 3e", unitType: "studio", floor: 3, surfaceArea: 22, bedrooms: 0, bathrooms: 1, furnished: true, currentStatus: "vacant", baseRent: 850, baseCharges: 80, availableFrom: "2026-04-01", notes: "Freshly renovated, new kitchen.", createdAt: "2024-01-15", updatedAt: "2026-02-28" },
  { id: "u4", propertyId: "p1", unitCode: "PAR-P01", unitLabel: "Parking sous-sol", unitType: "parking", floor: -1, surfaceArea: 12, bedrooms: 0, bathrooms: 0, furnished: false, currentStatus: "vacant", baseRent: 120, baseCharges: 0, availableFrom: "2026-03-15", notes: "", createdAt: "2024-01-15", updatedAt: "2025-09-10" },

  // Brussels — Les Terrasses (p2)
  { id: "u5", propertyId: "p2", unitCode: "BRU-C01", unitLabel: "Commerce RDC", unitType: "commercial-unit", floor: 0, surfaceArea: 95, bedrooms: 0, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 2200, baseCharges: 350, availableFrom: null, notes: "Currently leased to a bakery.", createdAt: "2024-03-20", updatedAt: "2025-10-05" },
  { id: "u6", propertyId: "p2", unitCode: "BRU-A01", unitLabel: "Appt 1er", unitType: "apartment", floor: 1, surfaceArea: 75, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 1100, baseCharges: 150, availableFrom: null, notes: "", createdAt: "2024-03-20", updatedAt: "2025-08-12" },
  { id: "u7", propertyId: "p2", unitCode: "BRU-A02", unitLabel: "Appt 2e", unitType: "apartment", floor: 2, surfaceArea: 80, bedrooms: 3, bathrooms: 1, furnished: false, currentStatus: "reserved", baseRent: 1200, baseCharges: 160, availableFrom: "2026-05-01", notes: "Reserved for new tenant, move-in May.", createdAt: "2024-03-20", updatedAt: "2026-01-15" },
  { id: "u8", propertyId: "p2", unitCode: "BRU-ST1", unitLabel: "Cave stockage", unitType: "storage", floor: -1, surfaceArea: 8, bedrooms: 0, bathrooms: 0, furnished: false, currentStatus: "vacant", baseRent: 75, baseCharges: 0, availableFrom: null, notes: "", createdAt: "2024-03-20", updatedAt: "2025-07-01" },

  // Amsterdam — Office Hub (p3)
  { id: "u9", propertyId: "p3", unitCode: "AMS-O01", unitLabel: "Office 1st floor", unitType: "office", floor: 1, surfaceArea: 120, bedrooms: 0, bathrooms: 1, furnished: true, currentStatus: "occupied", baseRent: 3200, baseCharges: 400, availableFrom: null, notes: "Includes 2 meeting rooms.", createdAt: "2024-06-01", updatedAt: "2025-09-12" },
  { id: "u10", propertyId: "p3", unitCode: "AMS-O02", unitLabel: "Office 2nd floor", unitType: "office", floor: 2, surfaceArea: 85, bedrooms: 0, bathrooms: 1, furnished: false, currentStatus: "vacant", baseRent: 2400, baseCharges: 300, availableFrom: "2026-04-15", notes: "Open-plan layout, needs fit-out.", createdAt: "2024-06-01", updatedAt: "2026-02-10" },
  { id: "u11", propertyId: "p3", unitCode: "AMS-O03", unitLabel: "Office 3rd floor", unitType: "office", floor: 3, surfaceArea: 85, bedrooms: 0, bathrooms: 1, furnished: true, currentStatus: "occupied", baseRent: 2600, baseCharges: 320, availableFrom: null, notes: "", createdAt: "2024-06-01", updatedAt: "2025-11-30" },
  { id: "u12", propertyId: "p3", unitCode: "AMS-P01", unitLabel: "Parking kelder", unitType: "parking", floor: -1, surfaceArea: 14, bedrooms: 0, bathrooms: 0, furnished: false, currentStatus: "unavailable", baseRent: 200, baseCharges: 0, availableFrom: null, notes: "Under maintenance until Q3 2026.", createdAt: "2024-06-01", updatedAt: "2026-01-05" },

  // London — Camden Mews (p4)
  { id: "u13", propertyId: "p4", unitCode: "LON-F01", unitLabel: "Flat 1 Ground", unitType: "apartment", floor: 0, surfaceArea: 45, bedrooms: 1, bathrooms: 1, furnished: true, currentStatus: "occupied", baseRent: 1800, baseCharges: 120, availableFrom: null, notes: "", createdAt: "2024-08-10", updatedAt: "2025-12-01" },
  { id: "u14", propertyId: "p4", unitCode: "LON-F02", unitLabel: "Flat 2 First", unitType: "apartment", floor: 1, surfaceArea: 62, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "occupied", baseRent: 2200, baseCharges: 140, availableFrom: null, notes: "", createdAt: "2024-08-10", updatedAt: "2025-11-15" },
  { id: "u15", propertyId: "p4", unitCode: "LON-S01", unitLabel: "Studio Top", unitType: "studio", floor: 2, surfaceArea: 28, bedrooms: 0, bathrooms: 1, furnished: true, currentStatus: "reserved", baseRent: 1400, baseCharges: 90, availableFrom: "2026-06-01", notes: "Reserved, tenant confirmed for June.", createdAt: "2024-08-10", updatedAt: "2026-03-01" },

  // Berlin — Friedrichstraße (p5)
  { id: "u16", propertyId: "p5", unitCode: "BER-W01", unitLabel: "Wohnung 1. OG", unitType: "apartment", floor: 1, surfaceArea: 70, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "unavailable", baseRent: 900, baseCharges: 200, availableFrom: null, notes: "Major renovation in progress.", createdAt: "2023-11-05", updatedAt: "2025-06-15" },
  { id: "u17", propertyId: "p5", unitCode: "BER-W02", unitLabel: "Wohnung 2. OG", unitType: "apartment", floor: 2, surfaceArea: 65, bedrooms: 2, bathrooms: 1, furnished: false, currentStatus: "vacant", baseRent: 850, baseCharges: 190, availableFrom: "2026-07-01", notes: "Available after renovation completes.", createdAt: "2023-11-05", updatedAt: "2026-02-20" },
  { id: "u18", propertyId: "p5", unitCode: "BER-K01", unitLabel: "Keller Lager", unitType: "storage", floor: -1, surfaceArea: 10, bedrooms: 0, bathrooms: 0, furnished: false, currentStatus: "vacant", baseRent: 60, baseCharges: 0, availableFrom: null, notes: "", createdAt: "2023-11-05", updatedAt: "2025-04-01" },
];
