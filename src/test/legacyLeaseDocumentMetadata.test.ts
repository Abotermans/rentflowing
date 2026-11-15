// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolioId = "00000000-0000-0000-0000-000000000001";
const leaseId = "00000000-0000-0000-0000-000000000011";

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.lease_document_types (
      portfolio_id uuid NOT NULL,
      slug text NOT NULL,
      label text NOT NULL,
      UNIQUE (portfolio_id, slug)
    );
    CREATE TABLE public.lease_documents (
      id uuid PRIMARY KEY,
      portfolio_id uuid NOT NULL,
      lease_id uuid NOT NULL,
      document_type text NOT NULL DEFAULT 'supporting',
      status text,
      signed_date date,
      notes text,
      CONSTRAINT contractual_status CHECK (
        (document_type NOT IN ('initial-contract', 'amendment') AND status IS NULL AND signed_date IS NULL)
        OR (document_type IN ('initial-contract', 'amendment')
          AND status IN ('draft', 'validated', 'sent', 'partially-signed', 'signed', 'cancelled')
          AND ((status = 'signed' AND signed_date IS NOT NULL)
            OR (status <> 'signed' AND signed_date IS NULL)))
      )
    );
  `);
  return db;
}

const migrationUrl = new URL("../../supabase/migrations/20261017185000_backfill_legacy_lease_document_metadata.sql", import.meta.url);
const typeGuardUrl = new URL("../../supabase/migrations/20261017130000_enforce_lease_document_types.sql", import.meta.url);

describe("legacy lease document metadata backfill", () => {
  it("preserves contractual and custom types without inventing a status for supporting docs", async () => {
    const db = await database();
    try {
      await db.query(
        `INSERT INTO public.lease_documents (id, portfolio_id, lease_id, notes) VALUES
         ('00000000-0000-0000-0000-000000000101', $1, $2, $3),
         ('00000000-0000-0000-0000-000000000102', $1, $2, $4),
         ('00000000-0000-0000-0000-000000000103', $1, $2, 'ordinary note')`,
        [portfolioId, leaseId,
          JSON.stringify({ __rentflowingLeaseDocumentMetadata: { documentType: "amendment", status: "draft", signedDate: null } }),
          JSON.stringify({ __rentflowingLeaseDocumentMetadata: { documentType: "id", status: null, signedDate: null } })],
      );
      await db.exec(await readFile(typeGuardUrl, "utf8"));
      await db.exec(await readFile(migrationUrl, "utf8"));
      const result = await db.query<{ document_type: string; status: string | null; notes: string | null }>(
        "SELECT document_type, status, notes FROM public.lease_documents ORDER BY id",
      );
      expect(result.rows).toEqual([
        { document_type: "amendment", status: "draft", notes: null },
        { document_type: "id", status: null, notes: null },
        { document_type: "supporting", status: null, notes: "ordinary note" },
      ]);
      const types = await db.query<{ slug: string }>("SELECT slug FROM public.lease_document_types");
      expect(types.rows).toEqual([{ slug: "id" }]);
      await db.exec(await readFile(migrationUrl, "utf8"));
    } finally {
      await db.close();
    }
  });

  it("aborts rather than silently dropping a signed document's missing date", async () => {
    const db = await database();
    try {
      await db.query(
        "INSERT INTO public.lease_documents (id, portfolio_id, lease_id, notes) VALUES ($1, $2, $3, $4)",
        ["00000000-0000-0000-0000-000000000101", portfolioId, leaseId,
          JSON.stringify({ __rentflowingLeaseDocumentMetadata: { documentType: "initial-contract", status: "signed" } })],
      );
      await expect(db.exec(await readFile(migrationUrl, "utf8"))).rejects.toThrow("has no legacy signed date");
    } finally {
      await db.close();
    }
  });
});
