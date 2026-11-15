// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const firstProperty = "00000000-0000-4000-8000-000000000001";
const secondProperty = "00000000-0000-4000-8000-000000000002";
const firstUnit = "00000000-0000-4000-8000-000000000003";
const secondUnit = "00000000-0000-4000-8000-000000000004";
const shareOnlyUnit = "00000000-0000-4000-8000-000000000005";
const firstRule = "00000000-0000-4000-8000-000000000006";
const secondRule = "00000000-0000-4000-8000-000000000007";
const shareOnlyRule = "00000000-0000-4000-8000-000000000008";
const entryId = "00000000-0000-4000-8000-000000000009";
const resultId = "00000000-0000-4000-8000-000000000010";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.units (id uuid PRIMARY KEY, property_id uuid NOT NULL);
    CREATE TABLE public.allocation_rules (id uuid PRIMARY KEY, property_id uuid NOT NULL);
    CREATE TABLE public.cost_entries (
      id uuid PRIMARY KEY, property_id uuid NOT NULL, unit_id uuid,
      allocation_rule_id uuid
    );
    CREATE TABLE public.cost_allocation_results (
      id uuid PRIMARY KEY, cost_entry_id uuid NOT NULL,
      property_id uuid NOT NULL, unit_id uuid NOT NULL
    );
    CREATE TABLE public.allocation_rule_unit_shares (
      id uuid PRIMARY KEY, allocation_rule_id uuid NOT NULL, unit_id uuid NOT NULL
    );
    INSERT INTO public.units VALUES
      ('${firstUnit}', '${firstProperty}'),
      ('${secondUnit}', '${secondProperty}'),
      ('${shareOnlyUnit}', '${firstProperty}');
    INSERT INTO public.allocation_rules VALUES
      ('${firstRule}', '${firstProperty}'),
      ('${secondRule}', '${secondProperty}'),
      ('${shareOnlyRule}', '${firstProperty}');
  `);
  return db;
}

const migration = readFile(new URL("../../supabase/migrations/20261019010000_guard_cost_property_links.sql", import.meta.url), "utf8");

describe("cost property link migration", () => {
  it("rejects mismatched unit, rule, result and share links", async () => {
    const db = await setup();
    try {
      await db.exec(await migration);
      await expect(db.exec(`INSERT INTO public.cost_entries VALUES ('${entryId}', '${firstProperty}', '${secondUnit}', NULL)`))
        .rejects.toThrow("cost_entries_unit_property_fk");
      await expect(db.exec(`INSERT INTO public.cost_entries VALUES ('${entryId}', '${firstProperty}', NULL, '${secondRule}')`))
        .rejects.toThrow("cost_entries_rule_property_fk");
      await db.exec(`INSERT INTO public.cost_entries VALUES ('${entryId}', '${firstProperty}', NULL, '${firstRule}')`);
      await expect(db.exec(`INSERT INTO public.cost_allocation_results VALUES ('${resultId}', '${entryId}', '${secondProperty}', '${secondUnit}')`))
        .rejects.toThrow("cost_results_entry_property_fk");
      await expect(db.exec(`INSERT INTO public.cost_allocation_results VALUES ('${resultId}', '${entryId}', '${firstProperty}', '${secondUnit}')`))
        .rejects.toThrow("cost_results_unit_property_fk");
      await db.exec(`INSERT INTO public.cost_allocation_results VALUES ('${resultId}', '${entryId}', '${firstProperty}', '${firstUnit}')`);
      await expect(db.exec(`UPDATE public.units SET property_id = '${secondProperty}' WHERE id = '${firstUnit}'`))
        .rejects.toThrow("cost_results_unit_property_fk");
      await expect(db.exec(`UPDATE public.allocation_rules SET property_id = '${secondProperty}' WHERE id = '${firstRule}'`))
        .rejects.toThrow("cost_entries_rule_property_fk");
      await expect(db.exec(`INSERT INTO public.allocation_rule_unit_shares VALUES ('${resultId}', '${firstRule}', '${secondUnit}')`))
        .rejects.toThrow("Allocation rule share unit must belong to the rule property");
      await db.exec(`INSERT INTO public.allocation_rule_unit_shares VALUES ('${resultId}', '${shareOnlyRule}', '${shareOnlyUnit}')`);
      await expect(db.exec(`UPDATE public.units SET property_id = '${secondProperty}' WHERE id = '${shareOnlyUnit}'`))
        .rejects.toThrow("A unit in an allocation rule cannot change property");
      await expect(db.exec(`UPDATE public.allocation_rules SET property_id = '${secondProperty}' WHERE id = '${shareOnlyRule}'`))
        .rejects.toThrow("An allocation rule with unit shares cannot change property");
    } finally {
      await db.close();
    }
  });

  it("permits moving a cost and replacing its allocations in one transaction", async () => {
    const db = await setup();
    try {
      await db.exec(await migration);
      await db.exec(`
        INSERT INTO public.cost_entries VALUES ('${entryId}', '${firstProperty}', NULL, '${firstRule}');
        INSERT INTO public.cost_allocation_results VALUES ('${resultId}', '${entryId}', '${firstProperty}', '${firstUnit}');
      `);
      await db.exec("BEGIN");
      await db.exec(`UPDATE public.cost_entries SET property_id = '${secondProperty}', allocation_rule_id = '${secondRule}' WHERE id = '${entryId}'`);
      await db.exec(`DELETE FROM public.cost_allocation_results WHERE id = '${resultId}'`);
      await db.exec(`INSERT INTO public.cost_allocation_results VALUES ('${resultId}', '${entryId}', '${secondProperty}', '${secondUnit}')`);
      await db.exec("COMMIT");
      expect((await db.query("SELECT property_id FROM public.cost_entries WHERE id = $1", [entryId])).rows[0])
        .toEqual({ property_id: secondProperty });
      expect((await db.query("SELECT property_id, unit_id FROM public.cost_allocation_results WHERE id = $1", [resultId])).rows[0])
        .toEqual({ property_id: secondProperty, unit_id: secondUnit });
    } finally {
      await db.close();
    }
  });

  it("permits moving a rule after replacing its old unit shares", async () => {
    const db = await setup();
    try {
      await db.exec(await migration);
      await db.exec(`INSERT INTO public.allocation_rule_unit_shares VALUES ('${resultId}', '${shareOnlyRule}', '${shareOnlyUnit}')`);
      await db.exec("BEGIN");
      await db.exec(`DELETE FROM public.allocation_rule_unit_shares WHERE allocation_rule_id = '${shareOnlyRule}'`);
      await db.exec(`UPDATE public.allocation_rules SET property_id = '${secondProperty}' WHERE id = '${shareOnlyRule}'`);
      await db.exec(`INSERT INTO public.allocation_rule_unit_shares VALUES ('${resultId}', '${shareOnlyRule}', '${secondUnit}')`);
      await db.exec("COMMIT");
      expect((await db.query("SELECT property_id FROM public.allocation_rules WHERE id = $1", [shareOnlyRule])).rows[0])
        .toEqual({ property_id: secondProperty });
    } finally {
      await db.close();
    }
  });

  it("refuses to install over a historical cross-property rule share", async () => {
    const db = await setup();
    try {
      await db.exec(`INSERT INTO public.allocation_rule_unit_shares VALUES ('${resultId}', '${firstRule}', '${secondUnit}')`);
      await expect(db.exec(await migration))
        .rejects.toThrow("Existing allocation rule shares refer to units in another property");
    } finally {
      await db.close();
    }
  });
});
