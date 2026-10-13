import { Database } from "bun:sqlite";
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DatabaseCommand, DatabaseResult } from "./database-types";

// Playwright runs in Node; this CLI uses Bun. No test-only application endpoint.
const directory = process.env.TINYNOTES_E2E_DIR;
const runId = process.env.TINYNOTES_E2E_RUN;
if (!directory || !runId) throw new Error("Missing E2E run directory.");
const root = realpathSync(directory);
const path = join(root, "test.db");
const marker = await Bun.file(join(root, "run.json")).json();
if (
  marker.runId !== runId ||
  realpathSync(marker.dbPath) !== path ||
  realpathSync(resolve(process.env.DB_PATH ?? "")) !== path
)
  throw new Error("Refusing a database outside this disposable E2E run.");
const command: DatabaseCommand = await Bun.stdin.json();
const db = new Database(path, { create: false, readwrite: true, strict: true });
try {
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const user = db
    .query<{ id: string }, [string]>("SELECT id FROM user WHERE email = ?")
    .get(command.email);
  if (!user) throw new Error("Fixture account does not exist.");
  if (command.kind === "seed") {
    if (!Number.isInteger(command.count) || command.count < 1 || command.count > 100)
      throw new Error("Invalid fixture note count.");
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: command.text ?? "A private fixture thought." }],
        },
      ],
    });
    const insert = db.query(
      "INSERT INTO note (id, user_id, title, content_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    db.transaction(() => {
      for (let i = 0; i < command.count; i++) {
        const time = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
        insert.run(
          crypto.randomUUID(),
          user.id,
          `${command.prefix ?? "Fixture"} ${i + 1}`,
          content,
          time,
          time,
        );
      }
    }).immediate();
  } else if (command.kind === "set-content") {
    db.query("UPDATE note SET content_json = ? WHERE id = ? AND user_id = ?").run(
      JSON.stringify(command.contentJson),
      command.id,
      user.id,
    );
  } else if (command.kind === "expire-session") {
    db.query("UPDATE session SET expiresAt = ? WHERE userId = ?").run(
      "2000-01-01T00:00:00.000Z",
      user.id,
    );
  } else if (
    command.kind === "fail-writes" ||
    command.kind === "fail-deletes" ||
    command.kind === "fail-sharing"
  ) {
    // DDL cannot bind identifiers; only validated fixture UUIDs enter these statements.
    if (!/^[a-f0-9-]{36}$/.test(user.id)) throw new Error("Unexpected fixture user ID.");
    const suffix = user.id.replaceAll("-", "");
    for (const event of command.kind === "fail-deletes"
      ? ["DELETE"]
      : command.kind === "fail-sharing"
        ? ["SHARE"]
        : ["INSERT", "UPDATE"]) {
      const name = `e2e_fail_${event}_${suffix}`;
      db.exec(`DROP TRIGGER IF EXISTS ${name}`);
      if (command.enabled)
        db.exec(
          `CREATE TRIGGER ${name} BEFORE ${event === "SHARE" ? "UPDATE OF share_enabled" : event} ON note WHEN ${event === "DELETE" ? "OLD" : "NEW"}.user_id = '${user.id}' BEGIN SELECT RAISE(ABORT, 'e2e database failure'); END;`,
        );
    }
  } else if (command.kind !== "inspect") throw new Error("Unknown fixture command.");
  const rows = db
    .query<{ id: string; title: string; content_json: string; updated_at: string }, [string]>(
      "SELECT id, title, content_json, updated_at FROM note WHERE user_id = ? ORDER BY updated_at DESC, id DESC",
    )
    .all(user.id);
  const result: DatabaseResult = {
    shares: db
      .query<{ id: string; note_id: string; enabled: number }, [string]>(
        "SELECT s.id, s.note_id, s.enabled FROM note_share s JOIN note n ON n.id = s.note_id WHERE n.user_id = ? ORDER BY s.created_at, s.id",
      )
      .all(user.id)
      .map((row) => ({ id: row.id, noteId: row.note_id, enabled: row.enabled === 1 })),
    notes: rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: JSON.parse(row.content_json),
      updatedAt: row.updated_at,
    })),
  };
  console.log(JSON.stringify(result));
} finally {
  db.close();
}
