import { expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { renderNoteHtml, sanitizeNoteHtml } from "./render";

test("public rendering preserves supported formatting and escapes text", () => {
  const html = renderNoteHtml({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "<script>not executable</script>" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Styled",
            marks: [
              { type: "bold" },
              { type: "italic" },
              { type: "underline" },
              { type: "strike" },
            ],
          },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 4 },
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Fourth" }] }],
          },
        ],
      },
      {
        type: "blockquote",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Quote" }] }],
      },
      { type: "codeBlock", content: [{ type: "text", text: "<img src=x>" }] },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Link",
            marks: [{ type: "link", attrs: { href: "https://example.test/?a=1&b=2" } }],
          },
        ],
      },
    ],
  });
  const dom = new DOMParser().parseFromString(html, "text/html");
  expect(dom.querySelector("h2")?.textContent).toBe("<script>not executable</script>");
  expect(dom.querySelectorAll("script,img")).toHaveLength(0);
  for (const tag of ["strong", "em", "u", "s"])
    expect(dom.querySelector(tag)?.textContent).toBe("Styled");
  expect(dom.querySelector("ol")?.start).toBe(4);
  expect(dom.querySelector("blockquote")?.textContent).toBe("Quote");
  expect(dom.querySelector("pre code")?.textContent).toBe("<img src=x>");
  expect(dom.querySelector("a")?.getAttribute("rel")).toBe("noopener noreferrer");
  expect(dom.querySelector("a")?.getAttribute("href")).toBe("https://example.test/?a=1&b=2");
});

test("the HTML boundary strips scripts, embedded content, styles, events, and unsafe links", () => {
  const html = sanitizeNoteHtml(
    `<p onclick="alert(1)" style="color:red" id="clobber">Safe</p><script>alert(1)</script><iframe src="https://evil.test"></iframe><svg onload="evil()"></svg><img src=x onerror="evil()"><a href="javascript:alert(1)">Bad</a><a href="//evil.test">Relative</a><a href="/notes">Local</a><a href="https://user:secret@evil.test">Credentials</a><a href="https://example.test" target="_self" rel="opener">Good</a><ol start="-1"><li>First</li></ol>`,
  );
  const dom = new DOMParser().parseFromString(html, "text/html");
  expect(
    dom.querySelectorAll("script,iframe,svg,img,[onclick],[onload],[onerror],[style],[id]"),
  ).toHaveLength(0);
  expect([...dom.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"))).toEqual([
    "https://example.test",
  ]);
  expect(dom.querySelector("a[href]")?.getAttribute("target")).toBe("_blank");
  expect(dom.querySelector("ol")?.hasAttribute("start")).toBe(false);
  expect(html).not.toContain("alert(1)");
});

test("invalid stored documents never reach the renderer", () => {
  expect(() =>
    renderNoteHtml({
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://evil.test" } }],
    }),
  ).toThrow();
  expect(() =>
    renderNoteHtml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "bad",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    }),
  ).toThrow();
});
