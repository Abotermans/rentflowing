// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";
import { checkTargetDocuments, requiredDocumentChecks } from "../../scripts/check-target-documents.mjs";

const backend = "https://othaxlwgtqpodncnlglv.supabase.co";
const zeroRows = () => requiredDocumentChecks.map(check_name => ({ check_name, affected: "0" }));
const reply = (rows: unknown, status = 201) => new Response(JSON.stringify(rows), {
  status, headers: { "Content-Type": "application/json" },
});

describe("read-only target document gate", () => {
  it("reports missing, orphaned, queued, and shared files without counting recent uploads", async () => {
    const audit = await readFile(new URL("../../scripts/audit-document-storage-consistency.sql", import.meta.url), "utf8");
    const sqlChecks = [...audit.matchAll(/SELECT '([^']+)'(?: AS check_name)?,/g)].map(match => match[1]);
    expect(sqlChecks).toEqual(requiredDocumentChecks);
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE SCHEMA storage;
        CREATE TABLE storage.objects (id text PRIMARY KEY, bucket_id text, name text, created_at timestamptz);
        CREATE TABLE public.lease_documents (id text PRIMARY KEY, storage_path text);
        CREATE TABLE public.lease_document_file_deletions (id text PRIMARY KEY, storage_path text);
        INSERT INTO public.lease_documents VALUES
          ('document-1', 'p/l/one.pdf'),
          ('document-2', 'p/l/missing.pdf'),
          ('document-3', 'p/l/queued.pdf'),
          ('document-4', 'p/l/one.pdf');
        INSERT INTO storage.objects VALUES
          ('file-1', 'lease-documents', 'p/l/one.pdf', now() - interval '2 hours'),
          ('file-2', 'lease-documents', 'p/l/orphan.pdf', now() - interval '2 hours'),
          ('file-3', 'lease-documents', 'p/l/recent.pdf', now()),
          ('file-4', 'lease-documents', 'p/l/queued.pdf', now() - interval '2 hours'),
          ('file-5', 'other-bucket', 'unrelated.pdf', now() - interval '2 hours');
        INSERT INTO public.lease_document_file_deletions VALUES ('queue-1', 'p/l/queued.pdf');
      `);
      const affected = async () => {
        const result = await db.query<{ check_name: string; affected: string }>(audit);
        return Object.fromEntries(result.rows.map(row => [row.check_name, Number(row.affected)]));
      };
      expect(await affected()).toEqual({
        documents_missing_file: 1,
        unreferenced_stored_files: 1,
        queued_files_still_referenced: 1,
        shared_document_file_paths: 1,
      });
      await db.exec(`
        DELETE FROM public.lease_documents WHERE id IN ('document-2', 'document-3', 'document-4');
        DELETE FROM storage.objects WHERE id IN ('file-2', 'file-4');
        DELETE FROM public.lease_document_file_deletions;
      `);
      expect(await affected()).toEqual({
        documents_missing_file: 0,
        unreferenced_stored_files: 0,
        queued_files_still_referenced: 0,
        shared_document_file_paths: 0,
      });
    } finally {
      await db.close();
    }
  });

  it("uses the read-only endpoint and accepts zero findings", async () => {
    const fetchImpl = vi.fn(async (_url: string, _options: RequestInit) => reply(zeroRows()));
    await expect(checkTargetDocuments(backend, "scoped-token", fetchImpl)).resolves.toBe(4);
    const [url, options] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.supabase.com/v1/projects/othaxlwgtqpodncnlglv/database/query/read-only");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer scoped-token");
    expect(JSON.parse(options.body as string).query).toContain("unreferenced_stored_files");
  });

  it("fails closed on findings or incomplete responses", async () => {
    const findings = zeroRows();
    findings[0].affected = "2";
    findings[3].affected = "1";
    await expect(checkTargetDocuments(backend, "token", async () => reply(findings)))
      .rejects.toThrow("documents_missing_file: 2, shared_document_file_paths: 1");
    await expect(checkTargetDocuments(backend, "token", async () => reply(zeroRows().slice(1))))
      .rejects.toThrow("incomplete result");
    const repeated = zeroRows();
    repeated[1].check_name = repeated[0].check_name;
    await expect(checkTargetDocuments(backend, "token", async () => reply(repeated)))
      .rejects.toThrow("unexpected or repeated");
    const invalid = zeroRows();
    invalid[0].affected = "NaN";
    await expect(checkTargetDocuments(backend, "token", async () => reply(invalid)))
      .rejects.toThrow("invalid count");
    await expect(checkTargetDocuments(backend, "", async () => reply(zeroRows())))
      .rejects.toThrow("SUPABASE_MANAGEMENT_READ_TOKEN");
    await expect(checkTargetDocuments(backend, "token", async () => reply({}, 403)))
      .rejects.toThrow("HTTP 403");
  });
});
