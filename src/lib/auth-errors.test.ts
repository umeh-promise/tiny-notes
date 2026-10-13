import { describe, expect, test } from "vitest";
import { authErrorMessage } from "./auth-errors";

describe("safe authentication feedback", () => {
  test.each(["INVALID_EMAIL_OR_PASSWORD", "INVALID_PASSWORD", "USER_NOT_FOUND"])(
    "%s does not disclose whether the account exists",
    (code) => {
      expect(authErrorMessage({ code }, "login")).toBe("The email or password is incorrect.");
    },
  );
  test.each([
    ["INVALID_EMAIL", "Enter a valid email address."],
    ["INVALID_NAME", "Enter your name."],
    ["PASSWORD_TOO_SHORT", "Use a password with at least 8 characters."],
    ["PASSWORD_TOO_LONG", "Use a password with no more than 128 characters."],
    ["VALIDATION_ERROR", "Check the details you entered and try again."],
    [
      "USER_ALREADY_EXISTS",
      "Unable to create your account. Try signing in or use a different email.",
    ],
    [
      "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
      "Unable to create your account. Try signing in or use a different email.",
    ],
  ])("maps %s to actionable feedback", (code, message) => {
    expect(authErrorMessage({ code }, "register")).toBe(message);
  });
  test("HTTP failures take precedence over misleading body codes", () => {
    expect(authErrorMessage({ status: 429, code: "INVALID_PASSWORD" }, "login")).toMatch(
      /^Too many attempts/,
    );
    expect(authErrorMessage({ status: 500, code: "INVALID_EMAIL" }, "register")).toBe(
      "Something went wrong. Please try again.",
    );
  });
  test("unknown errors never echo their code or private details", () => {
    expect(authErrorMessage({ code: "SQLITE_ERROR: password=secret" }, "login")).toBe(
      "Unable to continue. Please try again.",
    );
    expect(authErrorMessage({}, "logout")).toBe("Unable to sign out. Please try again.");
  });
});
