import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";

export const getSession = cache(async () => {
  const requestHeaders = await headers();
  if (!requestHeaders.get("cookie")) return null;
  return getAuth().api.getSession({
    headers: requestHeaders,
    // Server Components cannot send a refreshed cookie; refresh through the API instead.
    query: { disableRefresh: true, disableCookieCache: true },
  });
});

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function redirectIfAuthenticated() {
  if (await getSession()) redirect("/notes");
}
