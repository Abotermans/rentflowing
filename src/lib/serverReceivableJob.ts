import { generateServerScheduleResult, toServerReceivableRow } from "./serverReceivableSchedule.ts";
import { isISOCalendarDate } from "./dateValidation.ts";

export type DatabaseRow = Record<string, unknown>;

export interface DueReceivableStore {
  listPortfolios: (afterId: string | null, limit: number) => Promise<DatabaseRow[]>;
  listLeases: (portfolioId: string, afterId: string | null, limit: number) => Promise<DatabaseRow[]>;
  listProperties: (ids: string[]) => Promise<DatabaseRow[]>;
  listAssignments: (leaseIds: string[]) => Promise<DatabaseRow[]>;
  listUnits: (unitIds: string[]) => Promise<DatabaseRow[]>;
  listAmendments: (leaseIds: string[]) => Promise<DatabaseRow[]>;
  listChanges: (amendmentIds: string[]) => Promise<DatabaseRow[]>;
  insert: (portfolioId: string, rows: DatabaseRow[]) => Promise<number>;
}

export interface DueReceivableJobResult {
  leasesExamined: number;
  rowsGenerated: number;
  rowsInserted: number;
  incompleteLeaseIds: string[];
}

const PAGE_SIZE = 50;
const INSERT_BATCH_SIZE = 500;

export const isValidBusinessDate = isISOCalendarDate;

function nextPageCursor(rows: DatabaseRow[], previous: string | null): string {
  let cursor = previous;
  for (const row of rows) {
    if (typeof row.id !== "string" || !row.id || (cursor !== null && row.id <= cursor)) {
      throw new Error("Scheduled receivable pagination returned missing or out-of-order IDs.");
    }
    cursor = row.id;
  }
  if (cursor === null) throw new Error("Cannot advance an empty scheduled receivable page.");
  return cursor;
}

export async function collectRowsById(
  listPage: (afterId: string | null, limit: number) => Promise<DatabaseRow[]>,
  pageSize = 500,
): Promise<DatabaseRow[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("A positive page size is required.");
  const rows: DatabaseRow[] = [];
  for (let cursor: string | null = null; ;) {
    const page = await listPage(cursor, pageSize);
    if (page.length > pageSize) throw new Error("Scheduled receivable page exceeded its limit.");
    if (page.length > 0) cursor = nextPageCursor(page, cursor);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function runDueReceivableJob(
  store: DueReceivableStore,
  businessDate: string,
  genId: (prefix: string) => string = () => crypto.randomUUID(),
  dateForProperty?: (property: DatabaseRow) => string,
): Promise<DueReceivableJobResult> {
  if (!isValidBusinessDate(businessDate)) throw new Error("A valid business date is required.");
  const result: DueReceivableJobResult = {
    leasesExamined: 0, rowsGenerated: 0, rowsInserted: 0, incompleteLeaseIds: [],
  };

  for (let portfolioCursor: string | null = null; ;) {
    const portfolios = await store.listPortfolios(portfolioCursor, PAGE_SIZE);
    if (portfolios.length > PAGE_SIZE) throw new Error("Scheduled receivable portfolio page exceeded its limit.");
    if (portfolios.length > 0) portfolioCursor = nextPageCursor(portfolios, portfolioCursor);
    for (const portfolio of portfolios) {
      const portfolioId = String(portfolio.id);
      const leadDays = Number(portfolio.receivable_lead_days ?? 15);
      if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 120) {
        throw new Error(`Invalid receivable lead time for portfolio ${portfolioId}.`);
      }
      for (let leaseCursor: string | null = null; ;) {
        const leases = await store.listLeases(portfolioId, leaseCursor, PAGE_SIZE);
        if (leases.length === 0) break;
        if (leases.length > PAGE_SIZE) throw new Error(`Scheduled receivable lease page exceeded its limit for ${portfolioId}.`);
        leaseCursor = nextPageCursor(leases, leaseCursor);
        result.leasesExamined += leases.length;
        const leaseIds = leases.map(row => String(row.id));
        const propertyIds = [...new Set(leases.map(row => String(row.property_id)))];
        const [properties, assignments, amendments] = await Promise.all([
          store.listProperties(propertyIds),
          store.listAssignments(leaseIds),
          store.listAmendments(leaseIds),
        ]);
        const unitIds = [...new Set(assignments.map(row => String(row.unit_id)))];
        const units = unitIds.length > 0 ? await store.listUnits(unitIds) : [];
        const changes = amendments.length > 0
          ? await store.listChanges(amendments.map(row => String(row.id)))
          : [];
        const propertyById = new Map(properties.map(row => [String(row.id), row]));
        const unitById = new Map(units.map(row => [String(row.id), row]));
        const rows: DatabaseRow[] = [];
        for (const lease of leases) {
          const leaseId = String(lease.id);
          try {
            const property = propertyById.get(String(lease.property_id));
            const propertyDate = property && dateForProperty ? dateForProperty(property) : businessDate;
            if (!isValidBusinessDate(propertyDate)) {
              throw new Error(`Invalid business date for property ${String(lease.property_id)}.`);
            }
            const leaseAssignments = assignments.filter(row => row.lease_id === leaseId);
            const tenantIds = Array.isArray(lease.tenant_ids) ? lease.tenant_ids : [];
            const coverageDate = String(lease.start_date) > propertyDate
              ? String(lease.start_date)
              : propertyDate;
            const hasCurrentMainAssignment = leaseAssignments.some(row => {
              const unit = unitById.get(String(row.unit_id));
              return unit?.property_id === lease.property_id && unit?.portfolio_id === portfolioId
                && ["apartment", "studio", "office", "house", "commercial-unit"].includes(String(unit.unit_type))
                && String(row.start_date) <= coverageDate
                && (!row.end_date || String(row.end_date) >= coverageDate);
            });
            if (!property || property.portfolio_id !== portfolioId || !hasCurrentMainAssignment ||
                !(lease.billing_tenant_id || tenantIds[0])) {
              result.incompleteLeaseIds.push(leaseId);
              continue;
            }
            const leaseAmendments = amendments.filter(row => row.lease_id === leaseId);
            const amendmentIds = new Set(leaseAmendments.map(row => row.id));
            const generated = generateServerScheduleResult({
              lease,
              assignments: leaseAssignments,
              units,
              amendments: leaseAmendments,
              changes: changes.filter(row => amendmentIds.has(row.amendment_id)),
              currencyCode: String(property.currency_code),
              leadDays,
              businessDate: propertyDate,
              genId,
            });
            if (generated.unassignedCycleStarts.length > 0) {
              result.incompleteLeaseIds.push(leaseId);
              console.error(`Due receivable schedule for lease ${leaseId} has no main unit assignment for cycles: ${generated.unassignedCycleStarts.join(", ")}`);
              continue;
            }
            result.rowsGenerated += generated.receivables.length;
            rows.push(...generated.receivables.map(item => toServerReceivableRow(item, portfolioId)));
          } catch (error) {
            result.incompleteLeaseIds.push(leaseId);
            console.error(`Due receivable schedule for lease ${leaseId} failed`, error);
          }
        }
        for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
          const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
          const inserted = await store.insert(portfolioId, batch);
          if (!Number.isInteger(inserted) || inserted < 0 || inserted > batch.length) {
            throw new Error(`Invalid receivable insertion count for portfolio ${portfolioId}.`);
          }
          result.rowsInserted += inserted;
        }
        if (leases.length < PAGE_SIZE) break;
      }
    }
    if (portfolios.length < PAGE_SIZE) break;
  }

  return result;
}
