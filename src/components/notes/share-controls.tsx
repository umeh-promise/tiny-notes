"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enableShareAction, disableShareAction } from "@/app/notes/actions";
import type { ShareState } from "@/src/lib/notes/types";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";

export function ShareControls({
  id,
  share,
  disabled,
  beforeEnable,
  afterEnable,
  onChange,
}: {
  id: string;
  share: ShareState;
  disabled: boolean;
  beforeEnable: () => Promise<boolean>;
  afterEnable: () => void;
  onChange: (state: ShareState) => void;
}) {
  const router = useRouter();
  const fieldId = useId();
  const field = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [refreshing, refresh] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function changeSharing(enable: boolean) {
    if (submitting.current || disabled) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    setMessage("");
    // Keep the observed precondition throughout retries until fresh server props arrive.
    const input = { id, expectedShareId: share.shareId };
    try {
      if (enable && !(await beforeEnable())) {
        setError("Save your changes successfully before sharing this note.");
        return;
      }
      const result = await (enable ? enableShareAction(input) : disableShareAction(input));
      if (result.error) setError(result.error.message);
      else {
        onChange(result.data);
        setMessage(
          enable
            ? "Sharing is on. Anyone with this link can read your saved note."
            : "Sharing is off. Previous links no longer work.",
        );
      }
    } catch {
      setError(
        "Could not connect. Retry or refresh sharing details to check whether access changed.",
      );
    } finally {
      if (enable) afterEnable();
      submitting.current = false;
      setPending(false);
    }
  }
  const busy = pending || disabled || refreshing;
  return (
    <section
      aria-label="Note sharing"
      className="mt-6 rounded-xl border border-border bg-paper p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl">
            {share.shareEnabled ? "Shared by link" : "Keep it private, or share a thought."}
          </h2>
          <p className="mt-2 max-w-145 text-sm/relaxed text-muted">
            {share.shareEnabled
              ? "Anyone with the link can read the latest saved version. Future saved edits appear at the same link."
              : "Only you can read this note. Sharing creates a public, read-only link."}
          </p>
        </div>
        <Button
          disabled={busy}
          onClick={() => void changeSharing(!share.shareEnabled)}
          className="min-h-11 focus-visible:outline-aqua"
        >
          {pending
            ? share.shareEnabled
              ? "Unsharing…"
              : "Sharing…"
            : share.shareEnabled
              ? "Unshare"
              : "Share note"}
        </Button>
      </div>
      {share.shareEnabled &&
        (share.shareUrl ? (
          <div className="mt-4">
            <label htmlFor={fieldId} className="mb-2 block text-xs font-medium text-muted">
              Public link
            </label>
            <div className="flex flex-wrap gap-3">
              <input
                ref={field}
                id={fieldId}
                readOnly
                value={share.shareUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-aqua"
              />
              <Button
                disabled={busy}
                onClick={async () => {
                  try {
                    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
                    await navigator.clipboard.writeText(share.shareUrl ?? "");
                    setMessage("Link copied.");
                  } catch {
                    field.current?.focus();
                    field.current?.select();
                    setMessage("Copy the selected link manually using your device's copy command.");
                  }
                }}
                className="min-h-11 focus-visible:outline-aqua"
              >
                Copy link
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            This link is still active, but its address cannot be recovered. Unshare, then share
            again to create a new link.
          </p>
        ))}
      {error && <FormError className="mt-4">{error}</FormError>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p role="status" aria-live="polite" className="text-xs text-muted">
          {message}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError(null);
            setMessage("");
            refresh(() => router.refresh());
          }}
          className="min-h-11 text-xs text-aqua underline-offset-4 hover:underline focus-visible:outline-aqua disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh sharing details"}
        </button>
      </div>
    </section>
  );
}
