import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  FolderBrowser,
  FolderBrowserSkeleton,
} from "@/features/folders/components/FolderBrowser";

export default async function MyDrivePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">My Drive</h1>
      <Suspense fallback={<FolderBrowserSkeleton />}>
        <FolderBrowser ownerId={session.user.id} folderId={null} />
      </Suspense>
    </div>
  );
}
