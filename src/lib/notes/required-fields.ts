import type { JSONContent } from "@tiptap/core";
import type { NoteDraft } from "./types";

export function hasNoteText(document: JSONContent): boolean {
  return (
    (document.type === "text" && !!document.text?.trim()) || !!document.content?.some(hasNoteText)
  );
}

/** Shared completeness check. Server writes also validate the entire editor schema. */
export function requiredNoteFields(draft: NoteDraft): { title?: string } {
  return {
    title: draft.title.trim() ? undefined : "Enter a note title.",
  };
}
