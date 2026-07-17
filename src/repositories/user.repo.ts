// Data access for users. Queries only — hashing and validation live upstream.
import { eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { users } from "@/db/schema";

export const userRepo = {
  async findByEmail(email: string, tx: DbOrTx = db) {
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user ?? null;
  },

  async create(
    data: { name: string; email: string; passwordHash: string },
    tx: DbOrTx = db,
  ) {
    const [user] = await tx.insert(users).values(data).returning();
    return user;
  },
};
