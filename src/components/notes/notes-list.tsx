import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Icon } from "@/components/ui/icon";
import { noteTitle, type NoteSummary } from "@/src/lib/notes/types";
import { DeleteNoteButton } from "./delete-note-button";

const dateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function NotesList({
  notes,
  page,
  hasMore,
}: {
  notes: NoteSummary[];
  page: number;
  hasMore: boolean;
}) {
  return (
    <>
      <header className="mb-9 flex flex-wrap items-end justify-between gap-5">
        <div>
          <Eyebrow>A LITTLE LESS NOISE</Eyebrow>
          <h1 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">Your notes.</h1>
          <p className="mt-3 text-sm text-muted">Thoughts to keep. Ideas to come back to.</p>
        </div>
        <ButtonLink href="/notes/new" className="focus-visible:outline-aqua">
          New note <Icon name="note" />
        </ButtonLink>
      </header>
      {notes.length ? (
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="flex min-w-0 flex-col rounded-xl border border-border bg-paper"
            >
              <Link
                href={`/notes/${note.id}`}
                className="group flex min-h-57 flex-1 flex-col rounded-t-xl p-6 transition-colors hover:bg-aqua-light/30 focus-visible:outline-aqua motion-reduce:transition-none"
              >
                <span
                  className="mb-5 flex items-center justify-between text-aqua"
                  aria-hidden="true"
                >
                  <Icon name="note" />
                  <Icon name="arrow" className="size-4" />
                </span>
                <h2 className="line-clamp-2 font-display text-2xl leading-snug wrap-anywhere">
                  {noteTitle(note.title)}
                </h2>
                <p className="mt-3 mb-6 line-clamp-3 text-sm/relaxed text-muted wrap-anywhere">
                  {note.preview || "A fresh page, ready for your thoughts."}
                </p>
                <p className="mt-auto border-t border-border pt-4 text-xs text-muted">
                  Edited{" "}
                  <time dateTime={note.updatedAt}>
                    {dateFormat.format(new Date(note.updatedAt))}
                  </time>
                </p>
              </Link>
              <div className="flex justify-end border-t border-border px-3 py-1">
                <span className="mr-auto self-center pl-3 text-xs text-muted">
                  {note.shareEnabled ? "Shared by link" : "Private"}
                </span>
                <DeleteNoteButton
                  id={note.id}
                  title={note.title}
                  page={page}
                  lastOnPage={notes.length === 1}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <section
          className="rounded-2xl border border-dashed border-border bg-paper px-6 py-18 text-center"
          aria-labelledby="empty-notes-title"
        >
          <span className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-aqua-light text-aqua">
            <Icon name="note" className="size-6" />
          </span>
          <h2 id="empty-notes-title" className="font-display text-3xl">
            {page === 1 ? "A fresh page awaits." : "You've reached the end."}
          </h2>
          <p className="mx-auto mt-3 max-w-85 text-sm/relaxed text-muted">
            {page === 1
              ? "A passing thought, a plan, a little inspiration. Give it a place to stay."
              : "Head back to your notes or make room for a new idea."}
          </p>
          <ButtonLink
            href={page === 1 ? "/notes/new" : "/notes"}
            className="mt-7 focus-visible:outline-aqua"
          >
            {page === 1 ? "Write your first note" : "Back to your notes"}
          </ButtonLink>
        </section>
      )}
      {(page > 1 || hasMore) && (
        <nav
          aria-label="Notes pagination"
          className="mt-8 flex flex-wrap items-center justify-between gap-4 text-sm"
        >
          {page > 1 ? (
            <Link
              href={page === 2 ? "/notes" : `/notes?page=${page - 1}`}
              className="min-h-11 py-3 text-aqua hover:underline focus-visible:outline-aqua"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">Page {page}</span>
          {hasMore ? (
            <Link
              href={`/notes?page=${page + 1}`}
              className="min-h-11 py-3 text-aqua hover:underline focus-visible:outline-aqua"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
