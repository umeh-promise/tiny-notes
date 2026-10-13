import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth/auth-panel";
import { redirectIfAuthenticated } from "@/src/lib/session";

export const metadata: Metadata = { title: "Create an account · TinyNotes" };

export default async function RegisterPage() {
  await redirectIfAuthenticated();
  return <AuthPanel mode="register" />;
}
