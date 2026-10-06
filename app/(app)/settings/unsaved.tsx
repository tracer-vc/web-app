"use client";

import { createContext, useContext, useState } from "react";

// Lets the config editor tell the settings sidebar it has unsaved changes, so
// leaving for another settings page asks first.
const UnsavedContext = createContext<{ dirty: boolean; setDirty: (dirty: boolean) => void }>({
  dirty: false,
  setDirty: () => {},
});

export function UnsavedProvider({ children }: { children: React.ReactNode }) {
  const [dirty, setDirty] = useState(false);
  return <UnsavedContext value={{ dirty, setDirty }}>{children}</UnsavedContext>;
}

export const useUnsaved = () => useContext(UnsavedContext);
