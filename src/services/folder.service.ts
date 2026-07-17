// Business logic for folders: access decisions and path/tree computations.
import type { Folder } from "@/db/schema";
import { pathIds } from "@/db/path";
import { folderRepo } from "@/repositories/folder.repo";

export const folderService = {
  /**
   * The folder, if it exists and the user may view it — owner-only until the
   * Day 9 permission service adds shares. Returns null otherwise so callers
   * render 404 without revealing whether the id exists.
   */
  async getAccessibleFolder(userId: string, folderId: string) {
    const folder = await folderRepo.findById(folderId);
    if (!folder || folder.ownerId !== userId) return null;
    return folder;
  },

  listChildren(userId: string, parentId: string | null) {
    return folderRepo.listChildren(userId, parentId);
  },

  /** Ancestor chain (root → folder itself), derived from the materialized path. */
  async getBreadcrumbTrail(folder: Folder): Promise<Folder[]> {
    const ids = pathIds(folder.path);
    const rows = await folderRepo.findByIds(ids);
    return ids
      .map((id) => rows.find((f) => f.id === id))
      .filter((f): f is Folder => f !== undefined);
  },
};
