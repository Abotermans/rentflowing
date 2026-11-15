import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LeaseStatusChange {
  id: string;
  leaseId: string;
  portfolioId: string;
  fromStage: string | null;
  toStage: string;
  reason: string | null;
  notes: string | null;
  changedBy: string | null;
  changedAt: string;
  changedByName?: string | null;
}

export function useLeaseStatusHistory(leaseId: string | null | undefined) {
  const [entries, setEntries] = useState<LeaseStatusChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!leaseId) { setEntries([]); setLoading(false); setError(false); return; }
    setLoading(true);
    setError(false);
    try {
      const { data, error: loadError } = await supabase
        .from("lease_status_changes")
        .select("id, lease_id, portfolio_id, from_stage, to_stage, reason, notes, changed_by, changed_at")
        .eq("lease_id", leaseId)
        .order("changed_at", { ascending: false });
      if (loadError || !data) throw loadError ?? new Error("Status history was not returned");

      const userIds = Array.from(new Set(data.map(r => r.changed_by).filter((v): v is string => !!v)));
      const nameById: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", userIds);
        (profiles ?? []).forEach(p => {
          const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
          nameById[p.id] = name || "";
        });
      }

      if (currentRequest !== requestId.current) return;
      setEntries(data.map(r => ({
        id: r.id,
        leaseId: r.lease_id,
        portfolioId: r.portfolio_id,
        fromStage: r.from_stage,
        toStage: r.to_stage,
        reason: r.reason,
        notes: r.notes,
        changedBy: r.changed_by,
        changedAt: r.changed_at,
        changedByName: r.changed_by ? (nameById[r.changed_by] || null) : null,
      })));
    } catch {
      if (currentRequest !== requestId.current) return;
      setEntries([]);
      setError(true);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [leaseId]);

  useEffect(() => { load(); }, [load]);

  return { entries, loading, error, reload: load };
}
