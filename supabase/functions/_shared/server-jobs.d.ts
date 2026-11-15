export type DatabaseRow = Record<string, unknown>;

export interface ServerAmendmentRows {
  properties: DatabaseRow[];
  units: DatabaseRow[];
  tenants: DatabaseRow[];
  leases: DatabaseRow[];
  assignments: DatabaseRow[];
  amendments: DatabaseRow[];
  changes: DatabaseRow[];
  receivables: DatabaseRow[];
  allocations: DatabaseRow[];
}

export interface DueAmendmentStore {
  listDueAmendments: (businessDate: string) => Promise<DatabaseRow[]>;
  dateForAmendment?: (amendment: DatabaseRow) => Promise<string>;
  loadRows: (amendment: DatabaseRow) => Promise<ServerAmendmentRows>;
  getLeadDays: (portfolioId: string) => Promise<number>;
  activate: (args: DatabaseRow) => Promise<void>;
}

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

export function collectRowsById(
  listPage: (afterId: string | null, limit: number) => Promise<DatabaseRow[]>,
  pageSize?: number,
): Promise<DatabaseRow[]>;
export function isValidBusinessDate(value: string): boolean;
export function runDueReceivableJob(
  store: DueReceivableStore,
  businessDate: string,
  genId?: (prefix: string) => string,
  dateForProperty?: (property: DatabaseRow) => string,
): Promise<{ leasesExamined: number; rowsGenerated: number; rowsInserted: number; incompleteLeaseIds: string[] }>;
export function runDueAmendmentJob(
  store: DueAmendmentStore,
  businessDate: string,
  genId?: (prefix?: string) => string,
): Promise<{ amendmentsExamined: number; activatedAmendments: number; incompleteAmendmentIds: string[] }>;
export function isCompleteAmendmentActivationResponse(args: DatabaseRow, data: unknown): boolean;
export function calendarDateISO(date: Date, timeZone?: string): string;
export const DEFAULT_BUSINESS_TIME_ZONE: "Europe/Brussels";
export function parseScheduledBusinessInstant(value: unknown, now?: Date): Date;
export function hasScheduledJobSecret(request: Request, expected: string | undefined): boolean;
export function isConfiguredScheduledJobSecret(secret: string | undefined): secret is string;

export interface PendingDocumentFileDeletion {
  id: string;
  portfolio_id: string;
  lease_id: string;
  document_id: string;
  storage_path: string;
  attempts: number;
}
export interface DocumentFileCleanupResult {
  scanned: number;
  removed: number;
  failedIds: string[];
  remaining: number;
}
export function removeStorageFileIfPresent(
  storage: {
    exists: (path: string) => Promise<{ data: boolean; error: { status?: number; message: string } | null }>;
    remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
  },
  path: string,
): Promise<void>;
export function runDocumentFileCleanup(
  pending: PendingDocumentFileDeletion[],
  operations: {
    removeFile: (path: string) => Promise<void>;
    acknowledge: (id: string) => Promise<void>;
    recordFailure: (item: PendingDocumentFileDeletion, message: string) => Promise<void>;
    countRemaining: () => Promise<number>;
  },
): Promise<DocumentFileCleanupResult>;
