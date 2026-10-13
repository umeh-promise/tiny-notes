import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useEffect } from "react";
import { NavigationGuardProvider, useNavigationGuard } from "../layout/navigation-guard";
import { SignOutButton } from "./sign-out-button";
import { deferred } from "@/tests/helpers/deferred";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/src/lib/auth-client", () => ({ authClient: { signOut } }));

function EditorGuard({ save }: { save: () => Promise<boolean> }) {
  const navigation = useNavigationGuard();
  useEffect(
    () =>
      navigation.register(async (leave) => {
        if (await save()) await leave();
      }),
    [navigation, save],
  );
  return null;
}

test("sign-out waits for saving and prevents duplicate requests", async () => {
  const saving = deferred<boolean>();
  const save = vi.fn(() => saving.promise);
  signOut.mockResolvedValue({ error: {} });
  render(
    <NavigationGuardProvider>
      <EditorGuard save={save} />
      <SignOutButton />
    </NavigationGuardProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  fireEvent.click(screen.getByRole("button", { name: "Signing out…" }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(signOut).not.toHaveBeenCalled();
  await act(async () => saving.resolve(true));
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("alert").textContent).toBe("Unable to sign out. Please try again.");
  expect(screen.getByRole<HTMLButtonElement>("button").disabled).toBe(false);
});

test("failed saves retain the session and allow a later sign-out attempt", async () => {
  const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  signOut.mockRejectedValue(new Error("offline"));
  render(
    <NavigationGuardProvider>
      <EditorGuard save={save} />
      <SignOutButton />
    </NavigationGuardProvider>,
  );
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign out" })));
  expect(signOut).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign out" })));
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("alert").textContent).toBe(
    "Could not connect. Please try signing out again.",
  );
  expect(screen.getByRole<HTMLButtonElement>("button").disabled).toBe(false);
});
