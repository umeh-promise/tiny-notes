import { test, expect, newAccount, login } from "./support/fixtures";
import { deferred } from "../helpers/deferred";

test("public pages expose a main landmark, ordered headings and the TinyNotes favicon", async ({
  page,
  request,
}) => {
  for (const path of ["/", "/login", "/register", "/not-a-page", "/s/not-a-link"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    expect(
      await page
        .locator("main h1, main h2, main h3")
        .first()
        .evaluate((node) => node.tagName),
    ).toBe("H1");
    await page.getByRole("link", { name: "Skip to content" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  }
  const icon = page.locator('link[rel="icon"][type="image/svg+xml"]');
  await expect(icon).toHaveCount(1);
  const href = await icon.getAttribute("href");
  if (!href) throw new Error("Missing favicon URL");
  const response = await request.get(href);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image/svg+xml");
  const favicon = await request.get("/favicon.ico");
  expect(favicon.ok()).toBe(true);
  const bytes = await favicon.body();
  expect([...bytes.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
});

test("visitors can navigate public pages and every notes route requires a session", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Small notes.Clearer mind.");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Get started" })
    .click();
  await expect(page).toHaveURL(/\/register$/);
  for (const route of ["/notes", "/notes/new", `/notes/${crypto.randomUUID()}`]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
  await page.goto("/s/public-placeholder");
  await expect(page).toHaveURL(/\/s\/public-placeholder$/);
  await page.goto("/this-page-does-not-exist");
  await expect(page.getByText("Page not found", { exact: true })).toBeVisible();
});

test("keyboard registration shows pending state, persists the session, and signs out", async ({
  page,
  context,
}) => {
  const account = newAccount();
  const received = deferred<void>();
  const release = deferred<void>();
  let submissions = 0;
  await page.route("**/api/auth/sign-up/email", async (route) => {
    submissions++;
    received.resolve();
    await release.promise;
    await route.continue();
  });
  await page.goto("/register");
  await page.getByLabel("Your name").fill(`  ${account.name}  `);
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await received.promise;
  try {
    await expect(page.getByRole("button", { name: "Creating account…" })).toBeDisabled();
    await expect(page.getByLabel("Email address")).toBeDisabled();
    expect(submissions).toBe(1);
  } finally {
    release.resolve();
  }
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByRole("heading", { name: "A fresh page awaits." })).toBeVisible();
  const sessionCookie = (await context.cookies()).find((cookie) =>
    cookie.name.includes("session_token"),
  );
  expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  for (const route of ["/", "/login", "/register"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/notes$/);
  }
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/notes/new");
  await expect(page).toHaveURL(/\/login$/);
});

test("registration rejects invalid inputs and duplicate accounts without losing the form", async ({
  page,
  account,
}) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page.getByLabel("Your name")).toBeFocused();
  await page.getByLabel("Your name").fill("Writer");
  await page.getByLabel("Email address").fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page.getByLabel("Email address")).toBeFocused();
  await page.getByLabel("Email address").fill(account.email);
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByLabel("Your name").fill("   ");
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page.getByLabel("Your name")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Your name")).toBeFocused();
  await page.getByLabel("Your name").fill("Writer");
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Unable to create your account" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue(account.email);
  await login(page, account);
});

test("wrong passwords and unknown accounts have identical errors, followed by successful login", async ({
  page,
  account,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill("wrong password");
  await page.getByLabel("Password", { exact: true }).press("Enter");
  const error = page.getByRole("alert").filter({ hasText: "The email or password is incorrect." });
  await expect(error).toBeVisible();
  await expect(error).toBeFocused();
  await page.getByLabel("Email address").fill(newAccount().email);
  const unknownResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/sign-in/email"),
  );
  await page.getByLabel("Password", { exact: true }).press("Enter");
  expect((await unknownResponse).status()).toBe(401);
  await expect(error).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await login(page, account);
});

test("rate limits and unexpected server failures produce safe, recoverable feedback", async ({
  page,
  request,
  baseURL,
}) => {
  const account = newAccount();
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await request.post("/api/auth/sign-in/email", {
      data: account,
      headers: { Origin: baseURL ?? "" },
    });
    statuses.push(response.status());
  }
  expect(statuses).toContain(429);
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Too many attempts" })).toBeVisible();
  await page.route("**/api/auth/sign-in/email", (route) =>
    route.fulfill({ status: 500, json: { code: "SQLITE_ERROR", message: "private SQL details" } }),
  );
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(
    page.getByRole("alert").filter({ hasText: "Something went wrong. Please try again." }),
  ).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("private SQL details");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});

test("a failed authentication request preserves inputs and supports retry", async ({
  page,
  account,
}) => {
  await page.route("**/api/auth/sign-in/email", (route) => route.abort(), { times: 1 });
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Could not connect" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(account.password);
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/notes$/);
});

test("expired and tampered sessions cannot access notes; recovery APIs remain unavailable", async ({
  page,
  account,
  database,
  context,
  request,
}) => {
  await login(page, account);
  await database({ kind: "expire-session", email: account.email });
  await page.goto("/notes");
  await expect(page).toHaveURL(/\/login$/);
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name.includes("session_token"));
  if (session) await context.addCookies([{ ...session, value: "tampered-token" }]);
  else
    await context.addCookies([
      { name: "better-auth.session_token", value: "tampered-token", url: page.url() },
    ]);
  await page.goto("/notes/new");
  await expect(page).toHaveURL(/\/login$/);
  for (const endpoint of [
    "request-password-reset",
    "reset-password",
    "verify-email",
    "send-verification-email",
    "change-password",
  ]) {
    expect((await request.post(`/api/auth/${endpoint}`, { data: {} })).status()).toBe(404);
  }
});
