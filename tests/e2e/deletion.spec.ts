import { test, expect, login, content, status } from "./support/fixtures";

test("list deletion supports keyboard cancellation and returns from an emptied last page", async ({
  page,
  account,
  database,
}) => {
  await login(page, account);
  await database({ kind: "seed", email: account.email, count: 25 });
  await page.goto("/notes?page=2");
  const trigger = page.getByRole("button", { name: "Delete Fixture 1", exact: true });
  await trigger.focus();
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Delete this note?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect((await database({ kind: "inspect", email: account.email })).notes).toHaveLength(25);
  await trigger.click();
  await dialog.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(page).toHaveURL(/\/notes$/);
  expect((await database({ kind: "inspect", email: account.email })).notes).toHaveLength(24);
  await expect(page.getByRole("heading", { name: "Fixture 1", exact: true })).toHaveCount(0);
});

test("editor deletion retains dirty content after failure and retries without saving it", async ({
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
  await content(page).fill("Unsent local thoughts");
  await database({ kind: "fail-deletes", email: account.email, enabled: true });
  await page.getByRole("button", { name: "Delete Fixture 1" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("couldn't delete");
  await expect(content(page)).toHaveText("Unsent local thoughts");
  expect((await database({ kind: "inspect", email: account.email })).notes[0].content).toEqual(
    notes[0].content,
  );
  await database({ kind: "fail-deletes", email: account.email, enabled: false });
  await dialog.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await page.clock.resume();
  await expect(page.getByRole("heading", { name: "A fresh page awaits." })).toBeVisible();
  expect((await database({ kind: "inspect", email: account.email })).notes).toHaveLength(0);
  await page.goto(`/notes/${notes[0].id}`);
  await expect(page.getByRole("heading", { name: "This note isn't here." })).toBeVisible();
});

test("deletion settles an outstanding autosave and a lost delete response can be retried", async ({
  page,
  account,
  database,
}) => {
  await login(page, account);
  const { notes } = await database({ kind: "seed", email: account.email, count: 1 });
  await page.goto(`/notes/${notes[0].id}`);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started: () => void = () => {};
  const received = new Promise<void>((resolve) => {
    started = resolve;
  });
  let actions = 0;
  await page.route("**/notes/**", async (route) => {
    if (!route.request().headers()["next-action"]) return route.continue();
    const response = await route.fetch();
    actions++;
    if (actions === 1) {
      started();
      await gate;
      return route.fulfill({ response });
    }
    if (actions === 2) return route.abort("failed");
    return route.fulfill({ response });
  });
  await content(page).fill("Sent autosave");
  await received;
  await expect(status(page)).toHaveText("Saving…");
  await page.getByRole("button", { name: "Delete Fixture 1" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Deleting…" })).toBeDisabled();
  expect(actions).toBe(1);
  release();
  await expect(dialog.getByRole("alert")).toContainText("Could not connect");
  expect((await database({ kind: "inspect", email: account.email })).notes).toHaveLength(0);
  await dialog.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(page).toHaveURL(/\/notes$/);
  expect(actions).toBe(3);
});

test("an expired session cannot delete a note", async ({ page, account, database }) => {
  await login(page, account);
  const { notes } = await database({ kind: "seed", email: account.email, count: 1 });
  await page.goto(`/notes/${notes[0].id}`);
  await database({ kind: "expire-session", email: account.email });
  await page.getByRole("button", { name: "Delete Fixture 1" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("session ended");
  expect((await database({ kind: "inspect", email: account.email })).notes).toHaveLength(1);
});
