import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import NotesError from "./error";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

test("the notes error boundary offers a working recovery control", () => {
  const reset = vi.fn();
  render(<NotesError reset={reset} />);
  expect(screen.getByRole("heading").textContent).toBe("Your notes couldn't load.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(reset).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledTimes(1);
});
