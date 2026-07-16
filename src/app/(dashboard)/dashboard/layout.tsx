import Link from "next/link";
import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <Link href="/dashboard" className="font-semibold">
          CloudNest
        </Link>
        <Link href="/login" className="text-sm text-zinc-600">
          Log out
        </Link>
      </header>
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
