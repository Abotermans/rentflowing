import type { IntegrityEntityType } from "@/lib/integrity/types";

export interface OverrideRecord {
  id: string;
  entityType: IntegrityEntityType;
  entityId: string;
  action: string;
  blockerCodes: string[];
  reason: string;
  timestamp: string;
}
