/**
 * routes/web/admin.ts
 *
 * The HTML admin page + its plain form-POST action handlers, mirroring
 * the dashboard's pattern (server-rendered, POST-then-redirect, no
 * client-side framework required). All business logic is delegated to
 * services/adminService.ts / services/creditEngine.ts -- this file only
 * adapts HTTP <-> those calls and decides what to render.
 */
import { Hono } from "hono";
import type { AppEnv } from "@/honoTypes";
import { requireAdmin } from "@/middleware/adminAuth";
import {
  listCreditQueueEntries,
  listRecentCreditTransactions,
} from "@/repositories/creditRepo";
import { listAllUsers, type UserStatus } from "@/repositories/usersRepo";
import {
  getUserDetailForAdmin,
  processCreditQueueAsAdmin,
  setUserStatusAsAdmin,
} from "@/services/adminService";
import { RequestLogger } from "@/shared/logger";
import { AdminPage } from "@/views/pages/AdminPage";
import { AdminUserDetailPage } from "@/views/pages/AdminUserDetailPage";

export const adminWebRoute = new Hono<AppEnv>();

adminWebRoute.use("*", requireAdmin);

const NOTICE_MESSAGES: Record<
  string,
  { kind: "success" | "error"; message: string }
> = {
  status_updated: { kind: "success", message: "وضعیت کاربر به‌روزرسانی شد." },
  processed: { kind: "success", message: "صف اعتبار پردازش شد." },
  error: { kind: "error", message: "انجام عملیات ناموفق بود." },
};

async function loadAdminData(db: D1Database) {
  const [users, creditQueue, creditTransactions] = await Promise.all([
    listAllUsers(db),
    listCreditQueueEntries(db),
    listRecentCreditTransactions(db),
  ]);

  return { users, creditQueue, creditTransactions };
}

adminWebRoute.get("/", async (c) => {
  const admin = c.get("sessionUser");
  const requestId = c.get("requestId") ?? "unknown";
  const logger = new RequestLogger(requestId);
  const noticeKey = c.req.query("notice");
  const notice = noticeKey ? (NOTICE_MESSAGES[noticeKey] ?? null) : null;

  try {
    const data = await loadAdminData(c.env.DB);

    const page = AdminPage({
      adminUsername: admin.wikimediaUsername ?? "(ناشناس)",
      notice,
      loadError: false,
      ...data,
    });

    return c.html(`<!doctype html>${page.toString()}`);
  } catch (err) {
    logger.error("Failed to load admin panel", {
      message: err instanceof Error ? err.message : String(err),
    });

    const page = AdminPage({
      adminUsername: admin.wikimediaUsername ?? "(ناشناس)",
      notice,
      loadError: true,
      users: [],
      creditQueue: [],
      creditTransactions: [],
    });

    return c.html(`<!doctype html>${page.toString()}`, 200);
  }
});

adminWebRoute.get("/users/:id", async (c) => {
  try {
    const detail = await getUserDetailForAdmin(c.env.DB, c.req.param("id"));
    const page = AdminUserDetailPage({ detail });
    return c.html(`<!doctype html>${page.toString()}`);
  } catch {
    return c.redirect("/admin?notice=error");
  }
});

adminWebRoute.post("/users/:id/status", async (c) => {
  const body = await c.req.parseBody();
  const status = body.status;

  const VALID_STATUSES: readonly UserStatus[] = [
    "pending",
    "active",
    "disabled",
    "rejected",
  ];

  if (
    typeof status !== "string" ||
    !VALID_STATUSES.includes(status as UserStatus)
  ) {
    return c.redirect("/admin?notice=error");
  }

  try {
    await setUserStatusAsAdmin(
      c.env.DB,
      c.req.param("id"),
      status as UserStatus,
    );
    return c.redirect("/admin?notice=status_updated");
  } catch {
    return c.redirect("/admin?notice=error");
  }
});

adminWebRoute.post("/credits/queue/process", async (c) => {
  try {
    await processCreditQueueAsAdmin(c.env.DB);
    return c.redirect("/admin?notice=processed");
  } catch {
    return c.redirect("/admin?notice=error");
  }
});
