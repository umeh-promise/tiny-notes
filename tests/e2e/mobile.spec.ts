import { test, expect, newAccount, content, status } from "./support/fixtures";

test("mobile registration, formatting, saving, and navigation remain usable without horizontal overflow", async ({
  page,
}) => {
  const account = newAccount();
  await page.goto("/register");
  await page.getByLabel("Your name").fill(account.name);
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Create your account" }).tap();
  await expect(page).toHaveURL(/\/notes$/);
  await page.getByRole("link", { name: "New note", exact: true }).tap();
  await page.getByLabel("Note title").fill("A mobile thought");
  await content(page).fill("Written on a small screen");
  await content(page).press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Bold", exact: true }).tap();
  await expect(content(page).locator("strong")).toHaveText("Written on a small screen");
  await page.getByRole("button", { name: "Save", exact: true }).tap();
  await expect(page).toHaveURL(/\/notes\/[a-f0-9-]{36}$/);
  await expect(status(page)).toHaveText("Saved");
  const footer = page.getByRole("form").locator("footer");
  const buttons = [
    footer.getByRole("button", { name: "Delete A mobile thought" }),
    footer.getByRole("button", { name: "Clear", exact: true }),
    footer.getByRole("button", { name: "Submit", exact: true }),
  ];
  // Measure the settled route, not a detached /new editor during URL replacement.
  await expect
    .poll(async () => {
      const boxes = await Promise.all(buttons.map((button) => button.boundingBox()));
      if (boxes.some((box) => !box)) return Infinity;
      const centers = boxes.flatMap((box) => (box ? [box.y + box.height / 2] : []));
      return Math.max(...centers) - Math.min(...centers);
    })
    .toBeLessThan(2);
  await page.screenshot({ path: test.info().outputPath("mobile-editor.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  for (const name of ["Bold", "Add link", "Clear", "Submit"]) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeEnabled();
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  }
  await page.getByRole("button", { name: "Submit", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "A mobile thought" })).toBeVisible();
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: "A mobile thought", exact: true }) })
    .tap();
  await page.getByRole("button", { name: "Share note", exact: true }).tap();
  await expect(page.getByLabel("Public link")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Unshare", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Share note", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete A mobile thought", exact: true }).tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).tap();
  await page.getByRole("button", { name: "Delete A mobile thought", exact: true }).tap();
  await page.getByRole("dialog").getByRole("button", { name: "Delete note", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "A fresh page awaits." })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).tap();
  await expect(page).toHaveURL(/\/login$/);
});
