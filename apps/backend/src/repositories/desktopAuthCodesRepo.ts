export interface DesktopAuthCodeRow {
  codeHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
}

export async function createDesktopAuthCode(
  db: D1Database,
  codeHash: string,
  userId: string,
  ttlMs: number,
  now: Date = new Date(),
): Promise<void> {
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

  await db
    .prepare(
      `INSERT INTO desktop_auth_codes (code_hash, user_id, created_at, expires_at, redeemed_at)
			 VALUES (?, ?, ?, ?, NULL)`,
    )
    .bind(codeHash, userId, now.toISOString(), expiresAt)
    .run();
}

/**
 * Atomically finds-and-redeems a still-valid (unexpired, not already
 * redeemed) code in one statement, so two near-simultaneous exchange
 * attempts for the same code can't both succeed -- the code is the only
 * thing standing between "a redirect URI" and "a live session", so it
 * must be genuinely single-use.
 */
export async function redeemDesktopAuthCode(
  db: D1Database,
  codeHash: string,
  now: Date = new Date(),
): Promise<DesktopAuthCodeRow | null> {
  const row = await db
    .prepare(
      `UPDATE desktop_auth_codes
			 SET redeemed_at = ?
			 WHERE code_hash = ? AND redeemed_at IS NULL AND expires_at > ?
			 RETURNING code_hash AS codeHash, user_id AS userId, created_at AS createdAt, expires_at AS expiresAt, redeemed_at AS redeemedAt`,
    )
    .bind(now.toISOString(), codeHash, now.toISOString())
    .first<DesktopAuthCodeRow>();

  return row ?? null;
}
