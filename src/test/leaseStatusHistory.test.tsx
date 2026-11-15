import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  order: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mock.from },
}));

import { useLeaseStatusHistory } from "@/hooks/useLeaseStatusHistory";

const historyRow = (leaseId: string) => ({
  id: `${leaseId}-change`,
  lease_id: leaseId,
  portfolio_id: "portfolio-1",
  from_stage: "draft",
  to_stage: "signed",
  reason: "signed",
  notes: null,
  changed_by: null,
  changed_at: "2026-11-07T12:00:00Z",
});

describe("lease status history loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.from.mockReturnValue({
      select: () => ({ eq: () => ({ order: mock.order }) }),
    });
  });

  it("distinguishes a failed read from an empty history and can retry", async () => {
    mock.order
      .mockResolvedValueOnce({ data: null, error: { message: "Network unavailable" } })
      .mockResolvedValueOnce({ data: [], error: null });
    const { result } = renderHook(() => useLeaseStatusHistory("lease-1"));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.entries).toEqual([]);
    await act(async () => { await result.current.reload(); });
    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.entries).toEqual([]);
  });

  it("ignores a late response from a previously selected lease", async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise(resolve => { resolveFirst = resolve; });
    mock.order
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ data: [historyRow("lease-2")], error: null });
    const { result, rerender } = renderHook(({ id }) => useLeaseStatusHistory(id), {
      initialProps: { id: "lease-1" },
    });

    rerender({ id: "lease-2" });
    await waitFor(() => expect(result.current.entries[0]?.leaseId).toBe("lease-2"));
    await act(async () => { resolveFirst({ data: [historyRow("lease-1")], error: null }); });
    expect(result.current.entries[0]?.leaseId).toBe("lease-2");
  });
});
