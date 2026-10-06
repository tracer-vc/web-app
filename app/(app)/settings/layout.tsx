import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { SettingsSidebar } from "./sidebar";
import { UnsavedProvider } from "./unsaved";

// Settings shell: fixed sidebar (preferences, team, fund configuration) and
// the selected page next to it. Pages check the role again themselves.
export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const user = await requireUser();

  return (
    <UnsavedProvider>
      <Suspense>
        <SettingsSidebar isAdmin={user.role === "admin"} />
      </Suspense>
      <div className="md:ml-[264px]">{children}</div>
    </UnsavedProvider>
  );
}
