// Business logic for user accounts. Owns the registration rules: password
// hashing and the invariant that a user and their storage_usage row are
// created atomically.
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { env } from "@/lib/env";
import { userRepo } from "@/repositories/user.repo";
import { quotaRepo } from "@/repositories/quota.repo";

/** Thrown when the email is already registered; actions translate it to UI copy. */
export class EmailTakenError extends Error {
  constructor() {
    super("email already registered");
  }
}

function isUniqueViolation(e: unknown): boolean {
  // Drizzle 1.x wraps driver errors: the Postgres code lives on the cause
  // chain (DrizzleQueryError → postgres.PostgresError), so walk it.
  for (let cur = e; typeof cur === "object" && cur !== null; cur = (cur as Error).cause) {
    if ("code" in cur && cur.code === "23505") return true;
  }
  return false;
}

export const userService = {
  /** User if email + password match, else null (same answer for unknown email). */
  async verifyCredentials(email: string, password: string) {
    const user = await userRepo.findByEmail(email);
    // OAuth-only accounts have no passwordHash → same generic failure
    if (!user?.passwordHash) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  },

  async register(input: { name: string; email: string; password: string }) {
    const passwordHash = await bcrypt.hash(input.password, 10);

    try {
      // The rule "every user gets a quota row" lives here, atomically.
      return await db.transaction(async (tx) => {
        const user = await userRepo.create(
          { name: input.name, email: input.email, passwordHash },
          tx,
        );
        await quotaRepo.createForUser(user.id, env.DEFAULT_QUOTA_BYTES, tx);
        return user;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new EmailTakenError();
      throw e;
    }
  },
};
