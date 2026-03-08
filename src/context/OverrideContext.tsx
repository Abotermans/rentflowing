import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { OverrideRecord } from "@/types/override";
import type { IntegrityEntityType } from "@/lib/integrity/types";

interface OverrideContextValue {
  overrideHistory: OverrideRecord[];
  addOverride: (record: Omit<OverrideRecord, "id" | "timestamp">) => void;
  getOverridesForEntity: (entityType: IntegrityEntityType, entityId: string) => OverrideRecord[];
}

const OverrideContext = createContext<OverrideContextValue | null>(null);

let overrideCounter = 0;

export function OverrideProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<OverrideRecord[]>([]);

  const addOverride = useCallback((record: Omit<OverrideRecord, "id" | "timestamp">) => {
    const newRecord: OverrideRecord = {
      ...record,
      id: `ovr-${++overrideCounter}`,
      timestamp: new Date().toISOString(),
    };
    setHistory(prev => [newRecord, ...prev]);
  }, []);

  const getOverridesForEntity = useCallback(
    (entityType: IntegrityEntityType, entityId: string) =>
      history.filter(r => r.entityType === entityType && r.entityId === entityId),
    [history],
  );

  const value = useMemo(
    () => ({ overrideHistory: history, addOverride, getOverridesForEntity }),
    [history, addOverride, getOverridesForEntity],
  );

  return <OverrideContext.Provider value={value}>{children}</OverrideContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOverrideHistory() {
  const ctx = useContext(OverrideContext);
  if (!ctx) throw new Error("useOverrideHistory must be used within OverrideProvider");
  return ctx;
}
