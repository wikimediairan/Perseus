/**
 * adminService.ts
 *
 * Orchestration for the admin area: routes (JSON API + the HTML admin
 * page) call into this file, this file calls the repositories. Keeps
 * SQL out of routes/views and keeps views free of business rules (e.g.
 * "activating a user grants their initial credit" lives in
 * creditEngine.adminSetUserStatus, not here or in a view).
 */
import {
  type CreditQueueWithUserRow,
  type CreditTransactionRow,
  listCreditQueueEntries,
  listCreditTransactionsForUser,
  listRecentCreditTransactions,
} from "@/repositories/creditRepo";
import { getQuotaStatus } from "@/repositories/quota";
import {
  findUserById,
  listAllUsers,
  type UserRow,
} from "@/repositories/usersRepo";
import {
  adminSetUserStatus,
  processCreditQueue,
} from "@/services/creditEngine";
import { BackendError } from "@/shared/errors";

export async function listUsersForAdmin(db: D1Database): Promise<UserRow[]> {
  return await listAllUsers(db);
}

export interface AdminUserDetail {
  user: UserRow;
  usage: {
    usedThisWeek: number;
    remainingThisWeek: number;
    resetsAt: string;
  } | null;
  creditTransactions: CreditTransactionRow[];
}

export async function getUserDetailForAdmin(
  db: D1Database,
  userId: string,
): Promise<AdminUserDetail> {
  const user = await findUserById(db, userId);
  if (!user) {
    throw new BackendError("NotFoundError", "User not found.");
  }

  // Usage is keyed on users.id directly now (see migration
  // 0002_remove_api_keys.sql) -- shown whenever the user is active;
  // a pending/rejected/disabled user has no active-week usage to show.
  const usage =
    user.status === "active"
      ? await getQuotaStatus(db, user.id, user.weeklyCredit)
      : null;

  const creditTransactions = await listCreditTransactionsForUser(db, userId);

  return {
    user,
    usage: usage
      ? {
          usedThisWeek: usage.costUsed,
          remainingThisWeek: usage.remainingCost,
          resetsAt: usage.resetsAt,
        }
      : null,
    creditTransactions,
  };
}

export async function setUserStatusAsAdmin(
  db: D1Database,
  userId: string,
  status: UserRow["status"],
): Promise<void> {
  await adminSetUserStatus(db, userId, status);
}

export async function listCreditTransactionsForAdmin(
  db: D1Database,
  userId?: string,
): Promise<CreditTransactionRow[]> {
  return userId
    ? await listCreditTransactionsForUser(db, userId)
    : await listRecentCreditTransactions(db);
}

export async function listCreditQueueForAdmin(
  db: D1Database,
): Promise<CreditQueueWithUserRow[]> {
  return await listCreditQueueEntries(db);
}

/** Drains as much of the pending credit queue as the current community
 * budget allows -- same logic the weekly cron uses
 * (creditEngine.processCreditQueue), exposed here so an admin can trigger
 * it on demand (e.g. right after disabling a low-usage user frees up
 * budget) instead of waiting for the next scheduled run. */
export async function processCreditQueueAsAdmin(db: D1Database): Promise<void> {
  await processCreditQueue(db);
}
