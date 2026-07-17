import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { folderService } from "@/services/folder.service";
import { Breadcrumbs } from "@/features/folders/components/Breadcrumbs";
import {
  FolderBrowser,
  FolderBrowserSkeleton,
} from "@/features/folders/components/FolderBrowser";

export default async function FolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;

  const session = await auth();
  if (!session?.user) redirect("/login");

  // Access decision lives in the service; 404 (not 403) on foreign folders
  // so we don't reveal that the id exists.
  const folder = await folderService.getAccessibleFolder(session.user.id, folderId);
  if (!folder) notFound();

  const trail = await folderService.getBreadcrumbTrail(folder);

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs trail={trail} />
      <h1 className="text-xl font-semibold">{folder.name}</h1>
      <Suspense fallback={<FolderBrowserSkeleton />}>
        <FolderBrowser ownerId={session.user.id} folderId={folder.id} />
      </Suspense>
    </div>
  );
}
