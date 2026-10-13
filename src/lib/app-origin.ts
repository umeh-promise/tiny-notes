import "server-only";

export function appOrigin(value = process.env.APP_URL ?? "http://localhost:3000"): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("APP_URL must be an HTTP(S) origin without a path, credentials, or query.");
  return url.origin;
}
