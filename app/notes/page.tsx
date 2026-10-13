import type { Metadata } from "next";
import { requireSession } from "@/src/lib/session";
import { getNotesDatabase, listNotes } from "@/src/lib/notes/repository";
import { NotesList } from "@/components/notes/notes-list";

export const metadata: Metadata = { title: "Your notes · TinyNotes" };

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const number = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isSafeInteger(number) && number > 0 && number <= 1_000_000 ? number : 1;
  const result = listNotes(getNotesDatabase(), session.user.id, page);
  return <NotesList {...result} page={page} />;
}
