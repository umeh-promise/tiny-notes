import "server-only";

const encoder = new TextEncoder();

export function newShareToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

export function validShareToken(token: string): boolean {
  return (
    /^[A-Za-z0-9_-]{43}$/.test(token) &&
    Buffer.from(token, "base64url").toString("base64url") === token
  );
}

export function validPublicToken(token: string): boolean {
  // The original spec also permits 32 random bytes encoded as hexadecimal.
  return validShareToken(token) || /^[a-fA-F0-9]{64}$/.test(token);
}

export async function hashShareToken(token: string): Promise<string> {
  return Buffer.from(await crypto.subtle.digest("SHA-256", encoder.encode(token))).toString("hex");
}

async function encryptionKey(secret = process.env.SHARE_TOKEN_SECRET): Promise<CryptoKey> {
  if (!secret || !validShareToken(secret)) throw new Error("Share encryption is not configured.");
  return crypto.subtle.importKey("raw", Buffer.from(secret, "base64url"), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptShareToken(
  token: string,
  noteId: string,
  shareId: string,
  secret?: string,
): Promise<string> {
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(JSON.stringify([noteId, shareId])),
      tagLength: 128,
    },
    key,
    encoder.encode(token),
  );
  return `v1.${Buffer.from(iv).toString("base64url")}.${Buffer.from(encrypted).toString("base64url")}`;
}

export async function decryptShareToken(
  payload: string,
  noteId: string,
  shareId: string,
  secret?: string,
): Promise<string> {
  const [version, nonce, encrypted, extra] = payload.split(".");
  if (
    version !== "v1" ||
    !nonce ||
    !encrypted ||
    extra ||
    Buffer.from(nonce, "base64url").length !== 12
  )
    throw new Error("Share link could not be recovered.");
  const key = await encryptionKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: Buffer.from(nonce, "base64url"),
      additionalData: encoder.encode(JSON.stringify([noteId, shareId])),
      tagLength: 128,
    },
    key,
    Buffer.from(encrypted, "base64url"),
  );
  const token = new TextDecoder().decode(decrypted);
  if (!validShareToken(token)) throw new Error("Share link could not be recovered.");
  return token;
}
