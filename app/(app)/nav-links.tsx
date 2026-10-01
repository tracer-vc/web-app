"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ showSettings }: { showSettings: boolean }) {
  const pathname = usePathname();
  const links = [
    { href: "/deals", label: "Deals" },
    ...(showSettings ? [{ href: "/settings", label: "Fund settings" }] : []),
  ];

  return links.map(({ href, label }) => (
    <Link
      key={href}
      href={href}
      aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
    >
      {label}
    </Link>
  ));
}
