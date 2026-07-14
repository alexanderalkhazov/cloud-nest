import Link from "next/link";

export default function LoginPage() {
  return (
    <form className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Log in</h1>
      <input
        type="email"
        placeholder="Email"
        className="rounded-md border border-zinc-300 px-3 py-2"
      />
      <input
        type="password"
        placeholder="Password"
        className="rounded-md border border-zinc-300 px-3 py-2"
      />
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-3 py-2 text-white"
      >
        Log in
      </button>
      <p className="text-sm text-zinc-600">
        No account?{" "}
        <Link href="/register" className="underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}
