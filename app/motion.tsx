"use client";

import { AnimatePresence, LazyMotion, MotionConfig, m } from "motion/react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// Subtle UI motion (decision 46). Rules: 150–250 ms, ease-out, at most 8px of
// travel, no bounce. Motion only explains a change (something opened, moved
// or replaced); lists and tables never animate row by row. People who ask
// their OS for reduced motion get fades only (reducedMotion="user").
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

// The feature bundle loads after hydration; `m` components render plain
// elements until then.
const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: EASE_OUT }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

const subscribeNothing = () => () => {};

// Side drawer (claim, source, conflict, ... details): slides in from the right
// and out again on close. Stays mounted while it is open, so moving from one
// ID to the next inside it swaps the content without replaying the slide.
// Rendered into <body> so no transformed ancestor can capture it.
export function Drawer({ open, children }: { open: boolean; children: React.ReactNode }) {
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <m.aside
          key="drawer"
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0, transition: { duration: 0.15, ease: "easeIn" } }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
          className="fixed top-0 right-0 z-20 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-[var(--color-divider)] bg-[var(--color-surface)] p-6 shadow-2xl print:hidden"
        >
          {children}
        </m.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// The background of the selected item in a sidebar or segmented control.
// Rendered inside the selected item only; with a shared layoutId it glides to
// the newly selected one. The item needs the nav-highlight host styles
// (.sidebar-item and .seg-opt have them).
export function NavHighlight({ id }: { id: string }) {
  return (
    <m.span
      aria-hidden
      layoutId={id}
      className="nav-highlight"
      transition={{ type: "tween", duration: 0.22, ease: EASE_OUT }}
    />
  );
}

// Content that replaces other content in place (a deal tab, a setup step):
// a short fade with a small rise, or with `x` a small slide in the direction
// of travel. Give it a key so it replays on each change.
export function FadeIn({ children, className, x }: { children: React.ReactNode; className?: string; x?: number }) {
  return (
    <m.div
      className={className}
      initial={x ? { opacity: 0, x } : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
    >
      {children}
    </m.div>
  );
}
