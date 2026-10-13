import { test, expect, login, writeDraft, save, content, status } from "./support/fixtures";

test("new drafts require a title before explicit save and persist both fields", async ({
  page,
  account,
  database,
}) => {
  await page.clock.install();
  await login(page, account);
  await writeDraft(page, "   ", "A durable thought.");
  await page.clock.runFor(2000);
  expect((await database({ kind: "inspect", email: account.email })).notes).toHaveLength(0);
  await expect(status(page)).toHaveText("Unsaved changes");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Note title")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Note title")).toBeFocused();
  expect((await database({ kind: "inspect", email: account.email })).notes).toHaveLength(0);
  await page.getByLabel("Note title").fill("A required title");
  await save(page);
  const url = page.url();
  await page.reload();
  await expect(content(page)).toHaveText("A durable thought.");
  await expect(page.getByLabel("Note title")).toHaveValue("A required title");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: "A required title", exact: true }) })
    .click();
  await expect(page).toHaveURL(url);
  expect((await database({ kind: "inspect", email: account.email })).notes).toHaveLength(1);
});

test("autosave debounces existing notes for 1000 ms and skips unchanged saves", async ({
  page,
  account,
  database,
}) => {
  await page.clock.install();
  await login(page, account);
  const { notes } = await database({ kind: "seed", email: account.email, count: 1 });
  await page.goto(`/notes/${notes[0].id}`);
  await expect(content(page)).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  let writes = 0;
  page.on("request", (request) => {
    if (request.headers()["next-action"]) writes++;
  });
  await page.getByLabel("Note title").fill("First edit");
  await page.clock.runFor(700);
  await page.getByLabel("Note title").fill("Latest edit");
  await page.clock.runFor(999);
  expect(writes).toBe(0);
  await expect(status(page)).toHaveText("Unsaved changes");
  await page.clock.runFor(1);
  await expect(status(page)).toHaveText("Saved");
  expect(writes).toBe(1);
  expect((await database({ kind: "inspect", email: account.email })).notes[0].title).toBe(
    "Latest edit",
  );
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.clock.runFor(3000);
  expect(writes).toBe(1);
  await page.clock.resume();
  await page.reload();
  await expect(page.getByLabel("Note title")).toHaveValue("Latest edit");
});

test("Submit saves the latest document before showing its list preview", async ({
  page,
  account,
  database,
}) => {
  await login(page, account);
  await writeDraft(page, "Submitted note", "<img src=x onerror=alert(1)> stays text");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByRole("heading", { name: "Submitted note" })).toBeVisible();
  await expect(page.getByText("<img src=x onerror=alert(1)> stays text")).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect((await database({ kind: "inspect", email: account.email })).notes).toHaveLength(1);
});

test("lists paginate 24 owner notes in edit order and handle invalid page values", async ({
  page,
  account,
  database,
}) => {
  await login(page, account);
  await database({ kind: "seed", email: account.email, count: 26, prefix: "Page" });
  await page.reload();
  const titles = page.getByRole("main").getByRole("heading", { level: 2 });
  await expect(titles).toHaveCount(24);
  await expect(titles.first()).toHaveText("Page 26");
  await expect(titles.last()).toHaveText("Page 3");
  await page.getByRole("link", { name: "Next →" }).click();
  await expect(titles).toHaveText(["Page 2", "Page 1"]);
  await page.getByRole("link", { name: "← Previous" }).click();
  await expect(titles).toHaveCount(24);
  for (const value of ["-1", "nope", "1.5"]) {
    await page.goto(`/notes?page=${value}`);
    await expect(titles.first()).toHaveText("Page 26");
  }
  await page.goto("/notes?page=99");
  await expect(page.getByRole("heading", { name: "You've reached the end." })).toBeVisible();
});

test("another user's note and a missing note show the same private not-found page", async ({
  page,
  account,
  database,
}) => {
  const { notes } = await database({
    kind: "seed",
    email: account.email,
    count: 1,
    prefix: "Private secret",
  });
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Other reader");
  await page.getByLabel("Email address").fill(`other-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("another password");
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByRole("heading", { name: "A fresh page awaits." })).toBeVisible();
  await page.goto(`/notes/${notes[0].id}`);
  await expect(page.getByRole("heading", { name: "This note isn't here." })).toBeVisible();
  const foreign = await page.getByRole("main").textContent();
  expect(foreign).not.toContain("Private secret");
  await page.goto(`/notes/${crypto.randomUUID()}`);
  await expect(page.getByRole("heading", { name: "This note isn't here." })).toBeVisible();
  expect(await page.getByRole("main").textContent()).toBe(foreign);
});

test("Clear can autosave an empty body while preserving the title and undo history", async ({
  page,
  account,
  database,
}) => {
  await page.clock.install();
  await login(page, account);
  await writeDraft(page, "Keep this title", "Keep or clear this body");
  await save(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(content(page)).toHaveText("Keep or clear this body");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(content(page)).toHaveText("");
  await page.clock.runFor(2000);
  await expect(status(page)).toHaveText("Saved");
  expect(
    JSON.stringify((await database({ kind: "inspect", email: account.email })).notes[0].content),
  ).not.toContain("Keep or clear this body");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(content(page)).toHaveText("Keep or clear this body");
  await save(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await save(page);
  await page.reload();
  await expect(content(page)).toHaveText("");
  await expect(page.getByLabel("Note title")).toHaveValue("Keep this title");
});

test("title-only notes support keyboard submission, persistence and sharing", async ({
  page,
  account,
  database,
}) => {
  await login(page, account);
  await writeDraft(page, "Title only", "");
  await expect(content(page)).not.toHaveAttribute("aria-required", "true");
  await page.getByLabel("Note title").press("Enter");
  await expect(page).toHaveURL(/\/notes$/);
  const notes = (await database({ kind: "inspect", email: account.email })).notes;
  expect(notes).toHaveLength(1);
  await page.goto(`/notes/${notes[0].id}`);
  await expect(content(page)).toHaveText("");
  await page.getByRole("button", { name: "Share note", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unshare", exact: true })).toBeVisible();
  expect((await database({ kind: "inspect", email: account.email })).shares).toHaveLength(1);
});
