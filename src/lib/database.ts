import "server-only";
import { Database, SQLiteError } from "bun:sqlite";
import { resolve } from "node:path";

export function openDatabase(path = process.env.DB_PATH ?? "./data/tinynotes.db") {
  if (!path.trim()) throw new Error("DB_PATH must not be empty.");
  // Next.js is started from the project root, matching the migration runner's paths.
  // Opening an existing file only avoids silently creating an unmigrated database.
  const db = new Database(path === ":memory:" ? path : resolve(process.cwd(), path), {
    readwrite: true,
    create: false,
    strict: true,
  });
  try {
    db.run("PRAGMA busy_timeout = 5000");
    db.run("PRAGMA foreign_keys = ON");
    const deadline = performance.now() + 5000;
    while (true) {
      try {
        db.run("PRAGMA journal_mode = WAL");
        break;
      } catch (error) {
        if (
          !(error instanceof SQLiteError) ||
          error.code !== "SQLITE_BUSY" ||
          performance.now() >= deadline
        )
          throw error;
        Bun.sleepSync(25);
      }
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
