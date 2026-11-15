import type { Lease } from "@/types";
import { addCalendarDaysISO } from "@/lib/calendarToday";

export function isLeaseEndingWithinDays(
  lease: Pick<Lease, "lifecycleStage" | "endDate">,
  todayISO: string,
  days: number,
): boolean {
  return lease.lifecycleStage === "active"
    && !!lease.endDate
    && lease.endDate >= todayISO
    && lease.endDate <= addCalendarDaysISO(todayISO, days);
}
