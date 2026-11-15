import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Lease } from "@/types";
import type { LeaseAmendment, LeaseAmendmentChange } from "@/types/amendments";

const lease = { id: "lease-gbp", propertyId: "property-gbp", monthlyRent: 1000,
  endDate: "2027-12-31", primaryTenantId: "tenant" } as Lease;
const amendment = { id: "amendment", leaseId: lease.id, amendmentNumber: 1,
  effectiveDate: "2026-12-01", title: "New rent" } as LeaseAmendment;
const change = { id: "change", amendmentId: amendment.id, fieldName: "baseMonthlyRentTotal",
  oldValue: 1000, newValue: 1200 } as LeaseAmendmentChange;

vi.mock("@/context/SettingsContext", () => ({ useSettings: () => ({
  t: (key: string) => ({
    "rentPrepayment.monthsSuffix": "mois",
    "leaseDetail.rentIndexation": "Indexation du loyer",
    "leaseDetail.indexationCap": "plafond {percent} %",
    "common.no": "Non",
  }[key] ?? key), locale: "fr-BE",
}) }));
vi.mock("@/context/AppContext", () => ({ useAppData: () => ({
  units: [], tenants: [], amendments: [],
}) }));
vi.mock("@/hooks/use-integrity-state", () => ({ useIntegrityState: () => ({
  leases: [lease], amendments: [amendment],
  properties: [
    { id: "property-eur", currencyCode: "EUR" },
    { id: "property-gbp", currencyCode: "GBP" },
  ],
}) }));
vi.mock("@/lib/amendments", () => ({ getEffectiveLeaseTerms: () => null }));

import { AmendmentChangesDialog } from "@/components/amendments/AmendmentChangesDialog";
import { AmendmentConfirmDialog } from "@/components/amendments/AmendmentConfirmDialog";

afterEach(cleanup);

describe("amendment currency display", () => {
  it("uses the lease property's currency in the change comparison", () => {
    render(<AmendmentChangesDialog open onOpenChange={vi.fn()} amendment={amendment} changes={[change]} />);
    expect(screen.getAllByText(/£/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
  });

  it("uses the lease property's currency before scheduling or activation", () => {
    render(<AmendmentConfirmDialog open onOpenChange={vi.fn()} lease={lease}
      effectiveDate={amendment.effectiveDate} changes={[change]}
      action="activate" onConfirm={vi.fn()} />);
    expect(screen.getAllByText(/£/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
  });

  it("localizes formula duration and indexation changes", () => {
    const changes = [
      { ...change, id: "formula", fieldName: "rentFormula", oldValue: 1, newValue: 6 },
      { ...change, id: "index", fieldName: "indexationSettings", oldValue: { indexationEnabled: false },
        newValue: { indexationEnabled: true, indexationBaseIndex: 100, indexationCurrentIndex: 105,
          indexationCapPercent: 5 } },
    ] as LeaseAmendmentChange[];
    render(<AmendmentChangesDialog open onOpenChange={vi.fn()} amendment={amendment} changes={changes} />);
    expect(screen.getByText("6 mois")).toBeInTheDocument();
    expect(screen.getByText("Indexation du loyer")).toBeInTheDocument();
    expect(screen.getByText("Non")).toBeInTheDocument();
    expect(screen.getByText(/plafond 5 %/)).toBeInTheDocument();
  });
});
