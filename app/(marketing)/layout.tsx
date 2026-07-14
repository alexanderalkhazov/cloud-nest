import Link from "next/link";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <Link href="/" className="font-semibold">
          CloudNest
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/pricing">Pricing</Link>
          <Link href="/login">Log in</Link>
          <Link
            href="/register"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-white"
          >
            Sign up
          </Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
