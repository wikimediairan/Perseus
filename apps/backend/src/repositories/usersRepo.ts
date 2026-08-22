// A "user" is any principal with a weekly credit budget, created via
// Wikimedia OAuth (wikimedia_user_id/wikimedia_username set) the moment
// they complete login -- see upsertWikimediaUser below.
export type UserStatus = "pending" | "active" | "disabled" | "rejected";

export interface UserRow {
  id: string;
  wikimediaUserId: string | null;
  wikimediaUsername: string | null;
  status: UserStatus;
  /** The single source of truth for this user's weekly budget. Nothing
   * else in the schema stores or duplicates this value. */
  weeklyCredit: number;
  lowUsageWeeks: number;
  fullUsageWeeks: number;
  createdAt: string;
  updatedAt: string;
}

const SELECT_COLUMNS = `
	id,
	wikimedia_user_id AS wikimediaUserId,
	wikimedia_username AS wikimediaUsername,
	status,
	weekly_credit AS weeklyCredit,
	low_usage_weeks AS lowUsageWeeks,
	full_usage_weeks AS fullUsageWeeks,
	created_at AS createdAt,
	updated_at AS updatedAt
`;

export async function findUserById(
  db: D1Database,
  id: string,
): Promise<UserRow | null> {
  return await db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first<UserRow>();
}

async function findUserByWikimediaId(
  db: D1Database,
  wikimediaUserId: string,
): Promise<UserRow | null> {
  return await db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM users WHERE wikimedia_user_id = ?`)
    .bind(wikimediaUserId)
    .first<UserRow>();
}

export async function upsertWikimediaUser(
  db: D1Database,
  params: { wikimediaUserId: string; wikimediaUsername: string },
): Promise<UserRow> {
  const existing = await findUserByWikimediaId(db, params.wikimediaUserId);
  if (existing) {
    const nowIso = new Date().toISOString();
    // Wikimedia usernames can change; keep it current on every login.
    await db
      .prepare(
        `UPDATE users SET wikimedia_username = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(params.wikimediaUsername, nowIso, existing.id)
      .run();
    return { ...existing, wikimediaUsername: params.wikimediaUsername };
  }

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await db
    .prepare(`
			INSERT INTO users (
				id, wikimedia_user_id, wikimedia_username, status,
				weekly_credit, low_usage_weeks, full_usage_weeks,
				created_at, updated_at
			)
			VALUES (?, ?, ?, 'pending', 0, 0, 0, ?, ?)
		`)
    .bind(id, params.wikimediaUserId, params.wikimediaUsername, nowIso, nowIso)
    .run();

  return {
    id,
    wikimediaUserId: params.wikimediaUserId,
    wikimediaUsername: params.wikimediaUsername,
    status: "pending",
    weeklyCredit: 0,
    lowUsageWeeks: 0,
    fullUsageWeeks: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export async function setUserStatus(
  db: D1Database,
  userId: string,
  status: UserStatus,
): Promise<void> {
  await db
    .prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(status, new Date().toISOString(), userId)
    .run();
}

export async function updateUserCreditState(
  db: D1Database,
  userId: string,
  params: {
    weeklyCredit: number;
    lowUsageWeeks: number;
    fullUsageWeeks: number;
    status?: UserStatus;
  },
): Promise<void> {
  await db
    .prepare(`
			UPDATE users
			SET weekly_credit = ?, low_usage_weeks = ?, full_usage_weeks = ?,
				status = COALESCE(?, status), updated_at = ?
			WHERE id = ?
		`)
    .bind(
      params.weeklyCredit,
      params.lowUsageWeeks,
      params.fullUsageWeeks,
      params.status ?? null,
      new Date().toISOString(),
      userId,
    )
    .run();
}

/** Active users with a Wikimedia identity -- i.e. community members. The
 * weekly credit-engine evaluation and the shared-budget calculation both
 * apply only to community members: a service user's weekly credit is a
 * fixed allocation set by an admin, not something the community credit
 * policy (low/full-usage streaks, the shared $10/month pool) should touch. */
export async function listActiveCommunityUsers(
  db: D1Database,
): Promise<UserRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM users WHERE status = 'active' AND wikimedia_user_id IS NOT NULL`,
    )
    .all<UserRow>();
  return results ?? [];
}

/** Sum of weekly_credit across active community members -- the currently
 * allocated portion of the shared monthly budget. Service users' credit is
 * intentionally excluded; their budget isn't drawn from the community pool. */
export async function sumAllocatedCommunityWeeklyCredit(
  db: D1Database,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(weekly_credit), 0) AS total FROM users
			 WHERE status = 'active' AND wikimedia_user_id IS NOT NULL`,
    )
    .first<{ total: number }>();
  return row?.total ?? 0;
}

/** Every user, newest first, for the admin user list. Perseus's user count
 * is small (community-sized), so a single unpaginated page is fine for
 * now -- `limit` exists as a safety cap, not because pagination is
 * actually needed yet. */
export async function listAllUsers(
  db: D1Database,
  limit = 500,
): Promise<UserRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM users ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<UserRow>();
  return results ?? [];
}
