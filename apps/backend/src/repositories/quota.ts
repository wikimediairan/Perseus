import { recordUsageEvent, sumUsageBetween } from "@/repositories/usageRepo";

export interface QuotaStatus {
  weekStart: string;
  costUsed: number;
  weeklyLimitCost: number;
  remainingCost: number;
  resetsAt: string;
}

export function mondayOfWeekUtc(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d;
}

function weekStartKey(date: Date): string {
  return mondayOfWeekUtc(date).toISOString().slice(0, 10);
}

function nextResetIso(date: Date): string {
  const monday = mondayOfWeekUtc(date);
  const next = new Date(monday);
  next.setUTCDate(next.getUTCDate() + 7);
  return next.toISOString();
}

/**
 * Weekly cost usage is computed on read by summing `usage_events` for the
 * current week -- there is deliberately no separate materialized rollup
 * table. At Perseus's scale (a small, fixed community budget) a single
 * indexed range-sum on `(user_id, created_at)` is not a meaningful cost,
 * and avoiding a second, hand-synchronized copy of the same number
 * removes a whole class of "the two tables drifted apart" bugs.
 *
 * Keyed on `users.id` directly (not a credential id) -- usage belongs to
 * the Perseus user, full stop, since the API-key removal (see migration
 * 0002_remove_api_keys.sql).
 */
export async function getQuotaStatus(
  db: D1Database,
  userId: string,
  weeklyLimitCost: number,
  now: Date = new Date(),
): Promise<QuotaStatus> {
  const weekStartDate = mondayOfWeekUtc(now);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);

  const costUsed = await sumUsageBetween(
    db,
    userId,
    weekStartDate.toISOString(),
    weekEndDate.toISOString(),
  );

  return {
    weekStart: weekStartKey(now),
    costUsed,
    weeklyLimitCost,
    remainingCost: Math.max(0, weeklyLimitCost - costUsed),
    resetsAt: nextResetIso(now),
  };
}

export async function recordQuotaUsage(
  db: D1Database,
  userId: string,
  cost: number,
  now: Date = new Date(),
): Promise<void> {
  await recordUsageEvent(db, userId, cost, now);
}
