"use client";

import { useId } from "react";

// A section title that explains itself on hover or keyboard focus.
export function Hint({ info, children }: { info?: string; children: React.ReactNode }) {
  const id = useId();
  if (!info) return <>{children}</>;
  return (
    <span className="group/tip relative inline-flex items-center gap-2">
      <span
        tabIndex={0}
        aria-describedby={id}
        className="inline-flex cursor-help items-center gap-2 rounded-sm underline decoration-[var(--color-neutral-600)] decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-chip)] print:no-underline"
      >
        {children}
      </span>
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none invisible absolute top-full left-0 z-30 mt-2 w-72 rounded-[10px] border border-[var(--color-neutral-800)] bg-[var(--color-surface)] px-3.5 py-2.5 text-body leading-relaxed font-normal text-[var(--color-neutral-300)] opacity-0 shadow-[0_8px_24px_rgb(23_32_42/0.1),0_1px_2px_rgb(23_32_42/0.06)] transition-opacity duration-150 group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:opacity-100 print:hidden"
      >
        {info}
      </span>
    </span>
  );
}
