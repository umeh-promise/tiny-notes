import { render, act } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { NavigationGuardProvider, useNavigationGuard } from "./navigation-guard";

test("an obsolete editor cleanup cannot unregister the current editor guard", async () => {
  let navigation: ReturnType<typeof useNavigationGuard> | undefined;
  function Consumer() {
    navigation = useNavigationGuard();
    return null;
  }
  render(
    <NavigationGuardProvider>
      <Consumer />
    </NavigationGuardProvider>,
  );
  if (!navigation) throw new Error("Provider was not mounted");
  const first = vi.fn();
  const latest = vi.fn();
  const leave = vi.fn();
  const unregisterFirst = navigation.register(first);
  const unregisterLatest = navigation.register(latest);
  unregisterFirst();
  await act(() => navigation?.navigate(leave));
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledExactlyOnceWith(leave);
  expect(leave).not.toHaveBeenCalled();
  unregisterLatest();
  await act(() => navigation?.navigate(leave));
  expect(leave).toHaveBeenCalledTimes(1);
});
