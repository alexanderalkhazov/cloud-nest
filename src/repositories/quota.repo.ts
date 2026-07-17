// Data access for storage_usage.
import { eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { storageUsage } from "@/db/schema";

export const quotaRepo = {
  async createForUser(userId: string, quotaBytes: number, tx: DbOrTx = db) {
    await tx.insert(storageUsage).values({ userId, quotaBytes });
  },

  async getUsage(userId: string, tx: DbOrTx = db) {
    const [usage] = await tx
      .select()
      .from(storageUsage)
      .where(eq(storageUsage.userId, userId))
      .limit(1);
    return usage ?? null;
  },
};
