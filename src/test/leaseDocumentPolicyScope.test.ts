// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/20261107180000_scope_lease_document_write_policies.sql", import.meta.url);

describe("lease document write policy scope", () => {
  it("rejects cross-portfolio lease links without relying on reference triggers", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE authenticated;
        CREATE SCHEMA auth;
        CREATE TYPE public.portfolio_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT '85000000-0000-4000-8000-000000000001'::uuid $$;
        CREATE FUNCTION public.has_portfolio_role(uuid, uuid, public.portfolio_role[])
          RETURNS boolean LANGUAGE sql STABLE
          AS $$ SELECT $1 = current_setting('test.portfolio_id')::uuid $$;
        CREATE TABLE public.leases (id uuid PRIMARY KEY, portfolio_id uuid NOT NULL);
        CREATE TABLE public.lease_documents (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid NOT NULL
        );
        ALTER TABLE public.lease_documents ENABLE ROW LEVEL SECURITY;
        CREATE POLICY read_documents ON public.lease_documents
          FOR SELECT TO authenticated USING (true);
        GRANT USAGE ON SCHEMA auth TO authenticated;
        GRANT SELECT ON public.leases TO authenticated;
        GRANT SELECT, INSERT, UPDATE ON public.lease_documents TO authenticated;
        INSERT INTO public.leases VALUES
          ('85000000-0000-4000-8000-000000000011', '85000000-0000-4000-8000-000000000021'),
          ('85000000-0000-4000-8000-000000000012', '85000000-0000-4000-8000-000000000022');
        SELECT set_config('test.portfolio_id', '85000000-0000-4000-8000-000000000021', false);
      `);
      await db.exec(await readFile(migration, "utf8"));
      await db.exec("SET ROLE authenticated");

      await db.exec(`INSERT INTO public.lease_documents VALUES
        ('85000000-0000-4000-8000-000000000031',
         '85000000-0000-4000-8000-000000000021',
         '85000000-0000-4000-8000-000000000011')`);
      await expect(db.exec(`INSERT INTO public.lease_documents VALUES
        ('85000000-0000-4000-8000-000000000032',
         '85000000-0000-4000-8000-000000000021',
         '85000000-0000-4000-8000-000000000012')`))
        .rejects.toThrow("row-level security policy");
      await expect(db.exec(`UPDATE public.lease_documents
        SET lease_id = '85000000-0000-4000-8000-000000000012'
        WHERE id = '85000000-0000-4000-8000-000000000031'`))
        .rejects.toThrow("row-level security policy");
      expect((await db.query("SELECT count(*)::int AS n FROM public.lease_documents")).rows[0])
        .toEqual({ n: 1 });
    } finally {
      await db.close();
    }
  });
});
