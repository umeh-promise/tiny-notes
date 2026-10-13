import { test, expect, login, writeDraft, save, content, status } from "./support/fixtures";

test("expired sessions cannot change public access", async ({
  page,
  account,
  database,
  request,
}) => {
  await login(page, account);
  const { notes } = await database({ kind: "seed", email: account.email, count: 1 });
  await page.goto(`/notes/${notes[0].id}`);
  await page.getByRole("button", { name: "Share note", exact: true }).click();
  await expect(page.getByLabel("Public link")).toBeVisible();
  const link = await page.getByLabel("Public link").inputValue();
  await database({ kind: "expire-session", email: account.email });
  await page.getByRole("button", { name: "Unshare", exact: true }).click();
  await expect(page.getByRole("region", { name: "Note sharing" }).getByRole("alert")).toContainText(
    "session ended",
  );
  expect((await request.get(link)).status()).toBe(200);
});

test("sharing saves current edits, recovers its link after reload, and serves safe live content anonymously", async ({
  page,
  account,
  publicContext,
  database,
}) => {
  await login(page, account);
  await writeDraft(page, "Shared thoughts", "<img src=x onerror=alert(1)> stays text");
  await expect(page.getByRole("button", { name: "Share note", exact: true })).toHaveCount(0);
  await content(page).press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await save(page);
  await page.getByLabel("Note title").fill("The latest title");
  await page.getByRole("button", { name: "Share note", exact: true }).click();
  const field = page.getByLabel("Public link");
  await expect(field).toHaveValue(/\/s\/[A-Za-z0-9_-]{43}$/);
  const link = await field.inputValue();
  const stored = (await database({ kind: "inspect", email: account.email })).notes[0];
  expect(stored.title).toBe("The latest title");
  await page.reload();
  await expect(field).toHaveValue(link);
  await expect(
    page.getByText("Anyone with the link can read this note", { exact: true }),
  ).toBeVisible();
  const reader = publicContext;
  try {
    const view = await reader.newPage();
    const response = await view.goto(link);
    expect(response?.status()).toBe(200);
    const headers = await response?.allHeaders();
    expect(headers?.["cache-control"]).toContain("no-store");
    expect(headers?.["referrer-policy"]).toBe("no-referrer");
    expect(headers?.["x-frame-options"]).toBe("DENY");
    expect(headers?.["x-content-type-options"]).toBe("nosniff");
    expect(headers?.["x-robots-tag"]).toContain("noindex");
    expect(headers?.["content-security-policy"]).toMatch(/script-src[^;]+nonce-/);
    expect(
      headers?.["content-security-policy"]
        ?.split(";")
        .find((part) => part.trim().startsWith("script-src")),
    ).not.toMatch(/unsafe-inline|unsafe-eval/);
    await expect(view.getByRole("heading", { name: "The latest title" })).toBeVisible();
    await expect(view.locator("article strong")).toHaveText(
      "<img src=x onerror=alert(1)> stays text",
    );
    await expect(view.locator("article img")).toHaveCount(0);
    await expect(view.getByRole("textbox", { name: "Note content" })).toHaveCount(0);
    await expect(
      view
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Sign in" }),
    ).toBeVisible();
    await content(page).fill("A newer saved version");
    await expect(status(page)).toHaveText("Saved");
    await view.reload();
    await expect(view.locator("article")).toContainText("A newer saved version");
  } finally {
    await reader.close();
  }
});

test.describe("corrupt stored document", () => {
  test.use({ allowedPublicServerErrors: 1 });
  test("a malformed stored document is never served as HTML and the public error can recover", async ({
    page,
    account,
    publicContext,
    database,
  }) => {
    await login(page, account);
    const { notes } = await database({ kind: "seed", email: account.email, count: 1 });
    await page.goto(`/notes/${notes[0].id}`);
    await page.getByRole("button", { name: "Share note", exact: true }).click();
    await expect(page.getByLabel("Public link")).toBeVisible();
    const link = await page.getByLabel("Public link").inputValue();
    await database({
      kind: "set-content",
      email: account.email,
      id: notes[0].id,
      contentJson: {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { src: "https://invalid.example.test/private-malformed-content" },
          },
        ],
      },
    });
    const view = await publicContext.newPage();
    await view.goto(link);
    await expect(
      view.getByRole("heading", { name: "This shared note couldn't load." }),
    ).toBeVisible();
    await expect(view.locator('img[src*="private-malformed"]')).toHaveCount(0);
    await expect(view.getByRole("main")).not.toContainText("private-malformed-content");
    await database({
      kind: "set-content",
      email: account.email,
      id: notes[0].id,
      contentJson: notes[0].content,
    });
    await view.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(view.locator("article")).toContainText("A private fixture thought.");
  });
});

test("unshare and deletion revoke public access, re-sharing rotates the link without changing edit order", async ({
  page,
  account,
  publicContext,
  database,
}) => {
  await login(page, account);
  const { notes } = await database({ kind: "seed", email: account.email, count: 1 });
  await page.goto(`/notes/${notes[0].id}`);
  await page.getByRole("button", { name: "Share note", exact: true }).click();
  await expect(page.getByLabel("Public link")).toBeVisible();
  const oldLink = await page.getByLabel("Public link").inputValue();
  const reader = publicContext;
  try {
    const view = await reader.newPage();
    expect((await view.goto(oldLink))?.status()).toBe(200);
    await page.getByRole("button", { name: "Unshare", exact: true }).click();
    await expect(page.getByRole("button", { name: "Share note", exact: true })).toBeVisible();
    expect((await view.reload())?.status()).toBe(404);
    await expect(
      view.getByRole("heading", { level: 1, name: "This shared note isn't available." }),
    ).toBeVisible();
    await expect(view.getByRole("main")).toHaveCount(1);
    await expect(
      view.getByRole("main").getByRole("link", { name: "Back to TinyNotes" }),
    ).toBeVisible();
    await view.screenshot({
      path: test.info().outputPath("unavailable-share.png"),
      fullPage: true,
    });
    const unavailable = await view.getByRole("main").textContent();
    expect((await view.goto(new URL("/s/invalid-token", oldLink).href))?.status()).toBe(404);
    expect(await view.getByRole("main").textContent()).toBe(unavailable);
    await page.getByRole("button", { name: "Share note", exact: true }).click();
    await expect(page.getByLabel("Public link")).toBeVisible();
    const newLink = await page.getByLabel("Public link").inputValue();
    expect(newLink).not.toBe(oldLink);
    expect((await view.goto(newLink))?.status()).toBe(200);
    expect((await database({ kind: "inspect", email: account.email })).notes[0].updatedAt).toBe(
      notes[0].updatedAt,
    );
    await page.getByRole("button", { name: "Delete Fixture 1" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete note", exact: true })
      .click();
    await expect(page).toHaveURL(/\/notes$/);
    expect((await view.reload())?.status()).toBe(404);
    expect(await view.getByRole("main").textContent()).toBe(unavailable);
    expect((await view.goto(oldLink))?.status()).toBe(404);
  } finally {
    await reader.close();
  }
});

test("unsharing works during an edit conflict and refreshing sharing preserves unsaved local text", async ({
  page,
  context,
  account,
  database,
  request,
}) => {
  await login(page, account);
  const { notes } = await database({ kind: "seed", email: account.email, count: 1 });
  await page.goto(`/notes/${notes[0].id}`);
  await page.getByRole("button", { name: "Share note", exact: true }).click();
  await expect(page.getByLabel("Public link")).toBeVisible();
  const link = await page.getByLabel("Public link").inputValue();
  const other = await context.newPage();
  await other.goto(page.url());
  await content(other).fill("Saved from the other tab");
  await expect(status(other)).toHaveText("Saved");
  await content(page).fill("My unsaved conflicting text");
  await expect(page.getByRole("alert").filter({ hasText: "another tab" })).toBeVisible();
  await page.getByRole("button", { name: "Unshare", exact: true }).click();
  await expect(page.getByRole("button", { name: "Share note", exact: true })).toBeVisible();
  expect((await request.get(link)).status()).toBe(404);
  await page.getByRole("button", { name: "Refresh sharing details" }).click();
  await expect(page.getByRole("button", { name: "Refresh sharing details" })).toBeEnabled();
  await expect(content(page)).toHaveText("My unsaved conflicting text");
  await page.getByRole("button", { name: "Share note", exact: true }).click();
  await expect(page.getByRole("region", { name: "Note sharing" }).getByRole("alert")).toContainText(
    "Save your changes",
  );
  expect((await request.get(link)).status()).toBe(404);
});

test("sharing failures retain the draft and a lost acknowledgement retries the same link", async ({
  page,
  account,
  database,
}) => {
  await login(page, account);
  const { notes } = await database({ kind: "seed", email: account.email, count: 1 });
  await page.goto(`/notes/${notes[0].id}`);
  await database({ kind: "fail-sharing", email: account.email, enabled: true });
  await page.getByRole("button", { name: "Share note", exact: true }).click();
  const panel = page.getByRole("region", { name: "Note sharing" });
  await expect(panel.getByRole("alert")).toContainText("couldn't share");
  expect((await database({ kind: "inspect", email: account.email })).shares).toHaveLength(0);
  await expect(content(page)).toHaveText("A private fixture thought.");
  await database({ kind: "fail-sharing", email: account.email, enabled: false });
  let loseResponse = true;
  await page.route("**/notes/**", async (route) => {
    if (!route.request().headers()["next-action"] || !loseResponse) return route.continue();
    loseResponse = false;
    await route.fetch();
    return route.abort("failed");
  });
  await page.getByRole("button", { name: "Share note", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Could not connect");
  const committed = (await database({ kind: "inspect", email: account.email })).shares;
  expect(committed).toHaveLength(1);
  await page.getByRole("button", { name: "Share note", exact: true }).click();
  await expect(page.getByLabel("Public link")).toBeVisible();
  expect((await database({ kind: "inspect", email: account.email })).shares).toEqual(committed);
  await database({ kind: "fail-sharing", email: account.email, enabled: true });
  await page.getByRole("button", { name: "Unshare", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("couldn't unshare");
  await expect(page.getByLabel("Public link")).toBeVisible();
  await database({ kind: "fail-sharing", email: account.email, enabled: false });
  await page.getByRole("button", { name: "Unshare", exact: true }).click();
  await expect(page.getByRole("button", { name: "Share note", exact: true })).toBeVisible();
});

test("stale share controls cannot revoke a replacement link, and clipboard failure offers manual copying", async ({
  page,
  context,
  account,
  database,
}) => {
  await login(page, account);
  const { notes } = await database({ kind: "seed", email: account.email, count: 1 });
  await page.goto(`/notes/${notes[0].id}`);
  await page.getByRole("button", { name: "Share note", exact: true }).click();
  await expect(page.getByLabel("Public link")).toBeVisible();
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByRole("button", { name: "Unshare", exact: true }).click();
  await other.getByRole("button", { name: "Share note", exact: true }).click();
  await expect(other.getByLabel("Public link")).toBeVisible();
  const replacement = await other.getByLabel("Public link").inputValue();
  await page.getByRole("button", { name: "Unshare", exact: true }).click();
  await expect(page.getByRole("region", { name: "Note sharing" }).getByRole("alert")).toContainText(
    "another tab",
  );
  await page.getByRole("button", { name: "Refresh sharing details" }).click();
  await expect(page.getByLabel("Public link")).toHaveValue(replacement);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("Permission denied")) },
    }),
  );
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Copy the selected link manually" }),
  ).toBeVisible();
  await expect(page.getByLabel("Public link")).toBeFocused();
  expect(
    await page
      .getByLabel("Public link")
      .evaluate(
        (input: HTMLInputElement) => (input.selectionEnd ?? 0) - (input.selectionStart ?? 0),
      ),
  ).toBe(replacement.length);
});
