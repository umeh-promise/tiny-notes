import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth/auth-panel";
import { redirectIfAuthenticated } from "@/src/lib/session";

export const metadata: Metadata = { title: "Sign in · TinyNotes" };

export default async function LoginPage() {
  await redirectIfAuthenticated();
  return <AuthPanel mode="login" />;
}
