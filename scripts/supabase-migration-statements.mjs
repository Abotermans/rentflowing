// Supabase CLI records SplitAndTrim(file) in schema_migrations.statements.
// Preserve comments and internal whitespace while splitting only at SQL-level semicolons.
export function splitSupabaseMigration(sql) {
  const statements = [];
  let start = 0;
  let state = "normal";
  let blockDepth = 0;
  let dollarTag = "";

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];
    if (state === "line-comment") {
      if (char === "\n") state = "normal";
      continue;
    }
    if (state === "block-comment") {
      if (char === "/" && next === "*") { blockDepth++; i++; }
      else if (char === "*" && next === "/") {
        blockDepth--;
        i++;
        if (blockDepth === 0) state = "normal";
      }
      continue;
    }
    if (state === "single-quote" || state === "double-quote") {
      const quote = state === "single-quote" ? "'" : '"';
      if (char === "\\") i++;
      else if (char === quote && next === quote) i++;
      else if (char === quote) state = "normal";
      continue;
    }
    if (state === "dollar-quote") {
      if (sql.startsWith(dollarTag, i)) {
        i += dollarTag.length - 1;
        state = "normal";
      }
      continue;
    }
    if (char === "-" && next === "-") { state = "line-comment"; i++; }
    else if (char === "/" && next === "*") { state = "block-comment"; blockDepth = 1; i++; }
    else if (char === "'") state = "single-quote";
    else if (char === '"') state = "double-quote";
    else if (char === "$") {
      const tag = /^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/.exec(sql.slice(i))?.[0];
      if (tag) { dollarTag = tag; state = "dollar-quote"; i += tag.length - 1; }
    } else if (char === ";") {
      const statement = sql.slice(start, i).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }
  if (state !== "normal" && state !== "line-comment") {
    throw new Error(`Unterminated SQL ${state} in local migration`);
  }
  const trailing = sql.slice(start).trim();
  if (trailing) statements.push(trailing);
  return statements;
}
