import "server-only";
import { createAuth, type Auth } from "./auth-config";
import { openDatabase } from "./database";

const globalAuth = globalThis as typeof globalThis & { tinyNotesAuth?: Auth };

export function getAuth(): Auth {
  if (!globalAuth.tinyNotesAuth) {
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 32)
      throw new Error("Set AUTH_SECRET to a random secret of at least 32 characters.");
    const database = openDatabase();
    try {
      globalAuth.tinyNotesAuth = createAuth(database, {
        secret,
        baseURL: process.env.APP_URL ?? "http://localhost:3000",
      });
    } catch (error) {
      database.close();
      throw error;
    }
  }
  return globalAuth.tinyNotesAuth;
}
