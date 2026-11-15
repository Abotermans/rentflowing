import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  toast: vi.fn(),
  t: (key: string) => key,
  schemaMissing: true,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mock.from },
}));
vi.mock("@/context/SettingsContext", () => ({
  useSettings: () => ({ t: mock.t, locale: "en-GB" }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mock.toast }),
}));
vi.mock("@/hooks/use-portfolio-write-access", () => ({
  usePortfolioWriteAccess: () => true,
}));

import { LeaseDocumentsDialog } from "@/components/leases/LeaseDocumentsDialog";

function query(table: string) {
  let selected = "";
  const builder = {
    select(value: string) { selected = value; return builder; },
    eq() { return builder; },
    order() { return builder; },
    limit() { return Promise.resolve(mock.schemaMissing
      ? { data: null, error: { code: "42703", message: "column lease_documents.document_type does not exist" } }
      : { data: [], error: null }); },
    then(resolve: (value: unknown) => void) {
      resolve(table === "lease_document_types"
        ? { data: null, error: { code: "PGRST205", message: "Could not find the table public.lease_document_types in the schema cache" } }
        : { data: selected === "*" ? [] : null, error: null });
    },
  };
  return builder;
}

describe("lease document schema guard", () => {
  it("blocks uploads before selecting a file when contractual columns are absent", async () => {
    mock.schemaMissing = true;
    mock.from.mockReset().mockImplementation(query);
    mock.toast.mockReset();
    render(
      <LeaseDocumentsDialog
        open
        onOpenChange={vi.fn()}
        leaseId="lease-1"
        portfolioId="portfolio-1"
        todayISO="2026-11-05"
        lease={{ id: "lease-1", lifecycleStage: "draft", startDate: "2027-01-01", signedDate: null }}
      />,
    );
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("documents.error.migrationRequired"));
    expect(screen.getByRole("button", { name: "documents.upload" })).toBeDisabled();
    expect(mock.from).toHaveBeenCalledWith("lease_documents");
  });

  it("allows the add row when the document schema is available", async () => {
    mock.schemaMissing = false;
    mock.from.mockReset().mockImplementation(query);
    render(
      <LeaseDocumentsDialog
        open
        onOpenChange={vi.fn()}
        leaseId="lease-1"
        portfolioId="portfolio-1"
        todayISO="2026-11-05"
        lease={{ id: "lease-1", lifecycleStage: "draft", startDate: "2027-01-01", signedDate: null }}
      />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "documents.upload" })).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("loads a new lease and ignores a late document response from the previous lease", async () => {
    mock.schemaMissing = false;
    mock.toast.mockReset();
    let resolveFirst: ((value: unknown) => void) | undefined;
    const document = (leaseId: string, title: string) => ({
      id: `document-${leaseId}`, lease_id: leaseId, portfolio_id: "portfolio-1",
      document_type: "supporting", status: null, signed_date: null,
      title, document_date: "2026-11-05", original_filename: `${title}.pdf`,
      storage_path: `${leaseId}/${title}.pdf`, notes: null,
    });
    mock.from.mockReset().mockImplementation((table: string) => {
      let selected = "";
      let requestedLeaseId = "";
      const builder = {
        select(value: string) { selected = value; return builder; },
        eq(field: string, value: string) {
          if (field === "lease_id") requestedLeaseId = value;
          return builder;
        },
        order() { return builder; },
        limit() { return Promise.resolve({ data: [], error: null }); },
        then(resolve: (value: unknown) => void) {
          if (table === "lease_document_types") {
            resolve({ data: [], error: null });
          } else if (selected === "*" && requestedLeaseId === "lease-1") {
            resolveFirst = resolve;
          } else {
            resolve({ data: [document(requestedLeaseId, "Second lease document")], error: null });
          }
        },
      };
      return builder;
    });
    const onDocumentsChanged = vi.fn();
    const props = {
      open: true, onOpenChange: vi.fn(), portfolioId: "portfolio-1",
      todayISO: "2026-11-05", onDocumentsChanged,
    };
    const { rerender } = render(
      <TooltipProvider><LeaseDocumentsDialog {...props} leaseId="lease-1"
        lease={{ id: "lease-1", lifecycleStage: "draft", startDate: "2027-01-01", signedDate: null }} /></TooltipProvider>,
    );
    await waitFor(() => expect(resolveFirst).toBeDefined());
    rerender(
      <TooltipProvider><LeaseDocumentsDialog {...props} leaseId="lease-2"
        lease={{ id: "lease-2", lifecycleStage: "draft", startDate: "2027-01-01", signedDate: null }} /></TooltipProvider>,
    );
    await waitFor(() => expect(screen.getByText("Second lease document")).toBeInTheDocument());
    await act(async () => {
      resolveFirst?.({ data: [document("lease-1", "First lease document")], error: null });
    });
    expect(screen.getByText("Second lease document")).toBeInTheDocument();
    expect(screen.queryByText("First lease document")).not.toBeInTheDocument();
    expect(onDocumentsChanged).toHaveBeenCalledTimes(1);
  });
});
