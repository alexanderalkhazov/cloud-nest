// Server Component: storage usage bar for the sidebar.
import { quotaService } from "@/services/quota.service";
import { formatBytes } from "@/lib/utils";

export async function QuotaWidget({ userId }: { userId: string }) {
  const usage = await quotaService.getUsage(userId);
  if (!usage) return null;

  const percent = Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100);

  return (
    <div className="border-t border-zinc-200 p-4 text-xs text-zinc-500">
      <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full ${percent > 90 ? "bg-red-500" : "bg-zinc-900"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {formatBytes(usage.usedBytes)} of {formatBytes(usage.quotaBytes)} used
    </div>
  );
}
