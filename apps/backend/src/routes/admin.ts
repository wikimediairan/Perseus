/**
 * admin.ts
 *
 * JSON admin API, mounted at /api/admin. Every route requires
 * `requireAdmin` (checked against the `admins` table -- see
 * middleware/adminAuth.ts). This is a thin HTTP wrapper: all business
 * logic lives in services/adminService.ts (which itself delegates to
 * the repositories and, for status changes, to creditEngine) -- no SQL
 * and no admin-only business rules live in this file.
 */

import { PerseusError } from "@perseus/core";
import { Hono } from "hono";
import type { AppEnv } from "@/honoTypes";
import { requireAdmin } from "@/middleware/adminAuth";
import type { UserStatus } from "@/repositories/usersRepo";
import {
  getUserDetailForAdmin,
  listCreditQueueForAdmin,
  listCreditTransactionsForAdmin,
  listUsersForAdmin,
  processCreditQueueAsAdmin,
  setUserStatusAsAdmin,
} from "@/services/adminService";

export const adminRoute = new Hono<AppEnv>();

adminRoute.use("*", requireAdmin);

const VALID_STATUSES: readonly UserStatus[] = [
  "pending",
  "active",
  "disabled",
  "rejected",
];

adminRoute.get("/users", async (c) => {
  const users = await listUsersForAdmin(c.env.DB);
  return c.json({ users });
});

adminRoute.get("/users/:id", async (c) => {
  const detail = await getUserDetailForAdmin(c.env.DB, c.req.param("id"));
  return c.json(detail);
});

adminRoute.post("/users/:id/status", async (c) => {
  const body = await c.req
    .json<{ status?: string }>()
    .catch((): { status?: string } => ({}));

  if (!body.status || !VALID_STATUSES.includes(body.status as UserStatus)) {
    throw new PerseusError(
      "InputError",
      `status must be one of: ${VALID_STATUSES.join(", ")}.`,
    );
  }

  await setUserStatusAsAdmin(
    c.env.DB,
    c.req.param("id"),
    body.status as UserStatus,
  );
  return c.json({ status: "ok" });
});

adminRoute.get("/credits/transactions", async (c) => {
  const userId = c.req.query("userId");
  const transactions = await listCreditTransactionsForAdmin(c.env.DB, userId);
  return c.json({ transactions });
});

adminRoute.get("/credits/queue", async (c) => {
  const queue = await listCreditQueueForAdmin(c.env.DB);
  return c.json({ queue });
});

adminRoute.post("/credits/queue/process", async (c) => {
  await processCreditQueueAsAdmin(c.env.DB);
  return c.json({ status: "processed" });
});
