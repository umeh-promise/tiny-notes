import "server-only";
import { cache } from "react";
import { getNotesDatabase } from "./repository";
import { readPublicNote } from "./shares";
import { validPublicToken } from "./share-tokens";

// Request-local memoization only: the layout and page share a lookup, never a cached grant.
export const getPublicNote = cache(async (token: string) => {
  if (!validPublicToken(token)) return null;
  return readPublicNote(getNotesDatabase(), token);
});
