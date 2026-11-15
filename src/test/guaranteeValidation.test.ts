import { describe, expect, it } from "vitest";
import { validateGuaranteeInput } from "@/lib/guaranteeValidation";

const input = { expectedAmount: "1000", receivedAmount: "800", retentionAmount: "", releaseDate: "" };

describe("guarantee validation", () => {
  it("accepts a pending or partially received guarantee", () => {
    expect(validateGuaranteeInput(input)).toEqual({});
    expect(validateGuaranteeInput({ ...input, receivedAmount: "" })).toEqual({});
  });

  it("rejects negative and non-numeric amounts", () => {
    expect(validateGuaranteeInput({ ...input, expectedAmount: "-1", receivedAmount: "oops" })).toEqual({
      expectedAmount: "nonNegativeAmount",
      receivedAmount: "invalidAmount",
    });
  });

  it("accepts exact cents with a comma and rejects values the database would round", () => {
    expect(validateGuaranteeInput({ ...input, expectedAmount: "1,25", receivedAmount: "0,30" })).toEqual({});
    expect(validateGuaranteeInput({ ...input, expectedAmount: "1,234", receivedAmount: "1e3", retentionAmount: "0.001" })).toEqual({
      expectedAmount: "invalidAmount",
      receivedAmount: "invalidAmount",
      retentionAmount: "invalidAmount",
    });
  });

  it("requires a release before recording a retention", () => {
    expect(validateGuaranteeInput({ ...input, retentionAmount: "50" }).retentionAmount).toBe("retentionRequiresRelease");
  });

  it("cannot retain more than was received", () => {
    expect(validateGuaranteeInput({ ...input, releaseDate: "2026-10-17", retentionAmount: "801" }).retentionAmount)
      .toBe("retentionExceedsReceived");
    expect(validateGuaranteeInput({ ...input, releaseDate: "2026-10-17", retentionAmount: "800" })).toEqual({});
  });
});
