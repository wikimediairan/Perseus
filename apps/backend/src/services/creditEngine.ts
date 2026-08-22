import {
  CREDIT_INCREMENT,
  FULL_USAGE_WEEKS_LIMIT,
  INITIAL_WEEKLY_CREDIT,
  LOW_USAGE_THRESHOLD,
  LOW_USAGE_WEEKS_LIMIT,
  MAX_WEEKLY_CREDIT,
  MONTHLY_BUDGET,
} from "@/constants/credit";
import {
  enqueueCreditIncrease,
  hasPendingQueueEntry,
  listPendingQueueEntries,
  markQueueEntryProcessed,
  recordCreditTransaction,
} from "@/repositories/creditRepo";
import { mondayOfWeekUtc } from "@/repositories/quota";
import { sumUsageBetween } from "@/repositories/usageRepo";
import {
  findUserById,
  listActiveCommunityUsers,
  setUserStatus,
  sumAllocatedCommunityWeeklyCredit,
  type UserStatus,
  updateUserCreditState,
} from "@/repositories/usersRepo";
import { BackendError } from "@/shared/errors";

interface UserCreditState {
  weeklyCredit: number;
  lowUsageWeeks: number;
  fullUsageWeeks: number;
}

interface WeeklyEvaluationResult {
  weeklyCredit: number;
  lowUsageWeeks: number;
  fullUsageWeeks: number;
  disable: boolean;
  releasedCredit: number;
  increaseApplied: number;
  queuedIncrease: number;
}

const EPSILON = 1e-9;

function evaluateWeeklyUsage(
  state: UserCreditState,
  weeklyUsage: number,
  availableBudget: number,
): WeeklyEvaluationResult {
  const result: WeeklyEvaluationResult = {
    weeklyCredit: state.weeklyCredit,
    lowUsageWeeks: state.lowUsageWeeks,
    fullUsageWeeks: state.fullUsageWeeks,
    disable: false,
    releasedCredit: 0,
    increaseApplied: 0,
    queuedIncrease: 0,
  };

  const isLowUsage = weeklyUsage < LOW_USAGE_THRESHOLD - EPSILON;
  const isFullUsage = weeklyUsage >= state.weeklyCredit - EPSILON;

  if (isLowUsage) {
    result.lowUsageWeeks = state.lowUsageWeeks + 1;
    result.fullUsageWeeks = 0;

    if (result.lowUsageWeeks >= LOW_USAGE_WEEKS_LIMIT) {
      result.disable = true;
      result.releasedCredit = state.weeklyCredit;
      result.weeklyCredit = 0;
    }

    return result;
  }

  if (isFullUsage) {
    result.fullUsageWeeks = state.fullUsageWeeks + 1;
    result.lowUsageWeeks = 0;

    if (result.fullUsageWeeks >= FULL_USAGE_WEEKS_LIMIT) {
      // Streak requirement consumed either way: applied, queued, or
      // already at the cap.
      result.fullUsageWeeks = 0;

      const headroom = MAX_WEEKLY_CREDIT - state.weeklyCredit;
      if (headroom >= CREDIT_INCREMENT - EPSILON) {
        if (availableBudget >= CREDIT_INCREMENT - EPSILON) {
          result.weeklyCredit = state.weeklyCredit + CREDIT_INCREMENT;
          result.increaseApplied = CREDIT_INCREMENT;
        } else {
          result.queuedIncrease = CREDIT_INCREMENT;
        }
      }
    }

    return result;
  }

  result.lowUsageWeeks = 0;
  result.fullUsageWeeks = 0;
  return result;
}

async function getAvailableBudget(db: D1Database): Promise<number> {
  const allocated = await sumAllocatedCommunityWeeklyCredit(db);
  return MONTHLY_BUDGET - allocated;
}

/**
 * Self-service: lets a `rejected` user re-enter the review queue by
 * moving themselves back to `pending`, without any admin action. This
 * is the entire "access request" flow now that api_keys/key_requests
 * are gone (see migration 0002_remove_api_keys.sql) -- a brand-new
 * user already starts at `pending` the moment they complete Wikimedia
 * OAuth (see usersRepo.upsertWikimediaUser), so there is nothing left
 * to "request" at that point; only a `rejected` user has a status to
 * move out of. `disabled` users are deliberately not handled here at
 * all -- disabled is not self-service, matching "Disabled users cannot
 * create a new access request."
 */
export async function requestAccessReview(
  db: D1Database,
  userId: string,
): Promise<void> {
  const user = await findUserById(db, userId);
  if (!user) {
    throw new BackendError("NotFoundError", "User not found.");
  }

  if (user.status !== "rejected") {
    throw new BackendError(
      "ConflictError",
      `Only a rejected user can request another review (current status: ${user.status}).`,
    );
  }

  await setUserStatus(db, userId, "pending");
}

/**
 * Admin-driven status change (the `POST /admin/users/:id/status` action)
 * -- also now the only path to `active`, since there is no separate
 * "approve key request" step anymore (api_keys is gone; see migration
 * 0002_remove_api_keys.sql). Moving a user to `active` for the first
 * time (or after their credit was fully released -- pending/disabled/
 * rejected all zero it out, see the branch below) grants the same
 * `INITIAL_WEEKLY_CREDIT`, under the same community-budget guard, that
 * `approveKeyRequest` used to grant; a user who is already active and
 * simply gets re-confirmed active is left alone.
 *
 * Moving to any non-active status releases the user's `weekly_credit`
 * to 0 with a recorded RELEASE transaction, mirroring exactly what
 * `runWeeklyEvaluation`'s automatic disable does -- so
 * `sumAllocatedCommunityWeeklyCredit` never overcounts a user who no
 * longer has service access.
 */
export async function adminSetUserStatus(
  db: D1Database,
  userId: string,
  status: UserStatus,
): Promise<void> {
  const user = await findUserById(db, userId);
  if (!user) {
    throw new BackendError("NotFoundError", "User not found.");
  }

  if (status === "active") {
    if (user.weeklyCredit > EPSILON) {
      await setUserStatus(db, userId, "active");
      return;
    }

    const available = await getAvailableBudget(db);
    if (available < INITIAL_WEEKLY_CREDIT - EPSILON) {
      throw new BackendError(
        "ConflictError",
        "Insufficient community budget to activate this user.",
      );
    }

    await updateUserCreditState(db, userId, {
      weeklyCredit: INITIAL_WEEKLY_CREDIT,
      lowUsageWeeks: 0,
      fullUsageWeeks: 0,
      status: "active",
    });
    await recordCreditTransaction(db, userId, "INITIAL", INITIAL_WEEKLY_CREDIT);
    return;
  }

  if (user.weeklyCredit > 0) {
    await recordCreditTransaction(db, userId, "RELEASE", user.weeklyCredit);
    await updateUserCreditState(db, userId, {
      weeklyCredit: 0,
      lowUsageWeeks: 0,
      fullUsageWeeks: 0,
      status,
    });
  } else {
    await setUserStatus(db, userId, status);
  }
}

export async function runWeeklyEvaluation(
  db: D1Database,
  now: Date = new Date(),
): Promise<void> {
  const thisMonday = mondayOfWeekUtc(now);
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);

  const weekStartIso = lastMonday.toISOString();
  const weekEndIso = thisMonday.toISOString();

  let availableBudget = await getAvailableBudget(db);
  const users = await listActiveCommunityUsers(db);

  for (const user of users) {
    const weeklyUsage = await sumUsageBetween(
      db,
      user.id,
      weekStartIso,
      weekEndIso,
    );

    const result = evaluateWeeklyUsage(
      {
        weeklyCredit: user.weeklyCredit,
        lowUsageWeeks: user.lowUsageWeeks,
        fullUsageWeeks: user.fullUsageWeeks,
      },
      weeklyUsage,
      availableBudget,
    );

    await updateUserCreditState(db, user.id, {
      weeklyCredit: result.weeklyCredit,
      lowUsageWeeks: result.lowUsageWeeks,
      fullUsageWeeks: result.fullUsageWeeks,
      status: result.disable ? "disabled" : undefined,
    });

    if (result.disable) {
      await recordCreditTransaction(
        db,
        user.id,
        "RELEASE",
        result.releasedCredit,
      );
      availableBudget += result.releasedCredit;
    }

    if (result.increaseApplied > 0) {
      await recordCreditTransaction(
        db,
        user.id,
        "INCREASE",
        result.increaseApplied,
      );
      availableBudget -= result.increaseApplied;
    }

    if (
      result.queuedIncrease > 0 &&
      !(await hasPendingQueueEntry(db, user.id))
    ) {
      await enqueueCreditIncrease(db, user.id, result.queuedIncrease);
    }
  }

  await processCreditQueue(db);
}

export async function processCreditQueue(db: D1Database): Promise<void> {
  let availableBudget = await getAvailableBudget(db);
  const entries = await listPendingQueueEntries(db);

  for (const entry of entries) {
    if (availableBudget < entry.requestedAmount - EPSILON) {
      continue;
    }

    const user = await findUserById(db, entry.userId);
    if (user?.status !== "active") {
      await markQueueEntryProcessed(db, entry.id);
      continue;
    }

    const newCredit = Math.min(
      user.weeklyCredit + entry.requestedAmount,
      MAX_WEEKLY_CREDIT,
    );
    const actualIncrease = newCredit - user.weeklyCredit;

    if (actualIncrease > EPSILON) {
      await updateUserCreditState(db, user.id, {
        weeklyCredit: newCredit,
        lowUsageWeeks: user.lowUsageWeeks,
        fullUsageWeeks: user.fullUsageWeeks,
      });
      await recordCreditTransaction(db, user.id, "INCREASE", actualIncrease);
      availableBudget -= actualIncrease;
    }

    await markQueueEntryProcessed(db, entry.id);
  }
}
