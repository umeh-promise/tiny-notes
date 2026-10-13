import type { Metadata } from "next";
import { NoteEditor } from "@/components/notes/note-editor";
import { requireSession } from "@/src/lib/session";
import { emptyDocument } from "@/src/lib/notes/types";

export const metadata: Metadata = { title: "New note · TinyNotes" };

export default async function NewNotePage() {
  await requireSession();
  const id = crypto.randomUUID();
  return (
    <NoteEditor
      id={id}
      initialDraft={{ title: "", contentJson: emptyDocument() }}
      updatedAt={null}
    />
  );
}
