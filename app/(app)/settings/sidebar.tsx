"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LuArrowLeft, LuSlidersHorizontal, LuUsers } from "react-icons/lu";
import { NavHighlight } from "@/app/motion";
import { CONFIG_SECTIONS, toConfigSection } from "./config-sections";
import { useUnsaved } from "./unsaved";

const CONFIG_PATH = "/settings/config";

// Settings navigation: fixed to the left edge below the top bar on wide
// screens, a plain list above the content on narrow ones.
export function SettingsSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { dirty } = useUnsaved();
  const onConfig = pathname === CONFIG_PATH;
  const section = toConfigSection(params.get("section"));

  // Leaving the config editor drops unsaved draft changes.
  const guard = (e: React.MouseEvent) => {
    if (onConfig && dirty && !confirm("Leave without saving? Unsaved changes to the draft are lost.")) {
      e.preventDefault();
    }
  };

  // Switching sections stays on the page (no server round trip), so the editor
  // keeps its unsaved changes; ?v=N (a read-only version) is kept.
  const sectionHref = (key: string) => {
    const next = new URLSearchParams(onConfig ? params.toString() : "");
    next.set("section", key);
    return `${CONFIG_PATH}?${next}`;
  };
  const openSection = (e: React.MouseEvent, href: string) => {
    if (!onConfig || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    window.history.pushState(null, "", href);
  };

  return (
    <aside className="app-sidebar print:hidden" aria-label="Settings">
      {/* Same back link as the deal sidebar; asks first if draft edits are unsaved. */}
      <Link href="/deals" onClick={guard} className="sidebar-item mb-3 w-fit text-meta">
        <LuArrowLeft aria-hidden className="h-3.5 w-3.5" />
        All deals
      </Link>
      <div className="mb-4 px-2.5 text-section font-semibold">Settings</div>

      <div className="sidebar-group">Account</div>
      <Link
        href="/settings"
        onClick={guard}
        aria-current={pathname === "/settings" ? "page" : undefined}
        className="sidebar-item"
      >
        {pathname === "/settings" && <NavHighlight id="settings-nav" />}
        <LuSlidersHorizontal aria-hidden className="sidebar-icon" />
        Preferences
      </Link>

      {isAdmin && (
        <>
          <div className="sidebar-group">Fund</div>
          <Link
            href="/settings/team"
            onClick={guard}
            aria-current={pathname === "/settings/team" ? "page" : undefined}
            className="sidebar-item"
          >
            {pathname === "/settings/team" && <NavHighlight id="settings-nav" />}
            <LuUsers aria-hidden className="sidebar-icon" />
            Team
          </Link>

          <div className="sidebar-group">Fund configuration</div>
          {CONFIG_SECTIONS.map(([key, label]) => {
            const href = sectionHref(key);
            return (
              <Link
                key={key}
                href={href}
                onClick={(e) => openSection(e, href)}
                aria-current={onConfig && section === key ? "page" : undefined}
                className="sidebar-item"
                data-testid={`settings-section-${key}`}
              >
                {onConfig && section === key && <NavHighlight id="settings-nav" />}
                {label}
              </Link>
            );
          })}

          <div className="text-muted mx-2.5 mt-6 rounded-[4px] border border-[var(--color-line)] bg-[var(--color-subtle)] p-2.5 text-meta leading-normal">
            <div className="mb-1 font-medium text-[var(--color-neutral-300)]">Fixed mechanism (not configurable)</div>
            Mandatory C# on every statement · mandatory S# + excerpt on Facts and Inferences · three claim types ·
            mandatory conflict status · outputs rendered from claims · identifier scheme
          </div>
        </>
      )}
    </aside>
  );
}
