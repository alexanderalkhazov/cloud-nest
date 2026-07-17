// Data access for folders. Queries only — no permission checks, no path
// computation, no logging; those are service/action concerns.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { folders } from "@/db/schema";

export const folderRepo = {
  async findById(id: string, tx: DbOrTx = db) {
    const [folder] = await tx
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), isNull(folders.deletedAt)))
      .limit(1);
    return folder ?? null;
  },

  /** Live children of a folder (parentId null = root), sorted by name. */
  listChildren(ownerId: string, parentId: string | null, tx: DbOrTx = db) {
    return tx
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.ownerId, ownerId),
          parentId === null
            ? isNull(folders.parentId)
            : eq(folders.parentId, parentId),
          isNull(folders.deletedAt),
        ),
      )
      .orderBy(asc(folders.name));
  },

  /**
   * Ancestors for breadcrumbs. `ids` comes from pathIds(folder.path); the IN
   * query returns them unordered, so callers sort by position in `ids`.
   */
  async findByIds(ids: string[], tx: DbOrTx = db) {
    if (ids.length === 0) return [];
    return tx.select().from(folders).where(inArray(folders.id, ids));
  },
};
