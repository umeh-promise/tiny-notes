import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major !== 24 || minor < 15) {
  throw new Error(
    "Unit tests require Node 24 LTS >=24.15.0. Run bun run test:unit with that Node on PATH.",
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
