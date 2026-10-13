import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/notes/note-editor";
import { requireSession } from "@/src/lib/session";
import { getNotesDatabase, readNote } from "@/src/lib/notes/repository";
import { readShareState } from "@/src/lib/notes/shares";

export const metadata: Metadata = { title: "Edit note · TinyNotes" };

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const note = readNote(getNotesDatabase(), session.user.id, id);
  if (!note) notFound();
  return (
    <NoteEditor
      key={note.id}
      id={note.id}
      initialDraft={{ title: note.title, contentJson: note.contentJson }}
      updatedAt={note.updatedAt}
      initialShare={await readShareState(getNotesDatabase(), session.user.id, id)}
    />
  );
}
