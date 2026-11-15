// @vitest-environment node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { checkTargetMigrations, getLocalMigrationVersions } from "../../scripts/check-target-migrations.mjs";
import { splitSupabaseMigration } from "../../scripts/supabase-migration-statements.mjs";

const backend = "https://othaxlwgtqpodncnlglv.supabase.co";
const reply = (rows: unknown, status = 201) => new Response(JSON.stringify(rows), {
  status, headers: { "Content-Type": "application/json" },
});

async function historyRows(versions: string[], format: "raw" | "statements" = "raw") {
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  const names = await readdir(directory);
  const hashes = new Map(await Promise.all(names
    .filter(name => /^\d{14}_.*\.sql$/.test(name))
    .map(async name => {
      const bytes = await readFile(new URL(name, directory));
      const content = format === "raw" ? bytes : splitSupabaseMigration(bytes.toString("utf8")).join("\n");
      return [name.slice(0, 14), createHash("md5").update(content).digest("hex")] as const;
    })));
  return versions.map(version => ({ version, content_md5: hashes.get(version) ?? null }));
}

describe("read-only target migration gate", () => {
  it("compares every local version with the target history using a read-only query", async () => {
    const versions = await getLocalMigrationVersions();
    expect(versions.length).toBeGreaterThanOrEqual(100);
    expect(versions).toContain("20261107120000");
    const rows = await historyRows(versions);
    const fetchImpl = vi.fn(async (_url: string, _options: RequestInit) => reply(rows));
    await expect(checkTargetMigrations(backend, "scoped-token", fetchImpl)).resolves.toBe(versions.length);
    const [url, options] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.supabase.com/v1/projects/othaxlwgtqpodncnlglv/database/query/read-only");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer scoped-token");
    expect(JSON.parse(options.body as string).query)
      .toBe("SELECT version, md5(array_to_string(statements, E'\\n')) AS content_md5 FROM supabase_migrations.schema_migrations ORDER BY version");
  });

  it("accepts Supabase CLI's stored statement format for every migration", async () => {
    const versions = await getLocalMigrationVersions();
    const rows = await historyRows(versions, "statements");
    const rawRows = await historyRows(versions);
    expect(rows.some((row, index) => row.content_md5 !== rawRows[index].content_md5)).toBe(true);
    await expect(checkTargetMigrations(backend, "token", async () => reply(rows))).resolves.toBe(versions.length);
  });

  it("splits SQL only at top-level semicolons and fails closed on unfinished SQL", () => {
    const sql = `-- header; retained\nCREATE FUNCTION f() RETURNS void AS $body$\nBEGIN\n  PERFORM 'a;b';\nEND;\n$body$ LANGUAGE plpgsql;\n/* outer; /* inner; */ end */ SELECT 'x'';y', "a;b";\n-- trailing note`;
    expect(splitSupabaseMigration(sql)).toEqual([
      "-- header; retained\nCREATE FUNCTION f() RETURNS void AS $body$\nBEGIN\n  PERFORM 'a;b';\nEND;\n$body$ LANGUAGE plpgsql",
      `/* outer; /* inner; */ end */ SELECT 'x'';y', "a;b"`,
      "-- trailing note",
    ]);
    expect(() => splitSupabaseMigration("SELECT 'unfinished")).toThrow("Unterminated SQL");
  });

  it("fails when a local version is missing or the target has an unknown version", async () => {
    const versions = await getLocalMigrationVersions();
    await expect(checkTargetMigrations(backend, "token", async () => reply(await historyRows(versions.slice(1)))))
      .rejects.toThrow("1 missing");
    await expect(checkTargetMigrations(backend, "token", async () => reply(await historyRows([...versions, "20260101000000"]))))
      .rejects.toThrow("1 unexpected");
  });

  it("rejects recorded legacy and new versions whose SQL differs from the verified source", async () => {
    const versions = await getLocalMigrationVersions();
    const rows = await historyRows(versions);
    rows[0].content_md5 = "0".repeat(32);
    await expect(checkTargetMigrations(backend, "token", async () => reply(rows)))
      .rejects.toThrow(`Target migration ${versions[0]} has missing or changed SQL content`);
    rows[0].content_md5 = null;
    await expect(checkTargetMigrations(backend, "token", async () => reply(rows)))
      .rejects.toThrow(`Target migration ${versions[0]} has missing or changed SQL content`);

    const recent = versions.indexOf("20261107250000");
    expect(recent).toBeGreaterThan(0);
    rows[0] = (await historyRows(versions))[0];
    rows[recent].content_md5 = "0".repeat(32);
    await expect(checkTargetMigrations(backend, "token", async () => reply(rows)))
      .rejects.toThrow(`Target migration ${versions[recent]} has missing or changed SQL content`);
    rows[recent].content_md5 = null;
    await expect(checkTargetMigrations(backend, "token", async () => reply(rows)))
      .rejects.toThrow(`Target migration ${versions[recent]} has missing or changed SQL content`);
  });

  it("fails closed on malformed, duplicate, or unavailable history", async () => {
    const versions = await getLocalMigrationVersions();
    await expect(checkTargetMigrations(backend, "token", async () => reply([{ version: "bad" }])))
      .rejects.toThrow("malformed versions");
    await expect(checkTargetMigrations(backend, "token", async () => reply([{ version: versions[0] }, { version: versions[0] }])))
      .rejects.toThrow("duplicate versions");
    await expect(checkTargetMigrations(backend, "token", async () => reply({}, 403)))
      .rejects.toThrow("HTTP 403");
  });

  it("requires a hosted origin and a scoped token", async () => {
    await expect(checkTargetMigrations(backend, "", async () => reply([])))
      .rejects.toThrow("SUPABASE_MANAGEMENT_READ_TOKEN");
    await expect(checkTargetMigrations("http://othaxlwgtqpodncnlglv.supabase.co", "token", async () => reply([])))
      .rejects.toThrow("hosted Supabase HTTPS origin");
  });
});
