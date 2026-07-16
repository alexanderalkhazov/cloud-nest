import Link from "next/link";

export default function RegisterPage() {
  return (
    <form className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <input
        type="text"
        placeholder="Name"
        className="rounded-md border border-zinc-300 px-3 py-2"
      />
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
        Sign up
      </button>
      <p className="text-sm text-zinc-600">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
