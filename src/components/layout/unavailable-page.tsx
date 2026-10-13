import { ButtonLink } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Icon } from "@/components/ui/icon";

export function UnavailablePage({ shared = false }: { shared?: boolean }) {
  return (
    <section
      aria-labelledby="unavailable-title"
      className="relative isolate mx-auto max-w-200 overflow-hidden rounded-3xl border border-border bg-paper px-6 py-14 text-center shadow-note md:px-14 md:py-20"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-note-glow"
      />
      <div aria-hidden="true" className="relative mx-auto mb-9 w-24">
        <div className="absolute inset-0 rotate-12 rounded-xl border border-border bg-aqua-light" />
        <div className="relative -rotate-6 rounded-xl border border-border bg-paper px-5 py-6 text-aqua shadow-note">
          <Icon name="note" className="mx-auto size-10" />
          <span className="mt-4 block h-1 rounded-full bg-border" />
          <span className="mt-2 block h-1 w-2/3 rounded-full bg-border" />
        </div>
        <span className="absolute -right-3 -bottom-3 grid size-11 place-items-center rounded-full border-4 border-paper bg-aqua text-white">
          <Icon name={shared ? "lock" : "spark"} />
        </span>
      </div>
      <Eyebrow>404 · A LITTLE PAUSE</Eyebrow>
      <h1
        id="unavailable-title"
        className="mx-auto mt-4 max-w-130 font-display text-4xl/tight tracking-tight md:text-5xl"
      >
        {shared ? "This shared note isn't available." : "Page not found"}
      </h1>
      <p className="mx-auto mt-5 max-w-105 text-sm/relaxed text-muted">
        {shared
          ? "The link may be incorrect, or the note may no longer be shared. Some thoughts return to their own little corner."
          : "This page may have moved, or the address may be incomplete. There's still room for your next thought."}
      </p>
      <ButtonLink href="/" className="mt-8">
        Back to TinyNotes <Icon name="arrow" />
      </ButtonLink>
      {shared && (
        <p className="mx-auto mt-6 max-w-100 text-xs/relaxed text-muted">
          If someone sent you this link, ask them for a new one.
        </p>
      )}
    </section>
  );
}
