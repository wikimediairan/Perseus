import { getQuotaStatus, mondayOfWeekUtc } from "@/repositories/quota";
import type { UserRow } from "@/repositories/usersRepo";

function nextWeeklyEvaluationIso(now: Date): string {
  const monday = mondayOfWeekUtc(now);
  const candidate = new Date(monday);
  candidate.setUTCHours(4, 0, 0, 0);

  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
  }

  return candidate.toISOString();
}

export interface DashboardUsage {
  weeklyCredit: number;
  usedThisWeek: number;
  remainingThisWeek: number;
  nextEvaluationAt: string;
}

/** Usage is keyed directly on `users.id` now (see migration
 * 0002_remove_api_keys.sql) -- an active user always has usage to show,
 * with no credential lookup in between. */
export async function getDashboardUsage(
  db: D1Database,
  user: UserRow,
  now: Date = new Date(),
): Promise<DashboardUsage> {
  const status = await getQuotaStatus(db, user.id, user.weeklyCredit, now);

  return {
    weeklyCredit: user.weeklyCredit,
    usedThisWeek: status.costUsed,
    remainingThisWeek: status.remainingCost,
    nextEvaluationAt: nextWeeklyEvaluationIso(now),
  };
}
