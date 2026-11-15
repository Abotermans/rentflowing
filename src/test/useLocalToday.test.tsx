import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLocalTodayISO } from "@/hooks/use-local-today";

describe("local day refresh", () => {
  const originalTimeZone = process.env.TZ;

  afterEach(() => {
    vi.useRealTimers();
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  it("updates an open view at local midnight", () => {
    process.env.TZ = "Europe/Brussels";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T21:59:59Z"));
    const { result, unmount } = renderHook(() => useLocalTodayISO());
    expect(result.current).toBe("2026-06-30");
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current).toBe("2026-07-01");
    unmount();
  });
});
