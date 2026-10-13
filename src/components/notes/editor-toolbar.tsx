"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { AllSelection, Selection, TextSelection } from "@tiptap/pm/state";
import { isSafeNoteLink } from "@/src/lib/notes/editor-config";
import { FormError } from "@/components/ui/form-error";

function Tool({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md px-2 text-sm text-foreground hover:bg-aqua-light focus-visible:outline-aqua aria-pressed:bg-aqua aria-pressed:text-white disabled:opacity-35"
    >
      {children}
    </button>
  );
}

export function EditorToolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      bullet: editor.isActive("bulletList"),
      ordered: editor.isActive("orderedList"),
      quote: editor.isActive("blockquote"),
      code: editor.isActive("code"),
      codeBlock: editor.isActive("codeBlock"),
      link: editor.isActive("link"),
      heading: editor.isActive("heading") ? String(editor.getAttributes("heading").level) : "0",
      undo: editor.can().undo(),
      redo: editor.can().redo(),
    }),
  });
  const [showLink, setShowLink] = useState(false);
  const [href, setHref] = useState("");
  const [linkError, setLinkError] = useState("");
  const urlInput = useRef<HTMLInputElement>(null);
  const linkButton = useRef<HTMLButtonElement>(null);
  const formatting = [
    state.heading === "0" ? "Paragraph" : `Heading ${state.heading}`,
    state.bold && "bold",
    state.italic && "italic",
    state.underline && "underline",
    state.strike && "strikethrough",
    state.bullet && "bullet list",
    state.ordered && "numbered list",
    state.quote && "blockquote",
    state.code && "inline code",
    state.codeBlock && "code block",
    state.link && "link",
  ]
    .filter(Boolean)
    .join(", ");
  useEffect(() => {
    if (showLink) urlInput.current?.focus();
  }, [showLink]);

  function applyLink() {
    const url = href.trim();
    if (!isSafeNoteLink(url)) {
      setLinkError("Enter a complete HTTP or HTTPS address.");
      urlInput.current?.focus();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url, target: "_blank", rel: "noopener noreferrer" })
      .run();
    setShowLink(false);
    setLinkError("");
  }

  return (
    <div className="border-y border-border bg-background/75 px-3 py-2 md:px-5">
      <p role="status" className="sr-only" aria-atomic="true">
        Formatting: {formatting}
      </p>
      <fieldset disabled={disabled} className="flex flex-wrap items-center gap-1">
        <legend className="sr-only">Text formatting</legend>
        <label className="sr-only" htmlFor="note-heading">
          Paragraph style
        </label>
        <select
          id="note-heading"
          value={state.heading}
          onChange={(event) => {
            const level = Number(event.target.value);
            if (level === 1 || level === 2 || level === 3)
              editor.chain().focus().setHeading({ level }).run();
            else editor.chain().focus().setParagraph().run();
          }}
          className="mr-2 min-h-10 max-w-full rounded-md border border-border bg-paper px-2 text-xs focus-visible:outline-2 focus-visible:outline-aqua"
        >
          <option value="0">Paragraph</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
        <Tool
          label="Bold"
          active={state.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </Tool>
        <Tool
          label="Italic"
          active={state.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </Tool>
        <Tool
          label="Underline"
          active={state.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <span className="underline">U</span>
        </Tool>
        <Tool
          label="Strikethrough"
          active={state.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <span className="line-through">S</span>
        </Tool>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <Tool
          label="Bullet list"
          active={state.bullet}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • ≡
        </Tool>
        <Tool
          label="Numbered list"
          active={state.ordered}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </Tool>
        <Tool
          label="Blockquote"
          active={state.quote}
          onClick={() =>
            editor
              .chain()
              .focus()
              .command(({ tr }) => {
                // Lifting a quote needs text boundaries, not the document's outer edges.
                if (tr.selection instanceof AllSelection)
                  tr.setSelection(
                    TextSelection.between(
                      Selection.atStart(tr.doc).$from,
                      Selection.atEnd(tr.doc).$to,
                    ),
                  );
                return true;
              })
              .toggleBlockquote()
              .run()
          }
        >
          ❝
        </Tool>
        <Tool
          label="Inline code"
          active={state.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <span className="font-mono">&lt;&gt;</span>
        </Tool>
        <Tool
          label="Code block"
          active={state.codeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <span className="font-mono text-xs">{"{ }"}</span>
        </Tool>
        <button
          ref={linkButton}
          type="button"
          aria-expanded={showLink}
          aria-controls="note-link-controls"
          onClick={() => {
            setHref(
              typeof editor.getAttributes("link").href === "string"
                ? editor.getAttributes("link").href
                : "",
            );
            setLinkError("");
            setShowLink(!showLink);
          }}
          className="min-h-10 rounded-md px-3 text-xs font-medium hover:bg-aqua-light focus-visible:outline-aqua"
          aria-label={state.link ? "Edit link" : "Add link"}
        >
          {state.link ? "Edit link" : "Link"}
        </button>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <Tool
          label="Undo"
          disabled={!state.undo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </Tool>
        <Tool
          label="Redo"
          disabled={!state.redo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </Tool>
      </fieldset>
      {showLink && (
        <fieldset
          id="note-link-controls"
          disabled={disabled}
          className="mt-3 border-t border-border py-3"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setShowLink(false);
              linkButton.current?.focus();
            }
          }}
        >
          <legend className="sr-only">Edit a link</legend>
          <label htmlFor="note-link-url" className="mb-2 block text-xs font-medium">
            Link address
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              ref={urlInput}
              id="note-link-url"
              type="url"
              value={href}
              onChange={(event) => setHref(event.target.value)}
              placeholder="https://example.com"
              aria-invalid={!!linkError}
              aria-describedby={linkError ? "note-link-error" : undefined}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
              }}
              className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-paper px-3 text-base placeholder:text-muted focus-visible:outline-aqua"
            />
            <button
              type="button"
              onClick={applyLink}
              className="rounded-md bg-aqua px-4 py-2 text-xs font-medium text-white focus-visible:outline-aqua"
            >
              Apply link
            </button>
            {state.link && (
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setShowLink(false);
                }}
                className="px-3 py-2 text-xs underline focus-visible:outline-aqua"
              >
                Remove link
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowLink(false);
                linkButton.current?.focus();
              }}
              className="px-3 py-2 text-xs underline focus-visible:outline-aqua"
            >
              Cancel
            </button>
          </div>
          {linkError && (
            <FormError id="note-link-error" className="mt-2">
              {linkError}
            </FormError>
          )}
        </fieldset>
      )}
    </div>
  );
}
