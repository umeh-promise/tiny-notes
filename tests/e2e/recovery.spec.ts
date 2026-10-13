import {
  test,
  expect,
  login,
  submitLogin,
  writeDraft,
  save,
  content,
  status,
} from "./support/fixtures";
import { deferred } from "../helpers/deferred";

test("a lost creation response followed by an empty edit retains the ID and eventually replaces the draft URL", async ({
  page,
  account,
  database,
}) => {
  await login(page, account);
  await writeDraft(page);
  await page.route(
    "**/notes/**",
    async (route) => {
      if (!route.request().headers()["next-action"]) return route.continue();
      await route.fetch();
      await route.abort();
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry save" })).toBeEnabled();
  await page.getByLabel("Note title").fill("");
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByLabel("Note title")).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/notes\/new$/);
  const before = (await database({ kind: "inspect", email: account.email })).notes;
  expect(before).toHaveLength(1);
  await page.getByLabel("Note title").fill("Completed after acknowledgement");
  await expect(status(page)).toHaveText("Saved");
  await expect(page).toHaveURL(new RegExp(`/notes/${before[0].id}$`));
  const after = (await database({ kind: "inspect", email: account.email })).notes;
  expect(after).toHaveLength(1);
  expect(after[0].title).toBe("Completed after acknowledgement");
});

test("edits made during a save are serialized and persist after its acknowledgement", async ({
  page,
  account,
  database,
}) => {
  await page.clock.install();
  await login(page, account);
  const { notes } = await database({ kind: "seed", email: account.email, count: 1 });
  await page.goto(`/notes/${notes[0].id}`);
  await expect(content(page)).toBeVisible();
  const firstSaved = deferred<void>();
  const release = deferred<void>();
  let writes = 0;
  await page.route("**/notes/**", async (route) => {
    if (!route.request().headers()["next-action"]) return route.continue();
    writes++;
    if (writes !== 1) return route.continue();
    const response = await route.fetch();
    firstSaved.resolve();
    await release.promise;
    await route.fulfill({ response });
  });
  await page.getByLabel("Note title").fill("First sent version");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await firstSaved.promise;
  try {
    await expect(status(page)).toHaveText("Saving…");
    await page.getByLabel("Note title").fill("Latest local version");
    await page.clock.runFor(2000);
    expect(writes).toBe(1);
  } finally {
    release.resolve();
  }
  await expect(status(page)).toHaveText("Saved");
  expect(writes).toBe(2);
  expect((await database({ kind: "inspect", email: account.email })).notes[0].title).toBe(
    "Latest local version",
  );
  await page.reload();
  await expect(page.getByLabel("Note title")).toHaveValue("Latest local version");
});

for (const operation of ["creation", "update"] as const) {
  test(`a lost ${operation} response recovers newer edits without duplicating the note`, async ({
    page,
    account,
    database,
  }) => {
    await login(page, account);
    const sentText = "This survives a lost acknowledgement.";
    await writeDraft(page, "One copy", operation === "creation" ? sentText : "Original body");
    if (operation === "update") await save(page);
    let dropped = false;
    await page.route("**/notes/**", async (route) => {
      if (!route.request().headers()["next-action"] || dropped) return route.continue();
      dropped = true;
      await route.fetch(); // Commit the real write, then lose only its response.
      await route.abort();
    });
    if (operation === "update") await content(page).fill(sentText);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry save" })).toBeEnabled();
    await expect(content(page)).toHaveText("This survives a lost acknowledgement.");
    const before = await database({ kind: "inspect", email: account.email });
    expect(before.notes).toHaveLength(1);
    expect(JSON.stringify(before.notes[0].content)).toContain(sentText);
    const latestText = "Newer words written after the lost response.";
    await content(page).fill(latestText);
    await page.getByRole("button", { name: "Retry save" }).click();
    await expect(status(page)).toHaveText("Saved");
    await expect(page).toHaveURL(new RegExp(`/notes/${before.notes[0].id}$`));
    const after = await database({ kind: "inspect", email: account.email });
    expect(after.notes).toHaveLength(1);
    expect(JSON.stringify(after.notes[0].content)).toContain(latestText);
    await page.reload();
    await expect(content(page)).toHaveText(latestText);
  });
}

test("a rejected save keeps the draft, blocks exits, and recovers without leaking SQL", async ({
  page,
  account,
  database,
}) => {
  await login(page, account);
  await writeDraft(page, "Keep my changes", "Private local text");
  await database({ kind: "fail-writes", email: account.email, enabled: true });
  try {
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry save" })).toBeEnabled();
    await expect(page).toHaveURL(/\/notes\/new$/);
    await expect(content(page)).toHaveText("Private local text");
    await expect(page.getByRole("main")).not.toContainText(/SQL|trigger|e2e database|INSERT/);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeEnabled();
    await expect(page).toHaveURL(/\/notes\/new$/);
    expect((await database({ kind: "inspect", email: account.email })).notes).toHaveLength(0);
  } finally {
    await database({ kind: "fail-writes", email: account.email, enabled: false });
  }
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(status(page)).toHaveText("Saved");
  await expect(page).toHaveURL(/\/notes\/[a-f0-9-]{36}$/);
  await page.reload();
  await expect(content(page)).toHaveText("Private local text");
});

test("two tabs detect conflicts, preserve local text, and require confirmation to discard it", async ({
  page,
  context,
  account,
  database,
}) => {
  await page.clock.install();
  await login(page, account);
  const { notes } = await database({ kind: "seed", email: account.email, count: 1 });
  const path = `/notes/${notes[0].id}`;
  await page.goto(path);
  const second = await context.newPage();
  await second.goto(path);
  await expect(content(second)).toBeVisible();
  await page.getByLabel("Note title").fill("Saved by first tab");
  await save(page);
  await second.getByLabel("Note title").fill("Keep this local title");
  await content(second).fill("Unsaved second-tab words");
  await second.getByRole("button", { name: "Save", exact: true }).click();
  await expect(second.getByRole("button", { name: "Open saved version" })).toBeVisible();
  let writes = 0;
  second.on("request", (request) => {
    if (request.headers()["next-action"]) writes++;
  });
  await content(second).press("End");
  await content(second).pressSequentially(" still here");
  await second.clock.runFor(3000);
  expect(writes).toBe(0);
  await expect(content(second)).toContainText("Unsaved second-tab words");
  second.once("dialog", (dialog) => dialog.dismiss());
  await second.getByRole("button", { name: "Open saved version" }).click();
  await expect(second.getByLabel("Note title")).toHaveValue("Keep this local title");
  second.once("dialog", (dialog) => dialog.accept());
  await second.getByRole("button", { name: "Open saved version" }).click();
  await expect(second.getByLabel("Note title")).toHaveValue("Saved by first tab");
  await expect(content(second)).toHaveText("A private fixture thought.");
  await second.close();
});

test("session expiry during editing preserves text until reauthentication and retry", async ({
  page,
  context,
  account,
  database,
}) => {
  await login(page, account);
  await writeDraft(page, "Session expired", "Do not lose this");
  await database({ kind: "expire-session", email: account.email });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const signIn = page.getByRole("link", { name: "Sign in in a new tab, then retry saving" });
  await expect(signIn).toBeVisible();
  await expect(content(page)).toHaveText("Do not lose this");
  const opened = context.waitForEvent("page");
  await signIn.click();
  const authPage = await opened;
  await expect(authPage).toHaveURL(/\/login$/);
  await submitLogin(authPage, account);
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(status(page)).toHaveText("Saved");
  await expect(page).toHaveURL(/\/notes\/[a-f0-9-]{36}$/);
  await page.reload();
  await expect(content(page)).toHaveText("Do not lose this");
});

test("offline updates keep the latest body and persist after reconnecting", async ({
  page,
  context,
  account,
}) => {
  await login(page, account);
  await writeDraft(page);
  await save(page);
  await context.setOffline(true);
  await content(page).fill("Written offline");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry save" })).toBeEnabled();
  await expect(content(page)).toHaveText("Written offline");
  await context.setOffline(false);
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(status(page)).toHaveText("Saved");
  await page.reload();
  await expect(content(page)).toHaveText("Written offline");
});
