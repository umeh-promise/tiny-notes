import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runMigrations } from "../../../scripts/migrate";
import { openDatabase } from "../database";
import { createNote, deleteNote, readNote, updateNote } from "./repository";
import { enableShare, disableShare, readPublicNote, readShareState } from "./shares";
import { newShareToken, hashShareToken, decryptShareToken } from "./share-tokens";
import { runNoteMutation } from "./mutations";

let directory: string;
let db: Database;
const config = { secret: newShareToken(), origin: "https://notes.example.test" };
const time = "2026-01-01T00:00:00.000Z";
function note() {
  return createNote(db, "alice", {
    id: crypto.randomUUID(),
    title: "Private title",
    contentJson: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "A private thought" }] }],
    },
  });
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "tinynotes-shares-"));
  const dbPath = join(directory, "test.db");
  runMigrations({ dbPath, log: () => {} });
  db = openDatabase(dbPath);
  for (const id of ["alice", "bob"])
    db.query("INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)").run(
      id,
      id,
      `${id}@example.test`,
      time,
      time,
    );
});
afterEach(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("sharing encrypts its recoverable token, leaves content revisions alone, and exposes live saved content", async () => {
  const saved = note();
  const shared = await enableShare(db, "alice", { id: saved.id, expectedShareId: null }, config);
  expect(shared.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(shared.shareUrl).toBe(`${config.origin}/s/${shared.token}`);
  expect(await readShareState(db, "alice", saved.id, config)).toEqual({
    shareEnabled: true,
    shareId: shared.shareId,
    shareUrl: shared.shareUrl,
  });
  const row = db
    .query<{ token_hash: string; token_ciphertext: string }, []>(
      "SELECT token_hash, token_ciphertext FROM note_share",
    )
    .get();
  expect(row?.token_hash).toBe(await hashShareToken(shared.token));
  expect(JSON.stringify(row)).not.toContain(shared.token);
  expect(readNote(db, "alice", saved.id)?.updatedAt).toBe(saved.updatedAt);
  expect((await readPublicNote(db, shared.token))?.title).toBe("Private title");
  const updated = updateNote(db, "alice", {
    id: saved.id,
    expectedUpdatedAt: saved.updatedAt,
    title: "Latest saved title",
  });
  expect(await readPublicNote(db, shared.token)).toMatchObject({
    title: "Latest saved title",
    updatedAt: updated.updatedAt,
  });
  await expect(
    decryptShareToken(
      row?.token_ciphertext ?? "",
      crypto.randomUUID(),
      shared.shareId,
      config.secret,
    ),
  ).rejects.toThrow();
  await expect(
    decryptShareToken(row?.token_ciphertext ?? "", saved.id, shared.shareId, newShareToken()),
  ).rejects.toThrow();
});

test("concurrent enables and lost acknowledgements return one link; stale retries cannot restore revoked access", async () => {
  const saved = note();
  const input = { id: saved.id, expectedShareId: null };
  const [first, second] = await Promise.all([
    enableShare(db, "alice", input, config),
    enableShare(db, "alice", input, config),
  ]);
  expect(first).toEqual(second);
  expect(db.query("SELECT COUNT(*) count FROM note_share").get()).toEqual({ count: 1 });
  const disabled = disableShare(db, "alice", { id: saved.id, expectedShareId: first.shareId });
  expect(disableShare(db, "alice", { id: saved.id, expectedShareId: first.shareId })).toEqual(
    disabled,
  );
  expect(await readPublicNote(db, first.token)).toBeNull();
  await expect(enableShare(db, "alice", input, config)).rejects.toThrow("another tab");
  const replacement = await enableShare(
    db,
    "alice",
    { id: saved.id, expectedShareId: first.shareId },
    config,
  );
  expect(replacement.token).not.toBe(first.token);
  expect(await readPublicNote(db, first.token)).toBeNull();
  expect(await readPublicNote(db, replacement.token)).not.toBeNull();
  expect(() => disableShare(db, "alice", { id: saved.id, expectedShareId: first.shareId })).toThrow(
    "another tab",
  );
  expect(readNote(db, "alice", saved.id)?.updatedAt).toBe(saved.updatedAt);
  deleteNote(db, "alice", { id: saved.id });
  expect(await readPublicNote(db, replacement.token)).toBeNull();
});

test("foreign ownership, malformed inputs, invalid tokens and disabled note flags never expose notes", async () => {
  const saved = note();
  await expect(
    enableShare(db, "bob", { id: saved.id, expectedShareId: null }, config),
  ).rejects.toThrow("unavailable");
  expect(() => disableShare(db, "bob", { id: saved.id, expectedShareId: null })).toThrow(
    "unavailable",
  );
  await expect(readShareState(db, "bob", saved.id, config)).rejects.toThrow("could not be loaded");
  await expect(enableShare(db, "alice", { id: saved.id }, config)).rejects.toThrow("identifier");
  const shared = await enableShare(db, "alice", { id: saved.id, expectedShareId: null }, config);
  for (const token of ["invalid", "' OR 1=1 --", newShareToken(), "x".repeat(10000)])
    expect(await readPublicNote(db, token)).toBeNull();
  db.query("UPDATE note SET share_enabled = 0 WHERE id = ?").run(saved.id);
  expect(await readPublicNote(db, shared.token)).toBeNull();
});

test("legacy links and lost encryption keys remain publicly readable and can always be revoked", async () => {
  const saved = note();
  const token = newShareToken();
  const shareId = crypto.randomUUID();
  db.query("INSERT INTO note_share (id, note_id, token_hash, created_at) VALUES (?, ?, ?, ?)").run(
    shareId,
    saved.id,
    await hashShareToken(token),
    time,
  );
  db.query("UPDATE note SET share_enabled = 1 WHERE id = ?").run(saved.id);
  expect(await readShareState(db, "alice", saved.id, { secret: "invalid" })).toEqual({
    shareEnabled: true,
    shareId,
    shareUrl: null,
  });
  expect(await readPublicNote(db, token)).not.toBeNull();
  disableShare(db, "alice", { id: saved.id, expectedShareId: shareId });
  expect(await readPublicNote(db, token)).toBeNull();
  const next = await enableShare(db, "alice", { id: saved.id, expectedShareId: shareId }, config);
  expect(
    (await readShareState(db, "alice", saved.id, { ...config, secret: newShareToken() })).shareUrl,
  ).toBeNull();
  expect(await readPublicNote(db, next.token)).not.toBeNull();
  disableShare(db, "alice", { id: saved.id, expectedShareId: next.shareId });
  expect(await readPublicNote(db, next.token)).toBeNull();
});

test("failed enable and disable transactions roll back both flags and records without leaking SQL", async () => {
  const saved = note();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const dependencies = { getUserId: async () => "alice", database: () => db };
  db.exec(
    "CREATE TRIGGER reject_share BEFORE UPDATE OF share_enabled ON note BEGIN SELECT RAISE(ABORT, 'secret SQL detail'); END;",
  );
  const failed = await runNoteMutation(
    dependencies,
    (db, userId) => enableShare(db, userId, { id: saved.id, expectedShareId: null }, config),
    "Could not share.",
  );
  expect(failed.error?.code).toBe("INTERNAL_ERROR");
  expect(db.query("SELECT COUNT(*) count FROM note_share").get()).toEqual({ count: 0 });
  expect(JSON.stringify([failed, log.mock.calls])).not.toMatch(/secret SQL|Private title/);
  db.exec("DROP TRIGGER reject_share");
  const share = await enableShare(db, "alice", { id: saved.id, expectedShareId: null }, config);
  db.exec(
    "CREATE TRIGGER reject_share BEFORE UPDATE OF share_enabled ON note BEGIN SELECT RAISE(ABORT, 'secret SQL detail'); END;",
  );
  expect(() =>
    disableShare(db, "alice", { id: saved.id, expectedShareId: share.shareId }),
  ).toThrow();
  expect(await readPublicNote(db, share.token)).not.toBeNull();
  expect((await readShareState(db, "alice", saved.id, config)).shareUrl).toBe(share.shareUrl);
  db.exec("DROP TRIGGER reject_share");
  disableShare(db, "alice", { id: saved.id, expectedShareId: share.shareId });
  expect(await readPublicNote(db, share.token)).toBeNull();
  const database = vi.fn(() => db);
  const mutate = vi.fn();
  expect(
    (await runNoteMutation({ getUserId: async () => null, database }, mutate, "Failed")).error
      ?.code,
  ).toBe("UNAUTHORIZED");
  expect(database).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();
});

test("invalid configuration cannot enable sharing and public read errors are sanitized", async () => {
  const saved = note();
  const input = { id: saved.id, expectedShareId: null };
  for (const origin of [
    "javascript:bad",
    "https://user:password@example.test",
    "https://example.test/path",
    "https://example.test?query=1",
  ])
    await expect(enableShare(db, "alice", input, { ...config, origin })).rejects.toThrow();
  await expect(enableShare(db, "alice", input, { ...config, secret: "bad" })).rejects.toThrow();
  expect(db.query("SELECT COUNT(*) count FROM note_share").get()).toEqual({ count: 0 });
  const shared = await enableShare(db, "alice", input, config);
  db.query("UPDATE note SET content_json = ? WHERE id = ?").run("private broken JSON", saved.id);
  await expect(readPublicNote(db, shared.token)).rejects.toThrow(
    "This shared note could not be loaded. Please try again.",
  );
});
