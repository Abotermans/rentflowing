import { describe, expect, it } from "vitest";
import type { Lease } from "@/types";
import {
  BUILT_IN_LEASE_DOCUMENT_TYPES,
  buildLeaseDocumentTypeDefinitions,
  buildUniqueDocumentTypeSlug,
  canCreateInitialContract,
  documentTypeLabelExists,
  getInitialContract,
  getLeaseDocumentType,
  hasInitialContract,
  isContractualDocument,
  isInitialContractSigned,
  leaseDocumentMimeType,
  shouldPromptInitialContractRevert,
  shouldWarnManualLeaseSigned,
  slugifyDocumentTypeLabel,
  syncLeaseSignedFromInitialContract,
  type LeaseDocumentLike,
} from "@/lib/leaseDocuments";

const lease = (stage: Lease["lifecycleStage"], startDate = "2026-07-01"): Pick<Lease, "id" | "lifecycleStage" | "startDate" | "signedDate"> => ({
  id: "lease-1",
  lifecycleStage: stage,
  startDate,
  signedDate: null,
});

const doc = (overrides: Partial<LeaseDocumentLike>): LeaseDocumentLike => ({
  id: "doc-1",
  lease_id: "lease-1",
  document_type: "supporting",
  status: null,
  signed_date: null,
  ...overrides,
});

describe("lease document contractual flow helpers", () => {
  it("uses an allowed extension when the browser omits MIME and rejects mismatches", () => {
    expect(leaseDocumentMimeType("contract.PDF", "")).toBe("application/pdf");
    expect(leaseDocumentMimeType("contract.docx", "")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(leaseDocumentMimeType("photo.jpeg", "image/jpeg")).toBe("image/jpeg");
    expect(leaseDocumentMimeType("contract.pdf", "image/png")).toBeNull();
    expect(leaseDocumentMimeType("contract.exe", "")).toBeNull();
  });

  it("blocks a second initial contract on the same lease", () => {
    const documents = [doc({ document_type: "initial-contract" })];

    expect(getInitialContract("lease-1", documents)?.id).toBe("doc-1");
    expect(hasInitialContract("lease-1", documents)).toBe(true);
    expect(canCreateInitialContract("lease-1", documents)).toBe(false);
  });

  it("allows an initial contract when none exists on the lease", () => {
    const documents = [
      doc({ id: "doc-2", document_type: "amendment" }),
      doc({ id: "doc-3", lease_id: "lease-2", document_type: "initial-contract" }),
    ];

    expect(canCreateInitialContract("lease-1", documents)).toBe(true);
  });

  it("treats only initial contracts and amendments as contractual", () => {
    expect(isContractualDocument(doc({ document_type: "initial-contract" }))).toBe(true);
    expect(isContractualDocument(doc({ document_type: "amendment" }))).toBe(true);
    expect(isContractualDocument(doc({ document_type: "supporting", status: "signed" }))).toBe(false);
    expect(isContractualDocument(doc({ document_type: "insurance", status: "signed" }))).toBe(false);
  });

  it("preserves custom document type slugs", () => {
    expect(getLeaseDocumentType(doc({ document_type: "insurance-certificate" }))).toBe("insurance-certificate");
    expect(getLeaseDocumentType(doc({ document_type: "" }))).toBe("supporting");
  });

  it("keeps built-in type definitions locked and marks custom definitions as non-contractual", () => {
    const definitions = buildLeaseDocumentTypeDefinitions([{ slug: "insurance", label: "Insurance" }]);

    expect(BUILT_IN_LEASE_DOCUMENT_TYPES.every((type) => type.locked)).toBe(true);
    expect(definitions.find((type) => type.slug === "initial-contract")?.contractual).toBe(true);
    expect(definitions.find((type) => type.slug === "insurance")).toMatchObject({
      label: "Insurance",
      builtIn: false,
      contractual: false,
      locked: false,
    });
  });

  it("generates stable custom type slugs and detects duplicates", () => {
    const customTypes = [{ slug: "insurance-certificate", label: "Insurance Certificate" }];

    expect(slugifyDocumentTypeLabel(" Insurance certificate! ")).toBe("insurance-certificate");
    expect(documentTypeLabelExists("Insurance Certificate", customTypes)).toBe(true);
    expect(documentTypeLabelExists("Initial contract", customTypes)).toBe(true);
    expect(buildUniqueDocumentTypeSlug("Insurance Certificate", customTypes.map((type) => type.slug))).toBe("insurance-certificate-2");
  });

  it("warns on manual lease signing when there is no signed initial contract", () => {
    expect(shouldWarnManualLeaseSigned("lease-1", [])).toBe(true);
    expect(shouldWarnManualLeaseSigned("lease-1", [doc({ document_type: "initial-contract", status: "sent" })])).toBe(true);
    expect(shouldWarnManualLeaseSigned("lease-1", [doc({ document_type: "initial-contract", status: "signed" })])).toBe(false);
    expect(isInitialContractSigned("lease-1", [doc({ document_type: "amendment", status: "signed" })])).toBe(false);
  });

  it("syncs draft and pending-signature leases forward to signed", () => {
    expect(syncLeaseSignedFromInitialContract(lease("draft"), "2026-06-15")).toMatchObject({
      changed: true,
      lease: { lifecycleStage: "signed", signedDate: "2026-06-15" },
      fromStage: "draft",
      toStage: "signed",
    });

    expect(syncLeaseSignedFromInitialContract(lease("pending-signature"), "2026-06-16")).toMatchObject({
      changed: true,
      lease: { lifecycleStage: "signed", signedDate: "2026-06-16" },
      fromStage: "pending-signature",
      toStage: "signed",
    });
  });

  it("does not sync active or closed leases from document status", () => {
    expect(syncLeaseSignedFromInitialContract(lease("active", "2026-01-01"), "2026-01-01").changed).toBe(false);
    expect(syncLeaseSignedFromInitialContract(lease("ended", "2026-01-01"), "2026-01-01").changed).toBe(false);
    expect(syncLeaseSignedFromInitialContract(lease("terminated", "2026-01-01"), "2026-01-01").changed).toBe(false);
  });

  it("prompts rollback only for signed future leases and signed initial contracts", () => {
    const signedInitial = doc({ document_type: "initial-contract", status: "signed" });

    expect(shouldPromptInitialContractRevert(lease("signed", "2026-07-01"), signedInitial, "2026-06-25")).toBe(true);
    expect(shouldPromptInitialContractRevert(lease("signed", "2026-06-01"), signedInitial, "2026-06-25")).toBe(false);
    expect(shouldPromptInitialContractRevert(lease("active", "2026-06-01"), signedInitial, "2026-06-25")).toBe(false);
    expect(shouldPromptInitialContractRevert(lease("signed", "2026-07-01"), doc({ document_type: "amendment", status: "signed" }), "2026-06-25")).toBe(false);
  });

  it("stops prompting on the property's lease start day", () => {
    const signedInitial = doc({ document_type: "initial-contract", status: "signed" });
    const signedLease = lease("signed", "2026-07-01");

    expect(shouldPromptInitialContractRevert(signedLease, signedInitial, "2026-06-30")).toBe(true);
    expect(shouldPromptInitialContractRevert(signedLease, signedInitial, "2026-07-01")).toBe(false);
  });
});
