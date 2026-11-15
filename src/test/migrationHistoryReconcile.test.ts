// @vitest-environment node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const scriptUrl = new URL("../../scripts/reconcile-lovable-migration-history.sql", import.meta.url);
const preflightUrl = new URL("../../scripts/preflight-lovable-migration-history.sql", import.meta.url);
const migrationsUrl = new URL("../../supabase/migrations/", import.meta.url);

async function snapshot() {
  const script = await readFile(scriptUrl, "utf8");
  const mappings = [...script.matchAll(/\('([0-9]{14})', '([0-9]{14})', '([a-f0-9]{32})'\)/g)]
    .map(([, oldVersion, newVersion, expectedMd5]) => ({ oldVersion, newVersion, expectedMd5 }));
  const names = await readdir(migrationsUrl);
  const sources = await Promise.all(mappings.map(async (mapping) => {
    const matches = names.filter(name => name.startsWith(`${mapping.newVersion}_`) && name.endsWith(".sql"));
    expect(matches).toHaveLength(1);
    const source = await readFile(new URL(matches[0], migrationsUrl), "utf8");
    expect(createHash("md5").update(source).digest("hex")).toBe(mapping.expectedMd5);
    return source;
  }));
  return { script, mappings, sources };
}

async function databaseWithHistory(mappings: Awaited<ReturnType<typeof snapshot>>["mappings"],
  sources: string[]) {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations (
      version text PRIMARY KEY, statements text[] NOT NULL
    );
  `);
  for (let index = 0; index < mappings.length; index++) {
    await db.query("INSERT INTO supabase_migrations.schema_migrations VALUES ($1, $2::text[])",
      [mappings[index].oldVersion, [sources[index]]]);
  }
  return db;
}

describe("Lovable migration-history reconciliation rehearsal", () => {
  it("runs a read-only preflight against the same exact 29-row mapping", async () => {
    const { mappings, sources } = await snapshot();
    const preflight = await readFile(preflightUrl, "utf8");
    const preflightMappings = [...preflight.matchAll(/\('([0-9]{14})', '([0-9]{14})', '([a-f0-9]{32})'\)/g)]
      .map(([, oldVersion, newVersion, expectedMd5]) => ({ oldVersion, newVersion, expectedMd5 }));
    expect(preflightMappings).toEqual(mappings);
    const db = await databaseWithHistory(mappings, sources);
    const affected = async () => (await db.query<{ check_name: string; affected: number }>(preflight))
      .rows.map(row => ({ ...row, affected: Number(row.affected) }));
    try {
      expect(await affected()).toEqual([
        { check_name: "missing_or_changed_snapshot", affected: 0 },
        { check_name: "unexpected_target_version", affected: 0 },
        { check_name: "already_remapped_version", affected: 0 },
      ]);
      await db.query("UPDATE supabase_migrations.schema_migrations SET statements = $1::text[] WHERE version = $2",
        [[`${sources[0]}\n-- drift`], mappings[0].oldVersion]);
      expect((await affected())[0].affected).toBe(1);
      await db.query("UPDATE supabase_migrations.schema_migrations SET version = $1 WHERE version = $2",
        [mappings[1].newVersion, mappings[1].oldVersion]);
      expect(await affected()).toEqual([
        { check_name: "missing_or_changed_snapshot", affected: 2 },
        { check_name: "unexpected_target_version", affected: 1 },
        { check_name: "already_remapped_version", affected: 1 },
      ]);
    } finally {
      await db.close();
    }
  }, 30_000);

  it("maps exactly the verified 29-file snapshot to byte-identical local migrations", async () => {
    const { script, mappings, sources } = await snapshot();
    expect(mappings).toHaveLength(29);
    expect(new Set(mappings.map(row => row.oldVersion)).size).toBe(29);
    expect(new Set(mappings.map(row => row.newVersion)).size).toBe(29);
    const db = await databaseWithHistory(mappings, sources);
    try {
      await db.exec(script);
      const result = await db.query<{ version: string }>(
        "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version",
      );
      expect(result.rows.map(row => row.version)).toEqual(
        mappings.map(row => row.newVersion).sort(),
      );
    } finally {
      await db.close();
    }
  }, 30_000);

  it("rejects changed target statements without changing any version", async () => {
    const { script, mappings, sources } = await snapshot();
    const changed = [...sources];
    changed[0] += "\n-- unexpected change";
    const db = await databaseWithHistory(mappings, changed);
    try {
      await expect(db.exec(script)).rejects.toThrow("differs from the verified 29-file snapshot");
      await db.exec("ROLLBACK");
      const result = await db.query<{ version: string }>(
        "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version",
      );
      expect(result.rows.map(row => row.version)).toEqual(
        mappings.map(row => row.oldVersion).sort(),
      );
    } finally {
      await db.close();
    }
  }, 30_000);

  it("rejects an unexpected target migration without changing any version", async () => {
    const { script, mappings, sources } = await snapshot();
    const db = await databaseWithHistory(mappings, sources);
    try {
      await db.query("INSERT INTO supabase_migrations.schema_migrations VALUES ($1, $2::text[])",
        ["20260622150000", ["SELECT 1;"]]);
      await expect(db.exec(script)).rejects.toThrow("differs from the verified 29-file snapshot");
      await db.exec("ROLLBACK");
      const result = await db.query<{ version: string }>(
        "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version",
      );
      expect(result.rows.map(row => row.version)).toEqual(
        [...mappings.map(row => row.oldVersion), "20260622150000"].sort(),
      );
    } finally {
      await db.close();
    }
  }, 30_000);

  it("rejects an already-remapped version without changing any version", async () => {
    const { script, mappings, sources } = await snapshot();
    const db = await databaseWithHistory(mappings, sources);
    try {
      await db.query("UPDATE supabase_migrations.schema_migrations SET version = $1 WHERE version = $2",
        [mappings[0].newVersion, mappings[0].oldVersion]);
      await expect(db.exec(script)).rejects.toThrow("differs from the verified 29-file snapshot");
      await db.exec("ROLLBACK");
      const result = await db.query<{ version: string }>(
        "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version",
      );
      expect(result.rows.map(row => row.version)).toEqual(
        [mappings[0].newVersion, ...mappings.slice(1).map(row => row.oldVersion)].sort(),
      );
    } finally {
      await db.close();
    }
  }, 30_000);
});
