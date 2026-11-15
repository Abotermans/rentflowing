// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import * as bundled from "../../supabase/functions/_shared/server-jobs.js";
import { runDocumentFileCleanup as sourceCleanup } from "@/lib/serverDocumentCleanup";
import { isISOCalendarDate } from "@/lib/dateValidation";

describe("deployable Edge shared runtime", () => {
  it("contains the expected scheduled-job exports", () => {
    expect(bundled.runDueReceivableJob).toBeTypeOf("function");
    expect(bundled.runDueAmendmentJob).toBeTypeOf("function");
    expect(bundled.hasScheduledJobSecret).toBeTypeOf("function");
    expect(bundled.removeStorageFileIfPresent).toBeTypeOf("function");
  });

  it("preserves date validation used by the billing job", () => {
    for (const value of ["2026-02-28", "2026-02-30", "2026-11-15", "not-a-date"]) {
      expect(bundled.isValidBusinessDate(value)).toBe(isISOCalendarDate(value));
    }
  });

  it("preserves cleanup acknowledgement behavior", async () => {
    const item = {
      id: "queue-1", portfolio_id: "portfolio-1", lease_id: "lease-1",
      document_id: "document-1", storage_path: "portfolio-1/lease-1/document-1/file.pdf", attempts: 0,
    };
    const makeOperations = () => ({
      removeFile: vi.fn().mockResolvedValue(undefined),
      acknowledge: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn().mockResolvedValue(undefined),
      countRemaining: vi.fn().mockResolvedValue(0),
    });
    const sourceOperations = makeOperations();
    const bundledOperations = makeOperations();
    expect(await bundled.runDocumentFileCleanup([item], bundledOperations))
      .toEqual(await sourceCleanup([item], sourceOperations));
    expect(bundledOperations.removeFile).toHaveBeenCalledWith(item.storage_path);
    expect(bundledOperations.acknowledge).toHaveBeenCalledWith(item.id);
  });
});
