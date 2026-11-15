// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const portfolioA = "00000000-0000-0000-0000-000000000001";
const portfolioB = "00000000-0000-0000-0000-000000000002";
const leaseA = "00000000-0000-0000-0000-000000000011";
const leaseB = "00000000-0000-0000-0000-000000000012";
const admin = "00000000-0000-0000-0000-000000000021";
const editor = "00000000-0000-0000-0000-000000000022";
const viewer = "00000000-0000-0000-0000-000000000023";

describe("lease document write policies", () => {
  it.each([
    ["migration", "20261017120000_restrict_lease_document_writes.sql", "migration", "20261018235600_guard_referenced_lease_document_files.sql"],
    ["migration", "20261017120000_restrict_lease_document_writes.sql", "standalone hotfix", "hotfix-referenced-lease-document-files.sql"],
    ["standalone hotfix", "hotfix-lease-document-writers.sql", "migration", "20261018235600_guard_referenced_lease_document_files.sql"],
    ["standalone hotfix", "hotfix-lease-document-writers.sql", "standalone hotfix", "hotfix-referenced-lease-document-files.sql"],
  ] as const)("%s with %s file guard allows writers but denies viewers and referenced-file deletion", async (label, policyFile, guardLabel, guardFile) => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE SCHEMA auth;
        CREATE SCHEMA storage;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
          SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
        CREATE FUNCTION storage.foldername(path text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
          SELECT string_to_array(path, '/')
        $$;
        GRANT USAGE ON SCHEMA auth, storage TO authenticated;
        CREATE TYPE public.portfolio_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
        CREATE TABLE public.portfolio_members (portfolio_id uuid, user_id uuid, role public.portfolio_role);
        CREATE FUNCTION public.has_portfolio_role(_portfolio uuid, _user uuid, _roles public.portfolio_role[])
          RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
          SELECT EXISTS (SELECT 1 FROM public.portfolio_members
            WHERE portfolio_id = _portfolio AND user_id = _user AND role = ANY(_roles))
        $$;
        CREATE FUNCTION public.is_portfolio_member(_portfolio uuid, _user uuid)
          RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
          SELECT EXISTS (SELECT 1 FROM public.portfolio_members
            WHERE portfolio_id = _portfolio AND user_id = _user)
        $$;
        CREATE TABLE public.leases (id uuid PRIMARY KEY, portfolio_id uuid NOT NULL);
        CREATE TABLE public.lease_documents (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          portfolio_id uuid NOT NULL,
          lease_id uuid NOT NULL,
          title text NOT NULL,
          storage_path text
        );
        CREATE TABLE storage.objects (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          bucket_id text NOT NULL,
          name text NOT NULL
        );
        CREATE TABLE storage.buckets (
          id text PRIMARY KEY, public boolean NOT NULL DEFAULT false,
          file_size_limit bigint, allowed_mime_types text[]
        );
        GRANT SELECT ON public.leases TO authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.lease_documents TO authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
        ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.lease_documents ENABLE ROW LEVEL SECURITY;
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
        CREATE POLICY lease_read ON public.leases FOR SELECT TO authenticated
          USING (public.is_portfolio_member(portfolio_id, auth.uid()));
        CREATE POLICY document_read ON public.lease_documents FOR SELECT TO authenticated
          USING (public.is_portfolio_member(portfolio_id, auth.uid()));
        CREATE POLICY file_read ON storage.objects FOR SELECT TO authenticated
          USING (public.is_portfolio_member((storage.foldername(name))[1]::uuid, auth.uid()));
        CREATE POLICY "Members can insert lease documents" ON public.lease_documents FOR INSERT TO authenticated
          WITH CHECK (public.is_portfolio_member(portfolio_id, auth.uid()));
        CREATE POLICY "Members can update lease documents" ON public.lease_documents FOR UPDATE TO authenticated
          USING (public.is_portfolio_member(portfolio_id, auth.uid()))
          WITH CHECK (public.is_portfolio_member(portfolio_id, auth.uid()));
        CREATE POLICY "Members can delete lease documents" ON public.lease_documents FOR DELETE TO authenticated
          USING (public.is_portfolio_member(portfolio_id, auth.uid()));
        CREATE POLICY "Members can upload lease-documents files" ON storage.objects FOR INSERT TO authenticated
          WITH CHECK (bucket_id = 'lease-documents'
            AND public.is_portfolio_member((storage.foldername(name))[1]::uuid, auth.uid()));
        CREATE POLICY "Members can delete lease-documents files" ON storage.objects FOR DELETE TO authenticated
          USING (bucket_id = 'lease-documents'
            AND public.is_portfolio_member((storage.foldername(name))[1]::uuid, auth.uid()));
        INSERT INTO public.portfolio_members (portfolio_id, user_id, role) VALUES
          ('${portfolioA}', '${admin}', 'admin'),
          ('${portfolioA}', '${editor}', 'editor'),
          ('${portfolioA}', '${viewer}', 'viewer');
        INSERT INTO public.leases (id, portfolio_id) VALUES
          ('${leaseA}', '${portfolioA}'), ('${leaseB}', '${portfolioB}');
      `);
      const schemaCheck = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
      const writerGate = async () => {
        const result = await db.query<{ check_name: string; present: boolean }>(schemaCheck);
        return result.rows.find(row => row.check_name === "lease_document_write_role_policies")?.present;
      };
      expect(await writerGate()).toBe(false);
      const policyUrl = label === "migration"
        ? new URL(`../../supabase/migrations/${policyFile}`, import.meta.url)
        : new URL(`../../scripts/${policyFile}`, import.meta.url);
      const policySql = await readFile(policyUrl, "utf8");
      if (label === "standalone hotfix") {
        await db.exec(`CREATE POLICY unexpected_writer ON public.lease_documents FOR ALL
          TO authenticated USING (true) WITH CHECK (true)`);
        await expect(db.exec(policySql)).rejects.toThrow("hotfix aborted");
        await db.exec("ROLLBACK");
        const unchanged = await db.query<{ policyname: string }>(`
          SELECT policyname FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'lease_documents'
            AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE') ORDER BY policyname`);
        expect(unchanged.rows.map(row => row.policyname)).toEqual([
          "Members can delete lease documents",
          "Members can insert lease documents",
          "Members can update lease documents",
          "unexpected_writer",
        ]);
        await db.exec("DROP POLICY unexpected_writer ON public.lease_documents");
      }
      await db.exec(policySql);
      expect(await writerGate()).toBe(true);
      await db.exec("SET ROLE authenticated");
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [admin]);
      await db.query("INSERT INTO public.lease_documents (portfolio_id, lease_id, title) VALUES ($1, $2, 'Contract')", [portfolioA, leaseA]);
      await db.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('lease-documents', $1)", [`${portfolioA}/${leaseA}/document/file.pdf`]);
      await expect(db.query("INSERT INTO public.lease_documents (portfolio_id, lease_id, title) VALUES ($1, $2, 'Wrong')", [portfolioA, leaseB]))
        .rejects.toThrow("row-level security policy");

      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [viewer]);
      await expect(db.query("INSERT INTO public.lease_documents (portfolio_id, lease_id, title) VALUES ($1, $2, 'Viewer')", [portfolioA, leaseA]))
        .rejects.toThrow("row-level security policy");
      await expect(db.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('lease-documents', $1)", [`${portfolioA}/${leaseA}/viewer/file.pdf`]))
        .rejects.toThrow("row-level security policy");
      expect((await db.query<{ title: string }>(
        "SELECT title FROM public.lease_documents WHERE title = 'Contract'",
      )).rows).toEqual([{ title: "Contract" }]);
      expect((await db.query<{ name: string }>(
        "SELECT name FROM storage.objects WHERE name = $1", [`${portfolioA}/${leaseA}/document/file.pdf`],
      )).rows).toHaveLength(1);
      expect((await db.query(
        "UPDATE public.lease_documents SET title = 'Tampered' WHERE title = 'Contract' RETURNING id",
      )).rows).toEqual([]);
      expect((await db.query(
        "DELETE FROM public.lease_documents WHERE title = 'Contract' RETURNING id",
      )).rows).toEqual([]);
      expect((await db.query(
        "DELETE FROM storage.objects WHERE name = $1 RETURNING id", [`${portfolioA}/${leaseA}/document/file.pdf`],
      )).rows).toEqual([]);

      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [editor]);
      await db.query("INSERT INTO public.lease_documents (portfolio_id, lease_id, title) VALUES ($1, $2, 'Editor')", [portfolioA, leaseA]);
      await db.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('lease-documents', $1)", [`${portfolioA}/${leaseA}/editor/file.pdf`]);
      const documents = await db.query<{ title: string }>("SELECT title FROM public.lease_documents ORDER BY title");
      expect(documents.rows).toEqual([{ title: "Contract" }, { title: "Editor" }]);

      const guardedPath = `${portfolioA}/${leaseA}/document/file.pdf`;
      await db.query("UPDATE public.lease_documents SET storage_path = $1 WHERE title = 'Contract'", [guardedPath]);
      const fileGuard = await readFile(guardLabel === "migration"
        ? new URL(`../../supabase/migrations/${guardFile}`, import.meta.url)
        : new URL(`../../scripts/${guardFile}`, import.meta.url), "utf8");
      await db.exec("RESET ROLE");
      await db.exec(fileGuard);
      await db.query(
        "INSERT INTO public.lease_documents (portfolio_id, lease_id, title, storage_path) VALUES ($1, $2, 'Foreign reference', $3)",
        [portfolioB, leaseB, `${portfolioA}/${leaseA}/editor/file.pdf`],
      );
      await db.exec("SET ROLE authenticated");
      const referencedDelete = await db.query<{ id: string }>(
        "DELETE FROM storage.objects WHERE name = $1 RETURNING id", [guardedPath],
      );
      expect(referencedDelete.rows).toEqual([]);
      expect((await db.query<{ id: string }>(
        "SELECT id FROM storage.objects WHERE name = $1", [guardedPath],
      )).rows).toHaveLength(1);

      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [viewer]);
      expect((await db.query<{ id: string }>(
        "DELETE FROM storage.objects WHERE name = $1 RETURNING id", [`${portfolioA}/${leaseA}/editor/file.pdf`],
      )).rows).toEqual([]);
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [editor]);

      await db.query("DELETE FROM public.lease_documents WHERE title = 'Contract'");
      expect((await db.query<{ id: string }>(
        "DELETE FROM storage.objects WHERE name = $1 RETURNING id", [guardedPath],
      )).rows).toHaveLength(1);
      expect((await db.query<{ id: string }>(
        "DELETE FROM storage.objects WHERE name = $1 RETURNING id", [`${portfolioA}/${leaseA}/editor/file.pdf`],
      )).rows).toEqual([]);
      await db.exec("RESET ROLE");
      await db.query("DELETE FROM public.lease_documents WHERE title = 'Foreign reference'");
      await db.exec("SET ROLE authenticated");
      expect((await db.query<{ id: string }>(
        "DELETE FROM storage.objects WHERE name = $1 RETURNING id", [`${portfolioA}/${leaseA}/editor/file.pdf`],
      )).rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
});
