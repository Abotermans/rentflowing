// @vitest-environment node
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const legacyVersions = [
  "20260610113735", "20260610113751", "20260610122721", "20260610130317",
  "20260610132930", "20260610142013", "20260610151117", "20260610151950",
  "20260610152847", "20260610212852", "20260611194712", "20260612212301",
  "20260615210350", "20260616083503", "20260617110125", "20260617110329",
  "20260617110356", "20260617110411", "20260617114315", "20260617120857",
  "20260617121535", "20260617155547", "20260617160125", "20260618080854",
  "20260618094047", "20260618122539", "20260619094839", "20260619104330",
  "20260622145643",
];

const scriptUrl = new URL("../../scripts/reconcile-lovable-migration-history.sql", import.meta.url);
const migrationDir = new URL("../../supabase/migrations/", import.meta.url);

async function legacyHistory(): Promise<{ db: PGlite; filenames: string[]; statements: string[] }> {
  const filenames = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort().slice(0, 29);
  expect(filenames).toHaveLength(29);
  const statements = await Promise.all(filenames.map((name) => readFile(new URL(name, migrationDir), "utf8")));
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      statements text[] NOT NULL,
      name text
    );
  `);
  for (const [index, version] of legacyVersions.entries()) {
    await db.query(
      "INSERT INTO supabase_migrations.schema_migrations (version, statements) VALUES ($1, ARRAY[$2])",
      [version, statements[index]],
    );
  }
  return { db, filenames, statements };
}

describe("Lovable migration history reconciliation", () => {
  it("maps the 29 SQL-identical legacy versions to the local filenames", async () => {
    const { db, filenames, statements } = await legacyHistory();
    try {
      await db.exec(await readFile(scriptUrl, "utf8"));
      const result = await db.query<{ version: string; statement: string }>(`
        SELECT version, statements[1] AS statement
        FROM supabase_migrations.schema_migrations ORDER BY version
      `);
      expect(result.rows.map((row) => row.version)).toEqual(filenames.map((name) => name.slice(0, 14)));
      expect(result.rows.map((row) => row.statement)).toEqual(statements);
    } finally {
      await db.close();
    }
  });

  it("rolls back every version when one stored SQL body differs", async () => {
    const { db } = await legacyHistory();
    try {
      await db.query(
        "UPDATE supabase_migrations.schema_migrations SET statements = ARRAY['changed'] WHERE version = $1",
        [legacyVersions[0]],
      );
      await expect(db.exec(await readFile(scriptUrl, "utf8"))).rejects.toThrow(/differs from the verified/);
      await db.exec("ROLLBACK");
      const result = await db.query<{ version: string }>(
        "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version",
      );
      expect(result.rows.map((row) => row.version)).toEqual(legacyVersions);
    } finally {
      await db.close();
    }
  });

  it("refuses a migration history that has changed since the target snapshot", async () => {
    const { db } = await legacyHistory();
    try {
      await db.query(
        "INSERT INTO supabase_migrations.schema_migrations (version, statements) VALUES ($1, ARRAY[$2])",
        ["20260623120000", "SELECT 1;"],
      );
      await expect(db.exec(await readFile(scriptUrl, "utf8"))).rejects.toThrow(/differs from the verified/);
      await db.exec("ROLLBACK");
      const result = await db.query<{ version: string }>(
        "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version",
      );
      expect(result.rows.map((row) => row.version)).toEqual([...legacyVersions, "20260623120000"]);
    } finally {
      await db.close();
    }
  });
});
