import { useCallback, useEffect, useState } from "react";
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

  const load = useCallback(async () => {
    if (!leaseId) { setEntries([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("lease_status_changes")
      .select("id, lease_id, portfolio_id, from_stage, to_stage, reason, notes, changed_by, changed_at")
      .eq("lease_id", leaseId)
      .order("changed_at", { ascending: false });
    if (error || !data) { setEntries([]); setLoading(false); return; }

    const userIds = Array.from(new Set(data.map(r => r.changed_by).filter((v): v is string => !!v)));
    let nameById: Record<string, string> = {};
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
    setLoading(false);
  }, [leaseId]);

  useEffect(() => { load(); }, [load]);

  return { entries, loading, reload: load };
}

export interface LogLeaseStatusChangeArgs {
  leaseId: string;
  portfolioId: string;
  fromStage: string | null;
  toStage: string;
  reason?: string | null;
  notes?: string | null;
}

export async function logLeaseStatusChange(args: LogLeaseStatusChangeArgs): Promise<void> {
  if (args.fromStage === args.toStage) return;
  const { data: userRes } = await supabase.auth.getUser();
  await supabase.from("lease_status_changes").insert({
    lease_id: args.leaseId,
    portfolio_id: args.portfolioId,
    from_stage: args.fromStage,
    to_stage: args.toStage,
    reason: args.reason ?? null,
    notes: args.notes ?? null,
    changed_by: userRes.user?.id ?? null,
  });
}