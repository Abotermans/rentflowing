// @vitest-environment node
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { requiredAuditChecks } from "../../scripts/check-target-data.mjs";
import { requiredSchemaChecks } from "../../scripts/check-target-schema.mjs";

async function migratedDatabase(afterMigration?: (db: PGlite, name: string) => Promise<void>): Promise<PGlite> {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE ROLE anon;
      CREATE FUNCTION public.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql
        AS $$ SELECT decode(repeat('00', $1), 'hex') $$;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (
        id uuid PRIMARY KEY,
        email text,
        raw_user_meta_data jsonb,
        email_confirmed_at timestamptz DEFAULT now()
      );
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets (
        id text PRIMARY KEY,
        name text NOT NULL,
        public boolean NOT NULL DEFAULT false,
        file_size_limit bigint,
        allowed_mime_types text[]
      );
      CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text, name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE
        AS $$ SELECT string_to_array($1, '/') $$;
    `);
    const migrationDir = new URL("../../supabase/migrations/", import.meta.url);
    const migrations = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
    expect(migrations.length).toBeGreaterThanOrEqual(51);
    for (const migration of migrations) {
      const sql = await readFile(new URL(migration, migrationDir), "utf8");
      try {
        await db.exec(sql);
        await afterMigration?.(db, migration);
      } catch (error) {
        throw new Error(`Migration ${migration} failed: ${String(error)}`);
      }
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

describe("migration chain", () => {
  it("replays the indexation migration over Lovable-style unrecorded schema without losing lease values", async () => {
    const leaseId = "51000000-0000-4000-8000-000000000001";
    let injected = false;
    const db = await migratedDatabase(async (database, name) => {
      if (!name.startsWith("20260622145645_")) return;
      injected = true;
      const indexationSql = await readFile(
        new URL("../../supabase/migrations/20260811130000_lease_indexation.sql", import.meta.url), "utf8",
      );
      await database.exec(indexationSql);
      await database.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES ('51000000-0000-4000-8000-000000000002', 'indexation-replay@example.test', '{}'::jsonb);
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          SELECT '51000000-0000-4000-8000-000000000003', id, 'Indexation Replay', 'IR'
          FROM public.portfolios WHERE created_by = '51000000-0000-4000-8000-000000000002';
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          lifecycle_stage, start_date, end_date, indexation_enabled, indexation_base_date,
          indexation_base_index, indexation_current_index, indexation_cap_percent,
          indexation_rounding_mode, indexation_notes)
          SELECT '${leaseId}', portfolio_id, id, 'IR-LEASE', 'draft', '2026-01-01',
            '2027-12-31', true, '2026-01-01', 100, 110, 5, 'nearest-cent', 'existing terms'
          FROM public.properties WHERE id = '51000000-0000-4000-8000-000000000003';
      `);
    });
    try {
      expect(injected).toBe(true);
      const lease = await db.query<{
        indexation_enabled: boolean; indexation_base_index: string;
        indexation_current_index: string; indexation_rounding_mode: string;
        indexation_notes: string;
      }>(`SELECT indexation_enabled, indexation_base_index, indexation_current_index,
        indexation_rounding_mode, indexation_notes FROM public.leases WHERE id = $1::uuid`, [leaseId]);
      expect(lease.rows).toMatchObject([{
        indexation_enabled: true, indexation_base_index: "100.0000",
        indexation_current_index: "110.0000", indexation_rounding_mode: "nearest-cent",
        indexation_notes: "existing terms",
      }]);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("requires each lease document to own its Storage path", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.lease_documents (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, lease_id uuid NOT NULL, storage_path text NOT NULL
        );
        INSERT INTO public.lease_documents(id, portfolio_id, lease_id, storage_path) VALUES
          ('48000000-0000-4000-8000-000000000001', '48000000-0000-4000-8000-000000000020',
            '48000000-0000-4000-8000-000000000010', 'shared/contract.pdf'),
          ('48000000-0000-4000-8000-000000000002', '48000000-0000-4000-8000-000000000020',
            '48000000-0000-4000-8000-000000000011', 'shared/contract.pdf');
        CREATE INDEX lease_documents_storage_path_idx ON public.lease_documents(storage_path);
        CREATE TABLE public.lease_document_file_deletions (
          portfolio_id uuid NOT NULL, lease_id uuid NOT NULL, document_id uuid NOT NULL,
          storage_path text UNIQUE NOT NULL
        );
        CREATE FUNCTION public.guard_pending_document_file_deletion() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
        CREATE TRIGGER guard_pending_document_file_deletion BEFORE INSERT ON public.lease_documents
          FOR EACH ROW EXECUTE FUNCTION public.guard_pending_document_file_deletion();
      `);
      const migration = await readFile(new URL("../../supabase/migrations/20261107160000_unique_lease_document_storage_paths.sql", import.meta.url), "utf8");
      const audit = await readFile(new URL("../../scripts/audit-document-path-collisions.sql", import.meta.url), "utf8");
      const before = await db.query<{ storage_path: string; document_count: number }>(audit);
      expect(before.rows).toMatchObject([{ storage_path: "shared/contract.pdf", document_count: 2 }]);
      await expect(db.exec(migration)).rejects.toThrow("Lease documents share a storage path");
      await db.exec("DELETE FROM public.lease_documents WHERE id = '48000000-0000-4000-8000-000000000002'");
      await db.exec(migration);
      expect((await db.query(audit)).rows).toEqual([]);
      await db.exec("ALTER TABLE public.lease_documents DISABLE TRIGGER guard_pending_document_file_deletion");
      await expect(db.exec(`INSERT INTO public.lease_documents(id, portfolio_id, lease_id, storage_path) VALUES
        ('48000000-0000-4000-8000-000000000003', '48000000-0000-4000-8000-000000000020',
          '48000000-0000-4000-8000-000000000011', 'shared/contract.pdf')`))
        .rejects.toThrow("duplicate key");
    } finally {
      await db.close();
    }
  });

  it("satisfies the production schema gate after all local migrations", async () => {
    const db = await migratedDatabase();
    try {
      const sql = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
      const result = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(result.rows.map(row => row.check_name).sort()).toEqual([...requiredSchemaChecks].sort());
      expect(result.rows.filter(row => !row.present)).toEqual([]);
      await db.exec("ALTER TABLE public.leases DISABLE TRIGGER guard_lease_stage_main_unit");
      const disabledMainUnitGuard = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(disabledMainUnitGuard.rows.find(row => row.check_name === "lease_stage_main_unit_guard")?.present)
        .toBe(false);
      await db.exec("ALTER TABLE public.leases ENABLE TRIGGER guard_lease_stage_main_unit");
      await db.exec("ALTER TABLE public.lease_unit_assignments DISABLE TRIGGER guard_retained_lease_main_unit");
      const disabledAssignmentGuard = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(disabledAssignmentGuard.rows.find(row => row.check_name === "lease_stage_main_unit_guard")?.present)
        .toBe(false);
      await db.exec("ALTER TABLE public.lease_unit_assignments ENABLE TRIGGER guard_retained_lease_main_unit");
      await db.exec("ALTER TABLE public.lease_unit_assignments DISABLE TRIGGER guard_lease_assignment_totals_on_assignment");
      const disabledTotalsGuard = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(disabledTotalsGuard.rows.find(row => row.check_name === "lease_assignment_totals_guard")?.present)
        .toBe(false);
      await db.exec("ALTER TABLE public.lease_unit_assignments ENABLE TRIGGER guard_lease_assignment_totals_on_assignment");
      await db.exec("ALTER TABLE public.lease_unit_assignments DISABLE TRIGGER guard_same_lease_unit_overlap_on_assignment");
      const disabledUnitOverlapGuard = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(disabledUnitOverlapGuard.rows.find(row => row.check_name === "same_lease_unit_overlap_guard")?.present)
        .toBe(false);
      await db.exec("ALTER TABLE public.lease_unit_assignments ENABLE TRIGGER guard_same_lease_unit_overlap_on_assignment");
      await db.exec("ALTER TABLE public.leases DISABLE TRIGGER guard_cross_lease_overlap_on_lease");
      const disabledCrossLeaseGuard = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(disabledCrossLeaseGuard.rows.find(row => row.check_name === "cross_lease_unit_overlap_guard")?.present)
        .toBe(false);
      await db.exec("ALTER TABLE public.leases ENABLE TRIGGER guard_cross_lease_overlap_on_lease");
      await db.exec("CREATE POLICY unscoped_test_read ON public.properties FOR SELECT TO authenticated USING (true)");
      const unsafe = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(unsafe.rows.find(row => row.check_name === "portfolio_data_read_policies")?.present).toBe(false);
      expect(unsafe.rows.find(row => row.check_name === "all_portfolio_table_read_policies")?.present).toBe(false);
      await db.exec("DROP POLICY unscoped_test_read ON public.properties");
      await db.exec("CREATE POLICY unscoped_vendor_read ON public.vendors FOR SELECT TO authenticated USING (true)");
      const unsafeVendor = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(unsafeVendor.rows.find(row => row.check_name === "portfolio_data_read_policies")?.present).toBe(true);
      expect(unsafeVendor.rows.find(row => row.check_name === "all_portfolio_table_read_policies")?.present).toBe(false);
      await db.exec("DROP POLICY unscoped_vendor_read ON public.vendors");
      await db.exec(`
        DROP POLICY "Editors can insert lease documents" ON public.lease_documents;
        CREATE POLICY "Editors can insert lease documents" ON public.lease_documents
          FOR INSERT TO authenticated WITH CHECK (
            public.has_portfolio_role(portfolio_id, auth.uid(),
              ARRAY['owner','admin','editor']::public.portfolio_role[])
            AND EXISTS (SELECT 1 FROM public.leases AS lease
              WHERE lease.id = lease_id AND lease.portfolio_id = portfolio_id)
          );
      `);
      const unsafeDocuments = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(unsafeDocuments.rows.find(row => row.check_name === "lease_document_write_policy_scope")?.present)
        .toBe(false);
      await db.exec(`
        DROP POLICY "Editors can insert lease documents" ON public.lease_documents;
        CREATE POLICY "Editors can insert lease documents" ON public.lease_documents
          FOR INSERT TO authenticated WITH CHECK (
            public.has_portfolio_role(lease_documents.portfolio_id, auth.uid(),
              ARRAY['owner','admin','editor']::public.portfolio_role[])
            AND EXISTS (SELECT 1 FROM public.leases AS lease
              WHERE lease.id = lease_documents.lease_id
                AND lease.portfolio_id = lease_documents.portfolio_id)
          );
        CREATE POLICY extra_document_insert ON public.lease_documents
          FOR INSERT TO authenticated WITH CHECK (true);
      `);
      const extraDocuments = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(extraDocuments.rows.find(row => row.check_name === "lease_document_write_policy_scope")?.present)
        .toBe(false);
      await db.exec("CREATE TABLE public.unprotected_test (portfolio_id uuid NOT NULL)");
      const unprotected = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(unprotected.rows.find(row => row.check_name === "all_portfolio_tables_rls")?.present).toBe(false);
      await db.exec("UPDATE storage.buckets SET public = true WHERE id = 'lease-documents'");
      const publicBucket = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(publicBucket.rows.find(row => row.check_name === "lease_document_bucket_config")?.present).toBe(false);
      await db.exec(`
        DROP POLICY "Editors can upload lease-documents files" ON storage.objects;
        CREATE POLICY unscoped_test_upload ON storage.objects FOR INSERT TO authenticated
          WITH CHECK (bucket_id = 'lease-documents');
      `);
      const unsafeUpload = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(unsafeUpload.rows.find(row => row.check_name === "lease_document_storage_upload_policy")?.present).toBe(false);
      await db.exec("ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY");
      const unprotectedFiles = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(unprotectedFiles.rows.find(row => row.check_name === "lease_document_storage_objects_rls")?.present).toBe(false);
      await db.exec(`
        CREATE FUNCTION public.unsafe_definer_test() RETURNS integer LANGUAGE sql
          SECURITY DEFINER SET search_path = public AS $$ SELECT 1 $$;
      `);
      const unsafeDefiner = await db.query<{ check_name: string; present: boolean }>(sql);
      expect(unsafeDefiner.rows.find(row => row.check_name === "secure_definer_search_paths")?.present).toBe(false);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("isolates property and receipt data across authenticated portfolios", async () => {
    const db = await migratedDatabase();
    const ids = {
      firstUser: "8b000000-0000-4000-8000-000000000001",
      secondUser: "8b000000-0000-4000-8000-000000000002",
      firstProperty: "8b000000-0000-4000-8000-000000000003",
      secondProperty: "8b000000-0000-4000-8000-000000000004",
      firstReceipt: "8b000000-0000-4000-8000-000000000005",
      secondReceipt: "8b000000-0000-4000-8000-000000000006",
    };
    try {
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
          ('${ids.firstUser}', 'first-isolation@example.test', '{}'::jsonb),
          ('${ids.secondUser}', 'second-isolation@example.test', '{}'::jsonb);
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      const firstPortfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.firstUser],
      )).rows[0].id;
      const secondPortfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.secondUser],
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code) VALUES
          ('${ids.firstProperty}', '${firstPortfolio}', 'First Property', 'FIRST'),
          ('${ids.secondProperty}', '${secondPortfolio}', 'Second Property', 'SECOND');
        INSERT INTO public.cash_receipts (id, portfolio_id, property_id, payment_date,
          amount_received, currency_code, status, unmatched_amount) VALUES
          ('${ids.firstReceipt}', '${firstPortfolio}', '${ids.firstProperty}', '2026-06-17',
            120, 'GBP', 'unmatched', 120),
          ('${ids.secondReceipt}', '${secondPortfolio}', '${ids.secondProperty}', '2026-06-17',
            50, 'EUR', 'unmatched', 50);
      `);

      for (const [userId, ownProperty, ownReceipt, otherProperty, otherPortfolio] of [
        [ids.firstUser, ids.firstProperty, ids.firstReceipt, ids.secondProperty, secondPortfolio],
        [ids.secondUser, ids.secondProperty, ids.secondReceipt, ids.firstProperty, firstPortfolio],
      ]) {
        await db.query("SELECT set_config('test.user_id', $1, false)", [userId]);
        await db.exec("SET ROLE authenticated");
        try {
          const visibleProperties = (await db.query<{ id: string }>(
            "SELECT id FROM public.properties ORDER BY id",
          )).rows.map(row => row.id);
          const visibleReceipts = (await db.query<{ id: string }>(
            "SELECT id FROM public.cash_receipts ORDER BY id",
          )).rows.map(row => row.id);
          expect(visibleProperties).toEqual([ownProperty]);
          expect(visibleReceipts).toEqual([ownReceipt]);
          expect((await db.query<{ id: string }>(
            "UPDATE public.properties SET name = 'Unauthorized' WHERE id = $1::uuid RETURNING id",
            [otherProperty],
          )).rows).toEqual([]);
          await expect(db.query(
            "INSERT INTO public.properties (portfolio_id, name, reference_code) VALUES ($1::uuid, 'Unauthorized', 'CROSS')",
            [otherPortfolio],
          )).rejects.toThrow();
        } finally {
          await db.exec("RESET ROLE");
        }
      }
    } finally {
      await db.close();
    }
  }, 120_000);

  it("hardens an existing lease-document bucket without replacing it", async () => {
    const db = await migratedDatabase(async (database, name) => {
      if (name === "20261107140000_set_first_portfolio_as_default.sql") {
        await database.exec(`
          INSERT INTO storage.buckets (id, name, public, file_size_limit)
          VALUES ('lease-documents', 'lease-documents', true, NULL);
        `);
      }
    });
    try {
      const bucket = (await db.query<{
        id: string; public: boolean; file_size_limit: number; allowed_mime_types: string[];
      }>("SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'lease-documents'"))
        .rows[0];
      expect(bucket).toEqual({
        id: "lease-documents",
        public: false,
        file_size_limit: 20 * 1024 * 1024,
        allowed_mime_types: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "image/jpeg",
          "image/png",
        ],
      });
    } finally {
      await db.close();
    }
  }, 120_000);

  it("waits for email confirmation and avoids starter portfolios for valid invitees", async () => {
    const legacyId = "9a000000-0000-4000-8000-000000000001";
    const newId = "9a000000-0000-4000-8000-000000000002";
    const confirmedId = "9a000000-0000-4000-8000-000000000003";
    const invitedId = "9a000000-0000-4000-8000-000000000004";
    const pendingInviteId = "9a000000-0000-4000-8000-000000000005";
    const expiredInviteId = "9a000000-0000-4000-8000-000000000006";
    const invalidInviteId = "9a000000-0000-4000-8000-000000000007";
    const db = await migratedDatabase(async (database, name) => {
      if (name === "20261107120000_guard_property_currency_after_use.sql") {
        await database.query(
          "INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ($1::uuid, 'legacy@example.test', '{}'::jsonb, NULL)",
          [legacyId],
        );
      }
    });
    try {
      const portfolioCount = async (userId: string) => (await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM public.portfolios WHERE created_by = $1::uuid", [userId],
      )).rows[0].count;
      expect(await portfolioCount(legacyId)).toBe(1);

      await db.query(
        "INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ($1::uuid, 'new@example.test', '{\"first_name\":\"New\"}'::jsonb, NULL)",
        [newId],
      );
      expect((await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM public.profiles WHERE id = $1::uuid", [newId],
      )).rows[0].count).toBe(1);
      expect(await portfolioCount(newId)).toBe(0);

      await db.query("UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1::uuid", [newId]);
      await db.query("UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1::uuid", [legacyId]);
      expect(await portfolioCount(newId)).toBe(1);
      expect(await portfolioCount(legacyId)).toBe(1);
      const owner = (await db.query<{ role: string; default_portfolio_id: string }>(`
        SELECT m.role::text AS role, p.default_portfolio_id::text AS default_portfolio_id
        FROM public.profiles p
        JOIN public.portfolio_members m ON m.portfolio_id = p.default_portfolio_id AND m.user_id = p.id
        WHERE p.id = $1::uuid`, [newId])).rows[0];
      expect(owner.role).toBe("owner");
      expect(owner.default_portfolio_id).toBeTruthy();

      await db.query(
        "INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ($1::uuid, 'invited@example.test', '{}'::jsonb, NULL)",
        [invitedId],
      );
      const legacyPortfolioId = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [legacyId],
      )).rows[0].id;
      await db.query(
        "INSERT INTO public.portfolio_members (portfolio_id, user_id, role) VALUES ($1::uuid, $2::uuid, 'viewer')",
        [legacyPortfolioId, invitedId],
      );
      await db.query("UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1::uuid", [invitedId]);
      expect(await portfolioCount(invitedId)).toBe(0);
      expect((await db.query<{ default_portfolio_id: string }>(
        "SELECT default_portfolio_id::text AS default_portfolio_id FROM public.profiles WHERE id = $1::uuid", [invitedId],
      )).rows[0].default_portfolio_id).toBe(legacyPortfolioId);

      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES
          ('${pendingInviteId}', 'pending@example.test', '{}'::jsonb, NULL),
          ('${expiredInviteId}', 'expired@example.test', '{}'::jsonb, NULL),
          ('${invalidInviteId}', 'invalid@example.test', '{}'::jsonb, NULL);
        INSERT INTO public.portfolio_invitations
          (portfolio_id, email, role, token, invited_by, expires_at) VALUES
          ('${legacyPortfolioId}', ' PENDING@EXAMPLE.TEST ', 'viewer', 'pending-invite', '${legacyId}', now() + interval '1 day'),
          ('${legacyPortfolioId}', 'expired@example.test', 'viewer', 'expired-invite', '${legacyId}', now() - interval '1 day'),
          ('${legacyPortfolioId}', 'invalid@example.test', 'owner', 'invalid-invite', '${invitedId}', now() + interval '1 day');
      `);
      await db.query("UPDATE auth.users SET email_confirmed_at = now() WHERE id IN ($1::uuid, $2::uuid, $3::uuid)",
        [pendingInviteId, expiredInviteId, invalidInviteId]);
      expect(await portfolioCount(pendingInviteId)).toBe(0);
      expect((await db.query<{ default_portfolio_id: string | null }>(
        "SELECT default_portfolio_id::text AS default_portfolio_id FROM public.profiles WHERE id = $1::uuid",
        [pendingInviteId],
      )).rows[0].default_portfolio_id).toBeNull();
      expect(await portfolioCount(expiredInviteId)).toBe(1);
      expect(await portfolioCount(invalidInviteId)).toBe(1);

      await db.exec(`
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
      `);
      await db.query("SELECT set_config('test.user_id', $1, false)", [pendingInviteId]);
      const accepted = (await db.query<{ portfolio_id: string }>(
        "SELECT public.accept_portfolio_invitation('pending-invite') AS portfolio_id",
      )).rows[0].portfolio_id;
      expect(accepted).toBe(legacyPortfolioId);
      expect((await db.query<{ role: string }>(
        "SELECT role::text AS role FROM public.portfolio_members WHERE user_id = $1::uuid AND portfolio_id = $2::uuid",
        [pendingInviteId, legacyPortfolioId],
      )).rows).toEqual([{ role: "viewer" }]);
      expect((await db.query<{ default_portfolio_id: string }>(
        "SELECT default_portfolio_id::text AS default_portfolio_id FROM public.profiles WHERE id = $1::uuid",
        [pendingInviteId],
      )).rows[0].default_portfolio_id).toBe(legacyPortfolioId);
      expect(await portfolioCount(pendingInviteId)).toBe(0);
      const newPortfolioId = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [newId],
      )).rows[0].id;
      await db.query(
        "INSERT INTO public.portfolio_members (portfolio_id, user_id, role) VALUES ($1::uuid, $2::uuid, 'viewer')",
        [newPortfolioId, pendingInviteId],
      );
      expect((await db.query<{ default_portfolio_id: string }>(
        "SELECT default_portfolio_id::text AS default_portfolio_id FROM public.profiles WHERE id = $1::uuid",
        [pendingInviteId],
      )).rows[0].default_portfolio_id).toBe(legacyPortfolioId);

      await db.query(
        "INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES ($1::uuid, 'confirmed@example.test', '{}'::jsonb, now())",
        [confirmedId],
      );
      expect(await portfolioCount(confirmedId)).toBe(1);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("saves manual allocation shares with their rule after direct writes are revoked", async () => {
    const db = await migratedDatabase();
    const ids = {
      owner: "69000000-0000-4000-8000-000000000001",
      viewer: "69000000-0000-4000-8000-000000000002",
      property: "69000000-0000-4000-8000-000000000003",
      otherProperty: "69000000-0000-4000-8000-000000000009",
      unit: "69000000-0000-4000-8000-000000000004",
      template: "69000000-0000-4000-8000-000000000005",
      rule: "69000000-0000-4000-8000-000000000006",
      share: "69000000-0000-4000-8000-000000000007",
      replacement: "69000000-0000-4000-8000-000000000008",
      crossRule: "69000000-0000-4000-8000-000000000010",
    };
    try {
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
          ('${ids.owner}', 'rule-owner@example.test', '{}'::jsonb),
          ('${ids.viewer}', 'rule-viewer@example.test', '{}'::jsonb);
      `);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.owner],
      )).rows[0].id;
      const otherPortfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.viewer],
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
          VALUES ('${portfolio}', '${ids.viewer}', 'viewer');
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${ids.property}', '${portfolio}', 'Rule Property', 'RULE');
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${ids.otherProperty}', '${otherPortfolio}', 'Other Property', 'OTHER');
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('${ids.unit}', '${portfolio}', '${ids.property}', 'R-1');
        INSERT INTO public.allocation_rules (id, portfolio_id, property_id, name)
          VALUES ('${ids.template}', '${portfolio}', '${ids.property}', 'Template');
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      const template = (await db.query<{ data: Record<string, unknown> }>(
        "SELECT to_jsonb(item) AS data FROM public.allocation_rules AS item WHERE id = $1::uuid",
        [ids.template],
      )).rows[0].data;
      await db.query("DELETE FROM public.allocation_rules WHERE id = $1::uuid", [ids.template]);
      const rule = { ...template, id: ids.rule, name: "Manual", method: "manual-percentage" };
      const share = {
        id: ids.share, allocation_rule_id: ids.rule, unit_id: ids.unit,
        percentage_share: 100,
      };
      const save = (payload: Record<string, unknown>, shares: object[], version: string | null) =>
        db.query<{ result: { rule: { updated_at: string }; shares: Array<{ id: string }> } }>(
          "SELECT public.client_save_allocation_rule_with_shares($1::jsonb, $2::jsonb, $3::timestamptz) AS result",
          [JSON.stringify(payload), JSON.stringify(shares), version],
        );
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.viewer]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(save(rule, [share], null)).rejects.toThrow("Allocation rule save is not permitted");
      } finally {
        await db.exec("RESET ROLE");
      }
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.owner]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(db.query(
          "SELECT public.save_allocation_rule_with_shares('{}'::jsonb, '[]'::jsonb, NULL::timestamptz)",
        )).rejects.toThrow("permission denied");
        await expect(save({ ...rule, id: ids.crossRule, property_id: ids.otherProperty, method: "equal" }, [], null))
          .rejects.toThrow("Portfolio mismatch in allocation_rules.property_id");
        const saved = (await save(rule, [share], null)).rows[0].result;
        expect(saved.shares.map(row => row.id)).toEqual([ids.share]);
        const replaced = (await save({ ...rule, name: "Manual updated" }, [
          { ...share, id: ids.replacement },
        ], saved.rule.updated_at)).rows[0].result;
        expect(replaced.shares.map(row => row.id)).toEqual([ids.replacement]);
        await expect(db.query("UPDATE public.allocation_rules SET name = 'Forged' WHERE id = $1::uuid", [ids.rule]))
          .rejects.toThrow("permission denied");
        await expect(db.query("DELETE FROM public.allocation_rule_unit_shares WHERE id = $1::uuid", [ids.replacement]))
          .rejects.toThrow("permission denied");
        await db.query("DELETE FROM public.allocation_rules WHERE id = $1::uuid", [ids.rule]);
      } finally {
        await db.exec("RESET ROLE");
      }
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.allocation_rule_unit_shares WHERE id = $1::uuid",
        [ids.replacement],
      )).rows[0].n).toBe(0);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("saves cost entries and unit allocations atomically after direct writes are revoked", async () => {
    const db = await migratedDatabase();
    const ids = {
      owner: "68000000-0000-4000-8000-000000000001",
      viewer: "68000000-0000-4000-8000-000000000002",
      property: "68000000-0000-4000-8000-000000000003",
      unit: "68000000-0000-4000-8000-000000000004",
      category: "68000000-0000-4000-8000-000000000005",
      rule: "68000000-0000-4000-8000-000000000006",
      template: "68000000-0000-4000-8000-000000000007",
      entry: "68000000-0000-4000-8000-000000000008",
      result: "68000000-0000-4000-8000-000000000009",
      replacement: "68000000-0000-4000-8000-00000000000a",
    };
    try {
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
          ('${ids.owner}', 'cost-owner@example.test', '{}'::jsonb),
          ('${ids.viewer}', 'cost-viewer@example.test', '{}'::jsonb);
      `);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.owner],
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
          VALUES ('${portfolio}', '${ids.viewer}', 'viewer');
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${ids.property}', '${portfolio}', 'Cost Property', 'COST');
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('${ids.unit}', '${portfolio}', '${ids.property}', 'C-1');
        INSERT INTO public.cost_categories (id, portfolio_id, code, name)
          VALUES ('${ids.category}', '${portfolio}', 'REPAIR', 'Repairs');
        INSERT INTO public.allocation_rules (id, portfolio_id, property_id, name)
          VALUES ('${ids.rule}', '${portfolio}', '${ids.property}', 'Equal');
        INSERT INTO public.cost_entries (id, portfolio_id, category_id,
          property_id, allocation_rule_id, label, start_date, amount)
          VALUES ('${ids.template}', '${portfolio}', '${ids.category}',
            '${ids.property}', '${ids.rule}', 'Template', '2026-01-01', 100);
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      const template = (await db.query<{ data: Record<string, unknown> }>(
        "SELECT to_jsonb(item) AS data FROM public.cost_entries AS item WHERE id = $1::uuid",
        [ids.template],
      )).rows[0].data;
      await db.query("DELETE FROM public.cost_entries WHERE id = $1::uuid", [ids.template]);
      const entry = { ...template, id: ids.entry, label: "Roof repair" };
      const allocation = {
        id: ids.result, cost_entry_id: ids.entry, property_id: ids.property,
        unit_id: ids.unit, allocated_amount: 100, recovery_type: "owner-only",
        recoverable_amount: 0, owner_burden_amount: 100,
        period_start: "2026-01-01", period_end: "2026-12-31",
      };
      const save = () => db.query<{ result: { entry: { updated_at: string }; allocations: Array<{ id: string }> } }>(
        "SELECT public.client_save_cost_entry_with_allocations($1::jsonb, $2::jsonb, NULL::timestamptz) AS result",
        [JSON.stringify(entry), JSON.stringify([allocation])],
      );
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.viewer]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(save()).rejects.toThrow("Cost entry save is not permitted");
      } finally {
        await db.exec("RESET ROLE");
      }
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.owner]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(db.query(
          "SELECT public.save_cost_entry_with_allocations('{}'::jsonb, '[]'::jsonb, NULL::timestamptz)",
        )).rejects.toThrow("permission denied");
        const saved = (await save()).rows[0].result;
        expect(saved.allocations.map(row => row.id)).toEqual([ids.result]);
        const replaced = (await db.query<{ result: { entry: { updated_at: string }; allocations: Array<{ id: string }> } }>(
          "SELECT public.client_save_cost_entry_with_allocations($1::jsonb, $2::jsonb, $3::timestamptz) AS result",
          [JSON.stringify({ ...entry, amount: 120 }), JSON.stringify([{
            ...allocation, id: ids.replacement, allocated_amount: 120, owner_burden_amount: 120,
          }]), saved.entry.updated_at],
        )).rows[0].result;
        expect(replaced.allocations.map(row => row.id)).toEqual([ids.replacement]);
        await expect(db.query(
          "SELECT public.client_save_cost_entry_with_allocations($1::jsonb, $2::jsonb, $3::timestamptz)",
          [JSON.stringify({ ...entry, amount: 120 }), JSON.stringify([{
            ...allocation, allocated_amount: 121, owner_burden_amount: 121,
          }]), replaced.entry.updated_at],
        )).rejects.toThrow("Cost allocations cannot exceed the owner-managed invoice share");
        await expect(db.query(
          "SELECT public.client_save_cost_entry_with_allocations($1::jsonb, $2::jsonb, $3::timestamptz)",
          [JSON.stringify({ ...entry, amount: 120 }), JSON.stringify([{
            ...allocation, allocated_amount: 120, recoverable_amount: 1, owner_burden_amount: 119,
          }]), replaced.entry.updated_at],
        )).rejects.toThrow("Cost allocations must match the cost, property, unit and recovery split");
        const informational = (await db.query<{ result: { entry: { updated_at: string }; allocations: Array<{
          allocated_amount: number; recoverable_amount: number; owner_burden_amount: number;
        }> } }>(
          "SELECT public.client_save_cost_entry_with_allocations($1::jsonb, $2::jsonb, $3::timestamptz) AS result",
          [JSON.stringify({ ...entry, amount: 120, recovery_type: "informational" }), JSON.stringify([{
            ...allocation, id: ids.replacement, allocated_amount: 120,
            recovery_type: "informational", recoverable_amount: 0, owner_burden_amount: 0,
          }]), replaced.entry.updated_at],
        )).rows[0].result;
        expect(informational.allocations).toEqual([expect.objectContaining({
          allocated_amount: 120, recoverable_amount: 0, owner_burden_amount: 0,
        })]);
        await db.query("UPDATE public.properties SET is_partially_owned = true WHERE id = $1::uuid", [ids.property]);
        await db.query("UPDATE public.units SET millieme_shares = '{\"general\":45}'::jsonb WHERE id = $1::uuid", [ids.unit]);
        await expect(db.query(
          "SELECT public.client_save_cost_entry_with_allocations($1::jsonb, $2::jsonb, $3::timestamptz)",
          [JSON.stringify({ ...entry, amount: 120, recovery_type: "informational" }), JSON.stringify([{
            ...allocation, allocated_amount: 5.41, recovery_type: "informational",
            recoverable_amount: 0, owner_burden_amount: 0,
          }]), informational.entry.updated_at],
        )).rejects.toThrow("Cost allocations cannot exceed the owner-managed invoice share");
        await expect(db.query(
          "SELECT public.client_save_cost_entry_with_allocations($1::jsonb, $2::jsonb, $3::timestamptz)",
          [JSON.stringify({ ...entry, amount: 120, recovery_type: "partially-recoverable", recoverable_percentage: 40 }), JSON.stringify([{
            ...allocation, allocated_amount: 5.4, recovery_type: "partially-recoverable",
            recoverable_amount: 1, owner_burden_amount: 4.4,
          }]), informational.entry.updated_at],
        )).rejects.toThrow("Cost allocation recovery does not match the configured percentage");
        const partial = (await db.query<{ result: { allocations: Array<{ allocated_amount: number }> } }>(
          "SELECT public.client_save_cost_entry_with_allocations($1::jsonb, $2::jsonb, $3::timestamptz) AS result",
          [JSON.stringify({ ...entry, amount: 120, recovery_type: "informational" }), JSON.stringify([{
            ...allocation, id: ids.replacement, allocated_amount: 5.4,
            recovery_type: "informational", recoverable_amount: 0, owner_burden_amount: 0,
          }]), informational.entry.updated_at],
        )).rows[0].result;
        expect(partial.allocations[0].allocated_amount).toBe(5.4);
        await expect(db.query("UPDATE public.cost_entries SET amount = 999 WHERE id = $1::uuid", [ids.entry]))
          .rejects.toThrow("permission denied");
        await expect(db.query("DELETE FROM public.cost_allocation_results WHERE id = $1::uuid", [ids.replacement]))
          .rejects.toThrow("permission denied");
        await db.query("DELETE FROM public.cost_entries WHERE id = $1::uuid", [ids.entry]);
      } finally {
        await db.exec("RESET ROLE");
      }
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.cost_allocation_results WHERE id = $1::uuid", [ids.replacement],
      )).rows[0].n).toBe(0);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("creates lease and reconciliation receivables through scoped wrappers after direct INSERT is revoked", async () => {
    const db = await migratedDatabase();
    const ids = {
      owner: "67000000-0000-4000-8000-000000000001",
      viewer: "67000000-0000-4000-8000-000000000002",
      property: "67000000-0000-4000-8000-000000000003",
      unit: "67000000-0000-4000-8000-000000000004",
      tenant: "67000000-0000-4000-8000-000000000005",
      lease: "67000000-0000-4000-8000-000000000006",
      assignment: "67000000-0000-4000-8000-000000000007",
      rent: "67000000-0000-4000-8000-000000000008",
      reconciliation: "67000000-0000-4000-8000-000000000009",
      adjustment: "67000000-0000-4000-8000-00000000000a",
    };
    try {
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
          ('${ids.owner}', 'receivable-owner@example.test', '{}'::jsonb),
          ('${ids.viewer}', 'receivable-viewer@example.test', '{}'::jsonb);
      `);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.owner],
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
          VALUES ('${portfolio}', '${ids.viewer}', 'viewer');
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${ids.property}', '${portfolio}', 'Wrapper Property', 'WRAPPER');
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('${ids.unit}', '${portfolio}', '${ids.property}', 'W-1');
        INSERT INTO public.tenants (id, portfolio_id, first_name)
          VALUES ('${ids.tenant}', '${portfolio}', 'Test');
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, billing_tenant_id, lifecycle_stage, start_date, end_date)
          VALUES ('67000000-0000-4000-8000-00000000000b', '${portfolio}', '${ids.property}',
            'TEMPLATE-LEASE', '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'draft',
            '2026-01-01', '2026-12-31');
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      const template = (await db.query<{ data: Record<string, unknown> }>(
        "SELECT to_jsonb(item) AS data FROM public.leases AS item WHERE id = '67000000-0000-4000-8000-00000000000b'",
      )).rows[0].data;
      await db.exec("DELETE FROM public.leases WHERE id = '67000000-0000-4000-8000-00000000000b'");
      const lease = { ...template,
        id: ids.lease, portfolio_id: portfolio, property_id: ids.property,
        lease_reference: "WRAPPER-LEASE", tenant_ids: [ids.tenant], billing_tenant_id: ids.tenant,
        lifecycle_stage: "active", start_date: "2026-01-01", end_date: "2026-12-31",
        signed_date: "2026-01-01", monthly_rent: 100,
      };
      const assignment = {
        id: ids.assignment, lease_id: ids.lease, unit_id: ids.unit,
        start_date: "2026-01-01", end_date: "2026-12-31", rent_share: 100, charges_share: 0,
        assignment_type: "primary", is_primary: true, notes: "",
      };
      const rent = {
        id: ids.rent, lease_id: ids.lease, tenant_id: ids.tenant, property_id: ids.property,
        unit_id: ids.unit, item_type: "rent", label: "January rent", period_month: "2026-01",
        due_date: "2026-01-01", currency_code: "EUR", expected_amount: 100,
        allocated_amount: 0, outstanding_amount: 100, status: "open", origin: "lease-schedule",
        priority: 10, notes: "",
      };
      const createLease = () => db.query<{ result: { receivables: object[] } }>(
        "SELECT public.client_create_lease_with_schedule($1::jsonb, $2::jsonb, $3::jsonb, '[]'::jsonb) AS result",
        [JSON.stringify(lease), JSON.stringify([assignment]), JSON.stringify([rent])],
      );
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.viewer]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(db.query("INSERT INTO public.receivable_items (due_date) VALUES ('2026-01-01')"))
          .rejects.toThrow("permission denied");
        await expect(db.query(
          "SELECT public.create_lease_with_schedule('{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)",
        )).rejects.toThrow("permission denied");
        await expect(createLease()).rejects.toThrow("Lease creation is not permitted");
      } finally {
        await db.exec("RESET ROLE");
      }
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.owner]);
      await db.exec("SET ROLE authenticated");
      try {
        expect((await createLease()).rows[0].result.receivables).toHaveLength(1);
        await expect(db.query("INSERT INTO public.leases DEFAULT VALUES"))
          .rejects.toThrow("permission denied");
        await expect(db.query("INSERT INTO public.lease_unit_assignments DEFAULT VALUES"))
          .rejects.toThrow("permission denied");
        await expect(db.query(
          "UPDATE public.lease_unit_assignments SET rent_share = 999 WHERE id = $1::uuid",
          [ids.assignment],
        )).rejects.toThrow("permission denied");
        await expect(db.query(
          "DELETE FROM public.lease_unit_assignments WHERE id = $1::uuid", [ids.assignment],
        )).rejects.toThrow("permission denied");
        await expect(db.query(
          "SELECT public.close_lease_atomically('{}'::jsonb, now(), current_date)",
        )).rejects.toThrow("permission denied");
      } finally {
        await db.exec("RESET ROLE");
      }
      const reconciliation = {
        id: ids.reconciliation, portfolio_id: portfolio, lease_id: ids.lease,
        period_start: "2026-01-01", period_end: "2026-03-31",
        provisions_collected: 0, actual_recoverable: 20, delta: -20,
        resolution: "owe", receivable_item_id: ids.adjustment, notes: "",
      };
      const adjustment = {
        id: ids.adjustment, portfolio_id: portfolio, lease_id: ids.lease,
        tenant_id: ids.tenant, property_id: ids.property, item_type: "charges-adjustment",
        label: "Charges adjustment", due_date: "2026-04-01", currency_code: "EUR",
        expected_amount: 20, allocated_amount: 0, outstanding_amount: 20,
        status: "open", origin: "adjustment", priority: 10, notes: "",
      };
      const createReconciliation = () => db.query<{ result: { receivable: { id: string } } }>(
        "SELECT public.client_create_charges_reconciliation($1::jsonb, $2::jsonb) AS result",
        [JSON.stringify(reconciliation), JSON.stringify(adjustment)],
      );
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.viewer]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(createReconciliation()).rejects.toThrow("Reconciliation creation is not permitted");
      } finally {
        await db.exec("RESET ROLE");
      }
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.owner]);
      await db.exec("SET ROLE authenticated");
      try {
        expect((await createReconciliation()).rows[0].result.receivable.id).toBe(ids.adjustment);
        await expect(db.query(
          "UPDATE public.charges_reconciliations SET delta = 999 WHERE id = $1::uuid",
          [ids.reconciliation],
        )).rejects.toThrow("permission denied");
        await expect(db.query(
          "INSERT INTO public.charges_reconciliations (id, portfolio_id, lease_id, period_start, period_end, resolution) VALUES ($1::uuid, $2::uuid, $3::uuid, '2026-04-01', '2026-06-30', 'none')",
          ["67000000-0000-4000-8000-00000000000c", portfolio, ids.lease],
        )).rejects.toThrow("permission denied");
      } finally {
        await db.exec("RESET ROLE");
      }
    } finally {
      await db.close();
    }
  }, 120_000);

  it("applies every migration in filename order to a fresh schema", async () => {
    const db = await migratedDatabase();
    try {
      const functions = await db.query<{ proname: string }>(`
        SELECT proname FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname = ANY(ARRAY[
            'create_lease_with_schedule', 'save_receipt_allocations', 'client_save_receipt_allocations',
            'save_cost_entry_with_allocations', 'client_save_cost_entry_with_allocations',
            'save_allocation_rule_with_shares', 'client_save_allocation_rule_with_shares',
            'create_charges_reconciliation', 'client_create_charges_reconciliation', 'delete_charges_reconciliation',
            'client_delete_charges_reconciliation', 'client_save_lease_with_assignments',
            'client_create_lease_with_schedule',
            'save_amendment_with_changes', 'activate_amendment_with_schedule',
            'client_save_amendment_with_changes', 'client_activate_amendment_with_schedule',
            'client_close_lease_atomically', 'change_amendment_status',
            'save_lease_with_tenant_statuses', 'close_lease_atomically',
            'delete_lease_atomically', 'delete_duplicate_lease_receivables',
            'guard_paid_receivable_deletion',
            'ensure_lease_status_history',
            'prevent_duplicate_lease_receivable', 'advance_due_lease_lifecycle',
            'advance_due_lease_lifecycle_for_zone',
            'insert_due_lease_receivables', 'prune_future_closed_lease_receivables',
            'record_initial_lease_status', 'set_property_owner_links',
            'save_property_with_owners', 'save_lease_with_assignments'
          ])
      `);
      expect(functions.rows.map((row) => row.proname).sort()).toEqual([
        'activate_amendment_with_schedule', 'advance_due_lease_lifecycle',
        'advance_due_lease_lifecycle_for_zone',
        'change_amendment_status', 'client_activate_amendment_with_schedule',
        'client_close_lease_atomically', 'client_create_charges_reconciliation',
        'client_create_lease_with_schedule', 'client_delete_charges_reconciliation',
        'client_save_allocation_rule_with_shares', 'client_save_amendment_with_changes',
        'client_save_cost_entry_with_allocations',
        'client_save_lease_with_assignments',
        'client_save_receipt_allocations',
        'close_lease_atomically', 'create_charges_reconciliation', 'create_lease_with_schedule',
        'delete_charges_reconciliation', 'delete_duplicate_lease_receivables', 'delete_lease_atomically',
        'ensure_lease_status_history', 'guard_paid_receivable_deletion',
        'insert_due_lease_receivables',
        'prevent_duplicate_lease_receivable', 'prune_future_closed_lease_receivables',
        'record_initial_lease_status',
        'save_allocation_rule_with_shares', 'save_amendment_with_changes',
        'save_cost_entry_with_allocations', 'save_lease_with_assignments',
        'save_lease_with_tenant_statuses',
        'save_property_with_owners', 'save_receipt_allocations', 'set_property_owner_links',
      ]);
      const columns = await db.query<{ table_name: string; column_name: string }>(`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND (
          (table_name = 'leases' AND column_name = 'indexation_enabled') OR
          (table_name = 'properties' AND column_name = 'is_partially_owned') OR
          (table_name = 'cost_entries' AND column_name = 'recognition_mode') OR
          (table_name = 'lease_documents' AND column_name = 'document_type') OR
          (table_name = 'portfolios' AND column_name = 'receivable_lead_days') OR
          (table_name = 'properties' AND column_name = 'time_zone')
        )
      `);
      expect(columns.rows).toHaveLength(6);
      const privileges = (await db.query<{
        client_direct_update: boolean;
        client_original_activation: boolean;
        scheduler_original_activation: boolean;
        client_guarded_activation: boolean;
        client_original_close: boolean;
        client_guarded_close: boolean;
        direct_receivable_delete: boolean;
        direct_receivable_insert: boolean;
        direct_reconciliation_insert: boolean;
        direct_reconciliation_update: boolean;
        direct_cost_entry_insert: boolean;
        direct_cost_entry_update: boolean;
        direct_cost_result_insert: boolean;
        direct_cost_result_update: boolean;
        direct_cost_result_delete: boolean;
        original_cost_save: boolean;
        guarded_cost_save: boolean;
        direct_rule_insert: boolean;
        direct_rule_update: boolean;
        direct_rule_share_insert: boolean;
        direct_rule_share_update: boolean;
        direct_rule_share_delete: boolean;
        original_rule_save: boolean;
        guarded_rule_save: boolean;
        client_job_health_read: boolean;
        service_job_health_write: boolean;
        original_lease_creation: boolean;
        guarded_lease_creation: boolean;
        original_reconciliation_creation: boolean;
        guarded_reconciliation_creation: boolean;
        original_lease_assignment_edit: boolean;
        guarded_lease_assignment_edit: boolean;
        original_reconciliation_delete: boolean;
        guarded_reconciliation_delete: boolean;
      }>(`
        SELECT
          has_table_privilege('authenticated', 'public.lease_amendments', 'UPDATE') AS client_direct_update,
          has_function_privilege('authenticated',
            'public.activate_amendment_with_schedule(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz)',
            'EXECUTE') AS client_original_activation,
          has_function_privilege('service_role',
            'public.activate_amendment_with_schedule(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz)',
            'EXECUTE') AS scheduler_original_activation,
          has_function_privilege('authenticated',
            'public.client_activate_amendment_with_schedule(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz)',
            'EXECUTE') AS client_guarded_activation,
          has_function_privilege('authenticated',
            'public.close_lease_atomically(jsonb,timestamptz,date,boolean,text,text)',
            'EXECUTE') AS client_original_close,
          has_function_privilege('authenticated',
            'public.client_close_lease_atomically(jsonb,timestamptz,date,boolean,text,text)',
            'EXECUTE') AS client_guarded_close,
          has_table_privilege('authenticated', 'public.receivable_items', 'DELETE') AS direct_receivable_delete,
          has_table_privilege('authenticated', 'public.receivable_items', 'INSERT') AS direct_receivable_insert,
          has_table_privilege('authenticated', 'public.charges_reconciliations', 'INSERT') AS direct_reconciliation_insert,
          has_table_privilege('authenticated', 'public.charges_reconciliations', 'UPDATE') AS direct_reconciliation_update,
          has_table_privilege('authenticated', 'public.cost_entries', 'INSERT') AS direct_cost_entry_insert,
          has_table_privilege('authenticated', 'public.cost_entries', 'UPDATE') AS direct_cost_entry_update,
          has_table_privilege('authenticated', 'public.cost_allocation_results', 'INSERT') AS direct_cost_result_insert,
          has_table_privilege('authenticated', 'public.cost_allocation_results', 'UPDATE') AS direct_cost_result_update,
          has_table_privilege('authenticated', 'public.cost_allocation_results', 'DELETE') AS direct_cost_result_delete,
          has_function_privilege('authenticated',
            'public.save_cost_entry_with_allocations(jsonb,jsonb,timestamptz)',
            'EXECUTE') AS original_cost_save,
          has_function_privilege('authenticated',
            'public.client_save_cost_entry_with_allocations(jsonb,jsonb,timestamptz)',
            'EXECUTE') AS guarded_cost_save,
          has_table_privilege('authenticated', 'public.allocation_rules', 'INSERT') AS direct_rule_insert,
          has_table_privilege('authenticated', 'public.allocation_rules', 'UPDATE') AS direct_rule_update,
          has_table_privilege('authenticated', 'public.allocation_rule_unit_shares', 'INSERT') AS direct_rule_share_insert,
          has_table_privilege('authenticated', 'public.allocation_rule_unit_shares', 'UPDATE') AS direct_rule_share_update,
          has_table_privilege('authenticated', 'public.allocation_rule_unit_shares', 'DELETE') AS direct_rule_share_delete,
          has_function_privilege('authenticated',
            'public.save_allocation_rule_with_shares(jsonb,jsonb,timestamptz)',
            'EXECUTE') AS original_rule_save,
          has_function_privilege('authenticated',
            'public.client_save_allocation_rule_with_shares(jsonb,jsonb,timestamptz)',
            'EXECUTE') AS guarded_rule_save,
          has_table_privilege('authenticated', 'public.scheduled_job_health', 'SELECT') AS client_job_health_read,
          has_table_privilege('service_role', 'public.scheduled_job_health', 'INSERT') AS service_job_health_write,
          has_function_privilege('authenticated',
            'public.create_lease_with_schedule(jsonb,jsonb,jsonb,jsonb)',
            'EXECUTE') AS original_lease_creation,
          has_function_privilege('authenticated',
            'public.client_create_lease_with_schedule(jsonb,jsonb,jsonb,jsonb)',
            'EXECUTE') AS guarded_lease_creation,
          has_function_privilege('authenticated',
            'public.create_charges_reconciliation(jsonb,jsonb)',
            'EXECUTE') AS original_reconciliation_creation,
          has_function_privilege('authenticated',
            'public.client_create_charges_reconciliation(jsonb,jsonb)',
            'EXECUTE') AS guarded_reconciliation_creation,
          has_function_privilege('authenticated',
            'public.save_lease_with_assignments(jsonb,jsonb,timestamptz,jsonb,jsonb,date,jsonb,jsonb,jsonb)',
            'EXECUTE') AS original_lease_assignment_edit,
          has_function_privilege('authenticated',
            'public.client_save_lease_with_assignments(jsonb,jsonb,timestamptz,jsonb,jsonb,date,jsonb,jsonb,jsonb)',
            'EXECUTE') AS guarded_lease_assignment_edit,
          has_function_privilege('authenticated',
            'public.delete_charges_reconciliation(uuid,uuid,timestamptz)',
            'EXECUTE') AS original_reconciliation_delete,
          has_function_privilege('authenticated',
            'public.client_delete_charges_reconciliation(uuid,uuid,timestamptz)',
            'EXECUTE') AS guarded_reconciliation_delete
      `)).rows[0];
      expect(privileges).toEqual({
        client_direct_update: false,
        client_original_activation: false,
        scheduler_original_activation: true,
        client_guarded_activation: true,
        client_original_close: false,
        client_guarded_close: true,
        direct_receivable_delete: false,
        direct_receivable_insert: false,
        direct_reconciliation_insert: false,
        direct_reconciliation_update: false,
        direct_cost_entry_insert: false,
        direct_cost_entry_update: false,
        direct_cost_result_insert: false,
        direct_cost_result_update: false,
        direct_cost_result_delete: false,
        original_cost_save: false,
        guarded_cost_save: true,
        direct_rule_insert: false,
        direct_rule_update: false,
        direct_rule_share_insert: false,
        direct_rule_share_update: false,
        direct_rule_share_delete: false,
        original_rule_save: false,
        guarded_rule_save: true,
        client_job_health_read: false,
        service_job_health_write: true,
        original_lease_creation: false,
        guarded_lease_creation: true,
        original_reconciliation_creation: false,
        guarded_reconciliation_creation: true,
        original_lease_assignment_edit: false,
        guarded_lease_assignment_edit: true,
        original_reconciliation_delete: false,
        guarded_reconciliation_delete: true,
      });
      const exposedTriggers = await db.query<{ proname: string }>(`
        SELECT proname FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND prosecdef
          AND prorettype = 'trigger'::regtype
          AND (has_function_privilege('anon', oid, 'EXECUTE')
            OR has_function_privilege('authenticated', oid, 'EXECUTE'))
      `);
      expect(exposedTriggers.rows).toEqual([]);
      const unsafeDefinerPaths = await db.query<{ proname: string }>(`
        SELECT proname FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND prosecdef
          AND (NOT EXISTS (
              SELECT 1 FROM unnest(coalesce(proconfig, ARRAY[]::text[])) AS setting
              WHERE setting LIKE 'search_path=%'
            )
            OR 'search_path=public' = ANY(proconfig))
      `);
      expect(unsafeDefinerPaths.rows).toEqual([]);
      expect((await db.query(`
        SELECT has_schema_privilege('anon', 'public', 'CREATE') AS anon_create,
          has_schema_privilege('authenticated', 'public', 'CREATE') AS auth_create
      `)).rows[0]).toEqual({ anon_create: false, auth_create: false });
      const auditSql = await readFile(
        new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8",
      );
      const audit = await db.query<{ check_name: string; affected: number }>(auditSql);
      expect(new Set(audit.rows.map(check => check.check_name))).toEqual(new Set(requiredAuditChecks));
      expect(audit.rows.every((check) => check.affected === 0)).toBe(true);
      expect(audit.rows.map((check) => check.check_name)).toContain("duplicate_lease_schedule_rows");
      expect(audit.rows.map((check) => check.check_name)).toContain("cross_currency_schedule_slots");
      expect(audit.rows.map((check) => check.check_name)).toContain("lease_schedule_missing_cycle_metadata");
      expect(audit.rows.map((check) => check.check_name)).toContain("lease_schedule_without_plausible_assignment");
      expect(audit.rows.map((check) => check.check_name)).toContain("receivable_property_currency_mismatch");
      expect(audit.rows.map((check) => check.check_name)).toContain("receipt_property_currency_mismatch");
      expect(audit.rows.map((check) => check.check_name)).toContain("active_cost_property_currency_mismatch");
      expect(audit.rows.map((check) => check.check_name)).toContain("lease_without_status_history");
      expect(audit.rows.map((check) => check.check_name)).toContain("lease_signed_after_end_date");
      expect(audit.rows.map((check) => check.check_name)).toContain("amendment_unit_reference_mismatch");
      expect(audit.rows.map((check) => check.check_name)).toContain("unit_millieme_key_over_base");
      expect(audit.rows.map((check) => check.check_name)).toContain("invalid_unit_millieme_root");
      expect(audit.rows.map((check) => check.check_name)).toContain("invalid_unit_millieme_share");
      expect(audit.rows.map((check) => check.check_name)).toContain("property_cost_overallocated");
      const amendmentAudit = await readFile(
        new URL("../../scripts/audit-amendment-assignment-consistency.sql", import.meta.url), "utf8",
      );
      expect((await db.query(amendmentAudit)).rows).toEqual([]);
      const currencyAudit = await readFile(
        new URL("../../scripts/audit-currency-anomalies.sql", import.meta.url), "utf8",
      );
      expect((await db.query(currencyAudit)).rows).toEqual([]);
      const exposureAudit = await readFile(
        new URL("../../scripts/audit-currency-exposure-summary.sql", import.meta.url), "utf8",
      );
      expect((await db.query(exposureAudit)).rows).toEqual([]);
      const assignmentAudit = await readFile(
        new URL("../../scripts/audit-lease-schedule-unit-windows.sql", import.meta.url), "utf8",
      );
      expect((await db.query(assignmentAudit)).rows).toEqual([]);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("flags historical allocations that exceed a newly partial property's owned share", async () => {
    const db = await migratedDatabase();
    try {
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES ('56000000-0000-4000-8000-000000000001', 'cost-audit@example.test', '{}'::jsonb);
      `);
      const portfolio = (await db.query<{ id: string }>(`
        SELECT id FROM public.portfolios WHERE created_by = '56000000-0000-4000-8000-000000000001'
      `)).rows[0].id;
      await db.exec(`
        INSERT INTO public.properties (id, portfolio_id, name, millieme_base)
          VALUES ('56000000-0000-4000-8000-000000000002', '${portfolio}', 'Shared Building', 1000);
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code, millieme_shares)
          VALUES ('56000000-0000-4000-8000-000000000003', '${portfolio}',
            '56000000-0000-4000-8000-000000000002', 'A1', '{"general":100}'::jsonb);
        INSERT INTO public.cost_categories (id, portfolio_id, code, name)
          VALUES ('56000000-0000-4000-8000-000000000004', '${portfolio}', 'INS', 'Insurance');
        INSERT INTO public.allocation_rules (id, portfolio_id, property_id, name)
          VALUES ('56000000-0000-4000-8000-000000000005', '${portfolio}',
            '56000000-0000-4000-8000-000000000002', 'Equal');
        INSERT INTO public.cost_entries (id, portfolio_id, category_id, property_id,
          allocation_rule_id, label, start_date, amount, recovery_type)
          VALUES ('56000000-0000-4000-8000-000000000006', '${portfolio}',
            '56000000-0000-4000-8000-000000000004', '56000000-0000-4000-8000-000000000002',
            '56000000-0000-4000-8000-000000000005', 'Insurance', '2026-01-01', 1000,
            'tenant-recoverable');
        INSERT INTO public.cost_allocation_results (portfolio_id, cost_entry_id, property_id,
          unit_id, allocated_amount, recoverable_amount)
          VALUES ('${portfolio}', '56000000-0000-4000-8000-000000000006',
            '56000000-0000-4000-8000-000000000002',
            '56000000-0000-4000-8000-000000000003', 1000, 1000);
      `);
      const auditSql = await readFile(
        new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8",
      );
      const detailSql = await readFile(
        new URL("../../scripts/audit-cost-allocation-excess.sql", import.meta.url), "utf8",
      );
      const affected = async () => Number((await db.query<{ check_name: string; affected: number }>(auditSql)).rows
        .find(row => row.check_name === "property_cost_overallocated")?.affected);
      expect(await affected()).toBe(0);
      await db.exec(`UPDATE public.properties SET is_partially_owned = true
        WHERE id = '56000000-0000-4000-8000-000000000002'`);
      expect(await affected()).toBe(1);
      expect((await db.query(detailSql)).rows).toMatchObject([{
        property_name: "Shared Building", cost_label: "Insurance", invoice_amount: "1000.00",
        owner_managed_amount: "100.00", allocated_amount: "1000.00",
      }]);
      await db.exec(`UPDATE public.cost_allocation_results
        SET allocated_amount = 100, recoverable_amount = 100
        WHERE cost_entry_id = '56000000-0000-4000-8000-000000000006'`);
      expect(await affected()).toBe(0);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("identifies a paid EUR schedule row alongside an open GBP row on a GBP lease", async () => {
    const db = await migratedDatabase();
    try {
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES ('54000000-0000-4000-8000-000000000001', 'currency-audit@example.test', '{}'::jsonb);
      `);
      const portfolio = (await db.query<{ id: string }>(`
        SELECT id FROM public.portfolios WHERE created_by = '54000000-0000-4000-8000-000000000001'
      `)).rows[0].id;
      await db.exec(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code, currency_code)
          VALUES ('54000000-0000-4000-8000-000000000002', '${portfolio}', 'GBP property', 'GBP-AUDIT', 'GBP');
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, lifecycle_stage, start_date, end_date, monthly_rent)
          VALUES ('54000000-0000-4000-8000-000000000003', '${portfolio}',
            '54000000-0000-4000-8000-000000000002', 'GBP-LEASE',
            '[]'::jsonb, 'draft', '2026-01-01', '2026-12-31', 100);
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('54000000-0000-4000-8000-000000000004', '${portfolio}',
            '54000000-0000-4000-8000-000000000002', 'GBP-UNIT'),
            ('54000000-0000-4000-8000-000000000005', '${portfolio}',
            '54000000-0000-4000-8000-000000000002', 'GBP-MIDMONTH'),
            ('54000000-0000-4000-8000-000000000006', '${portfolio}',
              '54000000-0000-4000-8000-000000000002', 'GBP-ORPHAN'),
            ('54000000-0000-4000-8000-000000000007', '${portfolio}',
              '54000000-0000-4000-8000-000000000002', 'GBP-ALT');
        INSERT INTO public.lease_unit_assignments (portfolio_id, lease_id, unit_id,
          start_date, end_date, rent_share, charges_share)
          VALUES ('${portfolio}', '54000000-0000-4000-8000-000000000003',
            '54000000-0000-4000-8000-000000000004', '2026-01-01', '2026-12-31', 100, 0),
            ('${portfolio}', '54000000-0000-4000-8000-000000000003',
            '54000000-0000-4000-8000-000000000005', '2026-02-10', '2026-12-31', 0, 0);
        INSERT INTO public.lease_unit_assignments (portfolio_id, lease_id, unit_id,
          start_date, end_date, rent_share, charges_share)
          VALUES ('${portfolio}', '54000000-0000-4000-8000-000000000003',
            '54000000-0000-4000-8000-000000000007', '2026-01-01', '2026-12-31', 0, 0);
        ALTER TABLE public.receivable_items DISABLE TRIGGER prevent_duplicate_lease_receivable;
        ALTER TABLE public.receivable_items DISABLE TRIGGER guard_new_lease_schedule_assignment;
        INSERT INTO public.receivable_items (portfolio_id, lease_id, property_id,
          unit_id, item_type, origin, period_month, due_date, currency_code,
          expected_amount, allocated_amount, outstanding_amount, status)
          VALUES
            ('${portfolio}', '54000000-0000-4000-8000-000000000003',
              '54000000-0000-4000-8000-000000000002',
              '54000000-0000-4000-8000-000000000004', 'rent', 'lease-schedule',
              '2026-01', '2026-01-05', 'EUR', 50, 50, 0, 'paid'),
            ('${portfolio}', '54000000-0000-4000-8000-000000000003',
              '54000000-0000-4000-8000-000000000002',
              '54000000-0000-4000-8000-000000000007', 'rent', 'lease-schedule',
              '2026-01', '2026-01-05', 'GBP', 50, 0, 50, 'open');
        INSERT INTO public.receivable_items (portfolio_id, lease_id, property_id,
          unit_id, item_type, origin, period_month, due_date, currency_code,
          expected_amount, allocated_amount, outstanding_amount, status)
          VALUES ('${portfolio}', '54000000-0000-4000-8000-000000000003',
            '54000000-0000-4000-8000-000000000002',
            '54000000-0000-4000-8000-000000000006', 'rent', 'lease-schedule',
            '2026-02', '2026-02-05', 'GBP', 50, 50, 0, 'paid');
        ALTER TABLE public.receivable_items ENABLE TRIGGER guard_new_lease_schedule_assignment;
        INSERT INTO public.receivable_items (portfolio_id, lease_id, property_id,
          unit_id, item_type, origin, period_month, due_date, currency_code,
          expected_amount, allocated_amount, outstanding_amount, status)
          VALUES ('${portfolio}', '54000000-0000-4000-8000-000000000003',
              '54000000-0000-4000-8000-000000000002',
              '54000000-0000-4000-8000-000000000005', 'rent', 'lease-schedule',
              '2026-02', '2026-02-05', 'GBP', 50, 0, 50, 'open');
        ALTER TABLE public.receivable_items ENABLE TRIGGER prevent_duplicate_lease_receivable;
        INSERT INTO public.cash_receipts (portfolio_id, lease_id, property_id,
          payment_date, amount_received, unmatched_amount, currency_code, status)
          VALUES ('${portfolio}', '54000000-0000-4000-8000-000000000003',
            '54000000-0000-4000-8000-000000000002', '2026-01-05',
            20, 20, 'EUR', 'unmatched');
      `);
      const auditSql = await readFile(
        new URL("../../scripts/audit-financial-consistency.sql", import.meta.url), "utf8",
      );
      const results = (await db.query<{ check_name: string; affected: number }>(auditSql)).rows;
      const counts = new Map(results.map(result => [result.check_name, Number(result.affected)]));
      expect(counts.get("duplicate_lease_schedule_rows")).toBe(2);
      expect(counts.get("cross_currency_schedule_slots")).toBe(1);
      expect(counts.get("lease_schedule_missing_cycle_metadata")).toBe(4);
      const duplicateSql = await readFile(
        new URL("../../scripts/audit-duplicate-lease-billing-slots.sql", import.meta.url), "utf8",
      );
      const duplicateDetails = (await db.query<{
        unit_code: string; currency_code: string; period_month: string; receipt_allocation_count: number;
      }>(duplicateSql)).rows;
      expect(duplicateDetails).toHaveLength(4);
      expect(duplicateDetails.filter(row => row.period_month === "2026-01")
        .map(row => [row.unit_code, row.currency_code]).sort((a, b) => a[0].localeCompare(b[0])))
        .toEqual([["GBP-ALT", "GBP"], ["GBP-UNIT", "EUR"]]);
      expect(duplicateDetails.every(row => Number(row.receipt_allocation_count) === 0)).toBe(true);
      expect(counts.get("lease_schedule_without_plausible_assignment")).toBe(1);
      expect(counts.get("receivable_property_currency_mismatch")).toBe(1);
      expect(counts.get("receipt_property_currency_mismatch")).toBe(1);
      const detailSql = await readFile(
        new URL("../../scripts/audit-currency-anomalies.sql", import.meta.url), "utf8",
      );
      const details = (await db.query<{ source: string; lease_reference: string }>(detailSql)).rows;
      expect(details.map(row => row.source).sort()).toEqual(["receipt", "receivable"]);
      expect(details.every(row => row.lease_reference === "GBP-LEASE")).toBe(true);
      const exposureSql = await readFile(
        new URL("../../scripts/audit-currency-exposure-summary.sql", import.meta.url), "utf8",
      );
      const exposure = (await db.query<{
        source: string; record_currency: string; status: string; rows: number;
      }>(exposureSql)).rows;
      expect(exposure.map(row => [row.source, row.record_currency, row.status, Number(row.rows)])).toEqual([
        ["receipt", "EUR", "unmatched", 1],
        ["receivable", "EUR", "paid", 1],
        ["receivable", "GBP", "open", 2],
        ["receivable", "GBP", "paid", 1],
      ]);
      const assignmentSql = await readFile(
        new URL("../../scripts/audit-lease-schedule-unit-windows.sql", import.meta.url), "utf8",
      );
      const assignmentDetails = (await db.query<{ unit_code: string }>(assignmentSql)).rows;
      expect(assignmentDetails.map(row => row.unit_code)).toEqual(["GBP-ORPHAN"]);

      await db.exec(`
        ALTER TABLE public.receivable_items DISABLE TRIGGER guard_new_lease_schedule_assignment;
        INSERT INTO public.receivable_items (portfolio_id, lease_id, property_id,
          unit_id, item_type, origin, period_month, due_date, currency_code,
          expected_amount, allocated_amount, outstanding_amount, status)
        VALUES
          ('${portfolio}', '54000000-0000-4000-8000-000000000003',
            '54000000-0000-4000-8000-000000000002',
            '54000000-0000-4000-8000-000000000004', 'advance-payment',
            'lease-schedule', '2026-01', '2025-12-20', 'GBP', 50, 50, 0, 'paid'),
          ('${portfolio}', '54000000-0000-4000-8000-000000000003',
            '54000000-0000-4000-8000-000000000002',
            '54000000-0000-4000-8000-000000000004', 'deposit',
            'lease-schedule', NULL, '2025-12-20', 'GBP', 50, 50, 0, 'paid');
        ALTER TABLE public.receivable_items ENABLE TRIGGER guard_new_lease_schedule_assignment;
      `);
      const afterPreleasePayments = (await db.query<{ check_name: string; affected: number }>(auditSql)).rows;
      expect(afterPreleasePayments.find(row => row.check_name === "lease_schedule_without_plausible_assignment")?.affected).toBe(1);
      expect((await db.query<{ unit_code: string }>(assignmentSql)).rows.map(row => row.unit_code))
        .toEqual(["GBP-ORPHAN"]);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("rejects orphaned or wrong-currency schedule rows while allowing historical payment updates", async () => {
    const db = await migratedDatabase();
    try {
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES ('55000000-0000-4000-8000-000000000001', 'schedule-window@example.test', '{}'::jsonb);
      `);
      const portfolio = (await db.query<{ id: string }>(`
        SELECT id FROM public.portfolios WHERE created_by = '55000000-0000-4000-8000-000000000001'
      `)).rows[0].id;
      await db.exec(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('55000000-0000-4000-8000-000000000002', '${portfolio}', 'Schedule property', 'SCHED');
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('55000000-0000-4000-8000-000000000003', '${portfolio}',
            '55000000-0000-4000-8000-000000000002', 'SCHED-1');
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code, unit_type)
          VALUES ('55000000-0000-4000-8000-000000000010', '${portfolio}',
            '55000000-0000-4000-8000-000000000002', 'PARK-1', 'parking');
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, lifecycle_stage, start_date, end_date, monthly_rent)
          VALUES ('55000000-0000-4000-8000-000000000004', '${portfolio}',
            '55000000-0000-4000-8000-000000000002', 'SCHED-LEASE',
            '[]'::jsonb, 'draft', '2026-02-10', '2026-12-31', 100);
        INSERT INTO public.lease_unit_assignments (id, portfolio_id, lease_id, unit_id,
          start_date, end_date, rent_share, charges_share)
          VALUES ('55000000-0000-4000-8000-000000000005', '${portfolio}',
            '55000000-0000-4000-8000-000000000004',
            '55000000-0000-4000-8000-000000000003', '2026-02-10', '2026-12-31', 100, 0);
        INSERT INTO public.lease_unit_assignments (id, portfolio_id, lease_id, unit_id,
          start_date, end_date, rent_share, charges_share)
          VALUES ('55000000-0000-4000-8000-000000000011', '${portfolio}',
            '55000000-0000-4000-8000-000000000004',
            '55000000-0000-4000-8000-000000000010', '2026-02-10', '2026-12-31', 0, 0);
      `);
      const insert = (id: string, dueDate: string, origin = "lease-schedule", unitId: string | null = "55000000-0000-4000-8000-000000000003", currencyCode = "EUR") => db.query(`
        INSERT INTO public.receivable_items (id, portfolio_id, lease_id, property_id,
          unit_id, item_type, origin, period_month, due_date, currency_code,
          expected_amount, allocated_amount, outstanding_amount, status)
        VALUES ($1::uuid, $2::uuid, '55000000-0000-4000-8000-000000000004',
          '55000000-0000-4000-8000-000000000002', $3::uuid, 'rent', $4,
          left($5, 7), $5::date, $6, 100, 0, 100, 'open')
      `, [id, portfolio, unitId, origin, dueDate, currencyCode]);

      await expect(insert("55000000-0000-4000-8000-000000000006", "2026-01-05"))
        .rejects.toThrow("no matching lease assignment");
      await expect(insert("55000000-0000-4000-8000-000000000007", "2026-02-05", "lease-schedule", null))
        .rejects.toThrow("requires a lease, unit, and due date");
      await insert("55000000-0000-4000-8000-000000000008", "2026-01-05", "manual");
      await insert("55000000-0000-4000-8000-00000000000c", "2026-01-05", "manual", undefined, "GBP");
      await expect(insert("55000000-0000-4000-8000-00000000000d", "2026-02-05", "lease-schedule", undefined, "GBP"))
        .rejects.toThrow("currency must match its property currency");
      await expect(insert("55000000-0000-4000-8000-000000000012", "2026-03-05", "lease-schedule", "55000000-0000-4000-8000-000000000010"))
        .rejects.toThrow("must be attributed to a main unit");
      await insert("55000000-0000-4000-8000-000000000009", "2026-02-05");
      await db.exec("ALTER TABLE public.receivable_items DISABLE TRIGGER guard_new_lease_schedule_assignment");
      await insert("55000000-0000-4000-8000-000000000012", "2026-03-05", "lease-schedule", "55000000-0000-4000-8000-000000000010");
      await db.exec("ALTER TABLE public.receivable_items ENABLE TRIGGER guard_new_lease_schedule_assignment");
      await db.exec(`UPDATE public.receivable_items SET notes = 'Legacy anchor reviewed'
        WHERE id = '55000000-0000-4000-8000-000000000012'`);
      await expect(db.exec(`UPDATE public.receivable_items SET currency_code = 'GBP'
        WHERE id = '55000000-0000-4000-8000-000000000009'`))
        .rejects.toThrow("currency must match its property currency");
      await db.exec("ALTER TABLE public.lease_unit_assignments DISABLE TRIGGER guard_lease_assignment_totals_on_assignment");
      await expect(db.exec(`UPDATE public.lease_unit_assignments SET start_date = '2026-03-01'
        WHERE id = '55000000-0000-4000-8000-000000000005'`))
        .rejects.toThrow("cannot be detached");
      // Recreate a pre-guard legacy orphan to verify payment-only updates stay possible.
      await db.exec("ALTER TABLE public.lease_unit_assignments DISABLE TRIGGER guard_retained_lease_receivable_assignment");
      await db.exec(`UPDATE public.lease_unit_assignments SET start_date = '2026-03-01'
        WHERE id = '55000000-0000-4000-8000-000000000005'`);
      await db.exec("ALTER TABLE public.lease_unit_assignments ENABLE TRIGGER guard_retained_lease_receivable_assignment");
      await db.exec("ALTER TABLE public.lease_unit_assignments ENABLE TRIGGER guard_lease_assignment_totals_on_assignment");
      await db.exec(`UPDATE public.receivable_items SET allocated_amount = 100,
        outstanding_amount = 0, status = 'paid'
        WHERE id = '55000000-0000-4000-8000-000000000009'`);
      await expect(db.query(`
        UPDATE public.receivable_items SET due_date = '2026-01-05'
        WHERE id = '55000000-0000-4000-8000-000000000009'
      `)).rejects.toThrow("no matching lease assignment");
      expect((await db.query<{ status: string }>(`
        SELECT status FROM public.receivable_items
        WHERE id = '55000000-0000-4000-8000-000000000009'
      `)).rows[0].status).toBe("paid");
      await db.exec(`
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      await db.query("SELECT set_config('test.user_id', $1, false)", ["55000000-0000-4000-8000-000000000001"]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(insert("55000000-0000-4000-8000-00000000000a", "2026-01-05"))
          .rejects.toThrow("permission denied for table receivable_items");
        await expect(insert("55000000-0000-4000-8000-00000000000e", "2026-03-05", "lease-schedule", undefined, "GBP"))
          .rejects.toThrow("permission denied for table receivable_items");
      } finally {
        await db.exec("RESET ROLE");
      }
      await expect(db.exec(`UPDATE public.properties SET currency_code = 'GBP'
        WHERE id = '55000000-0000-4000-8000-000000000002'`))
        .rejects.toThrow("Property currency cannot change");
      await db.exec(`UPDATE public.receivable_items SET notes = 'Reviewed historical payment'
        WHERE id = '55000000-0000-4000-8000-000000000009'`);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("normalizes legacy amendment unit references while protecting applied history", async () => {
    const ids = {
      user: "49000000-0000-4000-8000-000000000001",
      property: "49000000-0000-4000-8000-000000000002",
      otherProperty: "49000000-0000-4000-8000-000000000003",
      unit: "49000000-0000-4000-8000-000000000004",
      otherUnit: "49000000-0000-4000-8000-000000000005",
      addedUnit: "49000000-0000-4000-8000-00000000000a",
      tenant: "49000000-0000-4000-8000-000000000006",
      lease: "49000000-0000-4000-8000-000000000007",
      amendment: "49000000-0000-4000-8000-000000000008",
      change: "49000000-0000-4000-8000-000000000009",
    };
    const db = await migratedDatabase(async (database, name) => {
      if (name !== "20261018232000_guard_charges_reconciliation_periods.sql") return;
      await database.exec(`INSERT INTO auth.users (id,email,raw_user_meta_data)
        VALUES ('${ids.user}','legacy-unit@example.test','{}'::jsonb)`);
      const portfolio = (await database.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.user],
      )).rows[0].id;
      await database.exec(`
        INSERT INTO public.properties (id,portfolio_id,name,reference_code)
          VALUES ('${ids.property}','${portfolio}','Lease property','AM-UNIT'),
            ('${ids.otherProperty}','${portfolio}','Other property','AM-OTHER');
        INSERT INTO public.units (id,portfolio_id,property_id,unit_code,legacy_id)
          VALUES ('${ids.unit}','${portfolio}','${ids.property}','UNIT-1','u10'),
            ('${ids.otherUnit}','${portfolio}','${ids.otherProperty}','UNIT-2','u11'),
            ('${ids.addedUnit}','${portfolio}','${ids.property}','UNIT-3','u12');
        INSERT INTO public.tenants (id,portfolio_id,first_name)
          VALUES ('${ids.tenant}','${portfolio}','Legacy');
        INSERT INTO public.leases (id,portfolio_id,property_id,lease_reference,
          tenant_ids,billing_tenant_id,lifecycle_stage,start_date,end_date)
          VALUES ('${ids.lease}','${portfolio}','${ids.property}','AM-LEASE',
            '["${ids.tenant}"]'::jsonb,'${ids.tenant}','draft','2026-01-01','2027-12-31');
        INSERT INTO public.lease_unit_assignments
          (portfolio_id,lease_id,unit_id,start_date,end_date,rent_share,charges_share)
          VALUES ('${portfolio}','${ids.lease}','${ids.unit}',
            '2026-01-01','2027-12-31',100,0);
        INSERT INTO public.lease_amendments
          (id,portfolio_id,lease_id,amendment_number,effective_date,status)
          VALUES ('${ids.amendment}','${portfolio}','${ids.lease}',1,'2026-07-01','draft');
        INSERT INTO public.lease_amendment_changes
          (id,portfolio_id,amendment_id,field_name,change_type,metadata,old_value)
          VALUES ('${ids.change}','${portfolio}','${ids.amendment}',
            'unitAssignments','remove','{"unitId":"u10"}'::jsonb,
            '{"unitId":"u10"}'::jsonb);
        UPDATE public.lease_amendments SET status = 'active' WHERE id = '${ids.amendment}';
      `);
    });
    try {
      const row = (await db.query<{ metadata: { unitId: string }; old_value: { unitId: string } }>(
        "SELECT metadata, old_value FROM public.lease_amendment_changes WHERE id = $1::uuid", [ids.change],
      )).rows[0];
      expect(row.metadata.unitId).toBe(ids.unit);
      expect(row.old_value.unitId).toBe(ids.unit);
      await db.exec(`INSERT INTO public.receivable_items
        (portfolio_id, lease_id, property_id, unit_id, item_type, origin,
          period_month, due_date, currency_code, expected_amount,
          allocated_amount, outstanding_amount, status)
        SELECT l.portfolio_id, l.id, l.property_id, '${ids.unit}',
          'rent', 'lease-schedule', '2026-08', '2026-08-01', 'EUR', 100, 0, 100, 'open'
        FROM public.leases l WHERE l.id = '${ids.lease}'`);
      const amendmentAudit = await readFile(
        new URL("../../scripts/audit-amendment-assignment-consistency.sql", import.meta.url), "utf8",
      );
      const findings = (await db.query<{
        issue: string; assignment_windows: string; schedule_rows_after: number;
        outstanding_after: number; allocated_after: number;
      }>(amendmentAudit)).rows;
      expect(findings).toMatchObject([{
        issue: "removed_unit_still_assigned",
        assignment_windows: "2026-01-01 to 2027-12-31",
      }]);
      expect(Number(findings[0].schedule_rows_after)).toBe(1);
      expect(Number(findings[0].outstanding_after)).toBe(100);
      expect(Number(findings[0].allocated_after)).toBe(0);
      await expect(db.query(
        "UPDATE public.lease_amendment_changes SET metadata = metadata WHERE id = $1::uuid", [ids.change],
      )).rejects.toThrow("Changes to an applied amendment cannot be edited");

      await db.query("UPDATE public.lease_amendments SET status = 'ended' WHERE id = $1::uuid", [ids.amendment]);
      await db.query("INSERT INTO public.lease_amendments (portfolio_id,lease_id,amendment_number,effective_date,status) SELECT portfolio_id,lease_id,2,'2026-09-01','draft' FROM public.lease_amendments WHERE id = $1::uuid", [ids.amendment]);
      const draft = (await db.query<{ id: string; portfolio_id: string }>(
        "SELECT id,portfolio_id FROM public.lease_amendments WHERE lease_id = $1::uuid AND amendment_number = 2", [ids.lease],
      )).rows[0];
      for (const badUnit of ["u10", ids.otherUnit]) {
        await expect(db.query(
          "INSERT INTO public.lease_amendment_changes (portfolio_id,amendment_id,field_name,metadata) VALUES ($1::uuid,$2::uuid,'unitRentShare',jsonb_build_object('unitId',$3::text))",
          [draft.portfolio_id, draft.id, badUnit],
        )).rejects.toThrow("Amendment unit reference must use a unit in the lease property");
      }
      await db.query(
        "INSERT INTO public.lease_amendment_changes (portfolio_id,amendment_id,field_name,change_type,metadata) VALUES ($1::uuid,$2::uuid,'unitAssignments','add',jsonb_build_object('unitId',$3::text))",
        [draft.portfolio_id, draft.id, ids.addedUnit],
      );
      await db.query("UPDATE public.lease_amendments SET status = 'active' WHERE id = $1::uuid", [draft.id]);
      expect((await db.query<{ issue: string }>(amendmentAudit)).rows.map(row => row.issue).sort()).toEqual([
        "missing_added_assignment", "removed_unit_still_assigned",
      ]);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("refuses legacy amendment metadata that cannot resolve to a lease unit", async () => {
    await expect(migratedDatabase(async (database, name) => {
      if (name !== "20261018232000_guard_charges_reconciliation_periods.sql") return;
      const user = "4a000000-0000-4000-8000-000000000001";
      await database.exec(`INSERT INTO auth.users (id,email,raw_user_meta_data)
        VALUES ('${user}','unresolved-unit@example.test','{}'::jsonb)`);
      const portfolio = (await database.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [user],
      )).rows[0].id;
      await database.exec(`
        INSERT INTO public.properties (portfolio_id,name,reference_code)
          VALUES ('${portfolio}','Lease property','AM-MISSING');
        INSERT INTO public.tenants (portfolio_id,first_name)
          VALUES ('${portfolio}','Legacy');
        INSERT INTO public.leases (portfolio_id,property_id,lease_reference,
          tenant_ids,billing_tenant_id,lifecycle_stage,start_date,end_date)
          SELECT '${portfolio}',p.id,'AM-MISSING-LEASE',
            jsonb_build_array(t.id::text),t.id,'draft','2026-01-01','2027-12-31'
          FROM public.properties p CROSS JOIN public.tenants t
          WHERE p.reference_code = 'AM-MISSING' AND t.portfolio_id = '${portfolio}';
        INSERT INTO public.lease_amendments
          (portfolio_id,lease_id,amendment_number,effective_date,status)
          SELECT '${portfolio}',id,1,'2026-07-01','draft'
          FROM public.leases WHERE lease_reference = 'AM-MISSING-LEASE';
        INSERT INTO public.lease_amendment_changes
          (portfolio_id,amendment_id,field_name,change_type,metadata)
          SELECT '${portfolio}',id,'unitAssignments','add','{"unitId":"missing"}'::jsonb
          FROM public.lease_amendments WHERE lease_id IN
            (SELECT id FROM public.leases WHERE lease_reference = 'AM-MISSING-LEASE');
      `);
    })).rejects.toThrow("Amendment unit reference is missing, ambiguous, or outside the lease property");
  }, 120_000);

  it("backfills and validates property business time zones", async () => {
    const user = "48000000-0000-4000-8000-000000000001";
    const france = "48000000-0000-4000-8000-000000000002";
    const britain = "48000000-0000-4000-8000-000000000003";
    const db = await migratedDatabase(async (database, name) => {
      if (name !== "20261018220000_harden_legacy_definer_helpers.sql") return;
      await database.exec(`INSERT INTO auth.users(id,email,raw_user_meta_data)
        VALUES ('${user}', 'time-zone@example.test', '{}'::jsonb)`);
      const portfolio = (await database.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [user],
      )).rows[0].id;
      await database.exec(`
        INSERT INTO public.properties(id,portfolio_id,name,reference_code,country_code)
          VALUES ('${france}','${portfolio}','France','TZ-FR','FR');
        INSERT INTO public.properties(id,portfolio_id,name,reference_code,country_code)
          VALUES ('${britain}','${portfolio}','Britain','TZ-GB','GB');
      `);
    });
    try {
      expect((await db.query<{ country_code: string; time_zone: string }>(
        "SELECT country_code, time_zone FROM public.properties WHERE id IN ($1::uuid, $2::uuid) ORDER BY country_code",
        [france, britain],
      )).rows).toEqual([
        { country_code: "FR", time_zone: "Europe/Paris" },
        { country_code: "GB", time_zone: "Europe/London" },
      ]);
      await expect(db.query(
        "UPDATE public.properties SET time_zone = 'not/a-zone' WHERE id = $1::uuid", [france],
      )).rejects.toThrow("valid IANA time zone");
      await db.query("UPDATE public.properties SET time_zone = 'Atlantic/Canary' WHERE id = $1::uuid", [france]);
      expect((await db.query<{ time_zone: string }>(
        "SELECT time_zone FROM public.properties WHERE id = $1::uuid", [france],
      )).rows[0].time_zone).toBe("Atlantic/Canary");
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [user],
      )).rows[0].id;
      const direct = "48000000-0000-4000-8000-000000000004";
      await db.query(`INSERT INTO public.properties(id,portfolio_id,name,reference_code,country_code)
        VALUES ($1::uuid,$2::uuid,'Direct insert','TZ-DIRECT','GB')`, [direct, portfolio]);
      expect((await db.query<{ time_zone: string }>(
        "SELECT time_zone FROM public.properties WHERE id = $1::uuid", [direct],
      )).rows[0].time_zone).toBe("Europe/London");
    } finally {
      await db.close();
    }
  }, 120_000);

  it("refuses to install lease property guards over inconsistent historical links", async () => {
    await expect(migratedDatabase(async (db, name) => {
      if (name !== "20261018160000_atomic_lease_assignment_edit.sql") return;
      const user = "44000000-0000-4000-8000-000000000001";
      const propertyA = "44000000-0000-4000-8000-000000000002";
      const propertyB = "44000000-0000-4000-8000-000000000003";
      const unit = "44000000-0000-4000-8000-000000000004";
      const tenant = "44000000-0000-4000-8000-000000000005";
      const lease = "44000000-0000-4000-8000-000000000006";
      await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('${user}', 'historical-link@example.test', '{}'::jsonb)`);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [user],
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${propertyA}', '${portfolio}', 'Lease property', 'LP'),
            ('${propertyB}', '${portfolio}', 'Unit property', 'UP');
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('${unit}', '${portfolio}', '${propertyB}', 'UP-1');
        INSERT INTO public.tenants (id, portfolio_id, first_name)
          VALUES ('${tenant}', '${portfolio}', 'Historical');
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, billing_tenant_id, lifecycle_stage, start_date, end_date)
          VALUES ('${lease}', '${portfolio}', '${propertyA}', 'LP-1',
            '["${tenant}"]'::jsonb, '${tenant}', 'draft', '2026-01-01', '2026-12-31');
        INSERT INTO public.lease_unit_assignments
          (id, portfolio_id, lease_id, unit_id, start_date, rent_share, charges_share)
          VALUES ('44000000-0000-4000-8000-000000000007', '${portfolio}', '${lease}',
            '${unit}', '2026-01-01', 100, 0);
      `);
    })).rejects.toThrow("Existing lease assignments cross a property or portfolio");
  }, 120_000);

  it("deletes only current draft amendments while preserving applied history", async () => {
    const db = await migratedDatabase();
    const ids = {
      user: "45000000-0000-4000-8000-000000000001",
      property: "45000000-0000-4000-8000-000000000002",
      tenant: "45000000-0000-4000-8000-000000000003",
      lease: "45000000-0000-4000-8000-000000000004",
      draft: "45000000-0000-4000-8000-000000000005",
      active: "45000000-0000-4000-8000-000000000006",
      change: "45000000-0000-4000-8000-000000000007",
      activeChange: "45000000-0000-4000-8000-000000000008",
    };
    try {
      await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('${ids.user}', 'delete-draft@example.test', '{}'::jsonb)`);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.user],
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${ids.property}', '${portfolio}', 'Amendment deletion', 'AD');
        INSERT INTO public.tenants (id, portfolio_id, first_name)
          VALUES ('${ids.tenant}', '${portfolio}', 'Draft');
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, billing_tenant_id, lifecycle_stage, start_date, end_date)
          VALUES ('${ids.lease}', '${portfolio}', '${ids.property}', 'AD-LEASE',
            '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'draft', '2026-01-01', '2026-12-31');
        INSERT INTO public.lease_amendments
          (id, portfolio_id, lease_id, amendment_number, effective_date, status)
          VALUES ('${ids.draft}', '${portfolio}', '${ids.lease}', 1, '2026-06-01', 'draft'),
            ('${ids.active}', '${portfolio}', '${ids.lease}', 2, '2026-07-01', 'draft');
        INSERT INTO public.lease_amendment_changes
          (id, portfolio_id, amendment_id, field_name, change_type)
          VALUES ('${ids.change}', '${portfolio}', '${ids.draft}', 'clauseSummary', 'set'),
            ('${ids.activeChange}', '${portfolio}', '${ids.active}', 'clauseSummary', 'set');
        UPDATE public.lease_amendments SET status = 'active' WHERE id = '${ids.active}';
      `);
      let draftVersion = (await db.query<{ updated_at: string }>(
        "SELECT updated_at FROM public.lease_amendments WHERE id = $1::uuid", [ids.draft],
      )).rows[0].updated_at;
      const activeVersion = (await db.query<{ updated_at: string }>(
        "SELECT updated_at FROM public.lease_amendments WHERE id = $1::uuid", [ids.active],
      )).rows[0].updated_at;
      await db.exec(`
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
        INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES ('45000000-0000-4000-8000-000000000009', 'amendment-viewer@example.test', '{}'::jsonb);
        INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
          VALUES ('${portfolio}', '45000000-0000-4000-8000-000000000009', 'viewer');
      `);
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.user]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(db.query(
          "UPDATE public.lease_amendments SET status = 'active' WHERE id = $1::uuid", [ids.draft],
        )).rejects.toThrow("permission denied");
        await expect(db.query(
          "INSERT INTO public.lease_amendments (portfolio_id, lease_id, amendment_number, effective_date, status) VALUES ($1::uuid, $2::uuid, 3, '2027-01-01', 'active')",
          [portfolio, ids.lease],
        )).rejects.toThrow("permission denied");
        await expect(db.query(
          "DELETE FROM public.lease_amendment_changes WHERE id = $1::uuid", [ids.change],
        )).rejects.toThrow("permission denied");
        await expect(db.query(
          "SELECT public.save_amendment_with_changes('{}'::jsonb, '[]'::jsonb, NULL)",
        )).rejects.toThrow("permission denied");
        await expect(db.query(
          "SELECT public.activate_amendment_with_schedule($1::uuid, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, now())",
          [ids.draft],
        )).rejects.toThrow("permission denied");
        const scheduled = (await db.query<{ result: { status: string; updated_at: string } }>(
          "SELECT public.change_amendment_status($1::uuid, $2::uuid, $3::timestamptz, 'scheduled') AS result",
          [ids.draft, portfolio, draftVersion],
        )).rows[0].result;
        expect(scheduled.status).toBe("scheduled");
        await expect(db.query(
          "SELECT public.change_amendment_status($1::uuid, $2::uuid, $3::timestamptz, 'active')",
          [ids.draft, portfolio, scheduled.updated_at],
        )).rejects.toThrow("Only draft and scheduled amendments can change status directly");
        const restored = (await db.query<{ result: { status: string; updated_at: string } }>(
          "SELECT public.change_amendment_status($1::uuid, $2::uuid, $3::timestamptz, 'draft') AS result",
          [ids.draft, portfolio, scheduled.updated_at],
        )).rows[0].result;
        expect(restored.status).toBe("draft");
        draftVersion = restored.updated_at;
        const draftRow = (await db.query<{ data: Record<string, unknown> }>(
          "SELECT to_jsonb(a) AS data FROM public.lease_amendments AS a WHERE id = $1::uuid",
          [ids.draft],
        )).rows[0].data;
        const changeRow = (await db.query<{ data: Record<string, unknown> }>(
          "SELECT to_jsonb(c) AS data FROM public.lease_amendment_changes AS c WHERE id = $1::uuid",
          [ids.change],
        )).rows[0].data;
        const edited = (await db.query<{ result: { amendment: { title: string; updated_at: string }; changes: unknown[] } }>(
          "SELECT public.client_save_amendment_with_changes($1::jsonb, $2::jsonb, $3::timestamptz) AS result",
          [JSON.stringify({ ...draftRow, title: "Edited draft" }), JSON.stringify([changeRow]), draftVersion],
        )).rows[0].result;
        expect(edited.amendment.title).toBe("Edited draft");
        expect(edited.changes).toHaveLength(1);
        draftVersion = edited.amendment.updated_at;
        await db.query("SELECT set_config('test.user_id', $1, false)", ["45000000-0000-4000-8000-000000000009"]);
        await expect(db.query(
          "SELECT public.change_amendment_status($1::uuid, $2::uuid, $3::timestamptz, 'scheduled')",
          [ids.draft, portfolio, draftVersion],
        )).rejects.toThrow("Amendment status change is not permitted");
        await expect(db.query(
          "SELECT public.client_save_amendment_with_changes($1::jsonb, '[]'::jsonb, $2::timestamptz)",
          [JSON.stringify(draftRow), draftVersion],
        )).rejects.toThrow("Amendment write is not permitted");
        await db.query("SELECT set_config('test.user_id', $1, false)", [ids.user]);
        await expect(db.query(
          "DELETE FROM public.lease_amendments WHERE id = $1::uuid", [ids.draft],
        )).rejects.toThrow("permission denied");
        await expect(db.query(
          "SELECT public.delete_draft_amendment($1::uuid, $2::uuid, $3::timestamptz)",
          [ids.draft, portfolio, "2020-01-01T00:00:00Z"],
        )).rejects.toThrow("changed since it was opened");
        await expect(db.query(
          "SELECT public.delete_draft_amendment($1::uuid, $2::uuid, $3::timestamptz)",
          [ids.active, portfolio, activeVersion],
        )).rejects.toThrow("Only draft amendments can be deleted");
        const deleted = (await db.query<{ result: { amendment_id: string } }>(
          "SELECT public.delete_draft_amendment($1::uuid, $2::uuid, $3::timestamptz) AS result",
          [ids.draft, portfolio, draftVersion],
        )).rows[0].result;
        expect(deleted.amendment_id).toBe(ids.draft);
      } finally {
        await db.exec("RESET ROLE");
      }
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.lease_amendment_changes WHERE amendment_id = $1::uuid",
        [ids.draft],
      )).rows[0].n).toBe(0);
      await expect(db.query(
        "DELETE FROM public.lease_amendments WHERE id = $1::uuid", [ids.active],
      )).rejects.toThrow("Only draft amendments can be deleted");
      await expect(db.query(
        "UPDATE public.lease_amendments SET status = 'draft' WHERE id = $1::uuid", [ids.active],
      )).rejects.toThrow("Applied amendments cannot return to draft");
      await expect(db.query(
        "UPDATE public.lease_amendments SET title = 'Rewritten' WHERE id = $1::uuid", [ids.active],
      )).rejects.toThrow("Applied amendments cannot return to draft or change their terms");
      await expect(db.query(
        "DELETE FROM public.lease_amendment_changes WHERE id = $1::uuid", [ids.activeChange],
      )).rejects.toThrow("Changes to an applied amendment cannot be edited or deleted");
      await expect(db.query(
        "UPDATE public.lease_amendment_changes SET new_value = '\"changed\"'::jsonb WHERE id = $1::uuid",
        [ids.activeChange],
      )).rejects.toThrow("Changes to an applied amendment cannot be edited or deleted");
      await expect(db.query(
        "DELETE FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rejects.toThrow("Only draft amendments can be deleted");
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rows[0].n).toBe(1);
      await db.query("DELETE FROM public.portfolios WHERE id = $1::uuid", [portfolio]);
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.lease_amendments WHERE id = $1::uuid", [ids.active],
      )).rows[0].n).toBe(0);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("saves contractual documents and lease signature transitions in one transaction", async () => {
    const db = await migratedDatabase();
    const ids = {
      user: "46000000-0000-4000-8000-000000000001",
      viewer: "46000000-0000-4000-8000-000000000002",
      property: "46000000-0000-4000-8000-000000000003",
      tenant: "46000000-0000-4000-8000-000000000004",
      lease: "46000000-0000-4000-8000-000000000005",
      unit: "46000000-0000-4000-8000-000000000009",
      initial: "46000000-0000-4000-8000-000000000006",
      duplicate: "46000000-0000-4000-8000-000000000007",
      amendment: "46000000-0000-4000-8000-000000000008",
    };
    try {
      await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
        ('${ids.user}', 'contract-owner@example.test', '{}'::jsonb),
        ('${ids.viewer}', 'contract-viewer@example.test', '{}'::jsonb)`);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.user],
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
          VALUES ('${portfolio}', '${ids.viewer}', 'viewer');
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${ids.property}', '${portfolio}', 'Contracts', 'CTR');
        INSERT INTO public.tenants (id, portfolio_id, first_name)
          VALUES ('${ids.tenant}', '${portfolio}', 'Tenant');
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, billing_tenant_id, lifecycle_stage, start_date, end_date)
          VALUES ('${ids.lease}', '${portfolio}', '${ids.property}', 'CTR-1',
            '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'draft', '2099-01-01', '2099-12-31');
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('${ids.unit}', '${portfolio}', '${ids.property}', 'CTR-UNIT');
        INSERT INTO public.lease_unit_assignments (portfolio_id, lease_id, unit_id,
          start_date, end_date, rent_share, charges_share)
          VALUES ('${portfolio}', '${ids.lease}', '${ids.unit}', '2099-01-01', '2099-12-31', 0, 0);
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      const path = (id: string) => `${portfolio}/${ids.lease}/${id}/contract.pdf`;
      for (const id of [ids.initial, ids.duplicate, ids.amendment]) {
        await db.query(
          "INSERT INTO storage.objects (id, bucket_id, name) VALUES ($1::uuid, 'lease-documents', $2)",
          [id, path(id)],
        );
      }
      const payload = (id: string, type: string, status = "signed") => ({
        id, portfolio_id: portfolio, lease_id: ids.lease, document_type: type,
        status, signed_date: status === "signed" ? "2026-10-18" : null,
        title: type, document_date: "2026-10-18", storage_path: path(id),
        original_filename: "contract.pdf", mime_type: "application/pdf", size_bytes: 100,
      });
      const document = async (id: string) => (await db.query<{
        status: string; updated_at: string;
      }>("SELECT status, updated_at FROM public.lease_documents WHERE id = $1::uuid", [id])).rows[0];
      const lease = async () => (await db.query<{ lifecycle_stage: string; signed_date: string | null }>(
        "SELECT lifecycle_stage, signed_date::text FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rows[0];
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.user]);
      await db.exec("SET ROLE authenticated");
      await expect(db.query(
        "INSERT INTO public.lease_documents (id, portfolio_id, lease_id, document_type, status, signed_date, title, document_date, storage_path, original_filename) VALUES ($1::uuid, $2::uuid, $3::uuid, 'initial-contract', 'signed', '2026-10-18', 'Direct', '2026-10-18', $4, 'contract.pdf')",
        [ids.initial, portfolio, ids.lease, path(ids.initial)],
      )).rejects.toThrow("guarded document transaction");
      const created = (await db.query<{ result: { document: { status: string }; lease: { lifecycle_stage: string } } }>(
        "SELECT public.create_contract_document($1::jsonb) AS result",
        [JSON.stringify(payload(ids.initial, "initial-contract"))],
      )).rows[0].result;
      expect(created.document.status).toBe("signed");
      expect(created.lease.lifecycle_stage).toBe("signed");
      expect((await lease()).signed_date).toBe("2026-10-18");
      await expect(db.query("SELECT public.create_contract_document($1::jsonb)",
        [JSON.stringify(payload(ids.duplicate, "initial-contract"))])).rejects.toThrow("duplicate key");
      await expect(db.query(
        "UPDATE public.lease_documents SET status = 'validated', signed_date = NULL WHERE id = $1::uuid",
        [ids.initial],
      )).rejects.toThrow("guarded document transaction");
      let version = (await document(ids.initial)).updated_at;
      const changeStatus = (status: string, signedDate: string | null, keep: boolean | null, expected = version) =>
        db.query<{ result: { document: { status: string; updated_at: string }; lease: { lifecycle_stage: string } } }>(
          "SELECT public.change_contract_document_status($1::uuid, $2::uuid, $3::timestamptz, $4, $5::date, $6) AS result",
          [ids.initial, portfolio, expected, status, signedDate, keep],
        );
      await expect(changeStatus("validated", null, null)).rejects.toThrow("Choose whether to keep");
      expect((await document(ids.initial)).status).toBe("signed");
      const kept = (await changeStatus("validated", null, true)).rows[0].result;
      version = kept.document.updated_at;
      expect(kept.lease.lifecycle_stage).toBe("signed");
      await expect(changeStatus("signed", "2026-10-18", null, "2020-01-01T00:00:00Z"))
        .rejects.toThrow("changed since it was opened");
      const signedAgain = (await changeStatus("signed", "2026-10-18", null)).rows[0].result;
      version = signedAgain.document.updated_at;
      const reverted = (await changeStatus("validated", null, false)).rows[0].result;
      version = reverted.document.updated_at;
      expect(reverted.lease.lifecycle_stage).toBe("pending-signature");
      expect((await lease()).signed_date).toBeNull();
      const amendmentResult = (await db.query<{ result: { lease: { lifecycle_stage: string } } }>(
        "SELECT public.create_contract_document($1::jsonb) AS result",
        [JSON.stringify(payload(ids.amendment, "amendment"))],
      )).rows[0].result;
      expect(amendmentResult.lease.lifecycle_stage).toBe("pending-signature");
      const signedThird = (await changeStatus("signed", "2026-10-18", null)).rows[0].result;
      version = signedThird.document.updated_at;
      await expect(db.query("DELETE FROM public.lease_documents WHERE id = $1::uuid", [ids.initial]))
        .rejects.toThrow("guarded document transaction");
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.viewer]);
      await expect(db.query(
        "SELECT public.delete_contract_document($1::uuid, $2::uuid, $3::timestamptz, false)",
        [ids.initial, portfolio, version],
      )).rejects.toThrow("Document deletion is not permitted");
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.user]);
      const deleted = (await db.query<{ result: { lease: { lifecycle_stage: string }; storage_path: string } }>(
        "SELECT public.delete_contract_document($1::uuid, $2::uuid, $3::timestamptz, false) AS result",
        [ids.initial, portfolio, version],
      )).rows[0].result;
      expect(deleted.storage_path).toBe(path(ids.initial));
      expect(deleted.lease.lifecycle_stage).toBe("pending-signature");
      expect((await db.query("SELECT count(*)::int AS n FROM public.lease_documents WHERE id = $1::uuid", [ids.initial])).rows[0]).toEqual({ n: 0 });
      await db.exec("RESET ROLE");
      expect((await db.query<{ storage_path: string }>(
        "SELECT storage_path FROM public.lease_document_file_deletions WHERE document_id = $1::uuid",
        [ids.initial],
      )).rows).toEqual([{ storage_path: path(ids.initial) }]);
      await db.exec("SET ROLE authenticated");
      await expect(db.query("SELECT public.create_contract_document($1::jsonb)",
        [JSON.stringify(payload(ids.initial, "initial-contract"))])).rejects.toThrow("pending deletion");
      await db.exec("RESET ROLE");
      await db.query("DELETE FROM public.lease_document_file_deletions WHERE document_id = $1::uuid", [ids.initial]);
      await db.exec("SET ROLE authenticated");
      const recreated = (await db.query<{ result: { document: { updated_at: string } } }>(
        "SELECT public.create_contract_document($1::jsonb) AS result",
        [JSON.stringify(payload(ids.initial, "initial-contract"))],
      )).rows[0].result;
      version = recreated.document.updated_at;
      await db.exec("RESET ROLE");
      await db.exec(`
        CREATE FUNCTION public.fail_document_history_test() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history write failed'; END $$;
        CREATE TRIGGER fail_document_history_test BEFORE INSERT ON public.lease_status_changes
          FOR EACH ROW EXECUTE FUNCTION public.fail_document_history_test();
      `);
      await db.exec("SET ROLE authenticated");
      await expect(changeStatus("validated", null, false)).rejects.toThrow("history write failed");
      expect((await document(ids.initial)).status).toBe("signed");
      expect((await lease()).lifecycle_stage).toBe("signed");
      await db.exec("RESET ROLE");
      await db.exec("DROP TRIGGER fail_document_history_test ON public.lease_status_changes");
      await db.exec("SET ROLE authenticated");
      const currentLease = (await db.query<{ data: Record<string, unknown> }>(
        "SELECT to_jsonb(item) AS data FROM public.leases AS item WHERE id = $1::uuid", [ids.lease],
      )).rows[0].data;
      const currentTenant = (await db.query<{ updated_at: string }>(
        "SELECT updated_at FROM public.tenants WHERE id = $1::uuid", [ids.tenant],
      )).rows[0];
      const { created_at: _created, updated_at: _updated, ...activePatch } = currentLease;
      await db.query(
        "SELECT public.client_save_lease_metadata($1::jsonb, $2::jsonb, $3::timestamptz)",
        [JSON.stringify({ ...activePatch, lifecycle_stage: "active" }), JSON.stringify([{
          id: ids.tenant, status: "active", expected_updated_at: currentTenant.updated_at,
        }]), currentLease.updated_at],
      );
      const activeDeleted = (await db.query<{ result: { lease: { lifecycle_stage: string } } }>(
        "SELECT public.delete_contract_document($1::uuid, $2::uuid, $3::timestamptz, false) AS result",
        [ids.initial, portfolio, version],
      )).rows[0].result;
      expect(activeDeleted.lease.lifecycle_stage).toBe("active");
      await db.exec("RESET ROLE");
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.lease_document_file_deletions WHERE document_id = $1::uuid",
        [ids.initial],
      )).rows[0].n).toBe(1);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("quarantines legacy file paths while rejecting newly forged document paths", async () => {
    const ids = {
      user: "47000000-0000-4000-8000-000000000001",
      property: "47000000-0000-4000-8000-000000000002",
      tenant: "47000000-0000-4000-8000-000000000003",
      lease: "47000000-0000-4000-8000-000000000004",
      legacy: "47000000-0000-4000-8000-000000000005",
      current: "47000000-0000-4000-8000-000000000006",
    };
    let portfolio = "";
    const db = await migratedDatabase(async (database, name) => {
      if (name !== "20261018200000_atomic_contract_documents.sql") return;
      await database.exec(`INSERT INTO auth.users(id,email,raw_user_meta_data)
        VALUES ('${ids.user}', 'legacy-document@example.test', '{}'::jsonb)`);
      portfolio = (await database.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.user],
      )).rows[0].id;
      await database.exec(`
        INSERT INTO public.properties(id,portfolio_id,name,reference_code)
          VALUES ('${ids.property}','${portfolio}','Legacy files','LF');
        INSERT INTO public.tenants(id,portfolio_id,first_name)
          VALUES ('${ids.tenant}','${portfolio}','Tenant');
        INSERT INTO public.leases(id,portfolio_id,property_id,lease_reference,
          tenant_ids,billing_tenant_id,lifecycle_stage,start_date,end_date)
          VALUES ('${ids.lease}','${portfolio}','${ids.property}','LF-1',
            '["${ids.tenant}"]'::jsonb,'${ids.tenant}','draft','2026-01-01','2027-12-31');
        INSERT INTO public.lease_documents(id,portfolio_id,lease_id,title,
          document_date,storage_path,original_filename)
          VALUES ('${ids.legacy}','${portfolio}','${ids.lease}','Legacy',
            '2026-01-01','contracts/old.pdf','old.pdf');
      `);
    });
    try {
      await expect(db.query(`INSERT INTO public.lease_documents(id,portfolio_id,lease_id,title,
        document_date,storage_path,original_filename)
        VALUES ($1::uuid,$2::uuid,$3::uuid,'Forged','2026-01-01',
          'another-portfolio/contract.pdf','contract.pdf')`,
      [ids.current, portfolio, ids.lease])).rejects.toThrow("outside its document scope");
      for (const filename of ["../secret.pdf", "folder/secret.pdf", "..%2fsecret.pdf", "..\\secret.pdf"]) {
        await expect(db.query(`INSERT INTO public.lease_documents(id,portfolio_id,lease_id,title,
          document_date,storage_path,original_filename)
          VALUES ($1::uuid,$2::uuid,$3::uuid,'Forged','2026-01-01',$4,'contract.pdf')`,
        [ids.current, portfolio, ids.lease, `${portfolio}/${ids.lease}/${ids.current}/${filename}`]))
          .rejects.toThrow("outside its document scope");
      }
      await db.query(`INSERT INTO public.lease_documents(id,portfolio_id,lease_id,title,
        document_date,storage_path,original_filename)
        VALUES ($1::uuid,$2::uuid,$3::uuid,'Safe','2026-01-01',$4,'legal file.pdf')`,
      [ids.current, portfolio, ids.lease, `${portfolio}/${ids.lease}/${ids.current}/legal file.pdf`]);
      await expect(db.query(
        "UPDATE public.lease_documents SET storage_path = $2 WHERE id = $1::uuid",
        [ids.current, `${portfolio}/${ids.lease}/${ids.current}/replaced.pdf`],
      )).rejects.toThrow("file path and its ownership cannot be changed");
      await expect(db.query(
        "UPDATE public.lease_documents SET id = $2::uuid WHERE id = $1::uuid",
        [ids.current, "47000000-0000-4000-8000-000000000007"],
      )).rejects.toThrow("file path and its ownership cannot be changed");
      const pathAudit = await readFile(
        new URL("../../scripts/audit-document-storage-paths.sql", import.meta.url), "utf8",
      );
      const beforeDelete = await db.exec(pathAudit);
      expect(beforeDelete[0]?.rows).toContainEqual(expect.objectContaining({ document_id: ids.legacy }));
      expect(beforeDelete[0]?.rows).not.toContainEqual(expect.objectContaining({ document_id: ids.current }));
      await db.query("DELETE FROM public.lease_documents WHERE id = $1::uuid", [ids.legacy]);
      expect((await db.query<{ storage_path: string }>(
        "SELECT storage_path FROM public.lease_document_file_deletions WHERE document_id = $1::uuid",
        [ids.legacy],
      )).rows).toEqual([{ storage_path: "contracts/old.pdf" }]);
      const afterDelete = await db.exec(pathAudit);
      expect(afterDelete[1]?.rows).toContainEqual(expect.objectContaining({ document_id: ids.legacy }));
      await db.query("DELETE FROM public.portfolios WHERE id = $1::uuid", [portfolio]);
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.lease_document_file_deletions WHERE document_id = $1::uuid",
        [ids.legacy],
      )).rows[0].n).toBe(1);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("does not duplicate lifecycle history from the scheduled backend transition", async () => {
    const db = await migratedDatabase();
    const ids = {
      user: "33000000-0000-4000-8000-000000000001",
      property: "33000000-0000-4000-8000-000000000002",
      tenant: "33000000-0000-4000-8000-000000000003",
      lease: "33000000-0000-4000-8000-000000000004",
      londonProperty: "33000000-0000-4000-8000-000000000005",
      londonLease: "33000000-0000-4000-8000-000000000006",
      unit: "33000000-0000-4000-8000-000000000007",
      londonUnit: "33000000-0000-4000-8000-000000000008",
    };
    try {
      const lifecycleFunction = (await db.query<{ definition: string; settings: string[] }>(`
        SELECT pg_get_functiondef(p.oid) AS definition, p.proconfig AS settings
        FROM pg_proc p
        WHERE p.oid = 'public.advance_due_lease_lifecycle_for_zone(date,text)'::regprocedure
      `)).rows[0];
      expect(lifecycleFunction.definition).toContain("FOR UPDATE OF l");
      expect(lifecycleFunction.definition).not.toContain("SKIP LOCKED");
      expect(lifecycleFunction.settings).toContain("lock_timeout=15s");
      await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('${ids.user}', 'scheduled-history@example.test', '{}'::jsonb)`);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.user],
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code, country_code)
          VALUES ('${ids.property}', '${portfolio}', 'Scheduled History', 'SH', 'BE');
        INSERT INTO public.properties (id, portfolio_id, name, reference_code, country_code, time_zone)
          VALUES ('${ids.londonProperty}', '${portfolio}', 'London', 'LD', 'GB', 'Europe/London');
        INSERT INTO public.tenants (id, portfolio_id, first_name, status)
          VALUES ('${ids.tenant}', '${portfolio}', 'Scheduled', 'applicant');
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, billing_tenant_id, lifecycle_stage, start_date, end_date)
          VALUES ('${ids.lease}', '${portfolio}', '${ids.property}', 'SH-LEASE',
          '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'signed', '2026-01-01', '2026-12-31');
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, billing_tenant_id, lifecycle_stage, start_date, end_date)
          VALUES ('${ids.londonLease}', '${portfolio}', '${ids.londonProperty}', 'LD-LEASE',
          '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'signed', '2026-01-01', '2026-12-31');
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('${ids.unit}', '${portfolio}', '${ids.property}', 'SH-UNIT'),
            ('${ids.londonUnit}', '${portfolio}', '${ids.londonProperty}', 'LD-UNIT');
        INSERT INTO public.lease_unit_assignments (portfolio_id, lease_id, unit_id,
          start_date, end_date, rent_share, charges_share)
          VALUES ('${portfolio}', '${ids.lease}', '${ids.unit}', '2026-01-01', '2026-12-31', 0, 0),
            ('${portfolio}', '${ids.londonLease}', '${ids.londonUnit}', '2026-01-01', '2026-12-31', 0, 0);
      `);
      await db.query("SELECT * FROM public.advance_due_lease_lifecycle_for_zone($1::date, $2::text)",
        ["2026-10-17", "Europe/Brussels"]);
      await db.query("SELECT * FROM public.advance_due_lease_lifecycle_for_zone($1::date, $2::text)",
        ["2026-10-17", "Europe/Brussels"]);
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.lease_status_changes WHERE lease_id = $1::uuid AND from_stage = 'signed' AND to_stage = 'active'",
        [ids.lease],
      )).rows[0].n).toBe(1);
      expect((await db.query<{ lifecycle_stage: string }>(
        "SELECT lifecycle_stage FROM public.leases WHERE id = $1::uuid", [ids.londonLease],
      )).rows[0].lifecycle_stage).toBe("signed");
      await db.query("SELECT * FROM public.advance_due_lease_lifecycle_for_zone($1::date, $2::text)",
        ["2026-10-17", "Europe/London"]);
      expect((await db.query<{ lifecycle_stage: string }>(
        "SELECT lifecycle_stage FROM public.leases WHERE id = $1::uuid", [ids.londonLease],
      )).rows[0].lifecycle_stage).toBe("active");
      expect((await db.query<{ status: string }>(
        "SELECT status FROM public.tenants WHERE id = $1::uuid", [ids.tenant],
      )).rows[0].status).toBe("active");
      await db.query("SELECT * FROM public.advance_due_lease_lifecycle_for_zone($1::date, $2::text)",
        ["2027-01-01", "Europe/Brussels"]);
      expect((await db.query<{ lifecycle_stage: string }>(
        "SELECT lifecycle_stage FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rows[0].lifecycle_stage).toBe("ended");
      expect((await db.query<{ status: string }>(
        "SELECT status FROM public.tenants WHERE id = $1::uuid", [ids.tenant],
      )).rows[0].status).toBe("active");
      await db.query("SELECT * FROM public.advance_due_lease_lifecycle_for_zone($1::date, $2::text)",
        ["2027-01-01", "Europe/London"]);
      await db.query("SELECT * FROM public.advance_due_lease_lifecycle_for_zone($1::date, $2::text)",
        ["2027-01-01", "Europe/London"]);
      expect((await db.query<{ lifecycle_stage: string }>(
        "SELECT lifecycle_stage FROM public.leases WHERE id = $1::uuid", [ids.londonLease],
      )).rows[0].lifecycle_stage).toBe("ended");
      expect((await db.query<{ status: string }>(
        "SELECT status FROM public.tenants WHERE id = $1::uuid", [ids.tenant],
      )).rows[0].status).toBe("former");
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.lease_status_changes WHERE lease_id IN ($1::uuid, $2::uuid) AND from_stage = 'active' AND to_stage = 'ended'",
        [ids.lease, ids.londonLease],
      )).rows[0].n).toBe(2);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("deletes an unencumbered lease and recalculates tenants in one transaction", async () => {
    const db = await migratedDatabase();
    const ids = {
      user: "32000000-0000-4000-8000-000000000001",
      viewer: "32000000-0000-4000-8000-000000000002",
      editor: "32000000-0000-4000-8000-000000000010",
      property: "32000000-0000-4000-8000-000000000003",
      unit: "32000000-0000-4000-8000-000000000004",
      tenant: "32000000-0000-4000-8000-000000000005",
      activeLease: "32000000-0000-4000-8000-000000000006",
      endedLease: "32000000-0000-4000-8000-000000000007",
      document: "32000000-0000-4000-8000-000000000008",
      receivable: "32000000-0000-4000-8000-000000000009",
    };
    try {
      await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
        ('${ids.user}', 'delete-owner@example.test', '{}'::jsonb),
        ('${ids.viewer}', 'delete-viewer@example.test', '{}'::jsonb),
        ('${ids.editor}', 'delete-editor@example.test', '{}'::jsonb)`);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.user],
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
          VALUES ('${portfolio}', '${ids.viewer}', 'viewer'),
            ('${portfolio}', '${ids.editor}', 'editor');
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${ids.property}', '${portfolio}', 'Delete Property', 'DEL');
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('${ids.unit}', '${portfolio}', '${ids.property}', 'DEL-1');
        INSERT INTO public.tenants (id, portfolio_id, first_name, status)
          VALUES ('${ids.tenant}', '${portfolio}', 'Delete', 'active');
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, billing_tenant_id, lifecycle_stage, start_date, end_date, monthly_rent)
          VALUES ('${ids.activeLease}', '${portfolio}', '${ids.property}', 'DEL-ACTIVE',
          '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'active', '2026-01-01', '2026-12-31', 100),
          ('${ids.endedLease}', '${portfolio}', '${ids.property}', 'DEL-ENDED',
          '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'ended', '2025-01-01', '2025-12-31', 0);
        INSERT INTO public.lease_unit_assignments
          (portfolio_id, lease_id, unit_id, start_date, rent_share, charges_share)
          VALUES ('${portfolio}', '${ids.activeLease}', '${ids.unit}', '2026-01-01', 100, 0);
        INSERT INTO public.receivable_items (id, portfolio_id, lease_id, tenant_id,
          property_id, unit_id, item_type, label, period_month, due_date,
          currency_code, expected_amount, allocated_amount, outstanding_amount, status, origin)
          VALUES ('${ids.receivable}', '${portfolio}', '${ids.activeLease}', '${ids.tenant}',
          '${ids.property}', '${ids.unit}', 'rent', 'Rent', '2026-02', '2026-02-01',
          'EUR', 100, 0, 100, 'open', 'lease-schedule');
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      const version = (await db.query<{ updated_at: string }>(
        "SELECT updated_at::text FROM public.leases WHERE id = $1::uuid", [ids.activeLease],
      )).rows[0].updated_at;
      const args = [ids.activeLease, portfolio, version];
      const call = "SELECT public.delete_lease_atomically($1::uuid, $2::uuid, $3::timestamptz) AS deletion";
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.user]);
      await db.exec("SET ROLE authenticated");
      await expect(db.query(call, args)).rejects.toThrow("financial records");
      await db.exec("RESET ROLE");
      await db.query("DELETE FROM public.receivable_items WHERE id = $1::uuid", [ids.receivable]);
      await db.exec(`INSERT INTO public.lease_documents
        (id, portfolio_id, lease_id, title, document_date, storage_path, original_filename)
        VALUES ('${ids.document}', '${portfolio}', '${ids.activeLease}', 'Contract',
        '2026-01-01', '${portfolio}/${ids.activeLease}/${ids.document}/example.pdf', 'example.pdf')`);
      await db.exec("SET ROLE authenticated");
      await expect(db.query(call, args)).rejects.toThrow("Remove the lease documents");
      await db.exec("RESET ROLE");
      await db.query("DELETE FROM public.lease_documents WHERE id = $1::uuid", [ids.document]);
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.viewer]);
      await db.exec("SET ROLE authenticated");
      await expect(db.query(call, args)).rejects.toThrow();
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.user]);
      await db.exec("SET ROLE authenticated");
      await expect(db.query(
        "DELETE FROM public.leases WHERE id = $1::uuid", [ids.activeLease],
      )).rejects.toThrow();
      await db.exec("RESET ROLE");
      await db.exec(`
        CREATE OR REPLACE FUNCTION public.fail_delete_tenant_update()
          RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'tenant update failed'; END $$;
        CREATE TRIGGER fail_delete_tenant_update BEFORE UPDATE ON public.tenants
          FOR EACH ROW EXECUTE FUNCTION public.fail_delete_tenant_update();
      `);
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.editor]);
      await db.exec("SET ROLE authenticated");
      await expect(db.query(call, args)).rejects.toThrow("tenant update failed");
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.leases WHERE id = $1::uuid", [ids.activeLease],
      )).rows[0].n).toBe(1);
      await db.exec("RESET ROLE");
      await db.exec("DROP TRIGGER fail_delete_tenant_update ON public.tenants");
      await db.exec("SET ROLE authenticated");
      const deleted = await db.query<{ deletion: { lease_id: string; tenants: { status: string }[] } }>(call, args);
      expect(deleted.rows[0].deletion).toMatchObject({
        lease_id: ids.activeLease, tenants: [{ status: "former" }],
      });
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.lease_unit_assignments WHERE lease_id = $1::uuid", [ids.activeLease],
      )).rows[0].n).toBe(0);
      await expect(db.query(call, args)).rejects.toThrow();
    } finally {
      await db.close();
    }
  }, 120_000);

  it("closes a lease atomically, including assignments, amendments, units, tenants and schedule", async () => {
    const db = await migratedDatabase();
    const ids = {
      user: "31000000-0000-4000-8000-000000000001",
      property: "31000000-0000-4000-8000-000000000002",
      unit: "31000000-0000-4000-8000-000000000003",
      futureUnit: "31000000-0000-4000-8000-000000000011",
      tenant: "31000000-0000-4000-8000-000000000004",
      lease: "31000000-0000-4000-8000-000000000005",
      amendment: "31000000-0000-4000-8000-000000000006",
    };
    try {
      await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('${ids.user}', 'atomic-closure@example.test', '{}'::jsonb)`);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.user],
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${ids.property}', '${portfolio}', 'Atomic Closure', 'AC');
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code, current_status)
          VALUES ('${ids.unit}', '${portfolio}', '${ids.property}', 'AC-1', 'occupied'),
            ('${ids.futureUnit}', '${portfolio}', '${ids.property}', 'AC-2', 'vacant');
        INSERT INTO public.tenants (id, portfolio_id, first_name, status)
          VALUES ('${ids.tenant}', '${portfolio}', 'Tenant', 'active');
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, billing_tenant_id, lifecycle_stage, start_date, end_date, monthly_rent)
          VALUES ('${ids.lease}', '${portfolio}', '${ids.property}', 'AC-LEASE',
          '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'active', '2026-01-01', '2026-12-31', 1000);
        INSERT INTO public.lease_unit_assignments
          (portfolio_id, lease_id, unit_id, start_date, end_date, rent_share, charges_share)
          VALUES ('${portfolio}', '${ids.lease}', '${ids.unit}', '2026-01-01', '2026-12-31', 1000, 0),
            ('${portfolio}', '${ids.lease}', '${ids.futureUnit}', '2026-12-01', '2026-12-31', 0, 0);
        INSERT INTO public.lease_amendments
          (id, portfolio_id, lease_id, effective_date, status)
          VALUES ('${ids.amendment}', '${portfolio}', '${ids.lease}', '2026-03-01', 'active');
        INSERT INTO public.receivable_items (portfolio_id, lease_id, tenant_id, property_id, unit_id,
          item_type, label, period_month, due_date, currency_code, expected_amount,
          allocated_amount, outstanding_amount, status, origin)
          VALUES ('${portfolio}', '${ids.lease}', '${ids.tenant}', '${ids.property}', '${ids.unit}',
          'rent', 'November', '2026-11', '2026-11-01', 'EUR', 1000, 0, 1000, 'open', 'lease-schedule');
        CREATE OR REPLACE FUNCTION public.fail_closure_tenant_update()
          RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'tenant write failed'; END $$;
        CREATE TRIGGER fail_closure_tenant_update BEFORE UPDATE ON public.tenants
          FOR EACH ROW EXECUTE FUNCTION public.fail_closure_tenant_update();
      `);
      const updatedAt = (await db.query<{ updated_at: string }>(
        "SELECT updated_at::text FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rows[0].updated_at;
      const currentLease = (await db.query<{ payload: Record<string, unknown> }>(
        "SELECT to_jsonb(leases) - 'created_at' - 'updated_at' - 'legacy_id' AS payload FROM public.leases WHERE id = $1::uuid",
        [ids.lease],
      )).rows[0].payload;
      const payload = JSON.stringify({
        ...currentLease, lifecycle_stage: "ended", end_date: "2026-06-30",
      });
      const args = [payload, updatedAt, "2026-06-30"];
      await expect(db.query(
        "SELECT public.close_lease_atomically($1::jsonb, $2::timestamptz, $3::date, true)", args,
      )).rejects.toThrow("tenant write failed");
      expect((await db.query<{ lifecycle_stage: string }>(
        "SELECT lifecycle_stage FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rows[0].lifecycle_stage).toBe("active");
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.receivable_items WHERE lease_id = $1::uuid", [ids.lease],
      )).rows[0].n).toBe(1);
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.lease_unit_assignments WHERE lease_id = $1::uuid", [ids.lease],
      )).rows[0].n).toBe(2);
      await db.exec("DROP TRIGGER fail_closure_tenant_update ON public.tenants");
      const viewer = "31000000-0000-4000-8000-000000000010";
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES ('${viewer}', 'closure-viewer@example.test', '{}'::jsonb);
        INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
          VALUES ('${portfolio}', '${viewer}', 'viewer');
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      await db.query("SELECT set_config('test.user_id', $1, false)", [viewer]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(db.query(
          "SELECT public.client_close_lease_atomically($1::jsonb, $2::timestamptz, $3::date, true)", args,
        )).rejects.toThrow();
      } finally {
        await db.exec("RESET ROLE");
      }
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.user]);
      await db.exec("SET ROLE authenticated");
      try {
        const changedRent = JSON.stringify({ ...JSON.parse(payload), monthly_rent: 9999 });
        await expect(db.query(
          "SELECT public.client_close_lease_atomically($1::jsonb, $2::timestamptz, $3::date, true)",
          [changedRent, updatedAt, "2026-06-30"],
        )).rejects.toThrow("Lease closure cannot change non-closure terms");
      } finally {
        await db.exec("RESET ROLE");
      }
      expect((await db.query<{ monthly_rent: string; lifecycle_stage: string }>(
        "SELECT monthly_rent, lifecycle_stage FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rows[0]).toMatchObject({ monthly_rent: "1000.00", lifecycle_stage: "active" });
      await db.exec(`
        CREATE OR REPLACE FUNCTION public.fail_closure_history_insert()
          RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history write failed'; END $$;
        CREATE TRIGGER fail_closure_history_insert BEFORE INSERT ON public.lease_status_changes
          FOR EACH ROW EXECUTE FUNCTION public.fail_closure_history_insert();
      `);
      await db.exec("SET ROLE authenticated");
      await expect(db.query(
        "SELECT public.client_close_lease_atomically($1::jsonb, $2::timestamptz, $3::date, true)", args,
      )).rejects.toThrow("history write failed");
      expect((await db.query<{ lifecycle_stage: string }>(
        "SELECT lifecycle_stage FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rows[0].lifecycle_stage).toBe("active");
      await db.exec("RESET ROLE");
      await db.exec("DROP TRIGGER fail_closure_history_insert ON public.lease_status_changes");
      await db.exec("SET ROLE authenticated");
      const result = await db.query<{ closure: { lease: { lifecycle_stage: string }; assignments: { end_date: string }[]; amendments: { status: string }[]; units: { current_status: string }[]; tenants: { status: string }[] } }>(
        "SELECT public.client_close_lease_atomically($1::jsonb, $2::timestamptz, $3::date, true) AS closure", args,
      );
      expect(result.rows[0].closure).toMatchObject({
        lease: { lifecycle_stage: "ended" },
        assignments: [{ end_date: "2026-06-30" }],
        amendments: [{ status: "ended" }],
        units: [{ current_status: "vacant" }],
        tenants: [{ status: "former" }],
      });
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.receivable_items WHERE lease_id = $1::uuid", [ids.lease],
      )).rows[0].n).toBe(0);
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.lease_unit_assignments WHERE lease_id = $1::uuid", [ids.lease],
      )).rows[0].n).toBe(1);
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.lease_status_changes WHERE lease_id = $1::uuid AND from_stage = 'active' AND to_stage = 'ended'", [ids.lease],
      )).rows[0].n).toBe(1);
      await expect(db.query(
        "SELECT public.client_close_lease_atomically($1::jsonb, $2::timestamptz, $3::date, true)", args,
      )).rejects.toThrow("Lease changed since it was opened");
    } finally {
      await db.close();
    }
  }, 120_000);

  it("uses the property's calendar day when closing a lease", async () => {
    const db = await migratedDatabase();
    const ids = {
      user: "32000000-0000-4000-8000-000000000001",
      property: "32000000-0000-4000-8000-000000000002",
      lease: "32000000-0000-4000-8000-000000000003",
      otherProperty: "32000000-0000-4000-8000-000000000004",
      otherLease: "32000000-0000-4000-8000-000000000005",
    };
    try {
      await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('${ids.user}', 'zoned-closure@example.test', '{}'::jsonb)`);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.user],
      )).rows[0].id;
      const zone = "Pacific/Kiritimati";
      const propertyDate = (await db.query<{ date: string }>(
        "SELECT (now() AT TIME ZONE $1)::date::text AS date", [zone],
      )).rows[0].date;
      const callerDate = (await db.query<{ date: string }>(
        "SELECT (now() AT TIME ZONE 'Pacific/Honolulu')::date::text AS date",
      )).rows[0].date;
      expect(propertyDate > callerDate).toBe(true);
      await db.query(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code, time_zone)
        VALUES ($1::uuid, $2::uuid, 'Zoned Closure', 'ZC', $3::text)
      `, [ids.property, portfolio, zone]);
      await db.query(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code, time_zone)
        VALUES ($1::uuid, $2::uuid, 'Other Zoned Closure', 'OZC', 'Pacific/Honolulu')
      `, [ids.otherProperty, portfolio]);
      await db.query(`
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, lifecycle_stage, start_date, end_date, monthly_rent)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'ZC-LEASE', '[]'::jsonb,
          'active', '2020-01-01', '2099-12-31', 1000)
      `, [ids.lease, portfolio, ids.property]);
      await db.query(`
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, lifecycle_stage, start_date, end_date, monthly_rent)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'OZC-LEASE', '[]'::jsonb,
          'active', '2020-01-01', '2099-12-31', 1000)
      `, [ids.otherLease, portfolio, ids.otherProperty]);
      const updatedAt = (await db.query<{ updated_at: string }>(
        "SELECT updated_at::text FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rows[0].updated_at;
      const otherUpdatedAt = (await db.query<{ updated_at: string }>(
        "SELECT updated_at::text FROM public.leases WHERE id = $1::uuid", [ids.otherLease],
      )).rows[0].updated_at;
      const payload = (leaseId: string, propertyId: string, endDate: string) => JSON.stringify({
        id: leaseId, portfolio_id: portfolio, property_id: propertyId,
        tenant_ids: [], billing_tenant_id: null, lifecycle_stage: "ended",
        start_date: "2020-01-01", end_date: endDate,
      });
      await db.exec(`
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.user]);
      await db.exec("SET TIME ZONE 'Pacific/Honolulu'");
      await db.exec("SET ROLE authenticated");
      try {
        const call = "SELECT public.client_close_lease_atomically($1::jsonb, $2::timestamptz, $3::date, true)";
        await db.query(call, [payload(ids.lease, ids.property, propertyDate), updatedAt, propertyDate]);
        expect((await db.query<{ stage: string }>(
          "SELECT lifecycle_stage AS stage FROM public.leases WHERE id = $1::uuid", [ids.lease],
        )).rows[0].stage).toBe("ended");
        expect((await db.query<{ zone: string }>(
          "SELECT current_setting('TimeZone') AS zone",
        )).rows[0].zone).toBe("Pacific/Honolulu");
        await db.exec("SET TIME ZONE 'Pacific/Kiritimati'");
        await expect(db.query(call, [
          payload(ids.otherLease, ids.otherProperty, propertyDate), otherUpdatedAt, propertyDate,
        ])).rejects.toThrow("Invalid lease closure state or date");
        await db.query(call, [
          payload(ids.otherLease, ids.otherProperty, callerDate), otherUpdatedAt, callerDate,
        ]);
        expect((await db.query<{ zone: string }>(
          "SELECT current_setting('TimeZone') AS zone",
        )).rows[0].zone).toBe("Pacific/Kiritimati");
      } finally {
        await db.exec("RESET ROLE");
        await db.exec("RESET TIME ZONE");
      }
    } finally {
      await db.close();
    }
  }, 120_000);

  it("uses the property's day for initial-contract rollback decisions", async () => {
    const db = await migratedDatabase();
    const ids = {
      user: "33000000-0000-4000-8000-000000000001",
      startedProperty: "33000000-0000-4000-8000-000000000002",
      futureProperty: "33000000-0000-4000-8000-000000000003",
      startedLease: "33000000-0000-4000-8000-000000000004",
      futureLease: "33000000-0000-4000-8000-000000000005",
      startedUnit: "33000000-0000-4000-8000-000000000006",
      futureUnit: "33000000-0000-4000-8000-000000000007",
    };
    try {
      await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('${ids.user}', 'zoned-document@example.test', '{}'::jsonb)`);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.user],
      )).rows[0].id;
      const startDate = (await db.query<{ date: string }>(
        "SELECT (now() AT TIME ZONE 'Pacific/Kiritimati')::date::text AS date",
      )).rows[0].date;
      const honoluluDate = (await db.query<{ date: string }>(
        "SELECT (now() AT TIME ZONE 'Pacific/Honolulu')::date::text AS date",
      )).rows[0].date;
      expect(startDate > honoluluDate).toBe(true);
      await db.query(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code, time_zone)
        VALUES ($1::uuid, $2::uuid, 'Started Property', 'SP', 'Pacific/Kiritimati'),
          ($3::uuid, $2::uuid, 'Future Property', 'FP', 'Pacific/Honolulu')
      `, [ids.startedProperty, portfolio, ids.futureProperty]);
      await db.query(`
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, lifecycle_stage, start_date, end_date, monthly_rent)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'SP-LEASE', '[]'::jsonb,
          'signed', $5::date, '2099-12-31', 1000),
          ($4::uuid, $2::uuid, $6::uuid, 'FP-LEASE', '[]'::jsonb,
          'signed', $5::date, '2099-12-31', 1000)
      `, [ids.startedLease, portfolio, ids.startedProperty, ids.futureLease, startDate, ids.futureProperty]);
      await db.query(`
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'SP-UNIT'),
          ($4::uuid, $2::uuid, $5::uuid, 'FP-UNIT')
      `, [ids.startedUnit, portfolio, ids.startedProperty, ids.futureUnit,
        ids.futureProperty]);
      await db.query(`
        INSERT INTO public.lease_unit_assignments (portfolio_id, lease_id, unit_id,
          start_date, end_date, rent_share, charges_share)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $6::date, '2099-12-31', 1000, 0),
          ($1::uuid, $4::uuid, $5::uuid, $6::date, '2099-12-31', 1000, 0)
      `, [portfolio, ids.startedLease, ids.startedUnit,
        ids.futureLease, ids.futureUnit, startDate]);

      const call = "SELECT (public.apply_initial_contract_lease_transition($1::uuid, true, false, NULL::date, $2::boolean))->>'lifecycle_stage' AS stage";
      await db.exec("SET TIME ZONE 'Pacific/Honolulu'");
      expect((await db.query<{ stage: string }>(call, [ids.startedLease, null])).rows[0].stage).toBe("signed");
      await db.exec("SET TIME ZONE 'Pacific/Kiritimati'");
      await expect(db.query(call, [ids.futureLease, null]))
        .rejects.toThrow("Choose whether to keep the future lease signed");
      expect((await db.query<{ stage: string }>(call, [ids.futureLease, false])).rows[0].stage)
        .toBe("pending-signature");
      expect((await db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM public.lease_status_changes
         WHERE lease_id = $1::uuid AND from_stage = 'signed' AND to_stage = 'pending-signature'`,
        [ids.futureLease],
      )).rows[0].count).toBe(1);
    } finally {
      await db.exec("RESET TIME ZONE");
      await db.close();
    }
  }, 120_000);

  it("prunes only unpaid future lease-schedule rows when a lease closes", async () => {
    const db = await migratedDatabase();
    const ids = {
      user: "30000000-0000-4000-8000-000000000001",
      property: "30000000-0000-4000-8000-000000000002",
      unit: "30000000-0000-4000-8000-000000000003",
      tenant: "30000000-0000-4000-8000-000000000004",
      lease: "30000000-0000-4000-8000-000000000005",
    };
    try {
      await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('${ids.user}', 'closure@example.test', '{}'::jsonb)`);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.user],
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${ids.property}', '${portfolio}', 'Closure Property', 'CLOSE');
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('${ids.unit}', '${portfolio}', '${ids.property}', 'CLOSE-1');
        INSERT INTO public.tenants (id, portfolio_id, first_name)
          VALUES ('${ids.tenant}', '${portfolio}', 'Closure');
        INSERT INTO public.leases (
          id, portfolio_id, property_id, lease_reference, tenant_ids, billing_tenant_id,
          lifecycle_stage, start_date, end_date, monthly_rent
        ) VALUES (
          '${ids.lease}', '${portfolio}', '${ids.property}', 'CLOSE-LEASE',
          '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'active',
          '2026-01-01', '2026-12-31', 1000
        );
        INSERT INTO public.lease_unit_assignments
          (portfolio_id, lease_id, unit_id, start_date, end_date, rent_share, charges_share)
          VALUES ('${portfolio}', '${ids.lease}', '${ids.unit}', '2026-01-01', '2026-12-31', 1000, 0);
      `);
      const row = (suffix: number, dueDate: string, status: string, origin = "lease-schedule") => `
        ('30000000-0000-4000-8000-${String(suffix).padStart(12, "0")}', '${portfolio}',
         '${ids.lease}', '${ids.tenant}', '${ids.property}', '${ids.unit}', 'rent',
         'Rent', '${dueDate.slice(0, 7)}', '${dueDate}', 'EUR', 1000,
         ${status === "paid" ? 1000 : 0}, ${status === "paid" ? 0 : 1000}, '${status}', '${origin}')`;
      await db.exec(`
        INSERT INTO public.receivable_items (
          id, portfolio_id, lease_id, tenant_id, property_id, unit_id, item_type,
          label, period_month, due_date, currency_code, expected_amount,
          allocated_amount, outstanding_amount, status, origin
        ) VALUES
          ${row(6, "2026-03-01", "overdue")},
          ${row(7, "2026-11-01", "open")},
          ${row(8, "2026-12-01", "paid")},
          ${row(9, "2026-10-01", "open", "manual")};
      `);
      await expect(db.exec(`
        BEGIN;
        UPDATE public.leases SET lifecycle_stage = 'ended', end_date = '2026-06-30'
          WHERE id = '${ids.lease}';
        SELECT 1 / 0;
        COMMIT;
      `)).rejects.toThrow();
      await db.exec("ROLLBACK");
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.receivable_items WHERE lease_id = $1::uuid", [ids.lease],
      )).rows[0].n).toBe(4);
      const viewer = "30000000-0000-4000-8000-000000000010";
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES ('${viewer}', 'closure-viewer@example.test', '{}'::jsonb);
        INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
          VALUES ('${portfolio}', '${viewer}', 'viewer');
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      await db.query("SELECT set_config('test.user_id', $1, false)", [viewer]);
      const closePayload = {
        id: ids.lease, portfolio_id: portfolio, property_id: ids.property,
        start_date: "2026-01-01", tenant_ids: [ids.tenant], billing_tenant_id: ids.tenant,
        lifecycle_stage: "ended", end_date: "2026-06-30",
      };
      const currentVersion = (await db.query<{ updated_at: string }>(
        "SELECT updated_at FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rows[0].updated_at;
      const close = () => db.query(
        "SELECT public.client_close_lease_atomically($1::jsonb, $2::timestamptz, '2026-06-30'::date, false)",
        [JSON.stringify(closePayload), currentVersion],
      );
      await db.exec("SET ROLE authenticated");
      try {
        await expect(close()).rejects.toThrow("Lease closure is not permitted");
      } finally {
        await db.exec("RESET ROLE");
      }
      expect((await db.query<{ lifecycle_stage: string }>(
        "SELECT lifecycle_stage FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rows[0].lifecycle_stage).toBe("active");
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.user]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(close()).rejects.toThrow("cannot be detached");
      } finally {
        await db.exec("RESET ROLE");
      }
      expect((await db.query<{ lifecycle_stage: string }>(
        "SELECT lifecycle_stage FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rows[0].lifecycle_stage).toBe("active");
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.receivable_items WHERE lease_id = $1::uuid", [ids.lease],
      )).rows[0].n).toBe(4);
      await db.exec(`UPDATE public.receivable_items
        SET due_date = '2026-04-01', period_month = '2026-04'
        WHERE id = '30000000-0000-4000-8000-000000000008'`);
      await db.exec("SET ROLE authenticated");
      try {
        await close();
      } finally {
        await db.exec("RESET ROLE");
      }
      const remaining = await db.query<{ due_date: string; origin: string; status: string }>(
        "SELECT due_date::text, origin, status FROM public.receivable_items WHERE lease_id = $1::uuid ORDER BY due_date",
        [ids.lease],
      );
      expect(remaining.rows).toEqual([
        { due_date: "2026-03-01", origin: "lease-schedule", status: "overdue" },
        { due_date: "2026-04-01", origin: "lease-schedule", status: "paid" },
        { due_date: "2026-10-01", origin: "manual", status: "open" },
      ]);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("upgrades representative June lease, document and cost rows without losing their meaning", async () => {
    const ids = {
      user: "20000000-0000-4000-8000-000000000001",
      property: "20000000-0000-4000-8000-000000000002",
      unit: "20000000-0000-4000-8000-000000000003",
      tenant: "20000000-0000-4000-8000-000000000004",
      lease: "20000000-0000-4000-8000-000000000005",
      document: "20000000-0000-4000-8000-000000000006",
      category: "20000000-0000-4000-8000-000000000007",
      cost: "20000000-0000-4000-8000-000000000008",
    };
    let portfolio = "";
    const db = await migratedDatabase(async (database, migration) => {
      if (!migration.startsWith("20260622145645_")) return;
      await database.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES ('${ids.user}', 'legacy@example.test', '{}'::jsonb);
      `);
      portfolio = (await database.query<{ id: string }>(
        `SELECT id FROM public.portfolios WHERE created_by = '${ids.user}'`,
      )).rows[0].id;
      await database.exec(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${ids.property}', '${portfolio}', 'Legacy Property', 'LEG');
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('${ids.unit}', '${portfolio}', '${ids.property}', 'LEG-1');
        INSERT INTO public.tenants (id, portfolio_id, first_name)
          VALUES ('${ids.tenant}', '${portfolio}', 'Legacy');
        INSERT INTO public.leases (
          id, portfolio_id, property_id, lease_reference, tenant_ids, billing_tenant_id,
          lifecycle_stage, start_date, end_date, monthly_rent
        ) VALUES (
          '${ids.lease}', '${portfolio}', '${ids.property}', 'LEG-LEASE',
          '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'active',
          '2025-01-01', '2027-12-31', 900
        );
        INSERT INTO public.lease_unit_assignments
          (portfolio_id, lease_id, unit_id, start_date, end_date, rent_share, charges_share)
          VALUES ('${portfolio}', '${ids.lease}', '${ids.unit}', '2025-01-01', '2027-12-31', 900, 0);
        INSERT INTO public.lease_documents
          (id, portfolio_id, lease_id, title, document_date, storage_path, original_filename)
          VALUES ('${ids.document}', '${portfolio}', '${ids.lease}', 'Signed copy',
                  '2025-01-01', '${portfolio}/${ids.lease}/${ids.document}/contract.pdf', 'contract.pdf');
        INSERT INTO public.cost_categories (id, portfolio_id, code, name)
          VALUES ('${ids.category}', '${portfolio}', 'REP', 'Repairs');
        INSERT INTO public.cost_entries
          (id, portfolio_id, category_id, property_id, label, start_date, amount, recovery_type)
          VALUES ('${ids.cost}', '${portfolio}', '${ids.category}', '${ids.property}',
                  'Roof', '2025-06-01', 1000, 'partially-recoverable');
      `);
    });
    try {
      expect(portfolio).not.toBe("");
      expect((await db.query("SELECT document_type, status FROM public.lease_documents WHERE id = $1::uuid", [ids.document])).rows[0])
        .toEqual({ document_type: "supporting", status: null });
      expect((await db.query("SELECT recoverable_percentage::float AS share FROM public.cost_entries WHERE id = $1::uuid", [ids.cost])).rows[0])
        .toEqual({ share: 50 });
      expect((await db.query("SELECT is_partially_owned FROM public.properties WHERE id = $1::uuid", [ids.property])).rows[0])
        .toEqual({ is_partially_owned: false });
      expect((await db.query("SELECT receivable_lead_days FROM public.portfolios WHERE id = $1::uuid", [portfolio])).rows[0])
        .toEqual({ receivable_lead_days: 15 });
      await expect(db.exec(`UPDATE public.portfolios SET receivable_lead_days = 121 WHERE id = '${portfolio}'`))
        .rejects.toThrow();
      expect((await db.query("SELECT indexation_enabled, lifecycle_stage FROM public.leases WHERE id = $1::uuid", [ids.lease])).rows[0])
        .toEqual({ indexation_enabled: false, lifecycle_stage: "active" });
      expect((await db.query("SELECT count(*)::int AS n FROM public.lease_unit_assignments WHERE lease_id = $1::uuid", [ids.lease])).rows[0])
        .toEqual({ n: 1 });

      const receivable = {
        id: "20000000-0000-4000-8000-000000000011",
        portfolio_id: portfolio, lease_id: ids.lease, tenant_id: ids.tenant,
        property_id: ids.property, unit_id: ids.unit,
        item_type: "rent", label: "Monthly Rent", period_month: "2025-01",
        due_date: "2025-01-05", currency_code: "EUR", expected_amount: 900,
        allocated_amount: 0, outstanding_amount: 900, status: "overdue",
        priority: 10, origin: "lease-schedule", notes: "",
        cycle_index: 1, cycle_end_date: "2025-01-31",
      };
      const insert = (rows: object[]) => db.query<{ inserted: number }>(
        "SELECT public.insert_due_lease_receivables($1::uuid, $2::jsonb) AS inserted",
        [portfolio, JSON.stringify(rows)],
      );
      expect((await insert([receivable])).rows[0]).toEqual({ inserted: 1 });
      await db.query("UPDATE public.receivable_items SET status = 'paid', allocated_amount = 900, outstanding_amount = 0 WHERE id = $1::uuid", [receivable.id]);
      expect((await insert([{ ...receivable, id: "20000000-0000-4000-8000-000000000012" }])).rows[0])
        .toEqual({ inserted: 0 });
      expect((await insert([{ ...receivable, id: "20000000-0000-4000-8000-000000000015", unit_id: "20000000-0000-4000-8000-000000000099" }])).rows[0])
        .toEqual({ inserted: 0 });
      expect((await db.query("SELECT status, allocated_amount::float AS amount FROM public.receivable_items WHERE id = $1::uuid", [receivable.id])).rows[0])
        .toEqual({ status: "paid", amount: 900 });

      const february = { ...receivable, id: "20000000-0000-4000-8000-000000000013", period_month: "2025-02", due_date: "2025-02-05" };
      const invalid = { ...receivable, id: "20000000-0000-4000-8000-000000000014", period_month: "2025-03", due_date: "2025-03-05", property_id: "20000000-0000-4000-8000-000000000099" };
      await expect(insert([february, invalid])).rejects.toThrow();
      expect((await db.query("SELECT count(*)::int AS n FROM public.receivable_items WHERE lease_id = $1::uuid", [ids.lease])).rows[0])
        .toEqual({ n: 1 });
      expect((await db.query("SELECT has_function_privilege('authenticated', 'public.insert_due_lease_receivables(uuid,jsonb)', 'EXECUTE') AS allowed")).rows[0])
        .toEqual({ allowed: false });
    } finally {
      await db.close();
    }
  }, 120_000);

  it("activates an amendment atomically and rolls back a rejected future receivable", async () => {
    const db = await migratedDatabase();
    const ids = {
      user: "00000000-0000-4000-8000-000000000001",
      property: "00000000-0000-4000-8000-000000000002",
      unit: "00000000-0000-4000-8000-000000000003",
      tenant: "00000000-0000-4000-8000-000000000004",
      lease: "00000000-0000-4000-8000-000000000005",
      prior: "00000000-0000-4000-8000-000000000006",
      target: "00000000-0000-4000-8000-000000000007",
      oldReceivable: "00000000-0000-4000-8000-000000000008",
      newReceivable: "00000000-0000-4000-8000-000000000009",
      next: "00000000-0000-4000-8000-000000000010",
    };
    try {
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES ('${ids.user}', 'qa@example.test', '{}'::jsonb);
      `);
      const portfolio = (await db.query<{ id: string }>(
        `SELECT id FROM public.portfolios WHERE created_by = '${ids.user}'`,
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${ids.property}', '${portfolio}', 'QA Property', 'QA');
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('${ids.unit}', '${portfolio}', '${ids.property}', 'QA-1');
        INSERT INTO public.tenants (id, portfolio_id, first_name, status)
          VALUES ('${ids.tenant}', '${portfolio}', 'QA', 'active');
        INSERT INTO public.leases (
          id, portfolio_id, property_id, lease_reference, tenant_ids, billing_tenant_id,
          lifecycle_stage, start_date, end_date, monthly_rent, monthly_charges
        ) VALUES (
          '${ids.lease}', '${portfolio}', '${ids.property}', 'QA-LEASE',
          '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'signed',
          '2026-01-01', '2026-12-31', 1000, 100
        );
        INSERT INTO public.lease_unit_assignments
          (portfolio_id, lease_id, unit_id, start_date, end_date, rent_share, charges_share)
          VALUES ('${portfolio}', '${ids.lease}', '${ids.unit}', '2026-01-01', '2026-12-31', 1000, 100);
        INSERT INTO public.leases (
          id, portfolio_id, property_id, lease_reference, tenant_ids, billing_tenant_id,
          lifecycle_stage, start_date, end_date, monthly_rent, monthly_charges
        ) VALUES (
          '00000000-0000-4000-8000-000000000012', '${portfolio}', '${ids.property}', 'QA-OLD',
          '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'active',
          '2025-01-01', '2025-12-31', 500, 0
        );
        INSERT INTO public.lease_unit_assignments
          (portfolio_id, lease_id, unit_id, start_date, rent_share, charges_share)
          VALUES ('${portfolio}', '00000000-0000-4000-8000-000000000012', '${ids.unit}',
            '2025-01-01', 500, 0);
        INSERT INTO public.lease_amendments
          (id, portfolio_id, lease_id, amendment_number, title, effective_date, status)
          VALUES
          ('${ids.prior}', '${portfolio}', '${ids.lease}', 1, 'Prior', '2026-02-01', 'active'),
          ('${ids.target}', '${portfolio}', '${ids.lease}', 2, 'Target', '2026-06-01', 'scheduled');
        INSERT INTO public.receivable_items (
          id, portfolio_id, lease_id, tenant_id, property_id, unit_id, item_type,
          label, period_month, due_date, currency_code, expected_amount,
          allocated_amount, outstanding_amount, status, origin
        ) VALUES (
          '${ids.oldReceivable}', '${portfolio}', '${ids.lease}', '${ids.tenant}',
          '${ids.property}', '${ids.unit}', 'rent', 'Monthly Rent', '2026-07',
          '2026-07-01', 'EUR', 1000, 0, 1000, 'open', 'lease-schedule'
        );
      `);
      const row = async (table: string, id: string) =>
        (await db.query<{ data: Record<string, unknown> }>(
          `SELECT to_jsonb(t) AS data FROM public.${table} AS t WHERE id = $1::uuid`, [id],
        )).rows[0].data;
      const lease = await row("leases", ids.lease);
      const prior = await row("lease_amendments", ids.prior);
      const target = await row("lease_amendments", ids.target);
      const oldReceivable = await row("receivable_items", ids.oldReceivable);
      const assignment = (await db.query<{ data: Record<string, unknown> }>(
        `SELECT to_jsonb(a) AS data FROM public.lease_unit_assignments AS a WHERE lease_id = $1::uuid`, [ids.lease],
      )).rows[0].data;
      const newReceivable = {
        id: ids.newReceivable, portfolio_id: portfolio, lease_id: ids.lease,
        tenant_id: ids.tenant, property_id: ids.property, unit_id: ids.unit,
        item_type: "rent", label: "Monthly Rent", period_month: "2026-07",
        due_date: "2026-07-01", currency_code: "EUR", expected_amount: 1100,
        allocated_amount: 0, outstanding_amount: 1100, status: "overdue", origin: "lease-schedule",
        priority: 10, notes: "",
      };
      const activate = (
        targetId: string, nextLease: object, amendmentRows: object[],
        removedRows: object[], freshRows: object[], expectedUpdatedAt: unknown,
        assignmentRows: object[] = [],
      ) => db.query<{ result: Record<string, unknown> }>(`
        SELECT public.client_activate_amendment_with_schedule(
          $1::uuid, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb,
          $6::jsonb, '[]'::jsonb, $7::timestamptz
        ) AS result
      `, [targetId, JSON.stringify(nextLease), JSON.stringify(assignmentRows), JSON.stringify(amendmentRows),
        JSON.stringify(removedRows), JSON.stringify(freshRows), expectedUpdatedAt]);
      await db.exec(`
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.user]);
      await db.exec("SET ROLE authenticated");
      const saved = (await activate(ids.target, { ...lease, lifecycle_stage: "active", monthly_rent: 1100 }, [
        { ...target, status: "active", supersedes_amendment_id: ids.prior, expected_updated_at: target.updated_at },
        { ...prior, status: "ended", expected_updated_at: prior.updated_at },
      ], [{ id: ids.oldReceivable, expected_updated_at: oldReceivable.updated_at }],
      [newReceivable], lease.updated_at,
      [{ ...assignment, rent_share: 1100, expected_updated_at: assignment.updated_at }])).rows[0].result;
      await db.exec("RESET ROLE");
      expect(saved.removed_receivable_ids).toEqual([ids.oldReceivable]);
      expect((await row("leases", ids.lease)).monthly_rent).toBe(1100);
      expect((await row("leases", ids.lease)).lifecycle_stage).toBe("active");
      expect((await row("lease_amendments", ids.target)).status).toBe("active");
      expect((await row("lease_amendments", ids.prior)).status).toBe("ended");
      expect((await row("lease_unit_assignments", assignment.id as string)).rent_share).toBe(1100);
      expect((await db.query("SELECT count(*)::int AS n FROM public.receivable_items WHERE id = $1::uuid", [ids.oldReceivable])).rows[0]).toEqual({ n: 0 });
      expect((await row("receivable_items", ids.newReceivable)).expected_amount).toBe(1100);
      expect((await row("receivable_items", ids.newReceivable)).status).toBe("overdue");

      await db.exec(`
        INSERT INTO public.lease_amendments
          (id, portfolio_id, lease_id, amendment_number, title, effective_date, status)
          VALUES ('${ids.next}', '${portfolio}', '${ids.lease}', 3, 'Next', '2026-08-01', 'scheduled');
      `);
      const currentLease = await row("leases", ids.lease);
      const currentPrior = await row("lease_amendments", ids.target);
      const next = await row("lease_amendments", ids.next);
      await expect(activate(ids.next, { ...currentLease, monthly_rent: 1200 }, [
        { ...next, status: "active", supersedes_amendment_id: ids.target, expected_updated_at: next.updated_at },
        { ...currentPrior, status: "ended", expected_updated_at: currentPrior.updated_at },
      ], [], [], lease.updated_at)).rejects.toThrow("Lease changed since activation was prepared");
      await expect(activate(ids.next, { ...currentLease, monthly_rent: 1200 }, [
        { ...next, status: "active", supersedes_amendment_id: ids.target, expected_updated_at: next.updated_at },
        { ...currentPrior, status: "ended", expected_updated_at: currentPrior.updated_at },
      ], [], [{ ...newReceivable, id: "00000000-0000-4000-8000-000000000011", unit_id: null, period_month: "2026-09", due_date: "2026-09-01" }], currentLease.updated_at))
        .rejects.toThrow("Generated receivable has an invalid scope or date");
      await expect(activate(ids.next, { ...currentLease, monthly_rent: 1200 }, [
        { ...next, status: "active", supersedes_amendment_id: ids.target, expected_updated_at: next.updated_at },
        { ...currentPrior, status: "ended", expected_updated_at: currentPrior.updated_at },
      ], [], [{ ...newReceivable, id: "00000000-0000-4000-8000-000000000011", period_month: "2026-09", due_date: "2026-09-01", status: "paid" }], currentLease.updated_at))
        .rejects.toThrow("Generated receivable has an invalid scope or date");
      expect((await row("leases", ids.lease)).monthly_rent).toBe(1100);
      expect((await row("lease_amendments", ids.target)).status).toBe("active");
      expect((await row("lease_amendments", ids.next)).status).toBe("scheduled");

      const viewer = "00000000-0000-4000-8000-000000000012";
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES ('${viewer}', 'viewer@example.test', '{}'::jsonb);
        INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
          VALUES ('${portfolio}', '${viewer}', 'viewer');
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      await db.query("SELECT set_config('test.user_id', $1, false)", [viewer]);
      await db.exec("SET ROLE authenticated");
      try {
        expect((await db.query("SELECT count(*)::int AS n FROM public.leases WHERE id = $1::uuid", [ids.lease])).rows[0]).toEqual({ n: 1 });
        await expect(activate(ids.next, { ...currentLease, monthly_rent: 1200 }, [
          { ...next, status: "active", supersedes_amendment_id: ids.target, expected_updated_at: next.updated_at },
          { ...currentPrior, status: "ended", expected_updated_at: currentPrior.updated_at },
        ], [], [], currentLease.updated_at)).rejects.toThrow();
      } finally {
        await db.exec("RESET ROLE");
      }
      expect((await row("leases", ids.lease)).monthly_rent).toBe(1100);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("edits a lease and its unit windows atomically with overlap and version checks", async () => {
    const db = await migratedDatabase();
    const ids = {
      user: "43000000-0000-4000-8000-000000000001",
      property: "43000000-0000-4000-8000-000000000002",
      unitA: "43000000-0000-4000-8000-000000000003",
      unitB: "43000000-0000-4000-8000-000000000004",
      tenant: "43000000-0000-4000-8000-000000000005",
      lease: "43000000-0000-4000-8000-000000000006",
      otherLease: "43000000-0000-4000-8000-000000000007",
      assignmentA: "43000000-0000-4000-8000-000000000008",
      assignmentB: "43000000-0000-4000-8000-000000000009",
      propertyB: "43000000-0000-4000-8000-000000000015",
      unitC: "43000000-0000-4000-8000-000000000016",
    };
    try {
      await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('${ids.user}', 'assignment-edit@example.test', '{}'::jsonb)`);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.user],
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${ids.property}', '${portfolio}', 'Unit edit', 'UE'),
            ('${ids.propertyB}', '${portfolio}', 'Other property', 'OTHER');
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('${ids.unitA}', '${portfolio}', '${ids.property}', 'UE-A'),
            ('${ids.unitB}', '${portfolio}', '${ids.property}', 'UE-B'),
            ('${ids.unitC}', '${portfolio}', '${ids.propertyB}', 'OTHER-C');
        INSERT INTO public.tenants (id, portfolio_id, first_name, status)
          VALUES ('${ids.tenant}', '${portfolio}', 'Edit', 'active');
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, billing_tenant_id, lifecycle_stage, start_date, end_date, monthly_rent)
          VALUES ('${ids.lease}', '${portfolio}', '${ids.property}', 'UE-LEASE',
            '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'active', '2026-01-01', '2027-12-31', 1000),
            ('${ids.otherLease}', '${portfolio}', '${ids.property}', 'UE-OTHER',
            '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'active', '2026-01-01', '2026-10-31', 800);
        INSERT INTO public.lease_unit_assignments
          (id, portfolio_id, lease_id, unit_id, start_date, end_date, rent_share, charges_share)
          VALUES ('${ids.assignmentA}', '${portfolio}', '${ids.lease}', '${ids.unitA}',
            '2026-01-01', '2027-12-31', 1000, 0),
            ('${ids.assignmentB}', '${portfolio}', '${ids.otherLease}', '${ids.unitB}',
            '2026-01-01', NULL, 800, 0);
      `);
      await expect(db.query(
        "UPDATE public.leases SET property_id = $1::uuid WHERE id = $2::uuid",
        [ids.propertyB, ids.lease],
      )).rejects.toThrow("cannot be moved to another property");
      await expect(db.query(
        "UPDATE public.units SET property_id = $1::uuid WHERE id = $2::uuid",
        [ids.propertyB, ids.unitA],
      )).rejects.toThrow("assigned unit cannot be moved");
      await expect(db.query(
        `INSERT INTO public.lease_unit_assignments
          (id, portfolio_id, lease_id, unit_id, start_date, rent_share, charges_share)
         VALUES ('43000000-0000-4000-8000-000000000017', $1::uuid, $2::uuid, $3::uuid,
           '2027-01-01', 100, 0)`,
        [portfolio, ids.lease, ids.unitC],
      )).rejects.toThrow("must belong to the lease property");
      await expect(db.query(
        "UPDATE public.lease_unit_assignments SET unit_id = $1::uuid WHERE id = $2::uuid",
        [ids.unitC, ids.assignmentA],
      )).rejects.toThrow("must belong to the lease property");
      const lease = (await db.query<{ data: Record<string, unknown> }>(
        "SELECT to_jsonb(item) AS data FROM public.leases AS item WHERE id = $1::uuid", [ids.lease],
      )).rows[0].data;
      const currentAssignments = (await db.query<{ data: Record<string, unknown> }>(
        "SELECT to_jsonb(item) AS data FROM public.lease_unit_assignments AS item WHERE lease_id = $1::uuid",
        [ids.lease],
      )).rows.map(row => row.data);
      const { created_at: _created, updated_at: _updated, ...leasePatch } = lease;
      const expected = currentAssignments.map(item => ({ id: item.id, updated_at: item.updated_at }));
      const a = { id: ids.assignmentA, lease_id: ids.lease, unit_id: ids.unitA,
        start_date: "2026-01-01", end_date: "2027-12-31", rent_share: 1000, charges_share: 0 };
      const b = { id: "43000000-0000-4000-8000-000000000010", lease_id: ids.lease,
        unit_id: ids.unitB, start_date: "2026-06-01", end_date: "2027-12-31",
        rent_share: 900, charges_share: 0 };
      const save = (version: unknown, expectedRows: object[], assignments: object[], propertyId = ids.property) =>
        db.query<{ result: { lease: Record<string, unknown>; assignments: object[] } }>(
          "SELECT public.save_lease_with_assignments($1::jsonb, '[]'::jsonb, $2::timestamptz, $3::jsonb, $4::jsonb, NULL::date, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb) AS result",
          [JSON.stringify({ ...leasePatch, property_id: propertyId, monthly_rent: 1900 }),
            version, JSON.stringify(expectedRows), JSON.stringify(assignments)],
        );
      const protectedId = "43000000-0000-4000-8000-000000000018";
      await db.exec("BEGIN");
      await db.exec(`
        INSERT INTO public.receivable_items (id, portfolio_id, lease_id, tenant_id,
          property_id, unit_id, item_type, label, period_month, due_date,
          currency_code, expected_amount, allocated_amount, outstanding_amount,
          status, origin, priority, notes)
        VALUES ('${protectedId}', '${portfolio}', '${ids.lease}', '${ids.tenant}',
          '${ids.property}', '${ids.unitA}', 'rent', 'Protected rent', '2026-03', '2026-03-01',
          'EUR', 100, 100, 0, 'paid', 'lease-schedule', 10, '');
      `);
      await db.exec("SAVEPOINT protected_receivable_case");
      await expect(save(lease.updated_at, expected, [{ ...a, start_date: "2026-04-01" },
        { ...b, start_date: "2026-11-01" },
      ])).rejects.toThrow("cannot be detached from existing lease receivable");
      await db.exec("ROLLBACK TO SAVEPOINT protected_receivable_case");
      expect((await db.query<{ start_date: string }>(
        "SELECT start_date::text FROM public.lease_unit_assignments WHERE id = $1::uuid", [ids.assignmentA],
      )).rows[0].start_date).toBe("2026-01-01");
      await db.exec("ROLLBACK");
      await expect(save(lease.updated_at, expected, [a], ids.unitB))
        .rejects.toThrow("cannot be moved to another property");
      await expect(save(lease.updated_at, expected, [a, b])).rejects.toThrow("conflicts with lease UE-OTHER");
      await expect(save(lease.updated_at, expected, [{ ...a, rent_share: -1 },
        { ...b, start_date: "2026-11-01" },
      ])).rejects.toThrow("negative share");
      expect(Number((await db.query<{ monthly_rent: string }>(
        "SELECT monthly_rent FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rows[0].monthly_rent)).toBe(1000);
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.lease_unit_assignments WHERE lease_id = $1::uuid", [ids.lease],
      )).rows[0].n).toBe(1);

      await db.exec(`
        CREATE FUNCTION public.reject_new_lease_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.id = '43000000-0000-4000-8000-000000000010'::uuid THEN
          RAISE EXCEPTION 'injected assignment insert failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_new_lease_assignment BEFORE INSERT ON public.lease_unit_assignments
          FOR EACH ROW EXECUTE FUNCTION public.reject_new_lease_assignment();
      `);
      await expect(save(lease.updated_at, expected, [a,
        { ...b, start_date: "2026-11-01" },
      ])).rejects.toThrow("injected assignment insert failure");
      expect(Number((await db.query<{ monthly_rent: string }>(
        "SELECT monthly_rent FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rows[0].monthly_rent)).toBe(1000);
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.lease_unit_assignments WHERE lease_id = $1::uuid", [ids.lease],
      )).rows[0].n).toBe(1);
      await db.exec("DROP TRIGGER reject_new_lease_assignment ON public.lease_unit_assignments");

      const result = (await save(lease.updated_at, expected, [a,
        { ...b, start_date: "2026-11-01" },
      ])).rows[0].result;
      expect(Number(result.lease.monthly_rent)).toBe(1900);
      expect(result.assignments).toHaveLength(2);
      await expect(save(result.lease.updated_at, expected, [a,
        { ...b, start_date: "2026-11-01" },
      ])).rejects.toThrow("assignments changed since this form was loaded");
      const openId = "43000000-0000-4000-8000-000000000012";
      const paidId = "43000000-0000-4000-8000-000000000013";
      const replacementId = "43000000-0000-4000-8000-000000000014";
      await db.exec(`
        ALTER TABLE public.receivable_items DISABLE TRIGGER guard_new_lease_schedule_assignment;
        INSERT INTO public.receivable_items (id, portfolio_id, lease_id, tenant_id,
          property_id, unit_id, item_type, label, period_month, due_date,
          currency_code, expected_amount, allocated_amount, outstanding_amount,
          status, origin, priority, notes)
        VALUES ('${openId}', '${portfolio}', '${ids.lease}', '${ids.tenant}',
          '${ids.property}', '${ids.unitA}', 'rent', 'Old rent', '2027-01', '2027-01-01',
          'EUR', 1000, 0, 1000, 'open', 'lease-schedule', 10, ''),
          ('${paidId}', '${portfolio}', '${ids.lease}', '${ids.tenant}',
          '${ids.property}', '${ids.unitA}', 'rent', 'Paid rent', '2027-02', '2027-02-01',
          'EUR', 1000, 1000, 0, 'paid', 'lease-schedule', 10, '');
        ALTER TABLE public.receivable_items ENABLE TRIGGER guard_new_lease_schedule_assignment;
      `);
      const scheduleBefore = (await db.query<{ data: Record<string, unknown> }>(
        "SELECT to_jsonb(item) AS data FROM public.receivable_items AS item WHERE lease_id = $1::uuid ORDER BY due_date",
        [ids.lease],
      )).rows.map(row => row.data);
      const expectedSchedule = scheduleBefore.map(item => ({ id: item.id, updated_at: item.updated_at }));
      const replacement = { ...scheduleBefore[0], id: replacementId,
        unit_id: ids.unitB, label: "Recalculated rent", expected_amount: 2100,
        allocated_amount: 0, outstanding_amount: 2100 };
      const newLease: Record<string, unknown> = { ...result.lease, monthly_rent: 2100 };
      const { created_at: _newCreated, updated_at: _newUpdated, ...newLeasePatch } = newLease;
      const savedAssignments = (result.assignments as Array<{ id: string; updated_at: string }>).map(item => ({
        id: item.id, updated_at: item.updated_at,
      }));
      const saveWithSchedule = (fresh: Record<string, unknown>, expectedRows = expectedSchedule) =>
        db.query<{ result: { lease: Record<string, unknown>; receivables: object[]; removed_receivable_ids: string[] } }>(
          "SELECT public.save_lease_with_assignments($1::jsonb, '[]'::jsonb, $2::timestamptz, $3::jsonb, $4::jsonb, $5::date, $6::jsonb, $7::jsonb, $8::jsonb) AS result",
          [JSON.stringify(newLeasePatch), result.lease.updated_at, JSON.stringify(savedAssignments),
            JSON.stringify([a, { ...b, start_date: "2026-11-01", rent_share: 1100 }]), "2027-01-01",
            JSON.stringify(expectedRows), JSON.stringify([{ id: openId, expected_updated_at: scheduleBefore[0].updated_at }]),
            JSON.stringify([fresh])],
        );
      await expect(saveWithSchedule(replacement, expectedSchedule.slice(0, 1)))
        .rejects.toThrow("receivables changed since this form was loaded");
      await expect(saveWithSchedule({ ...replacement, unit_id: ids.unitC }))
        .rejects.toThrow("Generated receivable has an invalid scope or date");
      await db.exec(`
        CREATE FUNCTION public.reject_lease_receivable_replacement() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.id = '${replacementId}'::uuid THEN
          RAISE EXCEPTION 'injected receivable insert failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_lease_receivable_replacement BEFORE INSERT ON public.receivable_items
          FOR EACH ROW EXECUTE FUNCTION public.reject_lease_receivable_replacement();
      `);
      await expect(saveWithSchedule(replacement)).rejects.toThrow("injected receivable insert failure");
      expect(Number((await db.query<{ monthly_rent: string }>(
        "SELECT monthly_rent FROM public.leases WHERE id = $1::uuid", [ids.lease],
      )).rows[0].monthly_rent)).toBe(1900);
      expect((await db.query<{ id: string }>(
        "SELECT id FROM public.receivable_items WHERE lease_id = $1::uuid ORDER BY due_date", [ids.lease],
      )).rows.map(item => item.id)).toEqual([openId, paidId]);
      await db.exec("DROP TRIGGER reject_lease_receivable_replacement ON public.receivable_items");
      const scheduled = (await saveWithSchedule(replacement)).rows[0].result;
      expect(Number(scheduled.lease.monthly_rent)).toBe(2100);
      expect(scheduled.removed_receivable_ids).toEqual([openId]);
      expect(scheduled.receivables).toHaveLength(1);
      expect((await db.query<{ id: string }>(
        "SELECT id FROM public.receivable_items WHERE lease_id = $1::uuid ORDER BY due_date", [ids.lease],
      )).rows.map(item => item.id)).toEqual([replacementId, paidId]);
      const viewer = "43000000-0000-4000-8000-000000000011";
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES ('${viewer}', 'assignment-viewer@example.test', '{}'::jsonb);
        INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
          VALUES ('${portfolio}', '${viewer}', 'viewer');
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      await db.query("SELECT set_config('test.user_id', $1, false)", [viewer]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(db.query("DELETE FROM public.receivable_items WHERE id = $1::uuid", [replacementId]))
          .rejects.toThrow("permission denied");
        await expect(db.query(
          "SELECT public.client_save_lease_with_assignments($1::jsonb, '[]'::jsonb, now(), '[]'::jsonb, '[]'::jsonb, NULL::date, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)",
          [JSON.stringify({ id: ids.lease, portfolio_id: portfolio })],
        )).rejects.toThrow("Lease edit is not permitted");
        await expect(save(result.lease.updated_at,
          (result.assignments as Array<{ id: string; updated_at: string }>).map(item => ({
            id: item.id, updated_at: item.updated_at,
          })), [a, { ...b, start_date: "2026-11-01" }])).rejects.toThrow();
      } finally {
        await db.exec("RESET ROLE");
      }
      const latestLease = (await db.query<{ data: Record<string, unknown> }>(
        "SELECT to_jsonb(item) AS data FROM public.leases AS item WHERE id = $1::uuid", [ids.lease],
      )).rows[0].data;
      const latestAssignments = (await db.query<{ data: Record<string, unknown> }>(
        "SELECT to_jsonb(item) AS data FROM public.lease_unit_assignments AS item WHERE lease_id = $1::uuid ORDER BY id",
        [ids.lease],
      )).rows.map(row => row.data);
      const latestReceivables = (await db.query<{ data: Record<string, unknown> }>(
        "SELECT to_jsonb(item) AS data FROM public.receivable_items AS item WHERE lease_id = $1::uuid AND due_date >= '2027-01-01' ORDER BY id",
        [ids.lease],
      )).rows.map(row => row.data);
      const openReceivable = latestReceivables.find(row => row.id === replacementId);
      expect(openReceivable).toBeDefined();
      const { created_at: _latestCreated, updated_at: _latestUpdated, ...leasePayload } = latestLease;
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.user]);
      await db.exec("SET ROLE authenticated");
      try {
        const saved = await db.query<{ result: { lease: { id: string } } }>(
          "SELECT public.client_save_lease_with_assignments($1::jsonb, '[]'::jsonb, $2::timestamptz, $3::jsonb, $4::jsonb, '2027-01-01'::date, $5::jsonb, $6::jsonb, $7::jsonb) AS result",
          [JSON.stringify({ ...leasePayload, monthly_rent: 2200 }), latestLease.updated_at,
            JSON.stringify(latestAssignments.map(row => ({ id: row.id, updated_at: row.updated_at }))),
            JSON.stringify(latestAssignments.map(row => row.id === ids.assignmentA
              ? row : { ...row, rent_share: 1200 })),
            JSON.stringify(latestReceivables.map(row => ({ id: row.id, updated_at: row.updated_at }))),
            JSON.stringify([{ id: replacementId, expected_updated_at: openReceivable?.updated_at }]),
            JSON.stringify([{ ...replacement, id: "43000000-0000-4000-8000-000000000015",
              expected_amount: 2200, outstanding_amount: 2200 }]),
          ],
        );
        expect(saved.rows[0].result.lease.id).toBe(ids.lease);
      } finally {
        await db.exec("RESET ROLE");
      }
      expect((await db.query<{ id: string }>(
        "SELECT id FROM public.receivable_items WHERE lease_id = $1::uuid AND due_date = '2027-01-01'", [ids.lease],
      )).rows.map(row => row.id)).toEqual(["43000000-0000-4000-8000-000000000015"]);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("deletes a charges reconciliation through the scoped wrapper after direct deletion is revoked", async () => {
    const db = await migratedDatabase();
    const ids = {
      user: "65000000-0000-4000-8000-000000000001",
      viewer: "65000000-0000-4000-8000-000000000002",
      property: "65000000-0000-4000-8000-000000000003",
      tenant: "65000000-0000-4000-8000-000000000004",
      lease: "65000000-0000-4000-8000-000000000005",
      receivable: "65000000-0000-4000-8000-000000000006",
      reconciliation: "65000000-0000-4000-8000-000000000007",
    };
    try {
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
          ('${ids.user}', 'reconciliation-owner@example.test', '{}'::jsonb),
          ('${ids.viewer}', 'reconciliation-viewer@example.test', '{}'::jsonb);
      `);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [ids.user],
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
          VALUES ('${portfolio}', '${ids.viewer}', 'viewer');
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${ids.property}', '${portfolio}', 'Reconciliation Property', 'RECON');
        INSERT INTO public.tenants (id, portfolio_id, first_name)
          VALUES ('${ids.tenant}', '${portfolio}', 'Reconciliation');
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, billing_tenant_id, lifecycle_stage, start_date, end_date, monthly_rent)
          VALUES ('${ids.lease}', '${portfolio}', '${ids.property}', 'RECON-LEASE',
            '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'active', '2026-01-01', '2026-12-31', 1000);
        INSERT INTO public.receivable_items (id, portfolio_id, lease_id, tenant_id,
          property_id, item_type, label, due_date, currency_code, expected_amount,
          allocated_amount, outstanding_amount, status, origin, priority, notes)
          VALUES ('${ids.receivable}', '${portfolio}', '${ids.lease}', '${ids.tenant}',
            '${ids.property}', 'charges-adjustment', 'Charges adjustment', '2026-05-01',
            'EUR', 30, 0, 30, 'open', 'adjustment', 25, '');
        INSERT INTO public.charges_reconciliations (id, portfolio_id, lease_id,
          period_start, period_end, provisions_collected, actual_recoverable,
          delta, resolution, receivable_item_id)
          VALUES ('${ids.reconciliation}', '${portfolio}', '${ids.lease}',
            '2026-01-01', '2026-03-31', 0, 30, -30, 'owe', '${ids.receivable}');
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      const version = (await db.query<{ updated_at: string }>(
        "SELECT updated_at FROM public.charges_reconciliations WHERE id = $1::uuid", [ids.reconciliation],
      )).rows[0].updated_at;
      const remove = () => db.query(
        "SELECT public.client_delete_charges_reconciliation($1::uuid, $2::uuid, $3::timestamptz)",
        [ids.reconciliation, portfolio, version],
      );
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.viewer]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(db.query("DELETE FROM public.receivable_items WHERE id = $1::uuid", [ids.receivable]))
          .rejects.toThrow("permission denied");
        await expect(db.query("DELETE FROM public.charges_reconciliations WHERE id = $1::uuid", [ids.reconciliation]))
          .rejects.toThrow("permission denied");
        await expect(remove()).rejects.toThrow("Reconciliation deletion is not permitted");
      } finally {
        await db.exec("RESET ROLE");
      }
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.user]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(db.query(
          "SELECT public.client_delete_charges_reconciliation($1::uuid, $2::uuid, $3::timestamptz)",
          [ids.reconciliation, "65000000-0000-4000-8000-000000000099", version],
        )).rejects.toThrow("Reconciliation deletion is not permitted");
        await remove();
      } finally {
        await db.exec("RESET ROLE");
      }
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.charges_reconciliations WHERE id = $1::uuid", [ids.reconciliation],
      )).rows[0].n).toBe(0);
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.receivable_items WHERE id = $1::uuid", [ids.receivable],
      )).rows[0].n).toBe(0);
    } finally {
      await db.close();
    }
  }, 120_000);

  it("updates a lease and tenant statuses atomically with version and role checks", async () => {
    const db = await migratedDatabase();
    const ids = {
      user: "10000000-0000-4000-8000-000000000001",
      property: "10000000-0000-4000-8000-000000000002",
      tenant: "10000000-0000-4000-8000-000000000003",
      lease: "10000000-0000-4000-8000-000000000004",
      viewer: "10000000-0000-4000-8000-000000000005",
      unit: "10000000-0000-4000-8000-000000000006",
    };
    try {
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES ('${ids.user}', 'owner@example.test', '{}'::jsonb);
      `);
      const portfolio = (await db.query<{ id: string }>(
        `SELECT id FROM public.portfolios WHERE created_by = '${ids.user}'`,
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${ids.property}', '${portfolio}', 'QA Property', 'QA');
        INSERT INTO public.tenants (id, portfolio_id, first_name, status)
          VALUES ('${ids.tenant}', '${portfolio}', 'QA', 'applicant');
        INSERT INTO public.leases (
          id, portfolio_id, property_id, lease_reference, tenant_ids, billing_tenant_id,
          lifecycle_stage, start_date, end_date, monthly_rent
        ) VALUES (
          '${ids.lease}', '${portfolio}', '${ids.property}', 'QA-LEASE',
          '["${ids.tenant}"]'::jsonb, '${ids.tenant}', 'draft',
          '2026-01-01', '2026-12-31', 1000
        );
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('${ids.unit}', '${portfolio}', '${ids.property}', 'QA-UNIT');
        INSERT INTO public.lease_unit_assignments (portfolio_id, lease_id, unit_id,
          start_date, end_date, rent_share, charges_share)
          VALUES ('${portfolio}', '${ids.lease}', '${ids.unit}', '2026-01-01', '2026-12-31', 1000, 0);
      `);
      const row = async (table: string, id: string) =>
        (await db.query<{ data: Record<string, unknown> }>(
          `SELECT to_jsonb(t) AS data FROM public.${table} AS t WHERE id = $1::uuid`, [id],
        )).rows[0].data;
      const lease = await row("leases", ids.lease);
      const tenant = await row("tenants", ids.tenant);
      expect((await db.query<{ from_stage: string | null; to_stage: string; reason: string }>(
        "SELECT from_stage, to_stage, reason FROM public.lease_status_changes WHERE lease_id = $1::uuid",
        [ids.lease],
      )).rows).toEqual([{ from_stage: null, to_stage: "draft", reason: "created" }]);
      const { created_at: _created, updated_at: _updated, ...leasePatch } = lease;
      const save = (patch: object, tenantRows: object[], version: unknown, reason: string | null = null) =>
        db.query<{ result: Record<string, unknown> }>(
          "SELECT public.save_lease_with_tenant_statuses($1::jsonb, $2::jsonb, $3::timestamptz, $4::text, NULL::text) AS result",
          [JSON.stringify(patch), JSON.stringify(tenantRows), version, reason],
        );
      await expect(save({ ...leasePatch, lifecycle_stage: "active", monthly_rent: 1200 }, [
        { id: ids.tenant, status: "active", expected_updated_at: "2020-01-01T00:00:00Z" },
      ], lease.updated_at)).rejects.toThrow("Tenant changed since the lease was opened");
      expect((await row("leases", ids.lease)).monthly_rent).toBe(1000);
      expect((await row("tenants", ids.tenant)).status).toBe("applicant");

      await db.exec(`
        CREATE OR REPLACE FUNCTION public.fail_lease_history_insert()
          RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'status history failed'; END $$;
        CREATE TRIGGER fail_lease_history_insert BEFORE INSERT ON public.lease_status_changes
          FOR EACH ROW EXECUTE FUNCTION public.fail_lease_history_insert();
      `);
      await expect(save({ ...leasePatch, lifecycle_stage: "active", monthly_rent: 1200 }, [
        { id: ids.tenant, status: "active", expected_updated_at: tenant.updated_at },
      ], lease.updated_at, "manual-activated")).rejects.toThrow("status history failed");
      expect((await row("leases", ids.lease)).lifecycle_stage).toBe("draft");
      expect((await row("tenants", ids.tenant)).status).toBe("applicant");
      await db.exec("DROP TRIGGER fail_lease_history_insert ON public.lease_status_changes");

      await expect(save({ ...leasePatch, lifecycle_stage: "active", monthly_rent: 1200 }, [
        { id: ids.tenant, status: "active", expected_updated_at: tenant.updated_at },
      ], lease.updated_at, "manual-activated")).rejects.toThrow("monthly totals do not match unit shares");
      const result = (await save({ ...leasePatch, lifecycle_stage: "active", notes: "Activated" }, [
        { id: ids.tenant, status: "active", expected_updated_at: tenant.updated_at },
      ], lease.updated_at, "manual-activated")).rows[0].result;
      expect((result.lease as Record<string, unknown>).notes).toBe("Activated");
      expect((await row("leases", ids.lease)).lifecycle_stage).toBe("active");
      expect((await row("tenants", ids.tenant)).status).toBe("active");
      expect((await db.query<{ from_stage: string; to_stage: string; reason: string }>(
        "SELECT from_stage, to_stage, reason FROM public.lease_status_changes WHERE lease_id = $1::uuid AND from_stage = 'draft'",
        [ids.lease],
      )).rows).toEqual([{ from_stage: "draft", to_stage: "active", reason: "manual-activated" }]);
      const { created_at: _createdAgain, updated_at: _updatedAgain, ...sameStagePatch } = result.lease as Record<string, unknown>;
      const sameStageResult = (await save({ ...sameStagePatch, notes: "Edited without a lifecycle change" }, [],
        (result.lease as Record<string, unknown>).updated_at)).rows[0].result;
      expect((await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM public.lease_status_changes WHERE lease_id = $1::uuid AND from_stage = 'draft'",
        [ids.lease],
      )).rows[0].n).toBe(1);
      await expect(save({ ...leasePatch, monthly_rent: 1300 }, [], lease.updated_at))
        .rejects.toThrow("Lease changed since it was opened");

      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES ('${ids.viewer}', 'viewer@example.test', '{}'::jsonb);
        INSERT INTO public.portfolio_members (portfolio_id, user_id, role)
          VALUES ('${portfolio}', '${ids.viewer}', 'viewer');
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.viewer]);
      await db.exec("SET ROLE authenticated");
      try {
        expect((await db.query("SELECT count(*)::int AS n FROM public.leases WHERE id = $1::uuid", [ids.lease])).rows[0]).toEqual({ n: 1 });
        const current = (sameStageResult.lease as Record<string, unknown>);
        await expect(save({ ...leasePatch, monthly_rent: 1300 }, [], current.updated_at)).rejects.toThrow();
      } finally {
        await db.exec("RESET ROLE");
      }
      expect((await row("leases", ids.lease)).monthly_rent).toBe(1000);

      await db.query("SELECT set_config('test.user_id', $1, false)", [ids.user]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(db.query(
          "UPDATE public.leases SET lifecycle_stage = 'signed' WHERE id = $1::uuid", [ids.lease],
        )).rejects.toThrow("permission denied");
      } finally {
        await db.exec("RESET ROLE");
      }
      expect((await row("leases", ids.lease)).lifecycle_stage).toBe("active");
    } finally {
      await db.close();
    }
  }, 120_000);

  it("restricts client lease metadata edits without bypassing billing regeneration", async () => {
    const db = await migratedDatabase();
    const user = "11000000-0000-4000-8000-000000000001";
    const property = "11000000-0000-4000-8000-000000000002";
    const leaseId = "11000000-0000-4000-8000-000000000003";
    const tenantId = "11000000-0000-4000-8000-000000000004";
    const unlinkedTenantId = "11000000-0000-4000-8000-000000000005";
    const unitId = "11000000-0000-4000-8000-000000000006";
    try {
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES ('${user}', 'lease-metadata@example.test', '{}'::jsonb);
      `);
      const portfolio = (await db.query<{ id: string }>(
        "SELECT id FROM public.portfolios WHERE created_by = $1::uuid", [user],
      )).rows[0].id;
      await db.exec(`
        INSERT INTO public.properties (id, portfolio_id, name, reference_code)
          VALUES ('${property}', '${portfolio}', 'Lease Metadata', 'META');
        INSERT INTO public.tenants (id, portfolio_id, first_name, status)
          VALUES ('${tenantId}', '${portfolio}', 'Metadata', 'applicant');
        INSERT INTO public.tenants (id, portfolio_id, first_name, status)
          VALUES ('${unlinkedTenantId}', '${portfolio}', 'Unlinked', 'applicant');
        INSERT INTO public.leases (id, portfolio_id, property_id, lease_reference,
          tenant_ids, billing_tenant_id, lifecycle_stage, start_date, end_date, monthly_rent)
          VALUES ('${leaseId}', '${portfolio}', '${property}', 'META-001',
            '["${tenantId}"]'::jsonb, '${tenantId}',
            'draft', '2026-01-01', '2026-12-31', 1000);
        INSERT INTO public.units (id, portfolio_id, property_id, unit_code)
          VALUES ('${unitId}', '${portfolio}', '${property}', 'META-UNIT');
        INSERT INTO public.lease_unit_assignments (portfolio_id, lease_id, unit_id,
          start_date, end_date, rent_share, charges_share)
          VALUES ('${portfolio}', '${leaseId}', '${unitId}', '2026-01-01', '2026-12-31', 1000, 0);
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated;
      `);
      const read = async () => (await db.query<{ data: Record<string, unknown> }>(
        "SELECT to_jsonb(lease) AS data FROM public.leases AS lease WHERE id = $1::uuid", [leaseId],
      )).rows[0].data;
      const original = await read();
      const { created_at: _created, updated_at: _updated, ...patch } = original;
      const save = (payload: object, version: unknown, tenantRows: object[] = []) => db.query(
        "SELECT public.client_save_lease_metadata($1::jsonb, $2::jsonb, $3::timestamptz)",
        [JSON.stringify(payload), JSON.stringify(tenantRows), version],
      );
      await db.query("SELECT set_config('test.user_id', $1, false)", [user]);
      await db.exec("SET ROLE authenticated");
      try {
        await expect(db.query(
          "SELECT public.save_lease_with_tenant_statuses($1::jsonb, '[]'::jsonb, $2::timestamptz)",
          [JSON.stringify(patch), original.updated_at],
        )).rejects.toThrow("permission denied");
        await expect(db.query(
          "INSERT INTO public.lease_status_changes (lease_id, portfolio_id, to_stage) VALUES ($1::uuid, $2::uuid, 'signed')",
          [leaseId, portfolio],
        )).rejects.toThrow("permission denied");
        await expect(db.query(
          "UPDATE public.leases SET monthly_rent = 1200 WHERE id = $1::uuid", [leaseId],
        )).rejects.toThrow("permission denied");
        await expect(save({ ...patch, monthly_rent: 1200 }, original.updated_at))
          .rejects.toThrow("monthly_rent requires the lease billing workflow");
        await expect(save({ ...patch, end_date: "2027-12-31" }, original.updated_at))
          .rejects.toThrow("end_date requires the lease billing workflow");
        await expect(save({ ...patch, lifecycle_stage: "ended" }, original.updated_at))
          .rejects.toThrow("lease closure workflow");
        await expect(save({ ...patch, lifecycle_stage: "unknown" }, original.updated_at))
          .rejects.toThrow("Invalid lease lifecycle stage");
        await save({ ...patch, lifecycle_stage: "pending-signature", notes: "Ready" }, original.updated_at);
      } finally {
        await db.exec("RESET ROLE");
      }
      const saved = await read();
      expect(saved.lifecycle_stage).toBe("pending-signature");
      expect(saved.notes).toBe("Ready");
      expect(saved.monthly_rent).toBe(1000);
      expect(saved.end_date).toBe("2026-12-31");
      expect((await db.query<{ reason: string }>(
        "SELECT reason FROM public.lease_status_changes WHERE lease_id = $1::uuid AND from_stage = 'draft'",
        [leaseId],
      )).rows).toEqual([{ reason: "pending-signature" }]);
      const tenantVersion = (await db.query<{ updated_at: string }>(
        "SELECT updated_at FROM public.tenants WHERE id = $1::uuid", [tenantId],
      )).rows[0].updated_at;
      const { created_at: _savedCreated, updated_at: _savedUpdated, ...pendingPatch } = saved;
      await db.exec("SET ROLE authenticated");
      try {
        await expect(save(pendingPatch, saved.updated_at, [{
          id: tenantId, status: "former", expected_updated_at: tenantVersion,
        }])).rejects.toThrow("Tenant status must match linked leases");
        await expect(save({ ...pendingPatch, lifecycle_stage: "active" }, saved.updated_at))
          .rejects.toThrow("requires the linked tenant status update");
        await expect(save({ ...pendingPatch, lifecycle_stage: "active" }, saved.updated_at, [{
          id: tenantId, status: "former", expected_updated_at: tenantVersion,
        }])).rejects.toThrow("Tenant status must match linked leases");
        await save({ ...pendingPatch, lifecycle_stage: "active" }, saved.updated_at, [{
          id: tenantId, status: "active", expected_updated_at: tenantVersion,
        }]);
      } finally {
        await db.exec("RESET ROLE");
      }
      expect((await db.query<{ status: string }>(
        "SELECT status FROM public.tenants WHERE id = $1::uuid", [tenantId],
      )).rows[0].status).toBe("active");
      await db.exec("SET ROLE authenticated");
      try {
        await db.query(
          "UPDATE public.tenants SET status = 'active' WHERE id = $1::uuid", [unlinkedTenantId],
        );
        await expect(db.query(
          "UPDATE public.tenants SET status = 'former' WHERE id = $1::uuid", [tenantId],
        )).rejects.toThrow("Tenant status must match linked leases: expected active");
      } finally {
        await db.exec("RESET ROLE");
      }
      const active = await read();
      const { created_at: _activeCreated, updated_at: _activeUpdated, ...activePatch } = active;
      await db.exec("SET ROLE authenticated");
      try {
        await expect(save({ ...activePatch, lifecycle_stage: "draft" }, active.updated_at))
          .rejects.toThrow("Invalid lease lifecycle transition");
      } finally {
        await db.exec("RESET ROLE");
      }
      await db.query("UPDATE public.leases SET lifecycle_stage = 'ended' WHERE id = $1::uuid", [leaseId]);
      await db.query("UPDATE public.tenants SET status = 'former' WHERE id = $1::uuid", [tenantId]);
      expect((await db.query<{ status: string }>(
        "SELECT status FROM public.tenants WHERE id = $1::uuid", [tenantId],
      )).rows[0].status).toBe("former");
      const closed = await read();
      const { created_at: _closedCreated, updated_at: _closedUpdated, ...closedPatch } = closed;
      await db.exec("SET ROLE authenticated");
      try {
        await expect(save({ ...closedPatch, lifecycle_stage: "active" }, closed.updated_at))
          .rejects.toThrow("A closed lease cannot be reopened");
      } finally {
        await db.exec("RESET ROLE");
      }
    } finally {
      await db.close();
    }
  }, 120_000);
});
