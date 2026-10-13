import { afterEach, beforeEach, describe, expect, vi, test } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { runMigrations } from "../../scripts/migrate";
import { createAuth, type Auth } from "./auth-config";
import { handleAuthRequest } from "./auth-handler";
import { authErrorMessage } from "./auth-errors";
import { openDatabase } from "./database";

const origin = "http://localhost:3000";
const secret = "integration-only-" + "a1b2c3d4".repeat(6);
const account = {
  name: "Test Reader",
  email: "reader@example.test",
  password: " a strong test password ",
};
let directory: string;
let db: Database;
let auth: Auth;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "tinynotes-auth-"));
  const dbPath = join(directory, "test.db");
  runMigrations({ dbPath, log: () => {} });
  db = openDatabase(dbPath);
  auth = createAuth(db, { secret, baseURL: origin, rateLimitEnabled: false });
  await auth.$context;
});

afterEach(async () => {
  await auth.$context;
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

function request(path: string, body?: unknown, cookie?: string, requestOrigin = origin) {
  return handleAuthRequest(
    new Request(origin + "/api/auth" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: requestOrigin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    () => auth,
  );
}

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

describe("authentication against the existing SQLite migrations", () => {
  test("registration stores hashed credentials, UUIDs, TEXT dates, and INTEGER booleans", async () => {
    const response = await request("/sign-up/email", { ...account, name: "  Test Reader  " });
    expect(response.status).toBe(200);
    const { user } = await response.json();
    expect(user).toMatchObject({ name: account.name, email: account.email, emailVerified: false });
    expect(user.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    const stored = db
      .query<{ createdAt: string; emailVerified: number }, []>(
        "SELECT createdAt, emailVerified FROM user",
      )
      .get()!;
    expect(stored.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(stored.emailVerified).toBe(0);
    const credential = db
      .query<{ password: string; providerId: string; accountId: string }, []>(
        "SELECT password, providerId, accountId FROM account",
      )
      .get()!;
    expect(credential.password).not.toBe(account.password);
    expect(credential.password.length).toBeGreaterThan(50);
    expect(credential).toMatchObject({ providerId: "credential", accountId: user.id });
    const setCookie = response.headers.get("set-cookie")!;
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=");
    const session = await (await request("/get-session", undefined, cookies(response))).json();
    expect(session.user.id).toBe(user.id);
    expect(session.session.userId).toBe(user.id);
    expect(db.query("SELECT * FROM verification").all()).toHaveLength(0);
    // A new auth instance reads the persisted session rather than an in-memory cache.
    auth = createAuth(db, { secret, baseURL: origin, rateLimitEnabled: false });
    expect(
      (await (await request("/get-session", undefined, cookies(response))).json()).user.id,
    ).toBe(user.id);
  });

  test("sign-out revokes the session; login preserves password whitespace and normalizes email", async () => {
    const registration = await request("/sign-up/email", account);
    const cookie = cookies(registration);
    const logout = await request("/sign-out", {}, cookie);
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await (await request("/get-session", undefined, cookie)).json()).toBeNull();
    expect(db.query("SELECT * FROM session").all()).toHaveLength(0);
    const login = await request("/sign-in/email", {
      email: account.email.toUpperCase(),
      password: account.password,
    });
    expect(login.status).toBe(200);
    expect(
      (await (await request("/get-session", undefined, cookies(login))).json()).user.email,
    ).toBe(account.email);
  });

  test("incorrect passwords and unknown accounts return identical invalid-credentials responses", async () => {
    await request("/sign-up/email", account);
    const wrong = await request("/sign-in/email", { ...account, password: "incorrect-password" });
    const unknown = await request("/sign-in/email", { ...account, email: "unknown@example.test" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect(cookies(wrong)).toBe("");
    expect(cookies(unknown)).toBe("");
  });

  test("duplicate registration preserves the original user and password", async () => {
    await request("/sign-up/email", account);
    const duplicate = await request("/sign-up/email", {
      ...account,
      password: "different-password",
    });
    expect(duplicate.status).toBe(422);
    for (const table of ["user", "account", "session"])
      expect(db.query(`SELECT * FROM ${table}`).all()).toHaveLength(1);
    expect((await request("/sign-in/email", account)).status).toBe(200);
  });

  test.each([
    { name: "   " },
    { email: "invalid-email" },
    { password: "short" },
    { password: "a".repeat(129) },
  ])("invalid registration is rejected atomically: %j", async (invalid) => {
    const response = await request("/sign-up/email", { ...account, ...invalid });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(cookies(response)).toBe("");
    expect(db.query("SELECT * FROM user").all()).toHaveLength(0);
    expect(db.query("SELECT * FROM account").all()).toHaveLength(0);
  });

  test("missing, tampered, expired, and deleted sessions are not authenticated", async () => {
    expect(await (await request("/get-session")).json()).toBeNull();
    const cookie = cookies(await request("/sign-up/email", account));
    expect(await (await request("/get-session", undefined, cookie + "tampered")).json()).toBeNull();
    db.run("UPDATE session SET expiresAt = '2000-01-01T00:00:00.000Z'");
    expect(await (await request("/get-session", undefined, cookie)).json()).toBeNull();
    const freshCookie = cookies(await request("/sign-in/email", account));
    db.run("DELETE FROM session");
    expect(await (await request("/get-session", undefined, freshCookie)).json()).toBeNull();
  });

  test("untrusted origins cannot register or sign out", async () => {
    const hostile = "https://untrusted.example.test";
    expect((await request("/sign-up/email", account, undefined, hostile)).status).toBe(403);
    expect(db.query("SELECT * FROM user").all()).toHaveLength(0);
    const cookie = cookies(await request("/sign-up/email", account));
    expect((await request("/sign-out", {}, cookie, hostile)).status).toBe(403);
    expect((await (await request("/get-session", undefined, cookie)).json()).user.email).toBe(
      account.email,
    );
  });

  test("HTTPS origins use secure session cookies", async () => {
    const secureOrigin = "https://notes.example.test";
    const secureAuth = createAuth(db, { secret, baseURL: secureOrigin, rateLimitEnabled: false });
    const response = await handleAuthRequest(
      new Request(secureOrigin + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: secureOrigin },
        body: JSON.stringify(account),
      }),
      () => secureAuth,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("__Secure-");
  });

  test("enabling the production rate limiter returns 429 for repeated login attempts", async () => {
    auth = createAuth(db, { secret, baseURL: origin, rateLimitEnabled: true });
    const statuses: number[] = [];
    for (let index = 0; index < 5; index++) {
      const response = await handleAuthRequest(
        new Request(origin + "/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            "X-Forwarded-For": "192.0.2.50",
          },
          body: JSON.stringify(account),
        }),
        () => auth,
      );
      statuses.push(response.status);
    }
    expect(statuses).toContain(429);
  });

  test.each([
    "/request-password-reset",
    "/reset-password",
    "/reset-password/any-token",
    "/send-verification-email",
    "/verify-email",
    "/change-password",
    "/sign-in/social",
    "/update-user",
  ])("excluded endpoint %s remains unavailable", async (path) => {
    expect((await request(path)).status).toBe(404);
    expect((await request(path, account)).status).toBe(404);
  });

  test("unexpected configuration failures never disclose secrets or SQL", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await handleAuthRequest(
        new Request(origin + "/api/auth/get-session"),
        () => {
          throw new Error("private SQL detail and secret-password");
        },
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        code: "INTERNAL_ERROR",
        message: "Authentication is unavailable. Please try again.",
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("secret-password");
    } finally {
      log.mockRestore();
    }
  });

  test("server errors are sanitized and client messages are safe", async () => {
    const failingAuth = {
      handler: async () => Response.json({ message: "private SQL bindings" }, { status: 500 }),
    } as unknown as Auth;
    const response = await handleAuthRequest(
      new Request(origin + "/api/auth/get-session"),
      () => failingAuth,
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("SQL");
    expect(authErrorMessage({ status: 500 }, "login")).toBe(
      "Something went wrong. Please try again.",
    );
    expect(authErrorMessage({ code: "SQL_DETAILS" }, "register")).toBe(
      "Unable to continue. Please try again.",
    );
    expect(authErrorMessage({ status: 429 }, "login")).toContain("Too many attempts");
  });

  test("opening an absent database does not silently create it", () => {
    const missing = join(directory, "missing.db");
    expect(() => openDatabase(missing)).toThrow();
    expect(existsSync(missing)).toBe(false);
  });
});
