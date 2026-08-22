export async function recordUsageEvent(
  db: D1Database,
  userId: string,
  cost: number,
  now: Date = new Date(),
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO usage_events (id, user_id, cost, created_at) VALUES (?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), userId, cost, now.toISOString())
    .run();
}

export async function sumUsageBetween(
  db: D1Database,
  userId: string,
  startIso: string,
  endIso: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(cost), 0) AS total FROM usage_events
			 WHERE user_id = ? AND created_at >= ? AND created_at < ?`,
    )
    .bind(userId, startIso, endIso)
    .first<{ total: number }>();

  return row?.total ?? 0;
}
