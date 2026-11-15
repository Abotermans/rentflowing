// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveReleaseRevision } from "../../scripts/release-provenance.mjs";

const revision = "0000000000000000000000000000000000000001";
const other = "0000000000000000000000000000000000000002";

describe("release revision provenance", () => {
  it("uses the checked-out commit for a local build", () => {
    expect(resolveReleaseRevision(revision, undefined, undefined)).toBe(revision);
  });

  it("accepts matching CI and hosting revisions", () => {
    expect(resolveReleaseRevision(revision, revision, revision)).toBe(revision);
  });

  it("rejects a claimed revision that is not the checkout", () => {
    expect(() => resolveReleaseRevision(revision, other, undefined))
      .toThrow("does not match checked-out commit");
    expect(() => resolveReleaseRevision(revision, undefined, other))
      .toThrow("does not match checked-out commit");
  });

  it("rejects conflicting revision claims even without Git metadata", () => {
    expect(() => resolveReleaseRevision(null, revision, other))
      .toThrow("conflicting commit revisions");
  });
});
