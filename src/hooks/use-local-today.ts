import { useEffect, useState } from "react";
import { localTodayISO } from "@/lib/calendarToday";

export function useLocalTodayISO(): string {
  const [today, setToday] = useState(localTodayISO);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => setToday(localTodayISO());
    const scheduleMidnight = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(() => {
        refresh();
        scheduleMidnight();
      }, Math.max(1_000, next.getTime() - now.getTime() + 100));
    };

    scheduleMidnight();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return today;
}
