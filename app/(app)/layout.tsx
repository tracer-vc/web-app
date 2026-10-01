import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/actions/auth";
import { NavLinks } from "./nav-links";

function initials(name: string) {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

// Shell for every signed-in page. Pages still call requireUser() themselves:
// layouts don't re-render on client navigation.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="nav">
        <div className="nav-brand">
          <span className="nav-brand-dot" />
          Tracer
        </div>
        <NavLinks showSettings={user.role === "admin"} />
        <div className="ml-auto flex items-center gap-4 whitespace-nowrap text-xs text-[var(--color-neutral-500)]">
          <span className="tag tag-neutral">
            {user.activeConfigVersion ? `Config v${user.activeConfigVersion}` : "No active config"}
          </span>
          <span>{user.fundName}</span>
          <span
            title={`${user.displayName} (${user.role})`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-neutral-800)] text-[11px] text-[var(--color-neutral-200)]"
          >
            {initials(user.displayName)}
          </span>
          <form action={signOut}>
            <button type="submit" className="btn text-xs">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="w-full max-w-[1440px] flex-1 px-12 pt-12 pb-24">{children}</main>
    </div>
  );
}
