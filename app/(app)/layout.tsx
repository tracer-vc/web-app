import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { DevModeProvider } from "./dev-mode";
import { UserMenu } from "./user-menu";

// Shell for every signed-in page. Pages still call requireUser() themselves:
// layouts don't re-render on client navigation.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  // A new fund's admin sets the fund up first (decision 47).
  if (!user.fundSetupDone && user.role === "admin") redirect("/setup");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="nav print:hidden">
        <Link href="/deals" className="nav-brand">
          <span className="nav-brand-dot" />
          Tracer
        </Link>
        <div className="ml-auto flex items-center gap-4 whitespace-nowrap text-meta text-[var(--color-neutral-500)]">
          <span>{user.fundName}</span>
          <UserMenu
            displayName={user.displayName}
            email={user.email}
            role={user.role}
            fundName={user.fundName}
          />
        </div>
      </header>
      {!user.fundSetupDone && (
        <div className="border-b border-[var(--color-neutral-800)] bg-[var(--color-accent-tint)] px-6 py-2.5 text-center text-body text-[var(--color-accent-text)] print:hidden">
          Your fund admin is still setting up {user.fundName}. Deals can be created once the setup is finished.
        </div>
      )}
      <main className="w-full max-w-[1440px] flex-1 px-12 pt-12 pb-24 print:p-0">
        <DevModeProvider enabled={user.devMode}>{children}</DevModeProvider>
      </main>
    </div>
  );
}
