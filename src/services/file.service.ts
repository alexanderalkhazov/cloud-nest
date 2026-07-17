// Business logic for files.
import { fileRepo } from "@/repositories/file.repo";

export const fileService = {
  /** Live, fully-uploaded files visible to the user in a folder. */
  listByFolder(userId: string, folderId: string | null) {
    return fileRepo.listByFolder(userId, folderId);
  },
};
