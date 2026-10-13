type AuthError = Readonly<{ code?: string; status?: number }>;

export function authErrorMessage(error: AuthError, mode: "login" | "register" | "logout"): string {
  if (error.status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (error.status && error.status >= 500) return "Something went wrong. Please try again.";
  if (
    mode === "login" &&
    (error.status === 401 ||
      ["INVALID_EMAIL_OR_PASSWORD", "INVALID_PASSWORD", "USER_NOT_FOUND"].includes(
        error.code ?? "",
      ))
  )
    return "The email or password is incorrect.";
  switch (error.code) {
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
    case "INVALID_NAME":
      return "Enter your name.";
    case "PASSWORD_TOO_SHORT":
      return "Use a password with at least 8 characters.";
    case "PASSWORD_TOO_LONG":
      return "Use a password with no more than 128 characters.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "Unable to create your account. Try signing in or use a different email.";
    case "VALIDATION_ERROR":
      return "Check the details you entered and try again.";
    default:
      return mode === "logout"
        ? "Unable to sign out. Please try again."
        : "Unable to continue. Please try again.";
  }
}
