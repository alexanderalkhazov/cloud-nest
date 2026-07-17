"use server";

import { z } from "zod";
import { AuthError } from "next-auth";
import { EmailTakenError, userService } from "@/services/user.service";
import { signIn } from "@/lib/auth";

const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

export type AuthFormState = { error?: string };

export async function registerUser(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { email, password } = parsed.data;

  try {
    await userService.register(parsed.data);
  } catch (e) {
    if (e instanceof EmailTakenError) {
      return { error: "An account with this email already exists" };
    }
    throw e;
  }

  // Log the new user straight in. On success signIn throws a special
  // NEXT_REDIRECT "error" that Next.js turns into the navigation — never
  // catch it, or the redirect silently dies.
  await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  return {}; // unreachable; satisfies the return type
}

export async function loginUser(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/dashboard" });
    return {};
  } catch (e) {
    if (e instanceof AuthError) {
      // Generic message on purpose: don't reveal whether the email exists
      return { error: "Invalid email or password" };
    }
    throw e; // rethrows NEXT_REDIRECT (success) and real errors
  }
}
