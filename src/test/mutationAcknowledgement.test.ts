import { describe, expect, it } from "vitest";
import { singleRowMutationError } from "@/lib/repo/mutationAcknowledgement";

describe("direct Supabase mutation acknowledgement", () => {
  it("does not treat an RLS-filtered zero-row response as success", () => {
    expect(singleRowMutationError(null, [], "Document deletion")).toContain("did not change a row");
    expect(singleRowMutationError(null, null, "Document deletion")).toContain("did not change a row");
  });

  it("requires exactly one returned row and preserves backend errors", () => {
    expect(singleRowMutationError(null, [{ id: "doc-1" }], "Document deletion")).toBeNull();
    expect(singleRowMutationError(null, [{ id: "doc-1" }, { id: "doc-2" }], "Document deletion")).toContain("did not change a row");
    expect(singleRowMutationError({ message: "permission denied" }, [{ id: "doc-1" }], "Document deletion")).toBe("permission denied");
  });
});
