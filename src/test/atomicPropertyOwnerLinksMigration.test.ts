// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const ids = {
  portfolio: "41000000-0000-4000-8000-000000000001",
  otherPortfolio: "41000000-0000-4000-8000-000000000002",
  property: "41000000-0000-4000-8000-000000000003",
  ownerA: "41000000-0000-4000-8000-000000000004",
  ownerB: "41000000-0000-4000-8000-000000000005",
  otherOwner: "41000000-0000-4000-8000-000000000006",
  linkA: "41000000-0000-4000-8000-000000000007",
};

describe("atomic property owner links", () => {
  it("replaces all links or none, rejects stale state, foreign owners, viewers and direct writes", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE authenticated;
        CREATE SCHEMA auth;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT NULL::uuid $$;
        CREATE TYPE public.portfolio_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
        CREATE FUNCTION public.has_portfolio_role(uuid, uuid, public.portfolio_role[])
          RETURNS boolean LANGUAGE sql STABLE
          AS $$ SELECT current_setting('test.can_write', true) = 'yes' $$;
        CREATE TABLE public.properties (id uuid PRIMARY KEY, portfolio_id uuid NOT NULL);
        CREATE TABLE public.property_owners (id uuid PRIMARY KEY, portfolio_id uuid NOT NULL);
        CREATE TABLE public.property_owner_links (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          portfolio_id uuid NOT NULL, property_id uuid NOT NULL REFERENCES public.properties(id),
          owner_id uuid NOT NULL REFERENCES public.property_owners(id),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE(property_id, owner_id)
        );
        GRANT SELECT ON public.property_owner_links TO authenticated;
        GRANT INSERT, UPDATE, DELETE ON public.property_owner_links TO authenticated;
        INSERT INTO public.properties VALUES ('${ids.property}', '${ids.portfolio}');
        INSERT INTO public.property_owners VALUES
          ('${ids.ownerA}', '${ids.portfolio}'),
          ('${ids.ownerB}', '${ids.portfolio}'),
          ('${ids.otherOwner}', '${ids.otherPortfolio}');
        INSERT INTO public.property_owner_links
          (id, portfolio_id, property_id, owner_id)
          VALUES ('${ids.linkA}', '${ids.portfolio}', '${ids.property}', '${ids.ownerA}');
      `);
      const migration = await readFile(new URL(
        "../../supabase/migrations/20261018130000_atomic_property_owner_links.sql", import.meta.url,
      ), "utf8");
      await db.exec(migration);
      const original = (await db.query<Record<string, unknown>>(`
        SELECT id, owner_id, updated_at FROM public.property_owner_links
        WHERE property_id = '${ids.property}' ORDER BY id
      `)).rows;
      const replace = (expected: object[], desired: string[]) => db.query<{ result: Array<{ owner_id: string }> }>(
        "SELECT public.set_property_owner_links($1::uuid, $2::jsonb, $3::uuid[]) AS result",
        [ids.property, JSON.stringify(expected), desired],
      );

      await db.exec(`
        CREATE FUNCTION public.reject_owner_b() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.owner_id = '${ids.ownerB}'::uuid THEN
          RAISE EXCEPTION 'injected insert failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_owner_b BEFORE INSERT ON public.property_owner_links
          FOR EACH ROW EXECUTE FUNCTION public.reject_owner_b();
      `);
      await expect(replace(original, [ids.ownerB])).rejects.toThrow("injected insert failure");
      expect((await db.query("SELECT owner_id FROM public.property_owner_links")).rows)
        .toEqual([{ owner_id: ids.ownerA }]);
      await db.exec("DROP TRIGGER reject_owner_b ON public.property_owner_links");

      const changed = (await replace(original, [ids.ownerB])).rows[0].result;
      expect(changed.map(row => row.owner_id)).toEqual([ids.ownerB]);
      await expect(replace(original, [ids.ownerA])).rejects.toThrow("changed since this form was loaded");
      await expect(replace(changed, [ids.otherOwner])).rejects.toThrow("does not belong to this portfolio");
      expect((await db.query("SELECT owner_id FROM public.property_owner_links")).rows)
        .toEqual([{ owner_id: ids.ownerB }]);

      await db.exec("SELECT set_config('test.can_write', 'no', false)");
      await expect(replace(changed, [ids.ownerA])).rejects.toThrow("writer role");
      await db.exec("SELECT set_config('test.can_write', 'yes', false)");
      await db.exec("SET ROLE authenticated");
      await expect(db.exec(`INSERT INTO public.property_owner_links
        (portfolio_id, property_id, owner_id)
        VALUES ('${ids.portfolio}', '${ids.property}', '${ids.ownerA}')`))
        .rejects.toThrow("permission denied");
      expect((await replace(changed, [ids.ownerA])).rows[0].result.map(row => row.owner_id))
        .toEqual([ids.ownerA]);
    } finally {
      await db.close();
    }
  }, 30_000);
});
