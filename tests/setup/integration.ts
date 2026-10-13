import { vi } from "vitest";

if (typeof Bun === "undefined") {
  throw new Error("SQLite integration tests require Bun. Run bun run test:integration.");
}

// Only remove Next's import boundary marker; database/auth implementations stay real.
vi.mock("server-only", () => ({}));
