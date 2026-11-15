import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const mock = vi.hoisted(() => ({
  deleteError: true,
  contractual: false,
  toast: vi.fn(),
  remove: vi.fn(),
  deleteRow: vi.fn(),
  rpc: vi.fn(),
  t: (key: string) => key,
}));

const documentRow = {
  id: "document-1",
  lease_id: "lease-1",
  portfolio_id: "portfolio-1",
  title: "Inventory",
  document_type: "supporting",
  status: null,
  signed_date: null,
  document_date: "2026-06-01",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  original_filename: "inventory.pdf",
  storage_path: "portfolio-1/lease-1/inventory.pdf",
  notes: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let mode: "list" | "schema" | "delete" = "list";
      const builder = {
        select(columns: string) {
          if (mode !== "delete" && columns !== "*") mode = "schema";
          return builder;
        },
        eq() { return builder; },
        order() { return builder; },
        limit() { return Promise.resolve({ data: [], error: null }); },
        delete() { mode = "delete"; return builder; },
        then(resolve: (result: unknown) => void) {
          if (table === "lease_document_types") return resolve({ data: [], error: null });
          if (mode === "schema") return resolve({ data: [], error: null });
          if (mode === "delete") {
            mock.deleteRow();
            return resolve(mock.deleteError
              ? { data: null, error: { message: "Permission denied" } }
              : { data: [{ id: documentRow.id }], error: null });
          }
          return resolve({ data: [mock.contractual
            ? { ...documentRow, document_type: "initial-contract", status: "signed", signed_date: "2026-06-01" }
            : documentRow], error: null });
        },
      };
      return builder;
    },
    storage: { from: () => ({ remove: mock.remove }) },
    rpc: mock.rpc,
  },
}));
vi.mock("@/context/SettingsContext", () => ({ useSettings: () => ({ t: mock.t, locale: "en-GB" }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mock.toast }) }));
vi.mock("@/hooks/use-portfolio-write-access", () => ({ usePortfolioWriteAccess: () => true }));

import { LeaseDocumentsDialog } from "@/components/leases/LeaseDocumentsDialog";

function renderDialog() {
  render(
    <TooltipProvider>
      <LeaseDocumentsDialog
        open
        onOpenChange={vi.fn()}
        leaseId="lease-1"
        portfolioId="portfolio-1"
        todayISO="2026-11-07"
        lease={{ id: "lease-1", lifecycleStage: mock.contractual ? "signed" : "draft", startDate: "2027-01-01", signedDate: mock.contractual ? "2026-06-01" : null }}
      />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  mock.deleteError = true;
  mock.contractual = false;
  mock.toast.mockReset();
  mock.deleteRow.mockReset();
  mock.remove.mockReset().mockResolvedValue({ error: null });
  mock.rpc.mockReset();
});

describe("lease document deletion confirmation", () => {
  it("keeps the confirmation open when the server rejects deletion", async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "documents.tooltip.delete" }));
    fireEvent.click(screen.getByRole("button", { name: "documents.delete" }));

    await waitFor(() => expect(mock.deleteRow).toHaveBeenCalledOnce());
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: "Permission denied" }));
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it("closes the confirmation after the database accepts deletion", async () => {
    mock.deleteError = false;
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "documents.tooltip.delete" }));
    fireEvent.click(screen.getByRole("button", { name: "documents.delete" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mock.deleteRow).toHaveBeenCalledOnce();
    expect(mock.remove).toHaveBeenCalledWith([documentRow.storage_path]);
  });

  it("keeps the lease-signature decision open when contractual deletion fails", async () => {
    mock.contractual = true;
    mock.rpc.mockResolvedValue({ data: null, error: { message: "RPC denied" } });
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "documents.tooltip.delete" }));
    fireEvent.click(screen.getByRole("button", { name: "documents.delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "documents.keepLeaseSignedNo" }));

    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("delete_contract_document", expect.objectContaining({ p_keep_lease_signed: false })));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("documents.keepLeaseSignedDesc");
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: "RPC denied" }));
  });

  it("does not remove the file when contractual deletion confirms a different lease", async () => {
    mock.contractual = true;
    mock.rpc.mockResolvedValue({ data: {
      document_id: documentRow.id,
      lease: { id: "another-lease", portfolio_id: "portfolio-1" },
    }, error: null });
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "documents.tooltip.delete" }));
    fireEvent.click(screen.getByRole("button", { name: "documents.delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "documents.keepLeaseSignedNo" }));

    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "documents.toast.error",
      description: expect.stringContaining("did not confirm the document deletion"),
      variant: "destructive",
    })));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(mock.remove).not.toHaveBeenCalled();
  });
});
