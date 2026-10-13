"use client";

import { useRef, useState } from "react";
import { authClient } from "@/src/lib/auth-client";
import { authErrorMessage } from "@/src/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { useNavigationGuard } from "@/components/layout/navigation-guard";

export function SignOutButton() {
  const navigation = useNavigationGuard();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      await navigation.navigate(async () => {
        const result = await authClient.signOut();
        if (!result.error) window.location.assign("/login");
        else setError(authErrorMessage(result.error, "logout"));
      });
    } catch {
      setError("Could not connect. Please try signing out again.");
    }
    submitting.current = false;
    setPending(false);
  }

  return (
    <div className="relative">
      <Button onClick={signOut} disabled={pending} size="navigation">
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      <FormError className="absolute top-full right-0 z-2 mt-3 w-60 rounded-md border border-border bg-background p-3 empty:hidden">
        {error}
      </FormError>
    </div>
  );
}
