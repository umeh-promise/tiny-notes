// sqlite-explorer.ts
// Bun script for exploring and querying SQLite databases.
// Requires Bun v1.1+ (uses bun:sqlite).
//
// Examples:
//   bun sqlite-explorer.ts ./db.sqlite --tables
//   bun sqlite-explorer.ts ./db.sqlite --schema users
//   bun sqlite-explorer.ts ./db.sqlite --readonly --query "SELECT * FROM users LIMIT 10"

import { Database } from "bun:sqlite";

type Args = {
  dbPath?: string;
  tables?: boolean;
  schema?: string;
  query?: string;
  readonly?: boolean;
  json?: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    if (a === "--tables") args.tables = true;
    else if (a === "--readonly") args.readonly = true;
    else if (a === "--json") args.json = true;
    else if (a === "--schema") args.schema = argv[++i];
    else if (a === "--query") args.query = argv[++i];
    else {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    }
  }

  args.dbPath = positional[0];
  return args;
}

function usage(): never {
  console.error(
    [
      "Usage:",
      "  bun sqlite-explorer.ts <dbPath> [--readonly] [--tables] [--schema <table>] [--query <sql>] [--json]",
      "",
      "Examples:",
      "  bun sqlite-explorer.ts ./db.sqlite --tables",
      "  bun sqlite-explorer.ts ./db.sqlite --schema users",
      '  bun sqlite-explorer.ts ./db.sqlite --query "SELECT * FROM users LIMIT 10"',
      '  bun sqlite-explorer.ts ./db.sqlite --readonly --query "SELECT COUNT(*) AS n FROM users"',
    ].join("\n"),
  );
  process.exit(2);
}

function isSelectLike(sql: string): boolean {
  const s = sql.trim().toLowerCase();
  return (
    s.startsWith("select") ||
    s.startsWith("with") ||
    s.startsWith("pragma") ||
    s.startsWith("explain")
  );
}

function printTable(rows: any[]): void {
  if (rows.length === 0) {
    console.log("(no rows)");
    return;
  }
  const cols = Object.keys(rows[0]);
  const widths = cols.map((c) => c.length);

  for (const r of rows) {
    cols.forEach((c, idx) => {
      const v = r?.[c];
      const str = v === null || v === undefined ? "" : String(v);
      widths[idx] = Math.max(widths[idx], str.length);
    });
  }

  const sep = "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+";
  const header = "|" + cols.map((c, i) => " " + c.padEnd(widths[i]) + " ").join("|") + "|";

  console.log(sep);
  console.log(header);
  console.log(sep);

  for (const r of rows) {
    const line =
      "|" +
      cols
        .map((c, i) => {
          const v = r?.[c];
          const str = v === null || v === undefined ? "" : String(v);
          return " " + str.padEnd(widths[i]) + " ";
        })
        .join("|") +
      "|";
    console.log(line);
  }
  console.log(sep);
}

function qIdent(name: string): string {
  // Quote an identifier safely for SQLite.
  return `"${name.replace(/"/g, '""')}"`;
}

function listTables(db: Database, asJson: boolean): void {
  const sql =
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY 1;";
  const rows = db.query(sql).all() as { name: string }[];
  if (asJson) {
    console.log(
      JSON.stringify(
        rows.map((r) => r.name),
        null,
        2,
      ),
    );
    return;
  }
  if (rows.length === 0) {
    console.log("(no tables)");
    return;
  }
  for (const r of rows) console.log(r.name);
}

function showSchema(db: Database, table: string, asJson: boolean): void {
  const t = table;

  const columns = db.query(`PRAGMA table_info(${qIdent(t)});`).all();
  const fks = db.query(`PRAGMA foreign_key_list(${qIdent(t)});`).all();
  const indexes = db.query(`PRAGMA index_list(${qIdent(t)});`).all() as any[];

  const indexDetails = indexes.map((ix) => {
    const name = ix?.name;
    const info = name
      ? (db.query(`PRAGMA index_info(${qIdent(String(name))});`).all() as any[])
      : [];
    return { ...ix, columns: info };
  });

  if (asJson) {
    console.log(
      JSON.stringify({ table: t, columns, foreignKeys: fks, indexes: indexDetails }, null, 2),
    );
    return;
  }

  console.log(`Table: ${t}\n`);

  console.log("Columns:");
  printTable(columns as any[]);
  console.log("");

  console.log("Foreign Keys:");
  printTable(fks as any[]);
  console.log("");

  console.log("Indexes:");
  if (indexDetails.length === 0) {
    console.log("(no indexes)");
  } else {
    for (const ix of indexDetails) {
      console.log(`- ${ix.name}${ix.unique ? " (unique)" : ""}`);
      const cols = (ix.columns ?? []).map((c: any) => c?.name).filter(Boolean);
      if (cols.length) console.log(`  columns: ${cols.join(", ")}`);
    }
  }
}

function runQuery(db: Database, sql: string, asJson: boolean): void {
  if (isSelectLike(sql)) {
    const rows = db.query(sql).all() as any[];
    if (asJson) {
      console.log(JSON.stringify(rows, null, 2));
    } else {
      printTable(rows);
      console.log(`(${rows.length} row${rows.length === 1 ? "" : "s"})`);
    }
  } else {
    const stmt = db.query(sql);
    const res = stmt.run();
    const out = {
      changes: res.changes,
      lastInsertRowid: res.lastInsertRowid,
    };
    if (asJson) console.log(JSON.stringify(out, null, 2));
    else console.log(`OK (changes=${out.changes}, lastInsertRowid=${out.lastInsertRowid})`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dbPath) usage();

  const db = new Database(args.dbPath, { readonly: !!args.readonly });

  try {
    const didSomething = !!args.tables || !!args.schema || typeof args.query === "string";

    if (!didSomething) {
      // Sensible default: list tables.
      listTables(db, !!args.json);
      return;
    }

    if (args.tables) listTables(db, !!args.json);
    if (args.schema) showSchema(db, args.schema, !!args.json);
    if (typeof args.query === "string") runQuery(db, args.query, !!args.json);
  } finally {
    db.close();
  }
}

main();
