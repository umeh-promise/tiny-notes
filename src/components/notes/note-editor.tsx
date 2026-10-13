"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import { useRouter } from "next/navigation";
import { createNoteAction, updateNoteAction } from "@/app/notes/actions";
import { noteExtensions } from "@/src/lib/notes/editor-config";
import { requiredNoteFields } from "@/src/lib/notes/required-fields";
import { NoteSaveController } from "@/src/lib/notes/save-controller";
import { NOTE_TITLE_LIMIT, type NoteDraft, type ShareState } from "@/src/lib/notes/types";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FormError } from "@/components/ui/form-error";
import { EditorToolbar } from "./editor-toolbar";
import { richTextClasses } from "./rich-text-styles";
import { ShareControls } from "./share-controls";
import { DeleteNoteButton } from "./delete-note-button";
import { useNavigationGuard } from "@/components/layout/navigation-guard";

export function NoteEditor({
  id,
  initialDraft,
  updatedAt,
  initialShare,
}: {
  id: string;
  initialDraft: NoteDraft;
  updatedAt: string | null;
  initialShare?: ShareState;
}) {
  const router = useRouter();
  const navigation = useNavigationGuard();
  const discarding = useRef(false);
  const navigating = useRef(false);
  const deleting = useRef(false);
  const [noteId] = useState(id);
  const [controller] = useState(
    () =>
      new NoteSaveController({
        id,
        draft: initialDraft,
        updatedAt,
        create: createNoteAction,
        update: updateNoteAction,
      }),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [share, setShare] = useState<ShareState>(
    initialShare ?? { shareEnabled: false, shareId: null, shareUrl: null },
  );
  const [sharing, setSharing] = useState(false);
  const sharingOperation = useRef(false);
  useEffect(() => {
    if (initialShare) setShare(initialShare);
  }, [initialShare]);
  const [leaving, setLeaving] = useState(false);
  const [manualSave, setManualSave] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const requiredFields = requiredNoteFields(state.draft);
  const fieldErrors = state.error?.code === "VALIDATION_ERROR" ? requiredFields : {};
  const incomplete = !!requiredFields.title;
  const editor = useEditor({
    extensions: noteExtensions,
    content: initialDraft.contentJson,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": "note-body-label",
        "aria-describedby": "note-writing-hint",
        class: `${richTextClasses} min-h-96 px-5 py-7 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-aqua md:min-h-120 md:px-10 md:py-9`,
      },
    },
    onUpdate: ({ editor }) =>
      controller.change({ ...controller.getSnapshot().draft, contentJson: editor.getJSON() }),
  });

  useEffect(() => {
    controller.setActive(true);
    return () => controller.setActive(false);
  }, [controller]);
  useEffect(() => {
    editor?.setEditable(!leaving && !sharing && !(manualSave && !state.updatedAt), false);
  }, [editor, leaving, manualSave, sharing, state.updatedAt]);
  useEffect(() => {
    // A lost creation acknowledgement can leave /new open while incomplete local
    // edits are corrected. Once autosave completes, canonicalize the URL safely.
    if (
      updatedAt === null &&
      state.updatedAt &&
      !state.dirty &&
      !state.saving &&
      !manualSave &&
      !leaving
    ) {
      router.replace(`/notes/${noteId}`);
    }
  }, [updatedAt, state.updatedAt, state.dirty, state.saving, manualSave, leaving, router, noteId]);
  useEffect(
    () =>
      navigation.register(async (leave) => {
        if (navigating.current || deleting.current || sharingOperation.current) return;
        navigating.current = true;
        setLeaving(true);
        try {
          if (controller.canLeaveEmpty() || (await controller.save())) await leave();
        } finally {
          navigating.current = false;
          setLeaving(false);
        }
      }),
    [controller, navigation],
  );
  useEffect(() => {
    if (
      !state.updatedAt ||
      !state.dirty ||
      state.saving ||
      state.error ||
      incomplete ||
      leaving ||
      sharing
    )
      return;
    const timer = window.setTimeout(() => void controller.save(), 1000);
    return () => window.clearTimeout(timer);
  }, [
    controller,
    state.draft,
    state.updatedAt,
    state.dirty,
    state.saving,
    state.error,
    incomplete,
    leaving,
    sharing,
  ]);

  useEffect(() => {
    if (!state.dirty && !state.saving) return;
    function warn(event: BeforeUnloadEvent) {
      const snapshot = controller.getSnapshot();
      if (
        !discarding.current &&
        !controller.canLeaveEmpty() &&
        (snapshot.dirty || snapshot.saving)
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [controller, state.dirty, state.saving]);

  // Save before ordinary same-tab links, including the shared header, leave the editor.
  useEffect(() => {
    function followLink(event: MouseEvent) {
      const snapshot = controller.getSnapshot();
      if (
        (!snapshot.dirty && !snapshot.saving) ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const url = new URL(target.href);
      if (
        url.origin !== window.location.origin ||
        (url.pathname === window.location.pathname && url.hash)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      void leaveEditor(url.pathname + url.search + url.hash);
    }
    document.addEventListener("click", followLink, true);
    return () => document.removeEventListener("click", followLink, true);
  });

  async function leaveEditor(destination: string) {
    if (navigating.current || deleting.current || sharingOperation.current || leaving) return;
    if (controller.canLeaveEmpty()) {
      discarding.current = true;
      controller.setActive(false);
      navigating.current = true;
      setLeaving(true);
      router.push(destination);
      return;
    }
    await saveAndNavigate(destination);
  }

  async function saveAndNavigate(destination?: string) {
    if (navigating.current || deleting.current || sharingOperation.current || leaving) return;
    navigating.current = true;
    setManualSave(true);
    // A replay may acknowledge creation while newer local fields remain invalid.
    // The route is still /new until a complete save can replace it.
    const wasNew = updatedAt === null;
    const saved = await controller.save();
    if (saved && (destination || wasNew)) {
      setLeaving(true);
      if (destination) router.push(destination);
      else router.replace(`/notes/${saved.id}`);
    }
    setManualSave(false);
    navigating.current = false;
    if (!saved) {
      const missing = requiredNoteFields(controller.getSnapshot().draft);
      requestAnimationFrame(() => {
        if (missing.title) titleInput.current?.focus();
      });
    }
  }

  const busy = manualSave || leaving || sharing;
  const conflicted = state.error?.code === "CONFLICT";
  return (
    <section aria-labelledby="editor-title" className="mx-auto max-w-240">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Eyebrow>YOUR WORDS, YOUR SPACE</Eyebrow>
          <h1 id="editor-title" className="mt-2 font-display text-3xl tracking-tight md:text-4xl">
            {state.updatedAt ? "A little room to think." : "Start with a thought."}
          </h1>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void leaveEditor("/notes")}
          className="min-h-11 text-sm text-aqua underline-offset-4 hover:underline focus-visible:outline-aqua disabled:opacity-50"
        >
          ← All notes
        </button>
      </header>
      <form
        aria-labelledby="editor-title"
        onSubmit={(event) => {
          event.preventDefault();
          void saveAndNavigate("/notes");
        }}
        className="overflow-hidden rounded-2xl border border-border bg-paper shadow-note"
      >
        <div className="px-5 pt-6 pb-5 md:px-10 md:pt-8">
          <label htmlFor="note-title" className="mb-2 block text-xs font-medium text-muted">
            Note title <span className="font-normal">(required)</span>
          </label>
          <input
            ref={titleInput}
            id="note-title"
            required
            aria-invalid={!!fieldErrors.title}
            aria-describedby={fieldErrors.title ? "note-title-error" : undefined}
            name="title"
            value={state.draft.title}
            maxLength={NOTE_TITLE_LIMIT}
            disabled={leaving || sharing || (manualSave && !state.updatedAt)}
            placeholder="Give your thought a title"
            onChange={(event) =>
              controller.change({ ...controller.getSnapshot().draft, title: event.target.value })
            }
            className="w-full min-w-0 rounded-sm bg-transparent py-2 font-display text-3xl text-foreground placeholder:text-muted focus-visible:outline-aqua md:text-4xl"
          />
          {fieldErrors.title && <FormError id="note-title-error">{fieldErrors.title}</FormError>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 text-xs text-muted">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-aqua" />
              {share.shareEnabled
                ? "Anyone with the link can read this note"
                : "Only you can see this note"}
            </span>
            <div className="flex items-center gap-4">
              <p role="status" aria-live="polite" aria-atomic="true" className="text-xs text-muted">
                {state.saving || leaving ? "Saving…" : state.dirty ? "Unsaved changes" : "Saved"}
              </p>
              <Button
                disabled={!editor || busy || conflicted || (!state.dirty && !state.error)}
                onClick={() => void saveAndNavigate()}
                className="min-h-10 px-5 py-2 text-xs focus-visible:outline-aqua"
              >
                {state.error && !conflicted ? "Retry save" : "Save"}
              </Button>
            </div>
          </div>
        </div>
        <p id="note-body-label" className="px-5 pb-3 text-xs font-medium text-muted md:px-10">
          Note content <span className="font-normal">(optional)</span>
        </p>
        {editor ? (
          <>
            <EditorToolbar
              editor={editor}
              disabled={leaving || sharing || (manualSave && !state.updatedAt)}
            />
            <EditorContent editor={editor} />
          </>
        ) : (
          <p
            role="status"
            className="min-h-96 border-t border-border px-5 py-8 text-muted md:min-h-120 md:px-10"
          >
            Preparing your writing space…
          </p>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-4 md:px-10">
          <p id="note-writing-hint" className="text-xs text-muted">
            {state.updatedAt
              ? "Add a title to save automatically."
              : "A title is required. The body is optional."}
          </p>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3 md:gap-5">
            {state.updatedAt && (
              <DeleteNoteButton
                id={noteId}
                title={state.draft.title}
                disabled={busy}
                beforeDelete={async () => {
                  deleting.current = true;
                  setLeaving(true);
                  await controller.pause();
                }}
                onFailure={() => {
                  deleting.current = false;
                  controller.resume();
                  setLeaving(false);
                }}
                onDeleted={() => {
                  discarding.current = true;
                  controller.setActive(false);
                  router.replace("/notes");
                }}
              />
            )}
            <button
              type="button"
              disabled={!editor || busy || state.saving}
              onClick={() => {
                if (
                  window.confirm(
                    "Clear the note body? The title will stay. You can undo this change in the editor.",
                  )
                ) {
                  if (!editor) return;
                  // Clear is a separate undo step, even immediately after typing.
                  editor.view.dispatch(closeHistory(editor.state.tr));
                  editor.commands.clearContent();
                  editor.view.dispatch(closeHistory(editor.state.tr));
                }
              }}
              className="min-h-11 text-sm text-muted hover:text-foreground focus-visible:outline-aqua disabled:opacity-50"
            >
              Clear
            </button>
            <Button
              type="submit"
              disabled={!editor || busy || conflicted}
              className="min-h-11 py-2.5 focus-visible:outline-aqua"
            >
              {busy ? "Saving…" : "Submit"}
            </Button>
          </div>
        </footer>
      </form>
      {state.updatedAt && (
        <ShareControls
          id={noteId}
          share={share}
          disabled={manualSave || leaving}
          onChange={setShare}
          beforeEnable={async () => {
            sharingOperation.current = true;
            setSharing(true);
            return (await controller.save()) !== null;
          }}
          afterEnable={() => {
            sharingOperation.current = false;
            setSharing(false);
          }}
        />
      )}
      {state.error && !fieldErrors.title && (
        <div className="mt-4 rounded-lg border border-error/25 bg-paper p-4">
          <FormError>{state.error.message}</FormError>
          {conflicted && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "Reload the saved note? Unsaved changes in this editor will be discarded. Copy anything you want to keep first.",
                  )
                ) {
                  discarding.current = true;
                  controller.setActive(false);
                  window.location.replace(`/notes/${noteId}`);
                }
              }}
              className="mt-3 min-h-10 text-sm font-medium text-aqua underline focus-visible:outline-aqua"
            >
              Open saved version
            </button>
          )}
          {state.error.code === "UNAUTHORIZED" && (
            <a
              href="/login"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm text-aqua underline"
            >
              Sign in in a new tab, then retry saving
            </a>
          )}
        </div>
      )}
      <noscript>
        <FormError className="mt-4">Enable JavaScript to write and save notes.</FormError>
      </noscript>
    </section>
  );
}
