import {
  planServerAmendmentActivation,
  toAmendmentActivationRpcArgs,
  type DatabaseRow,
  type ServerAmendmentRows,
} from "./serverAmendmentActivation.ts";
import { isValidBusinessDate } from "./serverReceivableJob.ts";

export interface DueAmendmentStore {
  listDueAmendments: (businessDate: string) => Promise<DatabaseRow[]>;
  dateForAmendment?: (amendment: DatabaseRow) => Promise<string>;
  loadRows: (amendment: DatabaseRow) => Promise<ServerAmendmentRows>;
  getLeadDays: (portfolioId: string) => Promise<number>;
  activate: (args: DatabaseRow) => Promise<void>;
}

export interface DueAmendmentJobResult {
  amendmentsExamined: number;
  activatedAmendments: number;
  incompleteAmendmentIds: string[];
}

export async function runDueAmendmentJob(
  store: DueAmendmentStore,
  businessDate: string,
  genId: (prefix?: string) => string = () => crypto.randomUUID(),
): Promise<DueAmendmentJobResult> {
  if (!isValidBusinessDate(businessDate)) throw new Error("A valid business date is required.");
  const due = await store.listDueAmendments(businessDate);
  due.sort((a, b) => {
    const dateOrder = String(a.effective_date).localeCompare(String(b.effective_date));
    if (dateOrder) return dateOrder;
    const numberOrder = Number(a.amendment_number) - Number(b.amendment_number);
    return numberOrder || String(a.id).localeCompare(String(b.id));
  });
  const result: DueAmendmentJobResult = {
    amendmentsExamined: 0, activatedAmendments: 0, incompleteAmendmentIds: [],
  };
  const failedLeaseIds = new Set<string>();
  for (const amendment of due) {
    const id = String(amendment.id);
    const leaseId = String(amendment.lease_id);
    const portfolioId = String(amendment.portfolio_id);
    let amendmentDate = businessDate;
    try {
      amendmentDate = store.dateForAmendment
        ? await store.dateForAmendment(amendment)
        : businessDate;
      if (!isValidBusinessDate(amendmentDate)) throw new Error("Invalid property business date.");
    } catch (error) {
      result.incompleteAmendmentIds.push(id);
      failedLeaseIds.add(leaseId);
      console.error(`Scheduled amendment ${id} has no valid business date`, error);
      continue;
    }
    if (String(amendment.effective_date) > amendmentDate) continue;
    result.amendmentsExamined += 1;
    if (failedLeaseIds.has(leaseId)) {
      result.incompleteAmendmentIds.push(id);
      continue;
    }
    try {
      const [rows, receivableLeadDays] = await Promise.all([
        store.loadRows(amendment), store.getLeadDays(portfolioId),
      ]);
      if (!Number.isInteger(receivableLeadDays) || receivableLeadDays < 0 || receivableLeadDays > 120) {
        throw new Error(`Invalid receivable lead time for portfolio ${portfolioId}.`);
      }
      const plan = planServerAmendmentActivation(id, rows, {
        businessDate: amendmentDate, portfolioId, receivableLeadDays, genId,
      });
      await store.activate(toAmendmentActivationRpcArgs(id, portfolioId, plan));
      result.activatedAmendments += 1;
    } catch (error) {
      result.incompleteAmendmentIds.push(id);
      failedLeaseIds.add(leaseId);
      console.error(`Scheduled amendment ${id} failed`, error);
    }
  }
  return result;
}
