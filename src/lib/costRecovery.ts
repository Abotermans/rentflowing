import type { RecoveryType } from "@/types/costs";
import { prorateMoney, roundMoney } from "@/lib/money";

export function validRecoverablePercentage(recoveryType: RecoveryType, percentage?: number | null): boolean {
  return recoveryType === "partially-recoverable"
    ? percentage != null && Number.isFinite(percentage) && percentage > 0 && percentage < 100
    : percentage == null;
}

export function splitCostRecovery(
  amount: number,
  recoveryType: RecoveryType,
  recoverablePercentage?: number | null,
): { recoverableAmount: number; ownerBurdenAmount: number } {
  if (recoveryType === "informational") return { recoverableAmount: 0, ownerBurdenAmount: 0 };
  if (recoveryType === "owner-only") return { recoverableAmount: 0, ownerBurdenAmount: amount };
  if (recoveryType === "tenant-recoverable") return { recoverableAmount: amount, ownerBurdenAmount: 0 };

  // Pre-migration partial entries historically used an implicit 50% share.
  const percentage = recoverablePercentage ?? 50;
  const recoverableAmount = prorateMoney(amount, percentage, 100);
  return { recoverableAmount, ownerBurdenAmount: roundMoney(amount - recoverableAmount) };
}
