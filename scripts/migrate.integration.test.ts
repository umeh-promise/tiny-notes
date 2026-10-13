import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "./migrate";

let directory: string;
let dbPath: string;
const quiet = () => {};
const versions = [
  "0001_init.up.sql",
  "0002_notes.up.sql",
  "0003_note_deletions.up.sql",
  "0004_share_tokens.up.sql",
];
const timestamp = "2026-01-01T00:00:00.000Z";

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "tinynotes-migrations-"));
  dbPath = join(directory, "data", "test.db");
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

function inspect<T>(read: (db: Database) => T): T {
  const db = new Database(dbPath, { strict: true });
  try {
    db.run("PRAGMA foreign_keys = ON");
    return read(db);
  } finally {
    db.close();
  }
}

function tables(db: Database): string[] {
  return db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
}

function history(db: Database) {
  return db
    .query<{ version: string; applied_at: string }, []>(
      "SELECT version, applied_at FROM schema_migrations ORDER BY version",
    )
    .all();
}

function addUser(db: Database) {
  db.query("INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)").run(
    "owner",
    "Owner",
    "owner@example.test",
    timestamp,
    timestamp,
  );
}

function fixture(name: string, up: string, down: string) {
  const migrationsDir = join(directory, "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  writeFileSync(join(migrationsDir, `${name}.up.sql`), up);
  writeFileSync(join(migrationsDir, `${name}.down.sql`), down);
  return migrationsDir;
}

async function cli(
  args: string[],
  script = join(import.meta.dirname, "migrate.ts"),
  path = dbPath,
) {
  const child = Bun.spawn([process.execPath, script, ...args], {
    cwd: tmpdir(),
    env: { ...process.env, DB_PATH: path },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe("application schema", () => {
  test("fresh UP creates the specified schema, indexes, defaults, and UTC history", () => {
    expect(runMigrations({ dbPath, log: quiet })).toEqual(versions);
    inspect((db) => {
      expect(tables(db)).toEqual([
        "account",
        "note",
        "note_deletion",
        "note_share",
        "schema_migrations",
        "session",
        "user",
        "verification",
      ]);
      const indexes = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name",
        )
        .all()
        .map((row) => row.name);
      expect(indexes).toEqual([
        "idx_account_userId",
        "idx_note_deletion_user",
        "idx_note_share_active",
        "idx_note_share_note",
        "idx_note_user_updated",
        "idx_session_userId",
        "idx_verification_identifier",
      ]);
      expect(history(db).map((row) => row.version)).toEqual(versions);
      for (const row of history(db))
        expect(new Date(row.applied_at).toISOString()).toBe(row.applied_at);
      expect(db.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
      addUser(db);
      expect(db.query("SELECT emailVerified, image FROM user").get()).toEqual({
        emailVerified: 0,
        image: null,
      });
      db.query(
        "INSERT INTO note (id, user_id, content_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      ).run("note", "owner", '{"type":"doc"}', timestamp, timestamp);
      expect(db.query("SELECT title, share_enabled FROM note").get()).toEqual({
        title: "",
        share_enabled: 0,
      });
    });
  });

  test("repeated UP leaves schema and history unchanged and reports a no-op", () => {
    runMigrations({ dbPath, log: quiet });
    const before = inspect(history);
    const messages: string[] = [];
    expect(runMigrations({ dbPath, log: (message) => messages.push(message) })).toEqual([]);
    expect(inspect(history)).toEqual(before);
    expect(messages).toEqual(["No pending migrations."]);
  });

  test("DOWN reverses only the latest migration and permits reapplication", () => {
    runMigrations({ dbPath, log: quiet });
    inspect(addUser);
    expect(runMigrations({ dbPath, direction: "down", log: quiet })).toEqual([versions.at(-1)]);
    inspect((db) => {
      expect(history(db).map((row) => row.version)).toEqual(versions.slice(0, -1));
      expect(db.query("SELECT id FROM user").get()).toEqual({ id: "owner" });
      expect(tables(db)).toContain("note");
    });
    expect(runMigrations({ dbPath, log: quiet })).toEqual([versions.at(-1)]);
    for (const version of [...versions].reverse())
      expect(runMigrations({ dbPath, direction: "down", log: quiet })).toEqual([version]);
    expect(inspect(tables)).toEqual(["schema_migrations"]);
    expect(inspect(history)).toEqual([]);
    expect(runMigrations({ dbPath, log: quiet })).toEqual(versions);
  });

  test("DOWN with no applied migrations reports a no-op", () => {
    const messages: string[] = [];
    expect(
      runMigrations({ dbPath, direction: "down", log: (message) => messages.push(message) }),
    ).toEqual([]);
    expect(messages).toEqual(["No applied migrations to revert."]);
    expect(inspect(tables)).toEqual(["schema_migrations"]);
  });

  test("sharing and deletion migrations preserve existing notes and hashes across DOWN/UP", () => {
    runMigrations({ dbPath, log: quiet });
    inspect((db) => {
      addUser(db);
      db.query(
        "INSERT INTO note (id, user_id, title, content_json, share_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
      ).run("existing", "owner", "Kept", '{"type":"doc"}', timestamp, timestamp);
      db.query(
        "INSERT INTO note_share (id, note_id, token_hash, token_ciphertext, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run("share", "existing", "kept-hash", "encrypted-copy", timestamp);
    });
    runMigrations({ dbPath, direction: "down", log: quiet });
    inspect((db) => {
      expect(db.query("SELECT title, share_enabled FROM note").get()).toEqual({
        title: "Kept",
        share_enabled: 1,
      });
      expect(db.query("SELECT token_hash, enabled FROM note_share").get()).toEqual({
        token_hash: "kept-hash",
        enabled: 1,
      });
      expect(() => db.query("SELECT token_ciphertext FROM note_share").get()).toThrow();
    });
    runMigrations({ dbPath, direction: "down", log: quiet });
    expect(inspect(tables)).not.toContain("note_deletion");
    expect(runMigrations({ dbPath, log: quiet })).toEqual(versions.slice(2));
    inspect((db) => {
      expect(db.query("SELECT token_hash, token_ciphertext FROM note_share").get()).toEqual({
        token_hash: "kept-hash",
        token_ciphertext: null,
      });
      expect(db.query("SELECT title FROM note").get()).toEqual({ title: "Kept" });
    });
  });

  test("foreign keys, unique credentials/tokens, and one active share are enforced", () => {
    runMigrations({ dbPath, log: quiet });
    inspect((db) => {
      addUser(db);
      const note = db.query(
        "INSERT INTO note (id, user_id, content_json, created_at, updated_at) VALUES (?, ?, '{}', ?, ?)",
      );
      expect(() => note.run("orphan", "missing", timestamp, timestamp)).toThrow();
      note.run("note", "owner", timestamp, timestamp);
      const share = db.query(
        "INSERT INTO note_share (id, note_id, token_hash, enabled, created_at) VALUES (?, 'note', ?, ?, ?)",
      );
      share.run("active", "hash-1", 1, timestamp);
      expect(() => share.run("second-active", "hash-2", 1, timestamp)).toThrow();
      expect(() => share.run("duplicate-token", "hash-1", 0, timestamp)).toThrow();
      share.run("disabled", "hash-2", 0, timestamp);
      share.run("older", "hash-3", 0, timestamp);
      db.run("UPDATE note_share SET enabled = 0 WHERE id = 'active'");
      share.run("new-active", "hash-4", 1, timestamp);
      const session = db.query(
        "INSERT INTO session (id, userId, token, expiresAt, createdAt, updatedAt) VALUES (?, 'owner', 'unique-token', ?, ?, ?)",
      );
      session.run("session", timestamp, timestamp, timestamp);
      expect(() => session.run("duplicate-session", timestamp, timestamp, timestamp)).toThrow();
      const account = db.query(
        "INSERT INTO account (id, userId, accountId, providerId, createdAt, updatedAt) VALUES (?, 'owner', 'owner', 'credential', ?, ?)",
      );
      account.run("account", timestamp, timestamp);
      expect(() => account.run("duplicate-account", timestamp, timestamp)).toThrow();
      db.run("DELETE FROM user WHERE id = 'owner'");
      for (const table of ["session", "account", "note", "note_share"]) {
        expect(db.query(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
      }
    });
  });
});

describe("atomicity and migration validation", () => {
  test("failed UP rolls back its changes, keeps earlier migrations, and stops", () => {
    const migrationsDir = fixture(
      "0001_first",
      "CREATE TABLE first (value TEXT); INSERT INTO first VALUES ('kept');",
      "DROP TABLE first;",
    );
    fixture(
      "0002_second",
      "CREATE TABLE second (value TEXT); INSERT INTO missing VALUES (1);",
      "DROP TABLE second;",
    );
    fixture("0003_third", "CREATE TABLE third (value TEXT);", "DROP TABLE third;");
    expect(() => runMigrations({ dbPath, migrationsDir, log: quiet })).toThrow(
      "Failed to apply 0002_second.up.sql",
    );
    inspect((db) => {
      expect(tables(db)).toEqual(["first", "schema_migrations"]);
      expect(history(db).map((row) => row.version)).toEqual(["0001_first.up.sql"]);
      expect(db.query("SELECT value FROM first").get()).toEqual({ value: "kept" });
    });
    fixture("0002_second", "CREATE TABLE second (value TEXT);", "DROP TABLE second;");
    expect(runMigrations({ dbPath, migrationsDir, log: quiet })).toEqual([
      "0002_second.up.sql",
      "0003_third.up.sql",
    ]);
  });

  test("a failed history write also rolls back schema changes", () => {
    const migrationsDir = fixture(
      "0001_first",
      "CREATE TABLE first (value TEXT);",
      "DROP TABLE first;",
    );
    runMigrations({ dbPath, migrationsDir, direction: "down", log: quiet });
    inspect((db) =>
      db.run(
        "CREATE TRIGGER reject_history BEFORE INSERT ON schema_migrations BEGIN SELECT RAISE(ABORT, 'history rejected'); END;",
      ),
    );
    expect(() => runMigrations({ dbPath, migrationsDir, log: quiet })).toThrow("history rejected");
    expect(inspect(tables)).toEqual(["schema_migrations"]);
    expect(inspect(history)).toEqual([]);
  });

  test("failed DOWN restores dropped tables, their data, and history", () => {
    const migrationsDir = fixture(
      "0001_first",
      "CREATE TABLE first (value TEXT); INSERT INTO first VALUES ('kept');",
      "DROP TABLE first; DROP TABLE missing;",
    );
    runMigrations({ dbPath, migrationsDir, log: quiet });
    const before = inspect(history);
    expect(() => runMigrations({ dbPath, migrationsDir, direction: "down", log: quiet })).toThrow(
      "Failed to revert 0001_first.up.sql",
    );
    expect(inspect(history)).toEqual(before);
    expect(inspect((db) => db.query("SELECT value FROM first").get())).toEqual({ value: "kept" });
  });

  test("foreign keys are enabled on the migration connection", () => {
    const migrationsDir = fixture(
      "0001_first",
      "CREATE TABLE parent (id TEXT PRIMARY KEY); CREATE TABLE child (parent_id TEXT REFERENCES parent(id)); INSERT INTO child VALUES ('missing');",
      "DROP TABLE child; DROP TABLE parent;",
    );
    expect(() => runMigrations({ dbPath, migrationsDir, log: quiet })).toThrow(
      "FOREIGN KEY constraint failed",
    );
    expect(inspect(tables)).toEqual(["schema_migrations"]);
    expect(inspect(history)).toEqual([]);
  });

  test("missing pairs fail before creating the database", () => {
    const migrationsDir = fixture("0001_first", "SELECT 1;", "SELECT 1;");
    rmSync(join(migrationsDir, "0001_first.down.sql"));
    expect(() => runMigrations({ dbPath, migrationsDir, log: quiet })).toThrow(
      "Missing migration pair",
    );
    expect(existsSync(dbPath)).toBe(false);
  });

  test("duplicate numbers and malformed SQL filenames fail before opening the database", () => {
    const migrationsDir = fixture("0001_first", "SELECT 1;", "SELECT 1;");
    fixture("0001_second", "SELECT 1;", "SELECT 1;");
    expect(() => runMigrations({ dbPath, migrationsDir, log: quiet })).toThrow(
      "Duplicate migration number",
    );
    writeFileSync(join(migrationsDir, "0000_invalid.sql"), "SELECT 1;");
    expect(() => runMigrations({ dbPath, migrationsDir, log: quiet })).toThrow(
      "Invalid migration file",
    );
    expect(existsSync(dbPath)).toBe(false);
  });

  test.each(["up", "down"] as const)(
    "%s rejects gaps and unknown versions in history",
    (direction) => {
      runMigrations({ dbPath, log: quiet });
      inspect((db) => db.query("DELETE FROM schema_migrations WHERE version = ?").run(versions[0]));
      expect(() => runMigrations({ dbPath, direction, log: quiet })).toThrow(
        "Inconsistent migration history",
      );
      inspect((db) => {
        db.run("DELETE FROM schema_migrations");
        db.query("INSERT INTO schema_migrations VALUES (?, ?)").run(
          "9999_unknown.up.sql",
          timestamp,
        );
      });
      expect(() => runMigrations({ dbPath, direction, log: quiet })).toThrow(
        "Inconsistent migration history",
      );
    },
  );
});

describe("CLI and competing runners", () => {
  test("invalid arguments fail before opening the database", async () => {
    for (const args of [["reset"], ["up", "down"]]) {
      const result = await cli(args);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage:");
      expect(existsSync(dbPath)).toBe(false);
    }
  });

  test("the CLI resolves relative DB_PATH and migrations against the script's project root", async () => {
    const migrationsDir = fixture(
      "0001_first",
      "CREATE TABLE first (value TEXT);",
      "DROP TABLE first;",
    );
    const scriptsDir = join(directory, "scripts");
    mkdirSync(scriptsDir);
    const script = join(scriptsDir, "migrate.ts");
    copyFileSync(join(import.meta.dirname, "migrate.ts"), script);
    const result = await cli([], script, "nested/example.db");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Applied 0001_first.up.sql");
    expect(existsSync(join(directory, "nested/example.db"))).toBe(true);
    fixture(
      "0002_bad",
      "CREATE TABLE partial (value TEXT); INSERT INTO absent VALUES (1);",
      "DROP TABLE partial;",
    );
    const failed = await cli(["up"], script, "nested/example.db");
    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toContain("Failed to apply 0002_bad.up.sql");
    dbPath = join(directory, "nested/example.db");
    expect(inspect(tables)).toEqual(["first", "schema_migrations"]);
    expect(runMigrations({ dbPath, migrationsDir, direction: "down", log: quiet })).toEqual([
      "0001_first.up.sql",
    ]);
  });

  test("concurrent UP processes apply each migration exactly once", async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => cli(["up"])));
    for (const result of results) {
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
    }
    for (const version of versions) {
      expect(
        results
          .flatMap((result) => result.stdout.split("\n"))
          .filter((line) => line === `Applied ${version}`),
      ).toHaveLength(1);
    }
    expect(inspect(history).map((row) => row.version)).toEqual(versions);
  });
});
