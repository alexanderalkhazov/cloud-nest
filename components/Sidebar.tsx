"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "My Drive" },
  { href: "/dashboard/shared", label: "Shared with me" },
  { href: "/dashboard/starred", label: "Starred" },
  { href: "/dashboard/trash", label: "Trash" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200 p-4">
      <nav className="flex flex-col gap-1 text-sm">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-2 ${
                active ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
