import { describe, expect, it } from "vitest";
import { safeReturnPath } from "@/lib/safeReturnPath";

describe("safe login return path", () => {
  it("keeps ordinary internal routes", () => {
    expect(safeReturnPath("/leases/123")).toBe("/leases/123");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/%5cevil.example", "/%2fevil.example", "\n//evil.example", null])("rejects an external or ambiguous destination: %s", value => {
    expect(safeReturnPath(value)).toBe("/");
  });
});
