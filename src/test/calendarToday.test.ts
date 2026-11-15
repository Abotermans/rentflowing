// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { addCalendarDaysISO, calendarDateISO, calendarDaysBetweenISO, localTodayISO } from "@/lib/calendarToday";

describe("business calendar date", () => {
  it("uses the local calendar day rather than the UTC date", () => {
    const instant = new Date("2026-06-30T22:30:00Z");
    expect(calendarDateISO(instant, "Europe/Brussels")).toBe("2026-07-01");
    expect(calendarDateISO(instant, "Europe/London")).toBe("2026-06-30");
  });

  it("handles the winter offset without manual DST arithmetic", () => {
    const instant = new Date("2026-12-31T23:30:00Z");
    expect(calendarDateISO(instant, "Europe/Brussels")).toBe("2027-01-01");
    expect(calendarDateISO(instant, "Europe/London")).toBe("2026-12-31");
  });

  it("uses the runtime's local day for business rules", () => {
    const originalTimeZone = process.env.TZ;
    try {
      process.env.TZ = "Europe/Brussels";
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-30T22:30:00Z"));
      expect(localTodayISO()).toBe("2026-07-01");
    } finally {
      vi.useRealTimers();
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
  });

  it("counts calendar days across daylight-saving transitions", () => {
    expect(addCalendarDaysISO("2026-03-28", 2)).toBe("2026-03-30");
    expect(calendarDaysBetweenISO("2026-03-28", "2026-03-30")).toBe(2);
    expect(addCalendarDaysISO("2026-10-24", 2)).toBe("2026-10-26");
    expect(calendarDaysBetweenISO("2026-10-24", "2026-10-26")).toBe(2);
  });
});
