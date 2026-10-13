import type { JSONContent } from "@tiptap/core";
export type DatabaseCommand =
  | { kind: "seed"; email: string; count: number; prefix?: string; text?: string }
  | { kind: "inspect"; email: string }
  | { kind: "set-content"; email: string; id: string; contentJson: JSONContent }
  | { kind: "expire-session"; email: string }
  | { kind: "fail-deletes"; email: string; enabled: boolean }
  | { kind: "fail-sharing"; email: string; enabled: boolean }
  | { kind: "fail-writes"; email: string; enabled: boolean };
export type StoredNote = { id: string; title: string; content: JSONContent; updatedAt: string };
export type DatabaseResult = {
  notes: StoredNote[];
  shares: { id: string; noteId: string; enabled: boolean }[];
};
