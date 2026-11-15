// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";
import { checkTargetSchema, requiredSchemaChecks } from "../../scripts/check-target-schema.mjs";

const backend = "https://othaxlwgtqpodncnlglv.supabase.co";
const rows = () => requiredSchemaChecks.map(check_name => ({ check_name, present: true }));
const reply = (result: unknown, status = 201) => new Response(JSON.stringify(result), {
  status, headers: { "Content-Type": "application/json" },
});

async function addEmptyStorageSchema(db: PGlite) {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (
      id text PRIMARY KEY,
      public boolean NOT NULL DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
  `);
}

describe("read-only target schema gate", () => {
  it("requires custom document type constraints and both enforcement triggers", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec("CREATE ROLE service_role");
      const present = async () => {
        const result = await db.query<{ check_name: string; present: boolean }>(query);
        return result.rows.find(row => row.check_name === "lease_document_types_table")?.present;
      };
      expect(await present()).toBe(false);
      await db.exec(`
        CREATE TABLE public.lease_document_types (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, slug text NOT NULL, label text NOT NULL,
          CONSTRAINT lease_document_types_slug_format_check CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
          CONSTRAINT lease_document_types_label_check CHECK (length(trim(label)) BETWEEN 1 AND 80),
          CONSTRAINT lease_document_types_not_builtin_check CHECK (slug NOT IN ('initial-contract', 'amendment', 'supporting')),
          CONSTRAINT lease_document_types_portfolio_slug_key UNIQUE (portfolio_id, slug)
        );
        CREATE TABLE public.lease_documents (id uuid PRIMARY KEY, portfolio_id uuid, document_type text);
      `);
      expect(await present()).toBe(false);
      const migration = await readFile(new URL(
        "../../supabase/migrations/20261017130000_enforce_lease_document_types.sql",
        import.meta.url,
      ), "utf8");
      await db.exec(migration);
      expect(await present()).toBe(true);
      await db.exec("ALTER TABLE public.lease_documents DISABLE TRIGGER lease_documents_check_type");
      expect(await present()).toBe(false);
      await db.exec("ALTER TABLE public.lease_documents ENABLE TRIGGER lease_documents_check_type");
      await db.exec("ALTER TABLE public.lease_document_types DISABLE TRIGGER lease_document_types_prevent_used_delete");
      expect(await present()).toBe(false);
      await db.exec("ALTER TABLE public.lease_document_types ENABLE TRIGGER lease_document_types_prevent_used_delete");
      await db.exec("ALTER TABLE public.lease_document_types DROP CONSTRAINT lease_document_types_portfolio_slug_key");
      expect(await present()).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("requires a usable, service-only scheduled job health table", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec("CREATE ROLE service_role");
      const present = async () => {
        const result = await db.query<{ check_name: string; present: boolean }>(query);
        return result.rows.find(row => row.check_name === "scheduled_job_health_table")?.present;
      };
      expect(await present()).toBe(false);
      const migration = await readFile(new URL(
        "../../supabase/migrations/20261107060000_scheduled_job_health.sql",
        import.meta.url,
      ), "utf8");
      await db.exec(migration);
      expect(await present()).toBe(true);
      await db.exec("GRANT SELECT ON public.scheduled_job_health TO authenticated");
      expect(await present()).toBe(false);
      await db.exec("REVOKE SELECT ON public.scheduled_job_health FROM authenticated");
      await db.exec("REVOKE UPDATE ON public.scheduled_job_health FROM service_role");
      expect(await present()).toBe(false);
      await db.exec("GRANT UPDATE ON public.scheduled_job_health TO service_role");
      await db.exec("ALTER TABLE public.scheduled_job_health DISABLE ROW LEVEL SECURITY");
      expect(await present()).toBe(false);
      await db.exec("ALTER TABLE public.scheduled_job_health ENABLE ROW LEVEL SECURITY");
      await db.exec("ALTER TABLE public.scheduled_job_health ALTER COLUMN last_succeeded_at DROP NOT NULL");
      expect(await present()).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("requires the lifecycle job to wait for locked leases or fail the run", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec("CREATE ROLE service_role; CREATE TABLE public.leases (id uuid PRIMARY KEY)");
      const present = async () => {
        const result = await db.query<{ check_name: string; present: boolean }>(query);
        return result.rows.find(row => row.check_name === "lifecycle_job_no_silent_lock_skips")?.present;
      };
      expect(await present()).toBe(false);
      const migration = await readFile(new URL(
        "../../supabase/migrations/20261115000000_avoid_silent_lifecycle_skips.sql",
        import.meta.url,
      ), "utf8");
      await db.exec(migration);
      expect(await present()).toBe(true);
      await db.exec("ALTER FUNCTION public.advance_due_lease_lifecycle_for_zone(date,text) RESET lock_timeout");
      expect(await present()).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("requires the new assignment pricing guard to be enabled and client-inaccessible", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec(`
        CREATE TABLE public.lease_unit_assignments (
          id uuid PRIMARY KEY, rent_share numeric, charges_share numeric
        );
      `);
      const present = async () => {
        const result = await db.query<{ check_name: string; present: boolean }>(query);
        return result.rows.find(row => row.check_name === "new_assignment_pricing_guard")?.present;
      };
      expect(await present()).toBe(false);
      const migration = await readFile(new URL(
        "../../supabase/migrations/20261113232000_guard_new_assignment_pricing.sql",
        import.meta.url,
      ), "utf8");
      await db.exec(migration);
      expect(await present()).toBe(true);
      await db.exec("GRANT EXECUTE ON FUNCTION public.guard_new_assignment_pricing() TO authenticated");
      expect(await present()).toBe(false);
      await db.exec("REVOKE EXECUTE ON FUNCTION public.guard_new_assignment_pricing() FROM authenticated");
      await db.exec("ALTER TABLE public.lease_unit_assignments DISABLE TRIGGER guard_new_assignment_pricing");
      expect(await present()).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("requires the retained receivable guard to be enabled and deferred", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec(`
        CREATE TABLE public.lease_unit_assignments (
          id uuid PRIMARY KEY, portfolio_id uuid, lease_id uuid, unit_id uuid,
          start_date date, end_date date
        );
        CREATE TABLE public.receivable_items (
          id uuid PRIMARY KEY, portfolio_id uuid, lease_id uuid, unit_id uuid,
          origin text, item_type text, status text, due_date date,
          cycle_end_date date
        );
      `);
      const present = async () => {
        const result = await db.query<{ check_name: string; present: boolean }>(query);
        return result.rows.find(row => row.check_name === "retained_lease_receivable_assignment_guard")?.present;
      };
      expect(await present()).toBe(false);
      const migration = await readFile(new URL(
        "../../supabase/migrations/20261113231000_guard_retained_lease_receivable_assignments.sql",
        import.meta.url,
      ), "utf8");
      await db.exec(migration);
      expect(await present()).toBe(true);
      await db.exec("ALTER TABLE public.lease_unit_assignments DISABLE TRIGGER guard_retained_lease_receivable_assignment");
      expect(await present()).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("requires the country-derived property time zone validator, not only its column", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec("CREATE TABLE public.properties (id uuid PRIMARY KEY, country_code text)");
      const present = async () => {
        const result = await db.query<{ check_name: string; present: boolean }>(query);
        return result.rows.find(row => row.check_name === "property_time_zone_model")?.present;
      };
      expect(await present()).toBe(false);
      const migration = await readFile(new URL("../../supabase/migrations/20261018230000_property_business_time_zones.sql", import.meta.url), "utf8");
      await db.exec(migration);
      expect(await present()).toBe(true);
      await db.exec("ALTER TABLE public.properties ALTER COLUMN time_zone SET DEFAULT 'Europe/Brussels'");
      expect(await present()).toBe(false);
      await db.exec("ALTER TABLE public.properties ALTER COLUMN time_zone DROP DEFAULT");
      await db.exec("ALTER TABLE public.properties DISABLE TRIGGER validate_property_time_zone");
      expect(await present()).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("requires signed-date rules and a unique initial contract, not just document columns", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec(`
        CREATE TABLE public.lease_documents (
          id uuid PRIMARY KEY, lease_id uuid NOT NULL,
          document_type text NOT NULL DEFAULT 'supporting', status text
        );
      `);
      const present = async () => {
        const result = await db.query<{ check_name: string; present: boolean }>(query);
        return result.rows.find(row => row.check_name === "lease_documents_contractual_model")?.present;
      };
      expect(await present()).toBe(false);
      await db.exec(`
        ALTER TABLE public.lease_documents ADD COLUMN signed_date date;
        ALTER TABLE public.lease_documents
          ADD CONSTRAINT lease_documents_document_type_check
            CHECK (document_type ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
          ADD CONSTRAINT lease_documents_contractual_status_check
            CHECK (
              (document_type NOT IN ('initial-contract', 'amendment')
                AND status IS NULL AND signed_date IS NULL)
              OR (document_type IN ('initial-contract', 'amendment')
                AND status IN ('draft', 'validated', 'sent', 'partially-signed', 'signed', 'cancelled')
                AND ((status = 'signed' AND signed_date IS NOT NULL)
                  OR (status <> 'signed' AND signed_date IS NULL)))
            );
      `);
      expect(await present()).toBe(false);
      await db.exec(`
        CREATE UNIQUE INDEX lease_documents_one_initial_contract_per_lease_idx
          ON public.lease_documents(lease_id) WHERE document_type <> 'initial-contract';
      `);
      expect(await present()).toBe(false);
      await db.exec("DROP INDEX public.lease_documents_one_initial_contract_per_lease_idx");
      await db.exec(`
        CREATE UNIQUE INDEX lease_documents_one_initial_contract_per_lease_idx
          ON public.lease_documents(lease_id) WHERE document_type = 'initial-contract';
      `);
      expect(await present()).toBe(true);
      await db.exec("DROP INDEX public.lease_documents_one_initial_contract_per_lease_idx");
      expect(await present()).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("requires cost amortization dates and validated constraints", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec(`
        CREATE TABLE public.cost_categories (id uuid PRIMARY KEY);
        CREATE TABLE public.cost_entries (id uuid PRIMARY KEY, recognition_mode text NOT NULL DEFAULT 'immediate');
      `);
      const present = async () => {
        const result = await db.query<{ check_name: string; present: boolean }>(query);
        return result.rows.find(row => row.check_name === "cost_amortization_model")?.present;
      };
      expect(await present()).toBe(false);
      const migration = await readFile(new URL("../../supabase/migrations/20260811120000_cost_amortization.sql", import.meta.url), "utf8");
      await db.exec(migration);
      expect(await present()).toBe(true);
      await db.exec("ALTER TABLE public.cost_entries DROP CONSTRAINT cost_entries_amortization_dates_check");
      expect(await present()).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("rejects a lone indexation flag and requires every indexation column and constraint", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec("CREATE TABLE public.leases (id uuid PRIMARY KEY, indexation_enabled boolean NOT NULL DEFAULT false)");
      const present = async () => {
        const result = await db.query<{ check_name: string; present: boolean }>(query);
        return result.rows.find(row => row.check_name === "lease_indexation_model")?.present;
      };
      expect(await present()).toBe(false);
      const migration = await readFile(new URL("../../supabase/migrations/20260811130000_lease_indexation.sql", import.meta.url), "utf8");
      await db.exec(migration);
      expect(await present()).toBe(true);
      await db.exec("ALTER TABLE public.leases DROP CONSTRAINT leases_indexation_values_check");
      expect(await present()).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("requires raw guarantee precision and both guarantee constraints", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec(`
        CREATE TABLE public.guarantees (
          expected_amount numeric(12,2) NOT NULL,
          received_amount numeric(12,2) NOT NULL,
          retention_amount numeric(12,2),
          received_date date, release_date date, status text NOT NULL
        );
      `);
      const result = async () => {
        const rows = await db.query<{ check_name: string; present: boolean }>(query);
        return rows.rows.filter(row => row.check_name.startsWith("guarantee_"));
      };
      expect((await result()).every(row => !row.present)).toBe(true);
      const migration = await readFile(new URL("../../supabase/migrations/20261107260000_guard_guarantee_amounts.sql", import.meta.url), "utf8");
      await db.exec(migration);
      expect((await result()).every(row => row.present)).toBe(true);
    } finally {
      await db.close();
    }
  });

  it("requires a unique lease key for guarantees", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec("CREATE TABLE public.guarantees (lease_id uuid NOT NULL)");
      const present = async () => {
        const rows = await db.query<{ check_name: string; present: boolean }>(query);
        return rows.rows.find(row => row.check_name === "one_guarantee_per_lease")?.present;
      };
      expect(await present()).toBe(false);
      const migration = await readFile(new URL("../../supabase/migrations/20261107270000_one_guarantee_per_lease.sql", import.meta.url), "utf8");
      await db.exec(migration);
      expect(await present()).toBe(true);
    } finally {
      await db.close();
    }
  });

  it("runs the attestation SQL against a database with missing capabilities", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      const result = await db.query<{ check_name: string; present: boolean }>(query);
      expect(result.rows.map(row => row.check_name).sort()).toEqual([...requiredSchemaChecks].sort());
      for (const missing of ["lease_document_types_table", "atomic_lease_create_rpc", "lease_document_bucket_config"]) {
        expect(result.rows.find(row => row.check_name === missing)?.present).toBe(false);
      }
    } finally {
      await db.close();
    }
  });

  it("rejects the old unit-scoped duplicate guard even when its function exists", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec(`
        CREATE FUNCTION public.prevent_duplicate_lease_receivable()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.unit_id IS NOT NULL THEN RETURN NEW; END IF;
          RETURN NEW;
        END $$;
      `);
      const before = await db.query<{ check_name: string; present: boolean }>(query);
      expect(before.rows.find(row => row.check_name === "lease_wide_duplicate_guard")?.present).toBe(false);
      await db.exec(`
        CREATE OR REPLACE FUNCTION public.prevent_duplicate_lease_receivable()
        RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      `);
      const after = await db.query<{ check_name: string; present: boolean }>(query);
      expect(after.rows.find(row => row.check_name === "lease_wide_duplicate_guard")?.present).toBe(true);
    } finally {
      await db.close();
    }
  });

  it("requires the retimed-cycle guard in both direct and scheduled writers", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec("CREATE ROLE service_role");
      await db.exec(`CREATE TABLE public.receivable_items (
        id uuid PRIMARY KEY, portfolio_id uuid, lease_id uuid, unit_id uuid,
        item_type text, origin text, period_month text, due_date date,
        cycle_index integer, cycle_end_date date, tenant_id uuid, property_id uuid,
        label text, currency_code text, expected_amount numeric,
        allocated_amount numeric, outstanding_amount numeric, status text,
        priority integer, notes text
      )`);
      const present = async () => {
        const result = await db.query<{ check_name: string; present: boolean }>(query);
        return result.rows.find(row => row.check_name === "retimed_receivable_cycle_guard")?.present;
      };
      expect(await present()).toBe(false);
      const old = await readFile(new URL(
        "../../supabase/migrations/20261015120000_prevent_duplicate_lease_receivables.sql",
        import.meta.url,
      ), "utf8");
      const anchor = await readFile(new URL(
        "../../supabase/migrations/20261107000000_dedupe_lease_billing_slots.sql",
        import.meta.url,
      ), "utf8");
      const retimed = await readFile(new URL(
        "../../supabase/migrations/20261115001000_guard_retimed_receivable_cycles.sql",
        import.meta.url,
      ), "utf8");
      await db.exec(old);
      await db.exec(anchor);
      expect(await present()).toBe(false);
      await db.exec(retimed);
      expect(await present()).toBe(true);
      await db.exec(`CREATE OR REPLACE FUNCTION public.insert_due_lease_receivables(
          p_portfolio_id uuid, p_rows jsonb)
        RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
        AS $$ BEGIN RETURN 0; END $$`);
      expect(await present()).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("requires the cash receipt scope trigger to be enabled and client-inaccessible", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec(`
        CREATE TABLE public.cash_receipts (id uuid);
        CREATE FUNCTION public.guard_cash_receipt_scope()
        RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
        AS $$ BEGIN RETURN NEW; END $$;
        CREATE TRIGGER guard_cash_receipt_scope
        BEFORE INSERT OR UPDATE ON public.cash_receipts
        FOR EACH ROW EXECUTE FUNCTION public.guard_cash_receipt_scope();
      `);
      const present = async () => {
        const result = await db.query<{ check_name: string; present: boolean }>(query);
        return result.rows.find(row => row.check_name === "cash_receipt_scope_trigger")?.present;
      };
      expect(await present()).toBe(false);
      await db.exec("REVOKE ALL ON FUNCTION public.guard_cash_receipt_scope() FROM PUBLIC, anon, authenticated");
      expect(await present()).toBe(true);
      await db.exec("ALTER TABLE public.cash_receipts DISABLE TRIGGER guard_cash_receipt_scope");
      expect(await present()).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("requires the receipt allocation property trigger", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec(`
        CREATE TABLE public.receipt_allocations (id uuid);
        CREATE FUNCTION public.guard_receipt_allocation_property()
        RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
        AS $$ BEGIN RETURN NEW; END $$;
        REVOKE ALL ON FUNCTION public.guard_receipt_allocation_property()
          FROM PUBLIC, anon, authenticated;
        CREATE TRIGGER guard_receipt_allocation_property
        BEFORE INSERT OR UPDATE ON public.receipt_allocations
        FOR EACH ROW EXECUTE FUNCTION public.guard_receipt_allocation_property();
      `);
      const present = async () => {
        const result = await db.query<{ check_name: string; present: boolean }>(query);
        return result.rows.find(row => row.check_name === "receipt_allocation_property_trigger")?.present;
      };
      expect(await present()).toBe(true);
      await db.exec("ALTER TABLE public.receipt_allocations DISABLE TRIGGER guard_receipt_allocation_property");
      expect(await present()).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("rejects storage policies that bypass the scoped document rules", async () => {
    const query = await readFile(new URL("../../scripts/check-target-schema.sql", import.meta.url), "utf8");
    const db = new PGlite();
    try {
      await addEmptyStorageSchema(db);
      await db.exec(`
        CREATE TABLE storage.objects (bucket_id text, name text);
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
        CREATE FUNCTION public.is_portfolio_member() RETURNS boolean LANGUAGE sql AS 'SELECT true';
        CREATE FUNCTION public.has_portfolio_role() RETURNS boolean LANGUAGE sql AS 'SELECT true';
        CREATE FUNCTION public.can_delete_lease_document_file() RETURNS boolean LANGUAGE sql AS 'SELECT true';
        CREATE POLICY "Document read" ON storage.objects FOR SELECT TO authenticated
          USING (bucket_id = 'lease-documents' AND public.is_portfolio_member());
        CREATE POLICY "Document upload" ON storage.objects FOR INSERT TO authenticated
          WITH CHECK (bucket_id = 'lease-documents' AND public.has_portfolio_role());
        CREATE POLICY "Document delete" ON storage.objects FOR DELETE TO authenticated
          USING (bucket_id = 'lease-documents' AND public.has_portfolio_role()
            AND public.can_delete_lease_document_file());
      `);
      const check = async (name: string) => {
        const result = await db.query<{ check_name: string; present: boolean }>(query);
        return result.rows.find(row => row.check_name === name)?.present;
      };
      for (const name of [
        "lease_document_storage_read_policy",
        "lease_document_storage_upload_policy",
        "lease_document_storage_delete_guard",
        "lease_document_storage_no_update_policy",
      ]) expect(await check(name)).toBe(true);

      await db.exec(`CREATE POLICY "Public read bypass" ON storage.objects FOR SELECT TO public USING (true);`);
      expect(await check("lease_document_storage_read_policy")).toBe(false);
      await db.exec(`CREATE POLICY "Anonymous upload bypass" ON storage.objects FOR INSERT TO anon WITH CHECK (true);`);
      expect(await check("lease_document_storage_upload_policy")).toBe(false);
      await db.exec(`CREATE POLICY "Delete bypass" ON storage.objects FOR DELETE TO authenticated USING (true);`);
      expect(await check("lease_document_storage_delete_guard")).toBe(false);
      await db.exec(`CREATE POLICY "Update bypass" ON storage.objects FOR UPDATE TO authenticated USING (true);`);
      expect(await check("lease_document_storage_no_update_policy")).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("sends the complete read-only query and accepts all required capabilities", async () => {
    const fetchImpl = vi.fn(async (_url: string, _options: RequestInit) => reply(rows()));
    await expect(checkTargetSchema(backend, "scoped-token", fetchImpl)).resolves.toBe(requiredSchemaChecks.length);
    const [url, options] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.supabase.com/v1/projects/othaxlwgtqpodncnlglv/database/query/read-only");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer scoped-token");
    expect(JSON.parse(options.body as string).query).toContain("paid_receivable_delete_trigger");
  });

  it("names missing capabilities and rejects malformed or incomplete results", async () => {
    const absent = rows();
    absent.find(row => row.check_name === "lease_document_types_table")!.present = false;
    absent.find(row => row.check_name === "scheduled_job_health_table")!.present = false;
    await expect(checkTargetSchema(backend, "token", async () => reply(absent)))
      .rejects.toThrow("lease_document_types_table, scheduled_job_health_table");
    await expect(checkTargetSchema(backend, "token", async () => reply(rows().slice(1))))
      .rejects.toThrow("incomplete result");
    const repeated = rows();
    repeated[1].check_name = repeated[0].check_name;
    await expect(checkTargetSchema(backend, "token", async () => reply(repeated)))
      .rejects.toThrow("malformed or repeated");
    const invalid = rows() as Array<{ check_name: string; present: unknown }>;
    invalid[0].present = "true";
    await expect(checkTargetSchema(backend, "token", async () => reply(invalid)))
      .rejects.toThrow("malformed or repeated");
  });

  it("requires a scoped token and the read-only service", async () => {
    await expect(checkTargetSchema(backend, "", async () => reply(rows())))
      .rejects.toThrow("SUPABASE_MANAGEMENT_READ_TOKEN");
    await expect(checkTargetSchema("http://othaxlwgtqpodncnlglv.supabase.co", "token", async () => reply(rows())))
      .rejects.toThrow("hosted Supabase HTTPS origin");
    await expect(checkTargetSchema(backend, "token", async () => reply({}, 403)))
      .rejects.toThrow("HTTP 403");
  });
});
