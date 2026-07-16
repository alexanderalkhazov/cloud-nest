import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-24">
      <Link href="/" className="mb-8 font-semibold">
        CloudNest
      </Link>
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 p-6">
        {children}
      </div>
    </div>
  );
}
