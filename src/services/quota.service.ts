// Business logic for storage quotas. Day 6 adds atomic reserve/release here.
import { quotaRepo } from "@/repositories/quota.repo";

export const quotaService = {
  getUsage(userId: string) {
    return quotaRepo.getUsage(userId);
  },
};
