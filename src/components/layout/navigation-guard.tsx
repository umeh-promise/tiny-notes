"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type Navigation = () => Promise<void>;
type Guard = (navigate: Navigation) => Promise<void>;
type NavigationGuard = {
  register: (guard: Guard) => () => void;
  navigate: (navigation: Navigation) => Promise<void>;
};

const Context = createContext<NavigationGuard | null>(null);

/** Lets the mounted editor save before shared controls, such as sign-out, leave it. */
export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [guard] = useState<NavigationGuard>(() => {
    let current: Guard | null = null;
    return {
      register(handler) {
        current = handler;
        return () => {
          if (current === handler) current = null;
        };
      },
      async navigate(navigation) {
        if (current) await current(navigation);
        else await navigation();
      },
    };
  });
  return <Context.Provider value={guard}>{children}</Context.Provider>;
}

export function useNavigationGuard(): NavigationGuard {
  const guard = useContext(Context);
  if (!guard) throw new Error("NavigationGuardProvider is missing.");
  return guard;
}
