import { Database, SQLiteError } from "bun:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const defaultMigrationsDir = resolve(projectRoot, "migrations");

type Direction = "up" | "down";
type Migration = { version: string; up: string; down: string };
type MigrationOptions = Readonly<{
  direction?: Direction;
  dbPath?: string;
  migrationsDir?: string;
  log?: (message: string) => void;
}>;

export function parseDirection(args: readonly string[]): Direction {
  if (args.length > 1 || (args[0] !== undefined && args[0] !== "up" && args[0] !== "down")) {
    throw new Error("Usage: bun run db:migrate [up|down]");
  }
  return args[0] === "down" ? "down" : "up";
}

function readMigrations(directory: string): Migration[] {
  const pairs = new Map<string, Partial<Record<Direction, string>>>();
  const numbers = new Map<string, string>();

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.name.endsWith(".sql")) continue;
    const match = /^(\d{4}_[a-z0-9]+(?:_[a-z0-9]+)*)\.(up|down)\.sql$/.exec(entry.name);
    if (!match || !entry.isFile()) {
      throw new Error(
        `Invalid migration file: ${entry.name}. Expected NNNN_name.up.sql or NNNN_name.down.sql.`,
      );
    }
    const [, name, direction] = match;
    const number = name.slice(0, 4);
    if (numbers.has(number) && numbers.get(number) !== name) {
      throw new Error(`Duplicate migration number: ${number}.`);
    }
    numbers.set(number, name);
    const pair = pairs.get(name) ?? {};
    pair[direction as Direction] = readFileSync(resolve(directory, entry.name), "utf8");
    pairs.set(name, pair);
  }

  return [...pairs.keys()].sort().map((name) => {
    const pair = pairs.get(name)!;
    if (pair.up === undefined || pair.down === undefined) {
      throw new Error(`Missing migration pair for ${name}. Both UP and DOWN files are required.`);
    }
    return { version: `${name}.up.sql`, up: pair.up, down: pair.down };
  });
}

function appliedCount(db: Database, migrations: readonly Migration[]): number {
  const history = db
    .query<{ version: string }, []>("SELECT version FROM schema_migrations ORDER BY version")
    .all();
  for (const [index, row] of history.entries()) {
    if (migrations[index]?.version !== row.version) {
      throw new Error(
        `Inconsistent migration history at ${row.version}. Applied versions must match an ordered prefix of available migrations.`,
      );
    }
  }
  return history.length;
}

function enableWal(db: Database): void {
  const deadline = performance.now() + 5000;
  while (true) {
    try {
      db.run("PRAGMA journal_mode = WAL");
      return;
    } catch (error) {
      // SQLite can bypass busy_timeout when promoting a journal-mode lock.
      // Retry only this idempotent setup operation, never partially executed SQL.
      if (
        !(error instanceof SQLiteError) ||
        error.code !== "SQLITE_BUSY" ||
        performance.now() >= deadline
      ) {
        throw error;
      }
      Bun.sleepSync(25);
    }
  }
}

export function runMigrations({
  direction = "up",
  dbPath = process.env.DB_PATH ?? "./data/tinynotes.db",
  migrationsDir = defaultMigrationsDir,
  log = console.log,
}: MigrationOptions = {}): string[] {
  if (direction !== "up" && direction !== "down") throw new Error("Invalid migration direction.");
  if (!dbPath.trim()) throw new Error("DB_PATH must not be empty.");
  const migrations = readMigrations(migrationsDir);
  const databasePath = dbPath === ":memory:" ? dbPath : resolve(projectRoot, dbPath);
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath, { create: true, strict: true });

  try {
    db.run("PRAGMA busy_timeout = 5000");
    db.run("PRAGMA foreign_keys = ON");
    enableWal(db);
    db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`);

    const step = db.transaction(() => {
      const count = appliedCount(db, migrations);
      const migration = migrations[direction === "up" ? count : count - 1];
      if (!migration) return null;

      try {
        db.run(migration[direction]);
        if (direction === "up") {
          db.query("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
            migration.version,
            new Date().toISOString(),
          );
        } else {
          db.query("DELETE FROM schema_migrations WHERE version = ?").run(migration.version);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to ${direction === "up" ? "apply" : "revert"} ${migration.version}: ${message}`,
          { cause: error },
        );
      }
      return migration.version;
    });

    const changed: string[] = [];
    while (true) {
      // Re-read history only after acquiring the write lock, including on competing runners.
      const version = step.immediate();
      if (!version) break;
      changed.push(version);
      log(`${direction === "up" ? "Applied" : "Reverted"} ${version}`);
      if (direction === "down") break;
    }
    if (changed.length === 0)
      log(direction === "up" ? "No pending migrations." : "No applied migrations to revert.");
    return changed;
  } finally {
    db.close();
  }
}

if (import.meta.main) {
  try {
    const direction = parseDirection(process.argv.slice(2));
    runMigrations({ direction });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
