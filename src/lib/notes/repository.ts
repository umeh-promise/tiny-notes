import "server-only";
import type { Database } from "bun:sqlite";
import { openDatabase } from "../database";
import {
  NoteError,
  notePreview,
  objectInput,
  validateContent,
  validateId,
  validateTitle,
} from "./validation";
import {
  NOTES_PAGE_SIZE,
  type DeletedNote,
  type Note,
  type NoteSummary,
  type SavedNote,
} from "./types";

const connections = globalThis as typeof globalThis & { tinyNotesNotesDatabase?: Database };

export function getNotesDatabase(): Database {
  // Better Auth owns its connection and asynchronous transactions. Do not join them.
  return safelyRead(() => (connections.tinyNotesNotesDatabase ??= openDatabase()));
}

function safelyRead<T>(read: () => T): T {
  try {
    return read();
  } catch {
    // Next.js logs thrown render errors: never forward SQL or malformed stored JSON.
    throw new Error("Your notes could not be loaded. Please try again.");
  }
}

type NoteRow = {
  id: string;
  title: string;
  content_json: string;
  share_enabled: number;
  created_at: string;
  updated_at: string;
};

function readRow(db: Database, userId: string, id: string): NoteRow | null {
  return db
    .query<NoteRow, [string, string]>(
      "SELECT id, title, content_json, share_enabled, created_at, updated_at FROM note WHERE id = ? AND user_id = ?",
    )
    .get(id, userId);
}

export function readNote(db: Database, userId: string, id: string): Note | null {
  return safelyRead(() => {
    const row = readRow(db, userId, id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      contentJson: validateContent(JSON.parse(row.content_json)).document,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export function listNotes(
  db: Database,
  userId: string,
  page = 1,
): { notes: NoteSummary[]; hasMore: boolean } {
  return safelyRead(() => {
    const currentPage = Number.isSafeInteger(page) && page > 0 && page <= 1_000_000 ? page : 1;
    const rows = db
      .query<NoteRow, [string, number, number]>(
        "SELECT id, title, content_json, share_enabled, created_at, updated_at FROM note WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?",
      )
      .all(userId, NOTES_PAGE_SIZE + 1, (currentPage - 1) * NOTES_PAGE_SIZE);
    return {
      notes: rows.slice(0, NOTES_PAGE_SIZE).map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updated_at,
        preview: notePreview(row.content_json),
        shareEnabled: row.share_enabled === 1,
      })),
      hasMore: rows.length > NOTES_PAGE_SIZE,
    };
  });
}

export function createNote(db: Database, userId: string, input: unknown): SavedNote {
  const value = objectInput(input);
  const id = validateId(value.id);
  const title = validateTitle(value.title);
  const { serialized } = validateContent(value.contentJson);
  return db
    .transaction(() => {
      const existing = readRow(db, userId, id);
      if (existing) {
        if (existing.title === title && existing.content_json === serialized)
          return { id, updatedAt: existing.updated_at };
        throw new NoteError(
          "CONFLICT",
          "This draft already has a saved version. Copy your changes before opening the saved note.",
        );
      }
      // A colliding ID must never expose or overwrite another user's note.
      if (
        db.query("SELECT 1 FROM note WHERE id = ?").get(id) ||
        db.query("SELECT 1 FROM note_deletion WHERE note_id = ?").get(id)
      )
        throw new NoteError("NOT_FOUND", "This note is unavailable.");
      const updatedAt = new Date().toISOString();
      db.query(
        "INSERT INTO note (id, user_id, title, content_json, share_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
      ).run(id, userId, title, serialized, updatedAt, updatedAt);
      return { id, updatedAt };
    })
    .immediate();
}

export function deleteNote(db: Database, userId: string, input: unknown): DeletedNote {
  const id = validateId(objectInput(input).id);
  return db
    .transaction(() => {
      if (!db.query("SELECT 1 FROM note WHERE id = ? AND user_id = ?").get(id, userId)) {
        if (
          db.query("SELECT 1 FROM note_deletion WHERE note_id = ? AND user_id = ?").get(id, userId)
        )
          return { id, deleted: true as const };
        throw new NoteError("NOT_FOUND", "This note is unavailable.");
      }
      db.query("INSERT INTO note_deletion (note_id, user_id, deleted_at) VALUES (?, ?, ?)").run(
        id,
        userId,
        new Date().toISOString(),
      );
      db.query("DELETE FROM note WHERE id = ? AND user_id = ?").run(id, userId);
      return { id, deleted: true as const };
    })
    .immediate();
}

export function updateNote(db: Database, userId: string, input: unknown): SavedNote {
  const value = objectInput(input);
  const id = validateId(value.id);
  if (
    typeof value.expectedUpdatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.expectedUpdatedAt))
  )
    throw new NoteError("VALIDATION_ERROR", "Reload the note before saving changes.");
  const title = value.title === undefined ? undefined : validateTitle(value.title);
  const content =
    value.contentJson === undefined ? undefined : validateContent(value.contentJson).serialized;
  if (title === undefined && content === undefined)
    throw new NoteError("VALIDATION_ERROR", "Provide a title or note content to save.");
  return db
    .transaction(() => {
      const row = readRow(db, userId, id);
      if (!row) throw new NoteError("NOT_FOUND", "This note is unavailable.");
      // Partial edits must also supply a title for legacy blank notes.
      const nextTitle = title ?? validateTitle(row.title);
      const nextContent = content ?? validateContent(JSON.parse(row.content_json)).serialized;
      // An acknowledged write may have lost its response. Retrying it is safe.
      if (nextTitle === row.title && nextContent === row.content_json)
        return { id, updatedAt: row.updated_at };
      if (row.updated_at !== value.expectedUpdatedAt)
        throw new NoteError(
          "CONFLICT",
          "This note changed in another tab. Copy your changes before reloading the saved version.",
        );
      const updatedAt = new Date(
        Math.max(Date.now(), Date.parse(row.updated_at) + 1),
      ).toISOString();
      db.query(
        "UPDATE note SET title = ?, content_json = ?, updated_at = ? WHERE id = ? AND user_id = ? AND updated_at = ?",
      ).run(nextTitle, nextContent, updatedAt, id, userId, row.updated_at);
      return { id, updatedAt };
    })
    .immediate();
}
