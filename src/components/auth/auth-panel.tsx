import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { Icon } from "@/components/ui/icon";
import { Eyebrow } from "@/components/ui/eyebrow";

export function AuthPanel({ mode }: Readonly<{ mode: "login" | "register" }>) {
  const registering = mode === "register";
  return (
    <section className="w-full max-w-105 md:max-w-87.5" aria-labelledby="auth-title">
      <Eyebrow>{registering ? "A FRESH PAGE" : "YOUR QUIET CORNER"}</Eyebrow>
      <h1
        id="auth-title"
        className="mt-3.75 font-display text-4xl/[1.2] font-normal tracking-[-1.3px] md:text-[34px] lg:text-[39px]"
      >
        {registering ? "Room for your ideas." : "Welcome back."}
      </h1>
      <p className="mt-3.5 text-xs/[1.8] text-muted">
        {registering
          ? "A small space for big thoughts. Make it yours."
          : "Your thoughts have a home here. Settle back in."}
      </p>
      <AuthForm mode={mode} />
      <p className="mt-6.5 border-t border-border pt-6.25 text-center text-[11px]/[1.8] text-muted">
        {registering ? "Already have an account?" : "New to TinyNotes?"}{" "}
        <Link
          href={registering ? "/login" : "/register"}
          className="ml-0.75 font-semibold text-aqua hover:underline"
        >
          {registering ? "Sign in" : "Create an account"}
          <span aria-hidden="true"> ↗</span>
        </Link>
      </p>
      <p className="mt-6.75 flex items-center justify-center gap-1.5 text-[9px]/[1.6] text-muted">
        <Icon name="lock" className="size-3" /> A space that’s yours. Share only when you choose.
      </p>
    </section>
  );
}
