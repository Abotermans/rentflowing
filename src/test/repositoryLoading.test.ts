import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  range: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            range: (from: number, to: number) => mock.range(table, from, to),
          }),
        }),
      }),
    }),
  },
}));

import { loadPortfolio } from "@/lib/repo";

describe("portfolio loading", () => {
  beforeEach(() => mock.range.mockReset());

  it("loads all pages when a table exceeds the API page size", async () => {
    mock.range.mockImplementation(async (table: string, from: number) => ({
      data: table === "units"
        ? Array.from({ length: from === 0 ? 1000 : 1 }, (_, index) => ({ id: `unit-${from + index}` }))
        : [],
      error: null,
    }));

    const snapshot = await loadPortfolio("portfolio-1");

    expect(snapshot.units).toHaveLength(1001);
    expect(snapshot.units[1000].id).toBe("unit-1000");
    expect(mock.range).toHaveBeenCalledWith("units", 0, 999);
    expect(mock.range).toHaveBeenCalledWith("units", 1000, 1999);
  });

  it("rejects an incomplete snapshot when any table fails", async () => {
    mock.range.mockImplementation(async (table: string) => ({
      data: [],
      error: table === "properties" ? { message: "permission denied" } : null,
    }));

    await expect(loadPortfolio("portfolio-1")).rejects.toThrow("Unable to load properties: permission denied");
  });

  it("hydrates an open-ended lease into the app's blank-date representation", async () => {
    mock.range.mockImplementation(async (table: string) => ({
      data: table === "leases" ? [{
        id: "lease-open", lifecycle_stage: "active", start_date: "2026-01-01",
        end_date: null, billing_tenant_id: "tenant-1", tenant_ids: ["tenant-1"],
      }] : [],
      error: null,
    }));

    const snapshot = await loadPortfolio("portfolio-1");
    expect(snapshot.leases[0].endDate).toBe("");
  });
});
