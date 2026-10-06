"use client";

import { createContext, useContext } from "react";

// Plain language for the config editors: the guided fund setup turns it on so a
// new admin reads everyday words instead of Tracer's terms (Claim Table, U#,
// R3...). Settings keeps the precise terms.
const PlainContext = createContext(false);

export function PlainLanguage({ children }: { children: React.ReactNode }) {
  return <PlainContext value={true}>{children}</PlainContext>;
}

// pick(precise, plain): the text for the current mode.
export function usePlain() {
  const plain = useContext(PlainContext);
  return { plain, pick: <T,>(precise: T, simple: T) => (plain ? simple : precise) };
}
