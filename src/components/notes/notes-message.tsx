import { useId, type ReactNode } from "react";

export function NotesMessage({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="mx-auto max-w-160 rounded-2xl border border-border bg-paper px-6 py-14 text-center"
    >
      <h1 id={id} className="font-display text-3xl tracking-tight">
        {title}
      </h1>
      <div className="mt-4 text-sm/relaxed text-muted">{children}</div>
    </section>
  );
}
