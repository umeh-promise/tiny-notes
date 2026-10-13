"use client";

import { useLayoutEffect, useRef, useState, type SubmitEvent } from "react";
import { authClient } from "@/src/lib/auth-client";
import { authErrorMessage } from "@/src/lib/auth-errors";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { FormError } from "@/components/ui/form-error";

export function AuthForm({ mode }: Readonly<{ mode: "login" | "register" }>) {
  const registering = mode === "register";
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  // Focus with the committed feedback, before paint. A delayed frame can steal
  // focus from someone already entering a correction or submitting a retry.
  useLayoutEffect(() => {
    if (error && !pending) errorRef.current?.focus();
  }, [error, pending]);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get("email") ?? "").trim();
    const password = String(values.get("password") ?? "");
    const name = String(values.get("name") ?? "").trim();
    setNameError("");
    setError("");
    if (registering && !name) {
      setNameError("Enter your name.");
      form.querySelector<HTMLInputElement>("[name=name]")?.focus();
      return;
    }
    submitting.current = true;
    setPending(true);
    let navigating = false;
    try {
      const result = registering
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password, rememberMe: true });
      if (result.error) {
        setError(authErrorMessage(result.error, mode));
      } else {
        navigating = true;
        // A fresh navigation also refreshes the server-rendered header and session guards.
        window.location.assign("/notes");
      }
    } catch {
      setError("Could not connect. Check your connection and try again.");
    } finally {
      if (!navigating) {
        submitting.current = false;
        setPending(false);
      }
    }
  }

  return (
    <form
      method="post"
      action={`/api/auth/${registering ? "sign-up" : "sign-in"}/email`}
      onSubmit={submit}
      aria-label={registering ? "Create an account" : "Sign in"}
      aria-busy={pending}
    >
      <fieldset className="mt-7.75 flex min-w-0 flex-col gap-5.25" disabled={pending}>
        <legend className="sr-only">{registering ? "Account details" : "Sign-in details"}</legend>
        {registering && (
          <FormField
            label="Your name"
            name="name"
            placeholder="Alex Morgan"
            autoComplete="name"
            required
            error={nameError}
          />
        )}
        <FormField
          label="Email address"
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          placeholder={registering ? "Choose a password" : "Enter your password"}
          autoComplete={registering ? "new-password" : "current-password"}
          required
          minLength={8}
          maxLength={128}
          hint={registering ? "Use 8–128 characters." : undefined}
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending
            ? registering
              ? "Creating account…"
              : "Signing in…"
            : registering
              ? "Create your account"
              : "Sign in"}
          <Icon name="arrow" />
        </Button>
      </fieldset>
      <FormError ref={errorRef} className="not-empty:mt-3" tabIndex={-1}>
        {error}
      </FormError>
      <noscript>
        <FormError className="mt-3">Enable JavaScript to sign in or create an account.</FormError>
      </noscript>
    </form>
  );
}
