export default async function FolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Folder {folderId}</h1>
      <p className="text-sm text-zinc-600">This folder is empty.</p>
    </div>
  );
}
