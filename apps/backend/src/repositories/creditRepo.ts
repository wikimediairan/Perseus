// USAGE is deliberately not a transaction type here -- usage is fully
// tracked in usage_events; this ledger only ever records changes to a
// user's weekly_credit balance itself.
export type CreditTransactionType = "INITIAL" | "INCREASE" | "RELEASE";

export async function recordCreditTransaction(
  db: D1Database,
  userId: string,
  type: CreditTransactionType,
  amount: number,
  now: Date = new Date(),
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO credit_transactions (id, user_id, type, amount, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), userId, type, amount, now.toISOString())
    .run();
}

export interface CreditQueueRow {
  id: string;
  userId: string;
  requestedAmount: number;
  createdAt: string;
  status: "pending" | "processed";
}

export async function enqueueCreditIncrease(
  db: D1Database,
  userId: string,
  requestedAmount: number,
  now: Date = new Date(),
): Promise<void> {
  await db
    .prepare(`
			INSERT INTO credit_queue (id, user_id, requested_amount, created_at, status)
			VALUES (?, ?, ?, ?, 'pending')
		`)
    .bind(crypto.randomUUID(), userId, requestedAmount, now.toISOString())
    .run();
}

export async function listPendingQueueEntries(
  db: D1Database,
): Promise<CreditQueueRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id AS userId, requested_amount AS requestedAmount,
				created_at AS createdAt, status
			 FROM credit_queue WHERE status = 'pending' ORDER BY created_at ASC`,
    )
    .all<CreditQueueRow>();
  return results ?? [];
}

export async function markQueueEntryProcessed(
  db: D1Database,
  id: string,
): Promise<void> {
  await db
    .prepare(`UPDATE credit_queue SET status = 'processed' WHERE id = ?`)
    .bind(id)
    .run();
}

/** Whether a user already has a pending queue entry (avoid duplicate queueing). */
export async function hasPendingQueueEntry(
  db: D1Database,
  userId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS found FROM credit_queue WHERE user_id = ? AND status = 'pending' LIMIT 1`,
    )
    .bind(userId)
    .first<{ found: number }>();
  return row !== null;
}

export interface CreditTransactionRow {
  id: string;
  userId: string;
  type: CreditTransactionType;
  amount: number;
  createdAt: string;
}

const TRANSACTION_COLUMNS = `
	id, user_id AS userId, type, amount, created_at AS createdAt
`;

/** This user's full credit ledger, newest first -- the audit trail behind
 * their current `weekly_credit`. */
export async function listCreditTransactionsForUser(
  db: D1Database,
  userId: string,
  limit = 100,
): Promise<CreditTransactionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${TRANSACTION_COLUMNS} FROM credit_transactions
			 WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(userId, limit)
    .all<CreditTransactionRow>();
  return results ?? [];
}

/** Most recent transactions across all users, for the admin credits
 * overview -- same columns/shape as the per-user view above. */
export async function listRecentCreditTransactions(
  db: D1Database,
  limit = 100,
): Promise<CreditTransactionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${TRANSACTION_COLUMNS} FROM credit_transactions
			 ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<CreditTransactionRow>();
  return results ?? [];
}

export interface CreditQueueWithUserRow extends CreditQueueRow {
  wikimediaUsername: string | null;
}

/** The credit queue for the admin view -- unlike `listPendingQueueEntries`
 * (used internally by the weekly cron, pending-only), this includes
 * already-processed entries too so an admin can see queue history, not
 * just what's currently waiting. */
export async function listCreditQueueEntries(
  db: D1Database,
  limit = 200,
): Promise<CreditQueueWithUserRow[]> {
  const { results } = await db
    .prepare(`
			SELECT
				credit_queue.id AS id,
				credit_queue.user_id AS userId,
				credit_queue.requested_amount AS requestedAmount,
				credit_queue.created_at AS createdAt,
				credit_queue.status AS status,
				users.wikimedia_username AS wikimediaUsername
			FROM credit_queue JOIN users ON users.id = credit_queue.user_id
			ORDER BY credit_queue.created_at DESC
			LIMIT ?
		`)
    .bind(limit)
    .all<CreditQueueWithUserRow>();
  return results ?? [];
}
