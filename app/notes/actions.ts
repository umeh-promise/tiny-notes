"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/src/lib/session";
import { getNotesDatabase } from "@/src/lib/notes/repository";
import { deleteNoteMutation, mutateNote, runNoteMutation } from "@/src/lib/notes/mutations";
import { disableShare, enableShare } from "@/src/lib/notes/shares";
import type { ActionResult, ShareInput, EnabledShare, DisabledShare } from "@/src/lib/notes/types";
import type {
  CreateNoteInput,
  DeleteNoteInput,
  DeleteNoteResult,
  NoteResult,
  UpdateNoteInput,
} from "@/src/lib/notes/types";

async function save(operation: "create" | "update", input: unknown): Promise<NoteResult> {
  const result = await mutateNote(operation, input, {
    getUserId: async () => (await getSession())?.user.id ?? null,
    database: getNotesDatabase,
  });
  if (result.data) {
    revalidatePath("/notes");
    revalidatePath(`/notes/${result.data.id}`);
  }
  return result;
}

export async function createNoteAction(input: CreateNoteInput): Promise<NoteResult> {
  return save("create", input);
}

export async function updateNoteAction(input: UpdateNoteInput): Promise<NoteResult> {
  return save("update", input);
}

export async function deleteNoteAction(input: DeleteNoteInput): Promise<DeleteNoteResult> {
  const result = await deleteNoteMutation(input, {
    getUserId: async () => (await getSession())?.user.id ?? null,
    database: getNotesDatabase,
  });
  if (result.data) {
    revalidatePath("/notes");
    revalidatePath(`/notes/${result.data.id}`);
    revalidatePath("/s/[token]", "page");
  }
  return result;
}

export async function enableShareAction(input: ShareInput): Promise<ActionResult<EnabledShare>> {
  const result = await runNoteMutation(
    {
      getUserId: async () => (await getSession())?.user.id ?? null,
      database: getNotesDatabase,
    },
    (db, userId) => enableShare(db, userId, input),
    "We couldn't share your note. Please try again.",
  );
  if (result.data) {
    revalidatePath("/notes");
    revalidatePath(`/notes/${input.id}`);
  }
  return result;
}

export async function disableShareAction(input: ShareInput): Promise<ActionResult<DisabledShare>> {
  const result = await runNoteMutation(
    {
      getUserId: async () => (await getSession())?.user.id ?? null,
      database: getNotesDatabase,
    },
    (db, userId) => disableShare(db, userId, input),
    "We couldn't unshare your note. Please try again.",
  );
  if (result.data) {
    revalidatePath("/notes");
    revalidatePath(`/notes/${input.id}`);
    revalidatePath("/s/[token]", "page");
  }
  return result;
}
