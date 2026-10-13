import StarterKit from "@tiptap/starter-kit";

export function isSafeNoteLink(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 32 || code === 127) return false;
  }
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

// The server validator and browser editor must use the same document schema.
export const noteExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    horizontalRule: false,
    trailingNode: false,
    link: {
      openOnClick: false,
      defaultProtocol: "https",
      isAllowedUri: (url) => isSafeNoteLink(url),
      HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
    },
  }),
];
