import "server-only";
import type { NoteDraft } from "@/src/lib/notes/types";
import { noteTitle } from "@/src/lib/notes/types";
import { renderNoteHtml } from "@/src/lib/notes/render";
import { richTextClasses } from "./rich-text-styles";
import { Eyebrow } from "@/components/ui/eyebrow";

export function PublicNote({ note }: { note: NoteDraft & { updatedAt: string } }) {
  // This is the only HTML boundary: never accept HTML directly from a caller.
  const html = renderNoteHtml(note.contentJson);
  return (
    <article className="mx-auto max-w-240 rounded-2xl border border-border bg-paper px-5 py-8 shadow-note md:px-10 md:py-10">
      <header className="mb-8 border-b border-border pb-6">
        <Eyebrow>SHARED WITH YOU</Eyebrow>
        <h1 className="mt-3 font-display text-4xl tracking-tight wrap-anywhere">
          {noteTitle(note.title)}
        </h1>
        <p className="mt-4 text-xs text-muted">
          Last edited{" "}
          <time dateTime={note.updatedAt}>
            {new Intl.DateTimeFormat("en", {
              dateStyle: "medium",
              timeZone: "UTC",
            }).format(new Date(note.updatedAt))}
          </time>{" "}
          · Read only
        </p>
      </header>
      <div className={richTextClasses} dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
