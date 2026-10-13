import { afterEach, beforeEach, describe, expect, vi, test } from "vitest";
import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "../../../scripts/migrate";
import { openDatabase } from "../database";
import { createNote, deleteNote, listNotes, readNote, updateNote } from "./repository";
import { deleteNoteMutation, mutateNote } from "./mutations";
import { validateContent } from "./validation";
import { emptyDocument, type NoteDraft } from "./types";

let db: Database;
let directory: string;
const time = "2026-10-01T00:00:00.000Z";
const draft: NoteDraft = {
  title: "A thought",
  contentJson: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Words worth keeping." }] }],
  },
};
function input() {
  return { id: crypto.randomUUID(), ...draft };
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "tinynotes-notes-"));
  const dbPath = join(directory, "notes.db");
  runMigrations({ dbPath, log: () => {} });
  db = openDatabase(dbPath);
  for (const user of ["alice", "bob"])
    db.query("INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)").run(
      user,
      user,
      `${user}@example.test`,
      time,
      time,
    );
});

afterEach(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("private notes persistence", () => {
  test("creation and updates require a title but accept empty bodies", () => {
    for (const title of ["", " \n\t "]) {
      for (const contentJson of [draft.contentJson, emptyDocument()]) {
        expect(() => createNote(db, "alice", { ...input(), title, contentJson })).toThrow(
          "Enter a note title.",
        );
      }
    }
    expect(listNotes(db, "alice").notes).toHaveLength(0);
    const saved = createNote(db, "alice", { ...input(), contentJson: emptyDocument() });
    expect(readNote(db, "alice", saved.id)?.contentJson).toEqual(emptyDocument());
    expect(() =>
      updateNote(db, "alice", { id: saved.id, expectedUpdatedAt: saved.updatedAt, title: " " }),
    ).toThrow("Enter a note title.");
    const edited = updateNote(db, "alice", {
      id: saved.id,
      expectedUpdatedAt: saved.updatedAt,
      contentJson: draft.contentJson,
    });
    updateNote(db, "alice", {
      id: saved.id,
      expectedUpdatedAt: edited.updatedAt,
      contentJson: emptyDocument(),
    });
    expect(readNote(db, "alice", saved.id)?.contentJson).toEqual(emptyDocument());
  });

  test("legacy blank notes remain readable and only need a title to save edits", () => {
    const saved = createNote(db, "alice", input());
    db.query("UPDATE note SET title = '', content_json = ? WHERE id = ?").run(
      JSON.stringify(emptyDocument()),
      saved.id,
    );
    expect(readNote(db, "alice", saved.id)).toMatchObject({
      title: "",
      contentJson: emptyDocument(),
    });
    expect(() =>
      updateNote(db, "alice", {
        ...saved,
        expectedUpdatedAt: saved.updatedAt,
        contentJson: draft.contentJson,
      }),
    ).toThrow("Enter a note title");
    updateNote(db, "alice", { ...saved, expectedUpdatedAt: saved.updatedAt, title: "Title only" });
    expect(readNote(db, "alice", saved.id)).toMatchObject({
      title: "Title only",
      contentJson: emptyDocument(),
    });
  });
  test("deletion removes the note and shares, retries safely, and blocks delayed creation", () => {
    const request = input();
    createNote(db, "alice", request);
    db.query(
      "INSERT INTO note_share (id, note_id, token_hash, created_at) VALUES (?, ?, ?, ?)",
    ).run(crypto.randomUUID(), request.id, "share-hash", time);
    expect(() => deleteNote(db, "bob", { id: request.id })).toThrow("unavailable");
    expect(deleteNote(db, "alice", { id: request.id })).toEqual({ id: request.id, deleted: true });
    expect(readNote(db, "alice", request.id)).toBeNull();
    expect(db.query("SELECT COUNT(*) count FROM note_share").get()).toEqual({ count: 0 });
    expect(deleteNote(db, "alice", { id: request.id })).toEqual({ id: request.id, deleted: true });
    expect(() => deleteNote(db, "bob", { id: request.id })).toThrow("unavailable");
    expect(() => deleteNote(db, "alice", { id: crypto.randomUUID() })).toThrow("unavailable");
    expect(() => createNote(db, "alice", request)).toThrow("unavailable");
    expect(() => createNote(db, "bob", request)).toThrow("unavailable");
    expect(() =>
      updateNote(db, "alice", { id: request.id, expectedUpdatedAt: time, title: "late" }),
    ).toThrow("unavailable");
  });

  test("a failed deletion rolls back its deletion record and returns a safe retriable error", async () => {
    const request = input();
    createNote(db, "alice", request);
    db.exec(
      "CREATE TRIGGER reject_delete BEFORE DELETE ON note BEGIN SELECT RAISE(ABORT, 'private deletion details'); END;",
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const dependencies = { getUserId: async () => "alice", database: () => db };
    const result = await deleteNoteMutation({ id: request.id }, dependencies);
    expect(result.error?.code).toBe("INTERNAL_ERROR");
    expect(readNote(db, "alice", request.id)).not.toBeNull();
    expect(db.query("SELECT COUNT(*) count FROM note_deletion").get()).toEqual({ count: 0 });
    expect(JSON.stringify([result, log.mock.calls])).not.toMatch(/private deletion|Words worth/);
    db.exec("DROP TRIGGER reject_delete");
    expect((await deleteNoteMutation({ id: request.id }, dependencies)).data).toEqual({
      id: request.id,
      deleted: true,
    });
    const database = vi.fn(() => db);
    expect(
      (await deleteNoteMutation(null, { getUserId: async () => null, database })).error?.code,
    ).toBe("UNAUTHORIZED");
    expect(database).not.toHaveBeenCalled();
  });
  test("validated heading and link attributes are serializable Server Component props", () => {
    const document = validateContent({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [
            {
              type: "text",
              text: "Reference",
              marks: [{ type: "link", attrs: { href: "https://example.test" } }],
            },
          ],
        },
      ],
    }).document;
    expect(Object.getPrototypeOf(document.content?.[0].attrs)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(document.content?.[0].content?.[0].marks?.[0].attrs)).toBe(
      Object.prototype,
    );
  });
  test("failed reads and corrupt stored documents do not expose SQL or private content", () => {
    const saved = createNote(db, "alice", input());
    db.query("UPDATE note SET content_json = ? WHERE id = ?").run(
      "private broken document",
      saved.id,
    );
    expect(() => readNote(db, "alice", saved.id)).toThrow(
      "Your notes could not be loaded. Please try again.",
    );
    expect(listNotes(db, "alice").notes[0].preview).toBe("Preview unavailable");
    db.exec("DROP TABLE note_share; DROP TABLE note;");
    expect(() => listNotes(db, "alice")).toThrow(
      "Your notes could not be loaded. Please try again.",
    );
  });
  test("creation persists canonical JSON, trimmed titles, timestamps, and a private note", () => {
    const request = { ...input(), title: "  A thought  " };
    const saved = createNote(db, "alice", request);
    expect(readNote(db, "alice", saved.id)).toMatchObject({
      ...draft,
      id: saved.id,
      createdAt: saved.updatedAt,
      updatedAt: saved.updatedAt,
    });
    expect(new Date(saved.updatedAt).toISOString()).toBe(saved.updatedAt);
    expect(db.query("SELECT user_id, share_enabled FROM note WHERE id = ?").get(saved.id)).toEqual({
      user_id: "alice",
      share_enabled: 0,
    });
    expect(listNotes(db, "alice").notes[0].preview).toBe("Words worth keeping.");
  });

  test("read, list, update, and duplicate creation cannot cross ownership boundaries", () => {
    const request = input();
    const saved = createNote(db, "alice", request);
    expect(readNote(db, "bob", saved.id)).toBeNull();
    expect(listNotes(db, "bob").notes).toEqual([]);
    expect(() =>
      updateNote(db, "bob", { id: saved.id, expectedUpdatedAt: saved.updatedAt, title: "stolen" }),
    ).toThrow("unavailable");
    expect(() => createNote(db, "bob", request)).toThrow("unavailable");
    expect(readNote(db, "alice", "' OR 1=1 --")).toBeNull();
    expect(readNote(db, "alice", saved.id)?.title).toBe(draft.title);
  });

  test("repeated creation is idempotent; a changed duplicate never overwrites", () => {
    const request = input();
    const saved = createNote(db, "alice", request);
    expect(createNote(db, "alice", request)).toEqual(saved);
    expect(() => createNote(db, "alice", { ...request, title: "different" })).toThrow(
      "already has a saved version",
    );
    expect(db.query("SELECT COUNT(*) count FROM note").get()).toEqual({ count: 1 });
  });

  test("updates support partial input, preserve sharing and creation time, and advance revisions", () => {
    const saved = createNote(db, "alice", input());
    db.query("UPDATE note SET share_enabled = 1 WHERE id = ?").run(saved.id);
    const first = updateNote(db, "alice", {
      id: saved.id,
      title: "Changed",
      expectedUpdatedAt: saved.updatedAt,
    });
    const second = updateNote(db, "alice", {
      id: saved.id,
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Updated words" }] }],
      },
      expectedUpdatedAt: first.updatedAt,
    });
    expect(first.updatedAt > saved.updatedAt).toBe(true);
    expect(second.updatedAt > first.updatedAt).toBe(true);
    expect(readNote(db, "alice", saved.id)).toMatchObject({
      title: "Changed",
      createdAt: saved.updatedAt,
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Updated words" }] }],
      },
    });
    expect(db.query("SELECT share_enabled FROM note WHERE id = ?").get(saved.id)).toEqual({
      share_enabled: 1,
    });
  });

  test("a stale revision conflicts, but a retry of the acknowledged content is a no-op", () => {
    const saved = createNote(db, "alice", input());
    const request = { id: saved.id, title: "New title", expectedUpdatedAt: saved.updatedAt };
    const result = updateNote(db, "alice", request);
    expect(updateNote(db, "alice", request)).toEqual(result);
    expect(() => updateNote(db, "alice", { ...request, title: "Stale tab" })).toThrow(
      "another tab",
    );
    expect(readNote(db, "alice", saved.id)?.title).toBe("New title");
  });

  test("list pagination orders timestamps and ID ties consistently, with no other user's notes", () => {
    const ids: string[] = [];
    for (let index = 0; index < 26; index++) {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      createNote(db, "alice", { ...draft, id });
      ids.push(id);
    }
    createNote(db, "bob", input());
    db.run("UPDATE note SET updated_at = '2026-10-01T00:00:00.000Z'");
    db.query("UPDATE note SET updated_at = '2026-10-02T00:00:00.000Z' WHERE id = ?").run(ids[0]);
    const first = listNotes(db, "alice", 1);
    const second = listNotes(db, "alice", 2);
    expect(first.notes).toHaveLength(24);
    expect(first.hasMore).toBe(true);
    expect(second.notes).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    expect([...first.notes, ...second.notes].map((note) => note.id)).toEqual([
      ids[0],
      ...ids.slice(1).reverse(),
    ]);
    expect(listNotes(db, "alice", -1)).toEqual(first);
  });

  test("SQL-looking titles and HTML-looking text are preserved as data", () => {
    const title = "'; DROP TABLE note; --";
    const text = '<img src=x onerror="alert(1)">';
    const saved = createNote(db, "alice", {
      ...input(),
      title,
      contentJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      },
    });
    expect(readNote(db, "alice", saved.id)?.title).toBe(title);
    expect(listNotes(db, "alice").notes[0].preview).toBe(text);
  });
});

describe("document boundary and errors", () => {
  test("mutation ownership comes from the verified session, ignoring forged owner fields", async () => {
    const request = { ...input(), userId: "bob", user_id: "bob" };
    const result = await mutateNote("create", request, {
      getUserId: async () => "alice",
      database: () => db,
    });
    expect(result.data?.id).toBe(request.id);
    expect(listNotes(db, "bob").notes).toEqual([]);
    expect(readNote(db, "alice", request.id)?.title).toBe(draft.title);
    const attack = await mutateNote(
      "update",
      { ...request, title: "stolen", expectedUpdatedAt: result.data?.updatedAt, userId: "alice" },
      { getUserId: async () => "bob", database: () => db },
    );
    expect(attack.error?.code).toBe("NOT_FOUND");
    expect(readNote(db, "alice", request.id)?.title).toBe(draft.title);
  });

  test("failed updates leave both persisted content and revision unchanged, then allow retry", async () => {
    const saved = createNote(db, "alice", input());
    const before = readNote(db, "alice", saved.id);
    db.exec(
      "CREATE TRIGGER reject_update BEFORE UPDATE ON note BEGIN SELECT RAISE(ABORT, 'private update error'); END;",
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = { id: saved.id, expectedUpdatedAt: saved.updatedAt, title: "Retry this title" };
    const dependencies = { getUserId: async () => "alice", database: () => db };
    expect((await mutateNote("update", request, dependencies)).error?.code).toBe("INTERNAL_ERROR");
    expect(readNote(db, "alice", saved.id)).toEqual(before);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private update|Retry this title/);
    db.exec("DROP TRIGGER reject_update");
    expect((await mutateNote("update", request, dependencies)).data?.id).toBe(saved.id);
    expect(readNote(db, "alice", saved.id)?.title).toBe("Retry this title");
  });

  test("title and content limits accept the boundary and reject the next byte", () => {
    const document = (text: string) => ({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });
    const overhead = new TextEncoder().encode(JSON.stringify(document(""))).length;
    const maximum = document("a".repeat(256 * 1024 - overhead));
    const saved = createNote(db, "alice", {
      ...input(),
      title: "a".repeat(200),
      contentJson: maximum,
    });
    expect(readNote(db, "alice", saved.id)?.title).toHaveLength(200);
    expect(() => validateContent(document("a".repeat(256 * 1024 - overhead + 1)))).toThrow(
      "256 KB",
    );
    expect(listNotes(db, "alice").notes[0].preview).toHaveLength(180);
  });

  test("a session lookup failure never opens the notes database or exposes its details", async () => {
    const database = vi.fn(() => db);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await mutateNote("create", input(), {
      getUserId: async () => {
        throw new Error("secret session storage details");
      },
      database,
    });
    expect(result.error?.code).toBe("INTERNAL_ERROR");
    expect(database).not.toHaveBeenCalled();
    expect(JSON.stringify([result, log.mock.calls])).not.toContain(
      "secret session storage details",
    );
  });

  test.each([
    null,
    {},
    { type: "text", text: "root" },
    { type: "doc", content: [{ type: "image", attrs: { src: "https://example.test" } }] },
    { type: "doc", content: [{ type: "heading", attrs: { level: 6 } }] },
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "paragraph" }] }] },
  ])("rejects unsupported document %j", (document) => {
    expect(() => createNote(db, "alice", { ...input(), contentJson: document })).toThrow();
    expect(listNotes(db, "alice").notes).toEqual([]);
  });

  test.each([
    "javascript:alert(1)",
    "data:text/html,evil",
    "//example.test",
    "mailto:reader@example.test",
    "https://example.test\n",
  ])("rejects unsafe link %s", (href) => {
    expect(() =>
      validateContent({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "link", marks: [{ type: "link", attrs: { href } }] }],
          },
        ],
      }),
    ).toThrow("HTTP or HTTPS");
  });

  test("safe links receive fixed target/rel and lose arbitrary attributes", () => {
    const result = validateContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { style: "color:red" },
          content: [
            {
              type: "text",
              text: "link",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "https://example.test",
                    target: "_self",
                    rel: "opener",
                    class: "hidden",
                    onclick: "evil",
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(result.serialized).toContain("noopener noreferrer");
    expect(result.serialized).not.toContain("onclick");
    expect(result.serialized).not.toContain("hidden");
    expect(result.serialized).not.toContain("color:red");
  });

  test("size limit measures UTF-8 bytes, and cyclic/deep documents fail safely", () => {
    const large = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "é".repeat(132_000) }] }],
    };
    expect(() => validateContent(large)).toThrow("256 KB");
    const cyclic: Record<string, unknown> = { type: "doc" };
    cyclic.content = [cyclic];
    expect(() => validateContent(cyclic)).toThrow();
    let deep: unknown = { type: "paragraph" };
    for (let i = 0; i < 70; i++) deep = { type: "blockquote", content: [deep] };
    expect(() => validateContent({ type: "doc", content: [deep] })).toThrow("nested too deeply");
    expect(() => createNote(db, "alice", { ...input(), title: "x".repeat(201) })).toThrow(
      "200 characters",
    );
    expect(() =>
      updateNote(db, "alice", { id: crypto.randomUUID(), expectedUpdatedAt: time }),
    ).toThrow("Provide");
  });

  test("mutation authorization runs before input validation and opening the database", async () => {
    let opened = false;
    const result = await mutateNote("create", null, {
      getUserId: async () => null,
      database: () => {
        opened = true;
        return db;
      },
    });
    expect(result.error?.code).toBe("UNAUTHORIZED");
    expect(opened).toBe(false);
  });

  test("database failures return safe errors, do not log content, and permit retry", async () => {
    db.run(
      "CREATE TRIGGER reject_note BEFORE INSERT ON note BEGIN SELECT RAISE(ABORT, 'private SQL details'); END;",
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = input();
    const dependencies = { getUserId: async () => "alice", database: () => db };
    try {
      const result = await mutateNote("create", request, dependencies);
      expect(result.error?.code).toBe("INTERNAL_ERROR");
      expect(JSON.stringify(result)).not.toContain("SQL");
      expect(JSON.stringify(log.mock.calls)).not.toContain("Words worth keeping");
      expect(listNotes(db, "alice").notes).toEqual([]);
      db.run("DROP TRIGGER reject_note");
      expect((await mutateNote("create", request, dependencies)).data?.id).toBe(request.id);
    } finally {
      log.mockRestore();
    }
  });
});
