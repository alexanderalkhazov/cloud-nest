import Link from "next/link";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { QuotaWidget } from "@/features/files/components/QuotaWidget";
import { auth, signOut } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The real auth check (proxy.ts is only the optimistic one).
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <Link href="/dashboard" className="font-semibold">
          CloudNest
        </Link>
        <div className="flex items-center gap-4 text-sm text-zinc-600">
          <span>{session.user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="underline">
              Log out
            </button>
          </form>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200">
          <Sidebar />
          <QuotaWidget userId={session.user.id} />
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
