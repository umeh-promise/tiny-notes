import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ShareControls } from "./share-controls";

const actions = vi.hoisted(() => ({ enable: vi.fn(), disable: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/notes/actions", () => ({
  enableShareAction: actions.enable,
  disableShareAction: actions.disable,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: actions.refresh }) }));
const privateShare = { shareEnabled: false, shareId: null, shareUrl: null };
const activeShare = {
  shareEnabled: true,
  shareId: "share-id",
  shareUrl: "https://notes.example.test/s/token",
};
function setup(share = privateShare as typeof activeShare | typeof privateShare) {
  const props = {
    id: "note-id",
    share,
    disabled: false,
    beforeEnable: vi.fn(async () => true),
    afterEnable: vi.fn(),
    onChange: vi.fn(),
  };
  return { ...props, render: () => render(<ShareControls {...props} />) };
}

test("sharing waits for a successful save and prevents duplicate submissions", async () => {
  let finish: (saved: boolean) => void = () => {};
  const saving = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const props = setup();
  props.beforeEnable.mockImplementation(() => saving);
  actions.enable.mockResolvedValue({ data: activeShare });
  props.render();
  fireEvent.click(screen.getByRole("button", { name: "Share note" }));
  fireEvent.click(screen.getByRole("button", { name: "Sharing…" }));
  expect(actions.enable).not.toHaveBeenCalled();
  expect(props.beforeEnable).toHaveBeenCalledTimes(1);
  finish(true);
  await waitFor(() => expect(props.onChange).toHaveBeenCalledWith(activeShare));
  expect(actions.enable).toHaveBeenCalledTimes(1);
  expect(actions.enable).toHaveBeenCalledWith({ id: "note-id", expectedShareId: null });
  expect(props.afterEnable).toHaveBeenCalledTimes(1);
});

test("a failed save prevents publication and restores the sharing button", async () => {
  const props = setup();
  props.beforeEnable.mockResolvedValue(false);
  props.render();
  fireEvent.click(screen.getByRole("button", { name: "Share note" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Save your changes"));
  expect(actions.enable).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Share note" }).hasAttribute("disabled")).toBe(false);
});

test("unsharing does not save and recovers after a network failure", async () => {
  const props = setup(activeShare);
  actions.disable
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce({ data: { ...privateShare, shareId: activeShare.shareId } });
  props.render();
  fireEvent.click(screen.getByRole("button", { name: "Unshare" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Could not connect"));
  expect(props.beforeEnable).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Unshare" }));
  await waitFor(() => expect(props.onChange).toHaveBeenCalled());
  expect(actions.disable).toHaveBeenLastCalledWith({ id: "note-id", expectedShareId: "share-id" });
});

test("clipboard rejection selects the link and offers a manual copy instruction", async () => {
  const writeText = vi.fn().mockRejectedValue(new Error("denied"));
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const props = setup(activeShare);
  props.render();
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("Copy the selected link manually"),
  );
  const input = screen.getByRole("textbox") as HTMLInputElement;
  expect(document.activeElement).toBe(input);
  expect(input.selectionEnd).toBe(activeShare.shareUrl.length);
  expect(input.selectionStart).toBe(0);
});
