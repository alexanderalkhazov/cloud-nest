export default function SettingsPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Settings</h1>
      <div className="max-w-sm space-y-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-600">Name</label>
          <input className="w-full rounded-md border border-zinc-300 px-3 py-2" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600">Email</label>
          <input className="w-full rounded-md border border-zinc-300 px-3 py-2" />
        </div>
      </div>
    </div>
  );
}
