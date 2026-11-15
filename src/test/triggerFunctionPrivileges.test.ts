// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("trigger function privileges", () => {
  it("removes explicit client execute grants without changing service access", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE ROLE service_role;
        CREATE FUNCTION public.test_guard() RETURNS trigger
          LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;
        GRANT EXECUTE ON FUNCTION public.test_guard() TO anon, authenticated, service_role;
        CREATE TABLE public.test_records (id integer PRIMARY KEY);
        CREATE TRIGGER test_records_guard BEFORE INSERT ON public.test_records
          FOR EACH ROW EXECUTE FUNCTION public.test_guard();
        GRANT INSERT ON public.test_records TO authenticated;
      `);
      const migration = await readFile(
        new URL("../../supabase/migrations/20261115002000_restrict_trigger_function_execute.sql", import.meta.url),
        "utf8",
      );
      await db.exec(migration);
      const privileges = await db.query<{
        anon: boolean; authenticated: boolean; service_role: boolean;
      }>(`SELECT
        has_function_privilege('anon', 'public.test_guard()', 'EXECUTE') AS anon,
        has_function_privilege('authenticated', 'public.test_guard()', 'EXECUTE') AS authenticated,
        has_function_privilege('service_role', 'public.test_guard()', 'EXECUTE') AS service_role`);
      expect(privileges.rows).toEqual([{ anon: false, authenticated: false, service_role: true }]);
      await db.exec(`
        SET ROLE authenticated;
        INSERT INTO public.test_records (id) VALUES (1);
        RESET ROLE;
      `);
      expect((await db.query<{ id: number }>("SELECT id FROM public.test_records")).rows).toEqual([{ id: 1 }]);
    } finally {
      await db.close();
    }
  });
});
