import type { JSONContent } from "@tiptap/core";

export const NOTE_TITLE_LIMIT = 200;
export const NOTE_CONTENT_LIMIT = 256 * 1024;
export const NOTES_PAGE_SIZE = 24;

export type NoteDraft = { title: string; contentJson: JSONContent };
export type SavedNote = { id: string; updatedAt: string };
export type Note = NoteDraft & SavedNote & { createdAt: string };
export type NoteSummary = SavedNote & { title: string; preview: string; shareEnabled: boolean };
export type CreateNoteInput = NoteDraft & { id: string };
export type UpdateNoteInput = Partial<NoteDraft> & { id: string; expectedUpdatedAt: string };
export type NoteErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";
export type ActionResult<T> =
  | { data: T; error?: never }
  | { data?: never; error: { code: NoteErrorCode; message: string } };
export type NoteResult = ActionResult<SavedNote>;
export type DeleteNoteInput = { id: string };
export type DeletedNote = { id: string; deleted: true };
export type DeleteNoteResult = ActionResult<DeletedNote>;
export type ShareInput = { id: string; expectedShareId: string | null };
export type ShareState = {
  shareEnabled: boolean;
  /** Latest share, even when revoked; acts as the sharing precondition. */
  shareId: string | null;
  shareUrl: string | null;
};
export type EnabledShare = ShareState & {
  shareEnabled: true;
  shareId: string;
  shareUrl: string;
  token: string;
};
export type DisabledShare = ShareState & { shareEnabled: false; shareUrl: null };

export function emptyDocument(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function noteTitle(title: string): string {
  return title.trim() || "Untitled note";
}
