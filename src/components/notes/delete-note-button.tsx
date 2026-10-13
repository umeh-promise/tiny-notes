"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteNoteAction } from "@/app/notes/actions";
import { noteTitle } from "@/src/lib/notes/types";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

export function DeleteNoteButton({
  id,
  title,
  disabled,
  page = 1,
  lastOnPage = false,
  beforeDelete,
  onFailure,
  onDeleted,
}: {
  id: string;
  title: string;
  disabled?: boolean;
  page?: number;
  lastOnPage?: boolean;
  beforeDelete?: () => Promise<void>;
  onFailure?: () => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label={`Delete ${noteTitle(title)}`}
        className="min-h-11 rounded px-3 text-sm text-error underline-offset-4 hover:underline focus-visible:outline-error disabled:opacity-50"
      >
        Delete
      </button>
      <ConfirmationDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this note?"
        confirmLabel="Delete note"
        pendingLabel="Deleting…"
        onConfirm={async () => {
          let deleted = false;
          try {
            await beforeDelete?.();
            const result = await deleteNoteAction({ id });
            if (result.error) return result.error.message;
            deleted = true;
            if (onDeleted) onDeleted();
            else {
              if (lastOnPage && page > 1)
                router.replace(page === 2 ? "/notes" : `/notes?page=${page - 1}`);
              router.refresh();
            }
            return null;
          } finally {
            if (!deleted) onFailure?.();
          }
        }}
      >
        <p>
          <strong className="text-foreground wrap-anywhere">{noteTitle(title)}</strong> will be
          permanently deleted, including any unsaved edits. Public links will stop working. This
          cannot be undone.
        </p>
      </ConfirmationDialog>
    </>
  );
}
