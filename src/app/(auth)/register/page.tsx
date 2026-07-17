"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerUser } from "@/features/auth/actions";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerUser, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <input
        name="name"
        type="text"
        placeholder="Name"
        required
        className="rounded-md border border-zinc-300 px-3 py-2"
      />
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
        placeholder="Password (min. 8 characters)"
        required
        minLength={8}
        className="rounded-md border border-zinc-300 px-3 py-2"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Creating account…" : "Sign up"}
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
