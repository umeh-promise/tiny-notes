import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { AuthForm } from "./auth-form";
import { deferred } from "@/tests/helpers/deferred";

const { signIn, signUp } = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn() }));
vi.mock("@/src/lib/auth-client", () => ({
  authClient: { signIn: { email: signIn }, signUp: { email: signUp } },
}));

function fill(mode: "login" | "register") {
  render(<AuthForm mode={mode} />);
  if (mode === "register")
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "  Alex  " } });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "  alex@example.test  " },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: " exact password " },
  });
  return screen.getByRole("form");
}

describe("authentication forms", () => {
  test("error feedback never steals focus from a user already retrying", async () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    signIn.mockRejectedValue(new Error("offline"));
    fireEvent.submit(fill("login"));
    await screen.findByText("Could not connect. Check your connection and try again.");
    const password = screen.getByLabelText("Password");
    password.focus();
    await act(async () => callbacks.forEach((callback) => callback(0)));
    expect(document.activeElement).toBe(password);
  });
  test.each(["login", "register"] as const)(
    "%s trims identity but preserves password bytes",
    async (mode) => {
      const send = mode === "login" ? signIn : signUp;
      send.mockResolvedValue({ error: { code: "VALIDATION_ERROR" } });
      fireEvent.submit(fill(mode));
      await screen.findByText("Check the details you entered and try again.");
      expect(send).toHaveBeenCalledExactlyOnceWith({
        email: "alex@example.test",
        password: " exact password ",
        ...(mode === "register" ? { name: "Alex" } : { rememberMe: true }),
      });
    },
  );

  test("blank names are associated with a focused invalid field without sending a request", () => {
    const form = fill("register");
    const name = screen.getByLabelText<HTMLInputElement>("Your name");
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.submit(form);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(name.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Enter your name.",
    );
    expect(document.activeElement).toBe(name);
    expect(signUp).not.toHaveBeenCalled();
  });

  test("native required, email, and password constraints are present", () => {
    render(<AuthForm mode="register" />);
    const email = screen.getByLabelText<HTMLInputElement>("Email address");
    const password = screen.getByLabelText<HTMLInputElement>("Password");
    expect(email.required).toBe(true);
    expect(email.checkValidity()).toBe(false);
    fireEvent.change(email, { target: { value: "invalid" } });
    expect(email.validity.typeMismatch).toBe(true);
    expect(password.required).toBe(true);
    expect([password.minLength, password.maxLength]).toEqual([8, 128]);
    expect(
      document.getElementById(password.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Use 8–128 characters.");
  });

  test.each(["login", "register"] as const)(
    "%s prevents duplicate submissions while pending",
    async (mode) => {
      const pending = deferred<{ error: { status: number } }>();
      const send = mode === "login" ? signIn : signUp;
      send.mockReturnValue(pending.promise);
      const form = fill(mode);
      fireEvent.submit(form);
      fireEvent.submit(form);
      expect(send).toHaveBeenCalledTimes(1);
      expect(form.getAttribute("aria-busy")).toBe("true");
      expect(screen.getByRole<HTMLButtonElement>("button").disabled).toBe(true);
      expect(screen.getByLabelText<HTMLInputElement>("Password").matches(":disabled")).toBe(true);
      await act(async () => pending.resolve({ error: { status: 429 } }));
      expect(screen.getByRole<HTMLButtonElement>("button").disabled).toBe(false);
      expect(form.getAttribute("aria-busy")).toBe("false");
      expect(screen.getByText(/Too many attempts/).getAttribute("role")).toBe("alert");
    },
  );

  test("connection failures preserve inputs, focus the error, and permit retry", async () => {
    signIn
      .mockRejectedValueOnce(new Error("sensitive network details"))
      .mockResolvedValueOnce({ error: { status: 401 } });
    const form = fill("login");
    fireEvent.submit(form);
    const error = await screen.findByText(
      "Could not connect. Check your connection and try again.",
    );
    await waitFor(() => expect(document.activeElement).toBe(error));
    expect(screen.getByLabelText<HTMLInputElement>("Password").value).toBe(" exact password ");
    expect(document.body.textContent).not.toContain("sensitive network details");
    fireEvent.submit(form);
    await screen.findByText("The email or password is incorrect.");
    expect(signIn).toHaveBeenCalledTimes(2);
  });
});
