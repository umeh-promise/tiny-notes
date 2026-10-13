import "server-only";
import { renderToHTMLString } from "@tiptap/static-renderer/pm/html-string";
import sanitizeHtml from "sanitize-html";
import { isSafeNoteLink, noteExtensions } from "./editor-config";
import { validateContent } from "./validation";

export function sanitizeNoteHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "a",
      "h1",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
    ],
    allowedAttributes: { a: ["href", "target", "rel"], ol: ["start"] },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attrs): sanitizeHtml.Tag => ({
        tagName: "a",
        attribs: isSafeNoteLink(attrs.href ?? "")
          ? { href: attrs.href, target: "_blank", rel: "noopener noreferrer" }
          : {},
      }),
      ol: (_tag, attrs): sanitizeHtml.Tag => ({
        tagName: "ol",
        attribs:
          /^\d+$/.test(attrs.start ?? "") &&
          Number.isSafeInteger(Number(attrs.start)) &&
          Number(attrs.start) > 0
            ? { start: attrs.start }
            : {},
      }),
    },
  });
}

export function renderNoteHtml(value: unknown): string {
  const { document } = validateContent(value);
  return sanitizeNoteHtml(renderToHTMLString({ extensions: noteExtensions, content: document }));
}
