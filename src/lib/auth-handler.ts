import "server-only";
import type { Auth } from "./auth-config";

const allowedPaths = new Set([
  "/api/auth/sign-up/email",
  "/api/auth/sign-in/email",
  "/api/auth/sign-out",
  "/api/auth/get-session",
]);

export async function handleAuthRequest(
  request: Request,
  resolveAuth: () => Auth,
): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  // Also excludes parameterized recovery routes and unused account-management APIs.
  if (!allowedPaths.has(path)) return new Response("Not found", { status: 404 });
  try {
    const response = await resolveAuth().handler(request);
    if (response.status < 500) return response;
  } catch (error) {
    // Keep request bodies, credentials, tokens, and database bindings out of logs.
    console.error("[auth] Request failed", {
      type: error instanceof Error ? error.name : "UnknownError",
    });
  }
  return Response.json(
    { code: "INTERNAL_ERROR", message: "Authentication is unavailable. Please try again." },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}
