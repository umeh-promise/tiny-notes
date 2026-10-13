"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";
import { FormError } from "./form-error";

export function ConfirmationDialog({
  open,
  title,
  children,
  confirmLabel,
  pendingLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<string | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        if (submitting.current) event.preventDefault();
      }}
      onClose={() => {
        setError(null);
        onClose();
      }}
      className="fixed inset-0 m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-border bg-paper p-6 text-foreground shadow-note backdrop:bg-foreground/40"
    >
      <h2 id={`${id}-title`} className="font-display text-2xl">
        {title}
      </h2>
      <div id={`${id}-description`} className="mt-3 text-sm/relaxed text-muted">
        {children}
      </div>
      {error && <FormError className="mt-4">{error}</FormError>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button
          autoFocus
          disabled={pending}
          onClick={() => dialog.current?.close()}
          className="border-border bg-transparent text-foreground hover:bg-background focus-visible:outline-aqua"
        >
          Cancel
        </Button>
        <Button
          disabled={pending}
          className="bg-error hover:bg-error/90 focus-visible:outline-error"
          onClick={async () => {
            if (submitting.current) return;
            submitting.current = true;
            setPending(true);
            setError(null);
            try {
              const message = await onConfirm();
              if (message) setError(message);
              else dialog.current?.close();
            } catch {
              setError("Could not connect. Please try again.");
            } finally {
              submitting.current = false;
              setPending(false);
            }
          }}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
