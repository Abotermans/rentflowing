import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationsDir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const migrations = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
const versions = new Map();
const errors = [];

for (const name of migrations) {
  const match = /^(\d{14})_[\w-]+\.sql$/.exec(name);
  if (!match) {
    errors.push(`Invalid migration filename: ${name}`);
    continue;
  }
  const previous = versions.get(match[1]);
  if (previous) {
    errors.push(`Duplicate migration version ${match[1]}: ${previous}, ${name}`);
  } else {
    versions.set(match[1], name);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`Validated ${migrations.length} unique migration versions.`);
}
