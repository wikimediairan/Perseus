const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionRow {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export async function createSession(
  db: D1Database,
  tokenHash: string,
  userId: string,
): Promise<SessionRow> {
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    )
    .bind(tokenHash, userId, nowIso, expiresAt)
    .run();

  return { id: tokenHash, userId, createdAt: nowIso, expiresAt };
}

export async function findValidSession(
  db: D1Database,
  tokenHash: string,
): Promise<SessionRow | null> {
  const row = await db
    .prepare(
      `SELECT id, user_id AS userId, created_at AS createdAt, expires_at AS expiresAt
			 FROM sessions WHERE id = ?`,
    )
    .bind(tokenHash)
    .first<SessionRow>();

  if (!row) return null;
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  return row;
}

export async function deleteSession(
  db: D1Database,
  tokenHash: string,
): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(tokenHash).run();
}
