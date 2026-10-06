"use client";

import { createContext, useContext } from "react";

// The user's dev-mode preference (Settings → Preferences), for client
// components that show developer views such as the model calls of a run.
const DevModeContext = createContext(false);

export function DevModeProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return <DevModeContext value={enabled}>{children}</DevModeContext>;
}

export function useDevMode() {
  return useContext(DevModeContext);
}
