import { test, expect, login, writeDraft, content, status } from "./support/fixtures";

test("list controls and shared-header links flush drafts before leaving", async ({
  page,
  account,
  database,
}) => {
  await login(page, account);
  await writeDraft(page, "Saved on exit", "First exit");
  await page.getByRole("button", { name: "← All notes" }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByRole("heading", { name: "Saved on exit" })).toBeVisible();
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: "Saved on exit" }) })
    .click();
  await content(page).fill("Latest header exit");
  await page.getByRole("link", { name: "My notes", exact: true }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByText("Latest header exit", { exact: true })).toBeVisible();
  expect((await database({ kind: "inspect", email: account.email })).notes).toHaveLength(1);
});

test("sign-out flushes edits and a subsequent login sees the persisted document", async ({
  page,
  account,
}) => {
  await login(page, account);
  await writeDraft(page, "Sign-out save", "Saved before the session ends");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, account);
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: "Sign-out save" }) })
    .click();
  await expect(content(page)).toHaveText("Saved before the session ends");
});

test("dirty editors cancel reload through the native warning; saved editors reload normally", async ({
  page,
  account,
}) => {
  await login(page, account);
  await writeDraft(page, "Reload guard", "Unsaved local text");
  await content(page).click();
  const warning = page.waitForEvent("dialog");
  // page.reload waits for a load that intentionally never happens after dismissal.
  await page.evaluate(() => {
    window.setTimeout(() => window.location.reload(), 0);
  });
  const dialog = await warning;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await expect(content(page)).toHaveText("Unsaved local text");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(status(page)).toHaveText("Saved");
  await expect(page).toHaveURL(/\/notes\/[a-f0-9-]{36}$/);
  const unexpectedDialogs: string[] = [];
  page.on("dialog", async (event) => {
    unexpectedDialogs.push(event.type());
    await event.dismiss();
  });
  await page.reload();
  await expect(content(page)).toHaveText("Unsaved local text");
  expect(unexpectedDialogs).toEqual([]);
});

for (const exit of ["All notes", "Back", "document Back"] as const) {
  test(`empty drafts leave through ${exit} without saving or a warning`, async ({
    page,
    account,
    database,
  }) => {
    await login(page, account);
    if (exit === "document Back") await page.goto("/notes/new");
    else await page.getByRole("link", { name: "New note", exact: true }).click();
    await expect(content(page)).toBeVisible();
    await page.getByLabel("Note title").fill("Temporary title");
    await page.getByLabel("Note title").fill(" ");
    await content(page).fill("Temporary body");
    await content(page).fill("");
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.dismiss();
    });
    if (exit === "All notes") await page.getByRole("button", { name: "← All notes" }).click();
    else await page.goBack();
    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByRole("heading", { name: "A fresh page awaits." })).toBeVisible();
    expect(dialogs).toEqual([]);
    expect((await database({ kind: "inspect", email: account.email })).notes).toHaveLength(0);
  });
}

test("body text without a title blocks All notes and retains the draft", async ({
  page,
  account,
  database,
}) => {
  await login(page, account);
  await writeDraft(page, "", "Keep this unsaved thought");
  await page.getByRole("button", { name: "← All notes" }).click();
  await expect(page.getByLabel("Note title")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Note title")).toBeFocused();
  await expect(page.getByText("Enter a note title.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/notes\/new$/);
  await expect(content(page)).toHaveText("Keep this unsaved thought");
  expect((await database({ kind: "inspect", email: account.email })).notes).toHaveLength(0);
});
