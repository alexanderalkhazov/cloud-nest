// Async Server Component: fetches and renders one folder's contents.
// Rendered inside <Suspense> by the pages, so the shell (header, sidebar,
// breadcrumbs) streams first and this fills in when the queries resolve.
import Link from "next/link";
import { folderService } from "@/services/folder.service";
import { fileService } from "@/services/file.service";
import { fileEmoji, formatBytes } from "@/lib/utils";

export async function FolderBrowser({
  ownerId,
  folderId,
}: {
  ownerId: string;
  folderId: string | null;
}) {
  // Independent queries — run them in parallel, not one await after another
  const [childFolders, childFiles] = await Promise.all([
    folderService.listChildren(ownerId, folderId),
    fileService.listByFolder(ownerId, folderId),
  ]);

  if (childFolders.length === 0 && childFiles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-zinc-400">
        <span className="text-4xl">🗂️</span>
        <p>This folder is empty</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {childFolders.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Folders
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {childFolders.map((folder) => (
              <Link
                key={folder.id}
                href={`/dashboard/folder/${folder.id}`}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-3 hover:border-zinc-400 hover:bg-zinc-50"
              >
                <span>📁</span>
                <span className="truncate text-sm font-medium">{folder.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {childFiles.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Files
          </h2>
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {childFiles.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-zinc-50"
              >
                <span>{fileEmoji(file.mimeType)}</span>
                <span className="flex-1 truncate font-medium">{file.name}</span>
                <span className="w-20 text-right text-zinc-500">
                  {formatBytes(file.sizeBytes)}
                </span>
                <span className="hidden w-28 text-right text-zinc-400 sm:block">
                  {file.updatedAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function FolderBrowserSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-100" />
      ))}
    </div>
  );
}
