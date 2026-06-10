export type ReconciliationResolution = "owe" | "refund" | "carry-forward" | "none";

export interface ChargesReconciliation {
  id: string;
  leaseId: string;
  periodStart: string;
  periodEnd: string;
  provisionsCollected: number;
  actualRecoverable: number;
  delta: number;
  resolution: ReconciliationResolution;
  receivableItemId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** Workspace this reconciliation belongs to. */
  portfolioId?: string;
}

export const RESOLUTION_LABELS: Record<ReconciliationResolution, string> = {
  owe: "Tenant owes",
  refund: "Refund tenant",
  "carry-forward": "Carry forward",
  none: "No action",
};