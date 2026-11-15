import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from } }));

import { createPortfolioConfirmed } from "@/lib/repo/portfolioCreation";

const expected = {
  id: "10000000-0000-0000-0000-000000000001",
  name: "New portfolio",
  created_by: "20000000-0000-0000-0000-000000000001",
};

function prepareQueries(
  insertResult: { data: unknown; error: Error | null } | Error,
  readResult: { data: unknown; error: Error | null },
) {
  const insert = vi.fn();
  const read = vi.fn();
  mock.from.mockImplementation(() => {
    let isInsert = false;
    const builder = {
      insert(payload: unknown) { isInsert = true; insert(payload); return builder; },
      select() { return builder; },
      eq(field: string, value: string) { read(field, value); return builder; },
      single() { return insertResult instanceof Error ? Promise.reject(insertResult) : Promise.resolve(insertResult); },
      maybeSingle() { return Promise.resolve(readResult); },
    };
    return builder;
  });
  return { insert, read };
}

describe("portfolio creation acknowledgement", () => {
  beforeEach(() => mock.from.mockReset());

  it("accepts an exact insert acknowledgement without an extra read", async () => {
    const queries = prepareQueries({ data: expected, error: null }, { data: null, error: null });
    await expect(createPortfolioConfirmed(expected)).resolves.toBe(expected.id);
    expect(queries.insert).toHaveBeenCalledWith(expected);
    expect(queries.read).not.toHaveBeenCalled();
  });

  it("recovers a committed insert when its response was lost", async () => {
    prepareQueries(new Error("Network response lost"), { data: expected, error: null });
    await expect(createPortfolioConfirmed(expected)).resolves.toBe(expected.id);
    expect(mock.from).toHaveBeenCalledTimes(2);
  });

  it("keeps a rejected insert as an error when the row is absent", async () => {
    prepareQueries({ data: null, error: new Error("Creation denied") }, { data: null, error: null });
    await expect(createPortfolioConfirmed(expected)).rejects.toThrow("Creation denied");
  });

  it("rejects an inconsistent response even when a row exists", async () => {
    prepareQueries({ data: { ...expected, name: "Different" }, error: null },
      { data: { ...expected, name: "Different" }, error: null });
    await expect(createPortfolioConfirmed(expected)).rejects.toThrow("returned a different portfolio");
  });

  it("never substitutes a prior matching row for an insert that returned a different ID", async () => {
    const queries = prepareQueries({ data: { ...expected, id: "other-id" }, error: null },
      { data: expected, error: null });
    await expect(createPortfolioConfirmed(expected)).rejects.toThrow("returned a different portfolio");
    expect(queries.read).not.toHaveBeenCalled();
  });

  it("reports an uncertain outcome when the readback fails", async () => {
    prepareQueries(new Error("Network response lost"), { data: null, error: new Error("Read denied") });
    await expect(createPortfolioConfirmed(expected)).rejects.toThrow("could not be verified");
  });
});
