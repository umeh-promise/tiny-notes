import { test as base, expect, type Page, type BrowserContext } from "@playwright/test";
import { spawn } from "node:child_process";
import { resolve as resolvePath } from "node:path";
import type { DatabaseCommand, DatabaseResult } from "./database-types";
import { testServers, type TestServer } from "./environment";

type Account = { name: string; email: string; password: string };
type Fixtures = {
  account: Account;
  database: (command: DatabaseCommand) => Promise<DatabaseResult>;
  browserErrors: void;
  publicContext: BrowserContext;
  allowedPublicServerErrors: number;
};
let client = 0;
export function newAccount(): Account {
  return {
    name: "Test Writer",
    email: `writer-${crypto.randomUUID()}@example.test`,
    password: " test password 123! ",
  };
}
export const test = base.extend<Fixtures, { server: TestServer }>({
  allowedPublicServerErrors: [0, { option: true }],
  publicContext: async ({ browser, allowedPublicServerErrors }, use) => {
    const context = await browser.newContext();
    const errors: string[] = [];
    const serverErrors: string[] = [];
    function record(message: string) {
      // React 441 is the sanitized Server Component failure intentionally injected
      // by the error-boundary test. Firefox may omit the caught-error console event.
      // Permit at most that one diagnostic; all other tests allow zero.
      if (/^(?:Error: )?Minified React error #441;/.test(message)) serverErrors.push(message);
      else errors.push(message);
    }
    context.on("page", (page) => {
      page.on("pageerror", (error) => record(error.message));
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          /hydration|hydrating|Minified React error|Content Security Policy|content-security-policy/i.test(
            message.text(),
          )
        )
          record(message.text());
      });
    });
    await use(context);
    await context.close();
    expect(errors, "Unexpected public-page script or CSP errors").toEqual([]);
    expect(
      serverErrors.length,
      "Unexpected repeated Server Component failures",
    ).toBeLessThanOrEqual(allowedPublicServerErrors);
  },
  server: [
    async ({ browserName }, use, info) => {
      const server = testServers()[info.parallelIndex];
      if (!server)
        throw new Error(
          `No isolated server for ${browserName} worker. Set E2E_WORKERS instead of --workers.`,
        );
      await use(server);
    },
    { scope: "worker" },
  ],
  baseURL: async ({ server }, use) => {
    await use(server.baseURL);
  },
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, info) => {
    await use({
      ...extraHTTPHeaders,
      "x-forwarded-for": `198.18.${info.workerIndex + 1}.${++client}`,
    });
  },
  account: async ({ request, baseURL }, use) => {
    const account = newAccount();
    const response = await request.post("/api/auth/sign-up/email", {
      data: account,
      headers: { Origin: baseURL ?? "" },
    });
    expect(response.status()).toBe(200);
    await use(account);
  },
  database: async ({ server }, use) => {
    await use(
      (command) =>
        new Promise((resolve, reject) => {
          const child = spawn("bun", [resolvePath("tests/e2e/support/database.ts")], {
            stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env, DB_PATH: server.dbPath, TINYNOTES_E2E_DIR: server.directory },
          });
          let stdout = "";
          let stderr = "";
          child.stdout.on("data", (chunk) => {
            stdout += chunk;
          });
          child.stderr.on("data", (chunk) => {
            stderr += chunk;
          });
          child.on("error", reject);
          child.on("close", (code) => {
            if (code !== 0) reject(new Error(`Disposable database fixture failed: ${stderr}`));
            else {
              try {
                resolve(JSON.parse(stdout));
              } catch (error) {
                reject(error);
              }
            }
          });
          child.stdin.end(JSON.stringify(command));
        }),
    );
  },
  browserErrors: [
    async ({ context, browserName, baseURL }, use, info) => {
      const errors: string[] = [];
      const observe = (page: Page) => {
        let loaded = false;
        let navigating = false;
        page.on("request", (request) => {
          if (request.isNavigationRequest() && request.frame() === page.mainFrame())
            navigating = loaded;
        });
        page.on("domcontentloaded", () => {
          loaded = true;
          navigating = false;
        });
        page.on("pageerror", (error) => {
          // WebKit reports cancelled Next prefetches as pageerrors during hard navigation:
          // https://github.com/microsoft/playwright/issues/42823
          // Fetches started during teardown may never emit a request event. Record
          // only this exact same-origin RSC signature while replacing a document;
          // ordinary API failures and errors while a page is active still fail.
          const refused = error.stack?.match(
            /^Fetch API cannot load (\S+) due to access control checks\./,
          )?.[1];
          if (browserName === "webkit" && navigating && refused && URL.canParse(refused)) {
            const url = new URL(refused);
            if (url.origin === baseURL && url.searchParams.has("_rsc")) {
              info.annotations.push({
                type: "WebKit navigation cancellation",
                description: refused,
              });
              return;
            }
          }
          errors.push(error.message);
        });
        page.on("console", (message) => {
          if (
            message.type() === "error" &&
            /hydration|hydrating|did not match|Minified React error/i.test(message.text())
          )
            errors.push(message.text());
        });
      };
      context.pages().forEach(observe);
      context.on("page", observe);
      await use();
      expect(errors, "Unexpected browser or hydration errors").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
export async function login(page: Page, account: Account) {
  await page.goto("/login");
  await submitLogin(page, account);
}
export async function submitLogin(page: Page, account: Account) {
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByRole("heading", { name: "Your notes." })).toBeVisible();
}
export const content = (page: Page) => page.getByRole("textbox", { name: "Note content" });
export const status = (page: Page) =>
  page.getByRole("status").filter({ hasText: /^(Saved|Unsaved changes|Saving…)$/ });
export async function writeDraft(page: Page, title = "A thought", body = "Words worth keeping.") {
  await page.goto("/notes/new");
  await page.getByLabel("Note title").fill(title);
  await content(page).fill(body);
}
export async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/[a-f0-9-]{36}$/);
  await expect(status(page)).toHaveText("Saved");
}
