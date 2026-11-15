// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const ids = {
  portfolio: "42000000-0000-4000-8000-000000000001",
  otherPortfolio: "42000000-0000-4000-8000-000000000002",
  property: "42000000-0000-4000-8000-000000000003",
  ownerA: "42000000-0000-4000-8000-000000000004",
  ownerB: "42000000-0000-4000-8000-000000000005",
  foreignOwner: "42000000-0000-4000-8000-000000000006",
};

describe("atomic property with owners", () => {
  it("creates and edits together, rejects stale edits and rolls back both on owner failure", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE authenticated;
        CREATE SCHEMA auth;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
        CREATE TYPE public.portfolio_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
        CREATE FUNCTION public.has_portfolio_role(uuid, uuid, public.portfolio_role[])
          RETURNS boolean LANGUAGE sql STABLE
          AS $$ SELECT current_setting('test.can_write', true) = 'yes' $$;
        CREATE TABLE public.properties (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL, name text NOT NULL,
          reference_code text NOT NULL, address1 text NOT NULL DEFAULT '',
          address2 text NOT NULL DEFAULT '', city text NOT NULL DEFAULT '',
          postal_code text NOT NULL DEFAULT '', region_or_state text NOT NULL DEFAULT '',
          country_code text NOT NULL DEFAULT 'FR', locale text NOT NULL DEFAULT 'fr-FR',
          currency_code text NOT NULL DEFAULT 'EUR', measurement_system text NOT NULL DEFAULT 'metric',
          property_type text NOT NULL DEFAULT 'residential', owner_name text NOT NULL DEFAULT '',
          description text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'active',
          millieme_base integer NOT NULL DEFAULT 1000,
          millieme_keys text[] NOT NULL DEFAULT ARRAY['general']::text[],
          is_partially_owned boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE FUNCTION public.touch_property() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
        CREATE TRIGGER properties_touch BEFORE UPDATE ON public.properties
          FOR EACH ROW EXECUTE FUNCTION public.touch_property();
        CREATE TABLE public.property_owners (id uuid PRIMARY KEY, portfolio_id uuid NOT NULL);
        CREATE TABLE public.units (
          id uuid PRIMARY KEY, portfolio_id uuid NOT NULL,
          property_id uuid NOT NULL REFERENCES public.properties(id),
          millieme_shares jsonb NOT NULL DEFAULT '{}'::jsonb
        );
        CREATE TABLE public.property_owner_links (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          portfolio_id uuid NOT NULL, property_id uuid NOT NULL REFERENCES public.properties(id),
          owner_id uuid NOT NULL REFERENCES public.property_owners(id),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE(property_id, owner_id)
        );
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_owner_links TO authenticated;
        INSERT INTO public.property_owners VALUES
          ('${ids.ownerA}', '${ids.portfolio}'),
          ('${ids.ownerB}', '${ids.portfolio}'),
          ('${ids.foreignOwner}', '${ids.otherPortfolio}');
        SELECT set_config('test.can_write', 'yes', false);
      `);
      for (const name of [
        "20261018130000_atomic_property_owner_links.sql",
        "20261018140000_atomic_property_with_owners.sql",
        "20261018150000_guard_unit_millieme_capacity.sql",
      ]) {
        const sql = await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
        await db.exec(sql);
      }
      const property = (name: string) => ({
        id: ids.property, portfolio_id: ids.portfolio, name, reference_code: "P-1",
        address1: "Main street", city: "Brussels", millieme_base: 10000,
        millieme_keys: ["general", "lift"], is_partially_owned: true,
      });
      const save = (name: string, owners: string[], expectedAt: string | null, links: unknown[]) =>
        db.query<{ result: { property: { name: string; updated_at: string }; links: Array<{ id: string; owner_id: string; updated_at: string }> } }>(
          "SELECT public.save_property_with_owners($1::jsonb, $2::uuid[], $3::timestamptz, $4::jsonb) AS result",
          [JSON.stringify(property(name)), owners, expectedAt, JSON.stringify(links)],
        );

      const created = (await save("Original", [ids.ownerA], null, [])).rows[0].result;
      expect(created.property.name).toBe("Original");
      expect(created.links.map(link => link.owner_id)).toEqual([ids.ownerA]);
      const expectedLinks = created.links.map(link => ({
        id: link.id, owner_id: link.owner_id, updated_at: link.updated_at,
      }));
      await expect(save("Foreign", [ids.foreignOwner], created.property.updated_at, expectedLinks))
        .rejects.toThrow("does not belong to this portfolio");
      expect((await db.query("SELECT name FROM public.properties")).rows)
        .toEqual([{ name: "Original" }]);
      expect((await db.query("SELECT owner_id FROM public.property_owner_links")).rows)
        .toEqual([{ owner_id: ids.ownerA }]);

      const edited = (await save("Edited", [ids.ownerB], created.property.updated_at, expectedLinks)).rows[0].result;
      expect(edited.property.name).toBe("Edited");
      expect(edited.links.map(link => link.owner_id)).toEqual([ids.ownerB]);
      await expect(save("Stale", [ids.ownerA], created.property.updated_at, expectedLinks))
        .rejects.toThrow("changed since this form was loaded");
      expect((await db.query("SELECT name FROM public.properties")).rows)
        .toEqual([{ name: "Edited" }]);

      await db.exec(`INSERT INTO public.units (id, portfolio_id, property_id, millieme_shares)
        VALUES ('42000000-0000-4000-8000-000000000007', '${ids.portfolio}', '${ids.property}', '{"general": 1500}')`);
      await db.exec(`INSERT INTO public.units (id, portfolio_id, property_id, millieme_shares)
        VALUES ('42000000-0000-4000-8000-000000000008', '${ids.portfolio}', '${ids.property}', '{"general": 8500}')`);
      await expect(db.exec(`INSERT INTO public.units (id, portfolio_id, property_id, millieme_shares)
        VALUES ('42000000-0000-4000-8000-000000000009', '${ids.portfolio}', '${ids.property}', '{"general": 1}')`))
        .rejects.toThrow("above property base");
      await expect(db.exec(`UPDATE public.units SET millieme_shares = '{"general": 1600}'
        WHERE id = '42000000-0000-4000-8000-000000000007'`))
        .rejects.toThrow("above property base");
      await db.exec(`UPDATE public.units SET millieme_shares = '{"general": 8400}'
        WHERE id = '42000000-0000-4000-8000-000000000008'`);
      await db.exec(`INSERT INTO public.units (id, portfolio_id, property_id, millieme_shares)
        VALUES ('42000000-0000-4000-8000-000000000009', '${ids.portfolio}', '${ids.property}', '{"general": 100}')`);
      await expect(db.exec(`INSERT INTO public.units (id, portfolio_id, property_id, millieme_shares)
        VALUES ('42000000-0000-4000-8000-000000000010', '${ids.otherPortfolio}', '${ids.property}', '{}')`))
        .rejects.toThrow("same portfolio");
      const reducedBase = { ...property("Too small"), millieme_base: 1000 };
      await expect(db.query(
        "SELECT public.save_property_with_owners($1::jsonb, $2::uuid[], $3::timestamptz, $4::jsonb)",
        [JSON.stringify(reducedBase), [ids.ownerB], edited.property.updated_at,
          JSON.stringify(edited.links.map(link => ({ id: link.id, owner_id: link.owner_id, updated_at: link.updated_at })))],
      )).rejects.toThrow("above property base");
      expect((await db.query("SELECT name, millieme_base FROM public.properties")).rows)
        .toEqual([{ name: "Edited", millieme_base: 10000 }]);

      await db.exec("SELECT set_config('test.can_write', 'no', false)");
      await expect(save("Forbidden", [ids.ownerA], edited.property.updated_at, edited.links))
        .rejects.toThrow("writer role");
    } finally {
      await db.close();
    }
  }, 30_000);
});
