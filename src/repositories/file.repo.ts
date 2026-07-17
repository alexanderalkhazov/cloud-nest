// Data access for files. Queries only.
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { files } from "@/db/schema";

export const fileRepo = {
  /** Live, fully-uploaded files in a folder (folderId null = root). */
  listByFolder(ownerId: string, folderId: string | null, tx: DbOrTx = db) {
    return tx
      .select()
      .from(files)
      .where(
        and(
          eq(files.ownerId, ownerId),
          folderId === null
            ? isNull(files.folderId)
            : eq(files.folderId, folderId),
          eq(files.status, "ready"),
          isNull(files.deletedAt),
        ),
      )
      .orderBy(asc(files.name));
  },
};
