// Server Component: renders My Drive / ancestor / ... / current.
// Ancestors are derived from the folder's materialized path (see page.tsx).
import Link from "next/link";
import type { Folder } from "@/db/schema";

export function Breadcrumbs({ trail }: { trail: Folder[] }) {
  const current = trail.at(-1);
  const ancestors = trail.slice(0, -1);

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-zinc-500">
      <Link href="/dashboard" className="hover:text-zinc-900 hover:underline">
        My Drive
      </Link>
      {ancestors.map((folder) => (
        <span key={folder.id} className="flex items-center gap-1">
          <span>/</span>
          <Link
            href={`/dashboard/folder/${folder.id}`}
            className="hover:text-zinc-900 hover:underline"
          >
            {folder.name}
          </Link>
        </span>
      ))}
      {current && (
        <span className="flex items-center gap-1">
          <span>/</span>
          <span className="font-medium text-zinc-900">{current.name}</span>
        </span>
      )}
    </nav>
  );
}
