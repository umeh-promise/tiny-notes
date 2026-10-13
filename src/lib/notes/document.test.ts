import { describe, expect, test } from "vitest";
import { copyDocument } from "./document";
import { isSafeNoteLink } from "./editor-config";
import { emptyDocument, noteTitle } from "./types";

test("copied ProseMirror JSON is detached and uses transportable plain attributes", () => {
  const attrs = Object.assign(Object.create(null), { level: 2 });
  const original = { type: "doc", content: [{ type: "heading", attrs }] };
  const copy = copyDocument(original);
  attrs.level = 3;
  expect(copy.content?.[0].attrs).toEqual({ level: 2 });
  expect(Object.getPrototypeOf(copy.content?.[0].attrs)).toBe(Object.prototype);
});
test("empty documents are independent and blank titles have a display fallback", () => {
  const first = emptyDocument();
  first.content?.push({ type: "paragraph" });
  expect(emptyDocument().content).toHaveLength(1);
  expect(noteTitle("  \n ")).toBe("Untitled note");
  expect(noteTitle("  My note  ")).toBe("My note");
});
describe("editor link policy", () => {
  test.each([
    "http://example.test",
    "https://example.test/a?q=b#c",
    "HTTPS://example.test",
    "https://例子.test",
  ])("accepts %s", (url) => expect(isSafeNoteLink(url)).toBe(true));
  test.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "//example.test",
    "/notes",
    "mailto:a@example.test",
    "ftp://example.test",
    "https://user:pass@example.test",
    "https://example.test/has space",
    "https://example.test/\n",
    "https://",
    "",
  ])("rejects %s", (url) => expect(isSafeNoteLink(url)).toBe(false));
});
