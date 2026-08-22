interface AdminRow {
  userId: string;
  createdAt: string;
  createdBy: string | null;
}

async function findAdminByUserId(
  db: D1Database,
  userId: string,
): Promise<AdminRow | null> {
  return await db
    .prepare(`
			SELECT user_id AS userId, created_at AS createdAt, created_by AS createdBy
			FROM admins WHERE user_id = ?
		`)
    .bind(userId)
    .first<AdminRow>();
}

export async function isAdmin(
  db: D1Database,
  userId: string,
): Promise<boolean> {
  return (await findAdminByUserId(db, userId)) !== null;
}
