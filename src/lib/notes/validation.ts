import "server-only";
import { getSchema, type JSONContent } from "@tiptap/core";
import { isSafeNoteLink, noteExtensions } from "./editor-config";
import { copyDocument } from "./document";
import { NOTE_CONTENT_LIMIT, NOTE_TITLE_LIMIT, type NoteErrorCode } from "./types";

export class NoteError extends Error {
  constructor(
    public readonly code: NoteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "NoteError";
  }
}

function invalid(message = "This note contains unsupported or invalid formatting."): never {
  throw new NoteError("VALIDATION_ERROR", message);
}

export function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("Check the note details and try again.");
  return value as Record<string, unknown>;
}

export function validateId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
  )
    invalid("This note identifier is invalid.");
  return value;
}

export function validateTitle(value: unknown): string {
  if (typeof value !== "string" || value.length > NOTE_TITLE_LIMIT)
    invalid(`Use a title of ${NOTE_TITLE_LIMIT} characters or fewer.`);
  if (!value.trim()) invalid("Enter a note title.");
  return value.trim();
}

const schema = getSchema(noteExtensions);
const nodeNames = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
]);
const markNames = new Set(["bold", "italic", "underline", "strike", "code", "link"]);

function normalizeNode(value: unknown, depth = 0): JSONContent {
  if (depth > 64) invalid("This note is nested too deeply.");
  const node = objectInput(value);
  if (typeof node.type !== "string" || !nodeNames.has(node.type)) invalid();
  const result: JSONContent = { type: node.type };
  const attrs = node.attrs === undefined ? {} : objectInput(node.attrs);
  if (node.type === "heading") {
    if (![1, 2, 3].includes(Number(attrs.level)) || typeof attrs.level !== "number") invalid();
    result.attrs = { level: attrs.level };
  }
  if (node.type === "orderedList") {
    const start = attrs.start ?? 1;
    if (typeof start !== "number" || !Number.isSafeInteger(start) || start < 1) invalid();
    result.attrs = { start };
  }
  if (node.type === "codeBlock") {
    const language = attrs.language ?? null;
    if (language !== null && (typeof language !== "string" || !/^[\w+-]{1,40}$/.test(language)))
      invalid();
    result.attrs = { language };
  }
  if (node.text !== undefined) {
    if (node.type !== "text" || typeof node.text !== "string") invalid();
    result.text = node.text;
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) invalid();
    result.content = node.content.map((child) => normalizeNode(child, depth + 1));
  }
  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks)) invalid();
    result.marks = node.marks.map((value) => {
      const mark = objectInput(value);
      if (typeof mark.type !== "string" || !markNames.has(mark.type)) invalid();
      if (mark.type !== "link") return { type: mark.type };
      const attrs = objectInput(mark.attrs);
      if (typeof attrs.href !== "string" || !isSafeNoteLink(attrs.href))
        invalid("Links must be valid HTTP or HTTPS addresses.");
      return {
        type: "link",
        attrs: { href: attrs.href, target: "_blank", rel: "noopener noreferrer" },
      };
    });
  }
  return result;
}

export function validateContent(value: unknown): { document: JSONContent; serialized: string } {
  try {
    const input = JSON.stringify(value);
    if (!input || new TextEncoder().encode(input).length > NOTE_CONTENT_LIMIT)
      invalid("Keep the note content within 256 KB.");
    const normalized = normalizeNode(value);
    if (normalized.type !== "doc") invalid();
    const node = schema.nodeFromJSON(normalized);
    node.check();
    const document: JSONContent = node.toJSON();
    const serialized = JSON.stringify(document);
    if (new TextEncoder().encode(serialized).length > NOTE_CONTENT_LIMIT)
      invalid("Keep the note content within 256 KB.");
    return { document: copyDocument(document), serialized };
  } catch (error) {
    if (error instanceof NoteError) throw error;
    return invalid();
  }
}

export function notePreview(serialized: string): string {
  try {
    const { document } = validateContent(JSON.parse(serialized));
    const node = schema.nodeFromJSON(document);
    return node.textBetween(0, node.content.size, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  } catch {
    return "Preview unavailable";
  }
}
