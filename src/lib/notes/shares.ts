import "server-only";
import type { Database } from "bun:sqlite";
import { appOrigin } from "../app-origin";
import { NoteError, objectInput, validateId, validateContent } from "./validation";
import {
  decryptShareToken,
  encryptShareToken,
  hashShareToken,
  newShareToken,
  validPublicToken,
} from "./share-tokens";
import type { DisabledShare, EnabledShare, NoteDraft, ShareInput, ShareState } from "./types";

type ShareRow = {
  id: string;
  token_hash: string;
  token_ciphertext: string | null;
  enabled: number;
  created_at: string;
};
type ShareConfig = { secret?: string; origin?: string };

function input(value: unknown): ShareInput {
  const data = objectInput(value);
  return {
    id: validateId(data.id),
    expectedShareId: data.expectedShareId === null ? null : validateId(data.expectedShareId),
  };
}

function ownedState(db: Database, userId: string, id: string) {
  const note = db
    .query<{ share_enabled: number }, [string, string]>(
      "SELECT share_enabled FROM note WHERE id = ? AND user_id = ?",
    )
    .get(id, userId);
  if (!note) throw new NoteError("NOT_FOUND", "This note is unavailable.");
  const row = db
    .query<ShareRow, [string]>(
      "SELECT id, token_hash, token_ciphertext, enabled, created_at FROM note_share WHERE note_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .get(id);
  return { row, enabled: note.share_enabled === 1 && row?.enabled === 1 };
}

async function recoverLink(
  row: ShareRow,
  noteId: string,
  config: ShareConfig,
): Promise<EnabledShare> {
  if (!row.token_ciphertext) throw new Error("Share link could not be recovered.");
  const token = await decryptShareToken(row.token_ciphertext, noteId, row.id, config.secret);
  if ((await hashShareToken(token)) !== row.token_hash)
    throw new Error("Share link could not be recovered.");
  return {
    shareEnabled: true,
    shareId: row.id,
    token,
    shareUrl: `${appOrigin(config.origin)}/s/${token}`,
  };
}

export async function readShareState(
  db: Database,
  userId: string,
  id: string,
  config: ShareConfig = {},
): Promise<ShareState> {
  let state: ReturnType<typeof ownedState>;
  try {
    state = ownedState(db, userId, id);
  } catch {
    throw new Error("Sharing details could not be loaded. Please try again.");
  }
  const { row, enabled } = state;
  if (!row || !enabled) return { shareEnabled: false, shareId: row?.id ?? null, shareUrl: null };
  try {
    const { shareEnabled, shareId, shareUrl } = await recoverLink(row, id, config);
    return { shareEnabled, shareId, shareUrl };
  } catch {
    // Hash-only legacy links and unavailable keys must never prevent revocation.
    return { shareEnabled: true, shareId: row.id, shareUrl: null };
  }
}

function staleShare(): never {
  throw new NoteError(
    "CONFLICT",
    "Sharing changed in another tab. Refresh sharing details and try again.",
  );
}

export async function enableShare(
  db: Database,
  userId: string,
  value: unknown,
  config: ShareConfig = {},
): Promise<EnabledShare> {
  const { id, expectedShareId } = input(value);
  ownedState(db, userId, id); // Authorize before preparing any secrets.
  appOrigin(config.origin);
  const token = newShareToken();
  const shareId = crypto.randomUUID();
  const hash = await hashShareToken(token);
  const ciphertext = await encryptShareToken(token, id, shareId, config.secret);
  // Crypto is asynchronous; all database reads and writes below stay synchronous.
  const row = db
    .transaction(() => {
      const state = ownedState(db, userId, id);
      if (state.enabled && state.row) return state.row;
      if ((state.row?.id ?? null) !== expectedShareId) staleShare();
      const createdAt = new Date(
        Math.max(Date.now(), state.row ? Date.parse(state.row.created_at) + 1 : 0),
      ).toISOString();
      db.query(
        "UPDATE note_share SET enabled = 0, disabled_at = ?, token_ciphertext = NULL WHERE note_id = ? AND enabled = 1",
      ).run(createdAt, id);
      db.query(
        "INSERT INTO note_share (id, note_id, token_hash, token_ciphertext, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)",
      ).run(shareId, id, hash, ciphertext, createdAt);
      db.query("UPDATE note SET share_enabled = 1 WHERE id = ? AND user_id = ?").run(id, userId);
      return {
        id: shareId,
        token_hash: hash,
        token_ciphertext: ciphertext,
        enabled: 1,
        created_at: createdAt,
      };
    })
    .immediate();
  try {
    return await recoverLink(row, id, config);
  } catch {
    throw new NoteError(
      "INTERNAL_ERROR",
      "This link cannot be recovered. Unshare the note, then share it again to create a new link.",
    );
  }
}

export function disableShare(db: Database, userId: string, value: unknown): DisabledShare {
  const { id, expectedShareId } = input(value);
  return db
    .transaction(() => {
      const { row } = ownedState(db, userId, id);
      if ((row?.id ?? null) !== expectedShareId) staleShare();
      db.query(
        "UPDATE note_share SET enabled = 0, disabled_at = COALESCE(disabled_at, ?), token_ciphertext = NULL WHERE note_id = ?",
      ).run(new Date().toISOString(), id);
      db.query("UPDATE note SET share_enabled = 0 WHERE id = ? AND user_id = ?").run(id, userId);
      return { shareEnabled: false as const, shareId: row?.id ?? null, shareUrl: null };
    })
    .immediate();
}

export async function readPublicNote(
  db: Database,
  token: string,
): Promise<(NoteDraft & { updatedAt: string }) | null> {
  if (!validPublicToken(token)) return null;
  try {
    const hash = await hashShareToken(token);
    const row = db
      .query<{ title: string; content_json: string; updated_at: string }, [string]>(
        "SELECT n.title, n.content_json, n.updated_at FROM note_share s JOIN note n ON n.id = s.note_id WHERE s.token_hash = ? AND s.enabled = 1 AND n.share_enabled = 1 LIMIT 1",
      )
      .get(hash);
    if (!row) return null;
    return {
      title: row.title,
      contentJson: validateContent(JSON.parse(row.content_json)).document,
      updatedAt: row.updated_at,
    };
  } catch {
    throw new Error("This shared note could not be loaded. Please try again.");
  }
}
