import type { Lease, LifecycleStage } from "@/types";

export const INITIAL_CONTRACT_DOCUMENT_TYPE = "initial-contract";
export const AMENDMENT_DOCUMENT_TYPE = "amendment";
export const SUPPORTING_DOCUMENT_TYPE = "supporting";

const LEASE_DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export function leaseDocumentMimeType(filename: string, browserMimeType: string): string | null {
  const dot = filename.lastIndexOf(".");
  const expected = dot >= 0 ? LEASE_DOCUMENT_MIME_BY_EXTENSION[filename.slice(dot).toLowerCase()] : undefined;
  return expected && (!browserMimeType || browserMimeType === expected) ? expected : null;
}

export type BuiltInLeaseDocumentType =
  | typeof INITIAL_CONTRACT_DOCUMENT_TYPE
  | typeof AMENDMENT_DOCUMENT_TYPE
  | typeof SUPPORTING_DOCUMENT_TYPE;

export type LeaseDocumentType = string;

export type LeaseDocumentStatus =
  | "draft"
  | "validated"
  | "sent"
  | "partially-signed"
  | "signed"
  | "cancelled";

export interface LeaseDocumentTypeDefinition {
  slug: string;
  label: string;
  builtIn: boolean;
  contractual: boolean;
  locked: boolean;
}

export const BUILT_IN_LEASE_DOCUMENT_TYPES: LeaseDocumentTypeDefinition[] = [
  { slug: SUPPORTING_DOCUMENT_TYPE, label: "Supporting document", builtIn: true, contractual: false, locked: true },
  { slug: AMENDMENT_DOCUMENT_TYPE, label: "Amendment", builtIn: true, contractual: true, locked: true },
  { slug: INITIAL_CONTRACT_DOCUMENT_TYPE, label: "Initial contract", builtIn: true, contractual: true, locked: true },
];

export const CONTRACTUAL_DOCUMENT_TYPES: ReadonlySet<string> = new Set([
  INITIAL_CONTRACT_DOCUMENT_TYPE,
  AMENDMENT_DOCUMENT_TYPE,
]);

export const LEASE_DOCUMENT_STATUSES: LeaseDocumentStatus[] = [
  "draft",
  "validated",
  "sent",
  "partially-signed",
  "signed",
  "cancelled",
];

export interface LeaseDocumentLike {
  id: string;
  lease_id?: string;
  leaseId?: string;
  document_type?: LeaseDocumentType | string | null;
  documentType?: LeaseDocumentType | string | null;
  status?: LeaseDocumentStatus | string | null;
  signed_date?: string | null;
  signedDate?: string | null;
}

export interface CustomLeaseDocumentTypeLike {
  slug: string;
  label: string;
}

export interface LocalLeaseDocumentType extends CustomLeaseDocumentTypeLike {
  id: string;
  portfolio_id: string;
  created_at: string;
  updated_at: string;
}

const LOCAL_DOCUMENT_TYPES_KEY_PREFIX = "rentflowing-lease-document-types";

function localDocumentTypesKey(portfolioId: string): string {
  return `${LOCAL_DOCUMENT_TYPES_KEY_PREFIX}:${portfolioId}`;
}

export function isMissingLeaseDocumentTypesTableError(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "PGRST205"
    || message.includes("lease_document_types") && message.includes("schema cache")
    || message.includes("could not find the table") && message.includes("lease_document_types");
}

export function readLocalLeaseDocumentTypes(portfolioId: string): LocalLeaseDocumentType[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(localDocumentTypesKey(portfolioId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((type): type is LocalLeaseDocumentType => (
      typeof type?.id === "string"
      && typeof type?.portfolio_id === "string"
      && typeof type?.slug === "string"
      && typeof type?.label === "string"
      && typeof type?.created_at === "string"
      && typeof type?.updated_at === "string"
    ));
  } catch {
    return [];
  }
}

export function writeLocalLeaseDocumentTypes(portfolioId: string, types: readonly LocalLeaseDocumentType[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(localDocumentTypesKey(portfolioId), JSON.stringify(types));
  } catch {
    // Local storage can be unavailable in private browsing contexts.
  }
}

export function slugifyDocumentTypeLabel(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "document";
}

export function buildUniqueDocumentTypeSlug(label: string, existingSlugs: Iterable<string>): string {
  const existing = new Set([...existingSlugs, ...BUILT_IN_LEASE_DOCUMENT_TYPES.map((type) => type.slug)]);
  const base = slugifyDocumentTypeLabel(label);
  if (!existing.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, Math.max(1, 64 - String(suffix).length - 1))}-${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base.slice(0, 55)}-${crypto.randomUUID().slice(0, 8)}`;
}

export function normalizeDocumentTypeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

export function documentTypeLabelExists(label: string, customTypes: readonly CustomLeaseDocumentTypeLike[]): boolean {
  const normalizedSlug = slugifyDocumentTypeLabel(label);
  return BUILT_IN_LEASE_DOCUMENT_TYPES.some((type) => type.slug === normalizedSlug)
    || customTypes.some((type) => type.slug === normalizedSlug || normalizeDocumentTypeLabel(type.label).toLowerCase() === normalizeDocumentTypeLabel(label).toLowerCase());
}

export function isBuiltInLeaseDocumentType(type: string | null | undefined): type is BuiltInLeaseDocumentType {
  return type === INITIAL_CONTRACT_DOCUMENT_TYPE || type === AMENDMENT_DOCUMENT_TYPE || type === SUPPORTING_DOCUMENT_TYPE;
}

export function getLeaseDocumentType(doc: LeaseDocumentLike): LeaseDocumentType {
  const value = doc.document_type ?? doc.documentType;
  return typeof value === "string" && value.trim() ? value.trim() : SUPPORTING_DOCUMENT_TYPE;
}

export function getLeaseDocumentLeaseId(doc: LeaseDocumentLike): string | null {
  return doc.lease_id ?? doc.leaseId ?? null;
}

export function isContractualDocumentType(type: LeaseDocumentType | string | null | undefined): type is "initial-contract" | "amendment" {
  return type === INITIAL_CONTRACT_DOCUMENT_TYPE || type === AMENDMENT_DOCUMENT_TYPE;
}

export function isContractualDocument(doc: LeaseDocumentLike): boolean {
  return isContractualDocumentType(getLeaseDocumentType(doc));
}

export function buildLeaseDocumentTypeDefinitions(customTypes: readonly CustomLeaseDocumentTypeLike[]): LeaseDocumentTypeDefinition[] {
  const custom = customTypes
    .filter((type) => type.slug && type.label && !isBuiltInLeaseDocumentType(type.slug))
    .map((type) => ({
      slug: type.slug,
      label: type.label,
      builtIn: false,
      contractual: false,
      locked: false,
    }));
  return [...BUILT_IN_LEASE_DOCUMENT_TYPES, ...custom];
}

export function getInitialContract<T extends LeaseDocumentLike>(leaseId: string, documents: T[]): T | null {
  return documents.find((doc) => getLeaseDocumentLeaseId(doc) === leaseId && getLeaseDocumentType(doc) === INITIAL_CONTRACT_DOCUMENT_TYPE) ?? null;
}

export function hasInitialContract(leaseId: string, documents: LeaseDocumentLike[]): boolean {
  return getInitialContract(leaseId, documents) !== null;
}

export function isInitialContractSigned(leaseId: string, documents: LeaseDocumentLike[]): boolean {
  return getInitialContract(leaseId, documents)?.status === "signed";
}

export function canCreateInitialContract(leaseId: string, documents: LeaseDocumentLike[]): boolean {
  return !hasInitialContract(leaseId, documents);
}

export function shouldWarnManualLeaseSigned(leaseId: string, documents: LeaseDocumentLike[]): boolean {
  return !isInitialContractSigned(leaseId, documents);
}

export function shouldPromptInitialContractRevert(
  lease: Pick<Lease, "id" | "lifecycleStage" | "startDate">,
  document: LeaseDocumentLike,
  todayISO: string,
): boolean {
  return (
    getLeaseDocumentLeaseId(document) === lease.id
    && getLeaseDocumentType(document) === INITIAL_CONTRACT_DOCUMENT_TYPE
    && document.status === "signed"
    && lease.lifecycleStage === "signed"
    && !!lease.startDate
    && lease.startDate > todayISO
  );
}

export function syncLeaseSignedFromInitialContract<T extends Pick<Lease, "lifecycleStage" | "signedDate">>(
  lease: T,
  signedDate: string,
): { lease: T; changed: boolean; fromStage: LifecycleStage | string; toStage: LifecycleStage | string } {
  const fromStage = lease.lifecycleStage;
  if (fromStage !== "draft" && fromStage !== "pending-signature") {
    return { lease, changed: false, fromStage, toStage: fromStage };
  }

  return {
    lease: { ...lease, lifecycleStage: "signed", signedDate } as T,
    changed: true,
    fromStage,
    toStage: "signed",
  };
}
