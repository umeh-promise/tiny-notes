import { test, expect, login, writeDraft, save, content } from "./support/fixtures";

test("rich-text marks, headings, and safe links survive saving and reload", async ({
  page,
  account,
}) => {
  await login(page, account);
  await writeDraft(page, "Formatted", "A formatted thought");
  await content(page).press("ControlOrMeta+A");
  for (const name of ["Bold", "Italic", "Underline", "Strikethrough"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  for (const level of ["1", "2", "3"]) {
    await page.getByLabel("Paragraph style").selectOption(level);
    await expect(content(page).locator(`h${level}`)).toHaveText("A formatted thought");
  }
  await page.getByRole("button", { name: "Add link" }).click();
  await expect(page.getByLabel("Link address")).toBeFocused();
  await page.getByLabel("Link address").fill("javascript:alert(1)");
  await page.getByLabel("Link address").press("Enter");
  await expect(
    page.getByRole("alert").filter({ hasText: "Enter a complete HTTP or HTTPS address." }),
  ).toBeVisible();
  await expect(content(page).locator("a")).toHaveCount(0);
  await page.getByLabel("Link address").press("Escape");
  await expect(page.getByRole("button", { name: "Add link" })).toBeFocused();
  await page.getByRole("button", { name: "Add link" }).press("Enter");
  await page.getByLabel("Link address").fill("https://example.test/reference");
  await page.getByLabel("Link address").press("Enter");
  await expect(content(page).getByRole("link")).toHaveAttribute(
    "href",
    "https://example.test/reference",
  );
  await save(page);
  await page.reload();
  await expect(content(page).locator("h3")).toHaveText("A formatted thought");
  for (const tag of ["strong", "em", "u", "s"])
    await expect(content(page).locator(tag)).toHaveText("A formatted thought");
  await expect(content(page).getByRole("link")).toHaveAttribute("rel", /noopener/);
  await content(page).click();
  await content(page).press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Edit link" }).click();
  await page.getByRole("button", { name: "Remove link" }).click();
  await expect(content(page).getByRole("link")).toHaveCount(0);
});

test("lists, quotes, code, and keyboard undo/redo operate on the real editor", async ({
  page,
  account,
}) => {
  await login(page, account);
  await writeDraft(page, "Blocks", "One item");
  for (const [name, tag] of [
    ["Bullet list", "ul"],
    ["Numbered list", "ol"],
    ["Blockquote", "blockquote"],
    ["Code block", "pre"],
    ["Inline code", "code"],
  ]) {
    // Commands restore editor focus asynchronously; don't inject a second pointer
    // selection while that restoration is pending.
    await expect(content(page)).toBeFocused();
    await content(page).press("ControlOrMeta+A");
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
      .toBe("One item");
    await page.getByRole("button", { name, exact: true }).click();
    await expect(content(page).locator(tag)).toHaveText("One item");
    await expect(page.getByRole("status").filter({ hasText: "Formatting:" })).toContainText(
      name.toLowerCase(),
    );
    await page.getByRole("button", { name, exact: true }).click();
    await expect(content(page).locator(tag)).toHaveCount(0);
  }
  await expect(content(page)).toBeFocused();
  await content(page).press("ControlOrMeta+A");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
    .toBe("One item");
  await content(page).press("ControlOrMeta+b");
  await expect(content(page).locator("strong")).toHaveText("One item");
  await content(page).press("ControlOrMeta+z");
  await expect(content(page).locator("strong")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(content(page).locator("strong")).toHaveText("One item");
  await save(page);
  await page.reload();
  await expect(content(page).locator("strong")).toHaveText("One item");
});
