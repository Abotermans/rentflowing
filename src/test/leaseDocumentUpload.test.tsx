import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  getUser: vi.fn(),
  toast: vi.fn(),
  t: (key: string) => key,
  persisted: null as Record<string, unknown> | null,
  lastInserted: null as Record<string, unknown> | null,
  insertSucceeds: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mock.from,
    storage: { from: () => ({ upload: mock.upload, remove: mock.remove }) },
    auth: { getUser: mock.getUser },
  },
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
import { TooltipProvider } from "@/components/ui/tooltip";

function leaseDocumentQuery() {
  let mode = "";
  const builder = {
    select(value: string) { mode = value; return builder; },
    eq() { return builder; },
    order() { return builder; },
    limit() { return Promise.resolve({ data: [], error: null }); },
    insert(payload: Record<string, unknown>) { mode = "insert"; mock.lastInserted = payload; return builder; },
    single() { return Promise.resolve(mock.insertSucceeds
      ? { data: { ...mock.lastInserted, ...mock.persisted, updated_at: "2026-11-05T00:00:00Z" }, error: null }
      : { data: null, error: { code: "", message: "Network response lost" } }); },
    maybeSingle() { return Promise.resolve({ data: mock.persisted ? { ...mock.lastInserted, ...mock.persisted } : null, error: null }); },
    then(resolve: (value: unknown) => void) {
      resolve({ data: mode === "*" ? [] : [], error: null });
    },
  };
  return builder;
}

describe("lease document upload acknowledgement", () => {
  beforeEach(() => {
    mock.persisted = null;
    mock.lastInserted = null;
    mock.insertSucceeds = false;
    mock.from.mockReset().mockImplementation(leaseDocumentQuery);
    mock.upload.mockReset().mockResolvedValue({ error: null });
    mock.remove.mockReset().mockResolvedValue({ error: null });
    mock.getUser.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } } });
    mock.toast.mockReset();
  });

  const startUpload = async (file = new File(["invoice"], "contract.pdf", { type: "application/pdf" })) => {
    render(
      <TooltipProvider>
        <LeaseDocumentsDialog
          open
          onOpenChange={vi.fn()}
          leaseId="lease-1"
          portfolioId="portfolio-1"
          todayISO="2026-11-05"
          lease={{ id: "lease-1", lifecycleStage: "draft", startDate: "2099-01-01", signedDate: null }}
        />
      </TooltipProvider>,
    );
    const add = await screen.findByRole("button", { name: "documents.upload" });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    fireEvent.change(document.getElementById("doc-file") as HTMLInputElement, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "documents.save" }));
  };

  it("retains the file and accepts a committed row after a lost response", async () => {
    mock.persisted = {
      lease_id: "lease-1", portfolio_id: "portfolio-1",
      document_type: "supporting", status: null, signed_date: null,
      title: "contract", document_date: "2026-11-05", notes: null,
      mime_type: "application/pdf", size_bytes: 7, original_filename: "contract.pdf",
      uploaded_by: "user-1", created_at: "2026-10-18T00:00:00Z", updated_at: "2026-10-18T00:00:00Z",
    };
    await startUpload();
    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith({ title: "documents.toast.added" }));
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it("refuses a successful response that persisted a different document type", async () => {
    mock.insertSucceeds = true;
    mock.persisted = { document_type: "amendment" };
    await startUpload();
    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "documents.toast.uploadFailed",
      description: expect.stringContaining("did not confirm the requested document details"),
      variant: "destructive",
    })));
    expect(mock.toast).not.toHaveBeenCalledWith({ title: "documents.toast.added" });
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it("refuses a lost-response readback that persisted a different lease", async () => {
    mock.persisted = { lease_id: "another-lease", updated_at: "2026-11-05T00:00:00Z" };
    await startUpload();
    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "documents.toast.uploadFailed",
      description: expect.stringContaining("did not confirm the requested document details"),
      variant: "destructive",
    })));
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it("sends a canonical MIME type when the browser omits it", async () => {
    const file = new File(["invoice"], "contract.pdf");
    await startUpload(file);
    await waitFor(() => expect(mock.upload).toHaveBeenCalled());
    expect(mock.upload).toHaveBeenCalledWith(
      expect.stringMatching(/\/contract\.pdf$/),
      file,
      expect.objectContaining({ contentType: "application/pdf" }),
    );
    expect(mock.lastInserted?.mime_type).toBe("application/pdf");
  });

  it("cleans up only after the new row is confirmed absent", async () => {
    await startUpload();
    await waitFor(() => expect(mock.remove).toHaveBeenCalledTimes(1));
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "documents.toast.uploadFailed",
      variant: "destructive",
    }));
  });

  it("does not remove a file when readback points to a different path", async () => {
    mock.persisted = { storage_path: "portfolio-1/lease-1/other/file.pdf" };
    await startUpload();
    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "documents.toast.uploadFailed",
      description: expect.stringContaining("did not match the uploaded file"),
    })));
    expect(mock.remove).not.toHaveBeenCalled();
  });
});
