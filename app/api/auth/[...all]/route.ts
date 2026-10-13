import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/src/lib/auth";
import { handleAuthRequest } from "@/src/lib/auth-handler";

export const runtime = "nodejs";
export const { GET, POST } = toNextJsHandler((request) => handleAuthRequest(request, getAuth));
