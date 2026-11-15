import type { Lease } from "@/types";

export function buildRenewedLease(lease: Lease, endDate: string): Lease {
  return {
    ...lease,
    endDate,
    noticeGiven: false,
    noticeDate: null,
    intendedMoveOutDate: null,
    preNoticeEndDate: null,
    moveOutScheduledDate: null,
    terminationReason: null,
  };
}
