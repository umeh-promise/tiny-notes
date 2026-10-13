import { notFound } from "next/navigation";
import { PublicNote } from "@/components/notes/public-note";
import { getPublicNote } from "@/src/lib/notes/public-note";

export default async function SharedNotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const note = await getPublicNote(token);
  if (!note) notFound();
  return <PublicNote note={note} />;
}
