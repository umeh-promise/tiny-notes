import "server-only";
import type { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { appOrigin } from "./app-origin";

type AuthConfig = Readonly<{
  secret: string;
  baseURL: string;
  rateLimitEnabled?: boolean;
}>;

export function createAuth(database: Database, { secret, baseURL, rateLimitEnabled }: AuthConfig) {
  if (secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  const origin = appOrigin(baseURL);
  return betterAuth({
    appName: "TinyNotes",
    database,
    secret,
    baseURL: origin,
    trustedOrigins: [origin],
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: { cookieCache: { enabled: false } },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
    disabledPaths: [
      "/request-password-reset",
      "/reset-password",
      "/send-verification-email",
      "/verify-email",
    ],
    databaseHooks: {
      user: {
        create: {
          async before(user) {
            const name = user.name.trim();
            if (!name)
              throw new APIError("BAD_REQUEST", {
                code: "INVALID_NAME",
                message: "Enter your name.",
              });
            return { data: { ...user, name } };
          },
        },
      },
    },
    rateLimit: rateLimitEnabled === undefined ? {} : { enabled: rateLimitEnabled },
    logger: {
      level: "warn",
      // Extra log arguments can contain database bindings or request data.
      log(level, message) {
        console.error(`[auth:${level}] ${message}`);
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
