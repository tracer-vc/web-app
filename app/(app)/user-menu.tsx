"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { LuLogOut, LuSettings, LuUsers } from "react-icons/lu";
import { signOut } from "@/app/actions/auth";

type Props = {
  displayName: string;
  email: string | null;
  role: "admin" | "analyst";
  fundName: string;
};

function initials(name: string) {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return (
    parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)
  ).toUpperCase();
}

// Avatar button in the top bar: account details, Settings and Sign out.
export function UserMenu({ displayName, email, role, fundName }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close on navigation, outside click and Escape.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        data-testid="user-menu"
        className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-meta font-medium transition-colors ${
          open
            ? "bg-[var(--color-accent-tint)] text-[var(--color-accent-text)] ring-2 ring-[var(--color-accent-chip)]"
            : "bg-[var(--color-neutral-800)] text-[var(--color-neutral-200)] hover:bg-[var(--color-neutral-700)]"
        }`}
      >
        {initials(displayName)}
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            role="menu"
            className="menu absolute top-full right-0 mt-2 w-64 origin-top-right"
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.16 }}
          >
            <div className="border-b border-[var(--color-neutral-800)] px-3 pt-2.5 pb-3">
              <div className="truncate text-body font-medium text-[var(--color-text)]">
                {displayName}
              </div>
              {email && (
                <div className="text-muted truncate text-meta">{email}</div>
              )}
              <div className="text-muted mt-1 text-meta">
                {fundName} · {role === "admin" ? "Admin" : "Analyst"}
              </div>
            </div>
            <div className="py-1">
              <Link href="/settings" role="menuitem" className="menu-item">
                <LuSettings aria-hidden className="menu-icon" />
                Settings
              </Link>
              {role === "admin" && (
                <Link href="/settings/team" role="menuitem" className="menu-item">
                  <LuUsers aria-hidden className="menu-icon" />
                  Team
                </Link>
              )}
            </div>
            <form
              action={signOut}
              className="border-t border-[var(--color-neutral-800)] py-1"
            >
              <button
                type="submit"
                role="menuitem"
                className="menu-item w-full text-left"
              >
                <LuLogOut aria-hidden className="menu-icon" />
                Sign out
              </button>
            </form>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
