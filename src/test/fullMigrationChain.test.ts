// @vitest-environment node
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrations = new URL("../../supabase/migrations/", import.meta.url);

describe("complete migration chain", () => {
  it("applies every migration in order to a clean Supabase-shaped database", async () => {
    const db = new PGlite();
    try {
      // PGlite does not bundle Supabase's auth, storage, or pgcrypto helpers.
      await db.exec(`
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE ROLE service_role;
        CREATE SCHEMA auth;
        CREATE TABLE auth.users (
          id uuid PRIMARY KEY,
          email text,
          email_confirmed_at timestamptz,
          created_at timestamptz DEFAULT now()
        );
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT null::uuid $$;
        CREATE SCHEMA storage;
        CREATE TABLE storage.buckets (
          id text PRIMARY KEY,
          name text,
          public boolean DEFAULT false,
          file_size_limit bigint,
          allowed_mime_types text[]
        );
        CREATE TABLE storage.objects (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          bucket_id text,
          name text
        );
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
        CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE
          AS $$ SELECT string_to_array($1, '/') $$;
        CREATE FUNCTION public.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql
          AS $$ SELECT decode(repeat('ab', $1), 'hex') $$;
      `);

      const files = (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort();
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const sql = await readFile(new URL(file, migrations), "utf8");
        try {
          await db.exec(sql);
        } catch (error) {
          throw new Error(`Migration ${file} failed on a clean database: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const result = await db.query<{ relname: string }>(`
        SELECT relname FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relname IN
          ('portfolios', 'properties', 'leases', 'lease_documents', 'cash_receipts')
        ORDER BY relname
      `);
      expect(result.rows.map(row => row.relname)).toEqual([
        "cash_receipts", "lease_documents", "leases", "portfolios", "properties",
      ]);

      const attestation = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
      const checks = await db.query<{ check_name: string; present: boolean }>(attestation);
      expect(checks.rows.filter(row => !row.present).map(row => row.check_name)).toEqual([]);
    } finally {
      await db.close();
    }
  });
});
