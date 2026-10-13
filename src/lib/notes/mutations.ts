import "server-only";
import type { Database } from "bun:sqlite";
import { createNote, deleteNote, updateNote } from "./repository";
import { NoteError } from "./validation";
import type { ActionResult, DeleteNoteResult, NoteResult } from "./types";

export type MutationDependencies = {
  getUserId: () => Promise<string | null>;
  database: () => Database;
};

export async function mutateNote(
  operation: "create" | "update",
  input: unknown,
  dependencies: MutationDependencies,
): Promise<NoteResult> {
  return runNoteMutation(
    dependencies,
    (db, userId) => (operation === "create" ? createNote : updateNote)(db, userId, input),
    "We couldn't save your note. Please try again.",
  );
}

export function deleteNoteMutation(
  input: unknown,
  dependencies: MutationDependencies,
): Promise<DeleteNoteResult> {
  return runNoteMutation(
    dependencies,
    (db, userId) => deleteNote(db, userId, input),
    "We couldn't delete your note. Please try again.",
  );
}

export async function runNoteMutation<T>(
  dependencies: MutationDependencies,
  mutate: (db: Database, userId: string) => T | Promise<T>,
  failureMessage: string,
): Promise<ActionResult<T>> {
  try {
    const userId = await dependencies.getUserId();
    if (!userId)
      return {
        error: {
          code: "UNAUTHORIZED",
          message: "Your session ended. Sign in again and retry.",
        },
      };
    const data = await mutate(dependencies.database(), userId);
    return { data };
  } catch (error) {
    if (error instanceof NoteError) return { error: { code: error.code, message: error.message } };
    console.error("[notes] Mutation failed", {
      type: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      error: { code: "INTERNAL_ERROR", message: failureMessage },
    };
  }
}
