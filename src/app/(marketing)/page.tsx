import Link from "next/link";

export default function LandingPage() {
  return (
    <section className="flex flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-bold">Your files, everywhere.</h1>
      <p className="max-w-md text-zinc-600">
        CloudNest is a simple place to store, organize, and share your files.
      </p>
      <Link
        href="/register"
        className="rounded-md bg-zinc-900 px-4 py-2 text-white"
      >
        Get started
      </Link>
    </section>
  );
}
