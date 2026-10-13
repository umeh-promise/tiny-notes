"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NotesMessage } from "@/components/notes/notes-message";

export function RouteError({ title, reset }: { title: string; reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <NotesMessage title={title}>
      <p>Please try again in a moment.</p>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
        className="mt-6 focus-visible:outline-aqua"
      >
        {pending ? "Trying again…" : "Try again"}
      </Button>
    </NotesMessage>
  );
}
