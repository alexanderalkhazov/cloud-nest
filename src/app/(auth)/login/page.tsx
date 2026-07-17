"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginUser } from "@/features/auth/actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginUser, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Log in</h1>
      <input
        name="email"
        type="email"
        placeholder="Email"
        required
        className="rounded-md border border-zinc-300 px-3 py-2"
      />
      <input
        name="password"
        type="password"
        placeholder="Password"
        required
        className="rounded-md border border-zinc-300 px-3 py-2"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Logging in…" : "Log in"}
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
