import type { JSONContent } from "@tiptap/core";

/** ProseMirror attributes have null prototypes, which React's transport cannot serialize. */
export function copyDocument(document: JSONContent): JSONContent {
  return JSON.parse(JSON.stringify(document));
}
