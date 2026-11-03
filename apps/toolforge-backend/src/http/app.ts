import { type Context, Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { issueGadgetCode, redeemGadgetCode } from "../auth/gadgetCode.js";
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchProfile,
} from "../auth/oauth.js";
import {
  assertGadgetOrigin,
  assertSourceWiki,
  isAllowedCorsOrigin,
} from "../auth/origin.js";
import { authenticate, bearerToken, issueSession } from "../auth/session.js";
import type { AppConfig } from "../config.js";
import type { Store } from "../db/store.js";
import type {
  JobRecord,
  SectionSelection,
  SourceInspection,
  TargetWikiCode,
  UserRecord,
} from "../domain/types.js";
import {
  flattenSections,
  normalizeSelection,
  toJobView,
} from "../jobs/view.js";
import { selectSections } from "../perseus/sections.js";
import { ApiError, isApiError } from "../util/errors.js";
import { newId, newToken, sha256 } from "../util/ids.js";
import { RateLimiter } from "../util/rateLimit.js";
import { addMinutes } from "../util/time.js";
import { inspectSource, loadSource } from "../wikimedia/client.js";

interface AppEnv {
  Variables: {
    user: UserRecord;
    requestId: string;
  };
}

export interface AppDependencies {
  store: Store;
  config: AppConfig;
}

const targetWikiSchema = z.enum(["fa", "tg"]);
const sourceSchema = z.object({
  wiki: z.string().min(1).max(32),
  title: z.string().min(1).max(255),
  revisionId: z.number().int().positive().optional(),
});
const sectionSelectionSchema = z.object({
  lead: z.boolean().default(true),
  sections: z
    .record(
      z.string(),
      z.object({ selected: z.boolean(), ownText: z.boolean() }),
    )
    .default({}),
});
const createJobSchema = z.object({
  source: sourceSchema,
  targetWiki: targetWikiSchema,
  selection: sectionSelectionSchema.optional(),
  replaceExisting: z.boolean().default(false),
});
const tokenSchema = z.object({ code: z.string().min(1).max(200) });

function parseBody<T>(c: Context<AppEnv>, schema: z.ZodType<T>): Promise<T> {
  return c.req
    .json()
    .catch(() => undefined)
    .then((raw) => {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw new ApiError(
          400,
          "INVALID_REQUEST",
          parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        );
      }
      return parsed.data;
    });
}

function parseTargetWiki(value: string | undefined): TargetWikiCode {
  const parsed = targetWikiSchema.safeParse(value ?? "fa");
  if (!parsed.success) {
    throw new ApiError(
      400,
      "INVALID_TARGET_WIKI",
      "targetWiki must be fa or tg.",
    );
  }
  return parsed.data;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function errorPage(message: string): string {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><title>Perseus</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 42rem; margin: 3rem auto; line-height: 1.8">
<h1>ورود به پرسیوس ناموفق بود</h1>
<p>${escapeHtml(message)}</p>
<p>می‌توانید این پنجره را ببندید و دوباره تلاش کنید.</p>
</body></html>`;
}

function completePage(code: string, origin: string): string {
  const codeJson = JSON.stringify(code);
  const originJson = JSON.stringify(origin);
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>Perseus — ورود</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 42rem; margin: 3rem auto; line-height: 1.8">
  <h1>ورود به پرسیوس</h1>
  <p>در حال بازگرداندن نتیجه به ویکی… اگر پنجره بسته نشد، این کد را در پنل پرسیوس وارد کنید:</p>
  <p><code style="direction:ltr; display:inline-block; padding:.4rem .6rem; background:#f3f4f6; border-radius:.4rem">${escapeHtml(code)}</code></p>
  <script>
    (function () {
      var code = ${codeJson};
      var targetOrigin = ${originJson};
      try {
        if (window.opener) {
          window.opener.postMessage({ type: "perseus-auth", code: code }, targetOrigin);
          setTimeout(function () { window.close(); }, 250);
        }
      } catch (error) {
        console.error("Perseus auth handoff failed", error);
      }
    })();
  </script>
</body>
</html>`;
}

function outputExpired(job: JobRecord): boolean {
  return Boolean(
    job.expiresAt && new Date(job.expiresAt).getTime() <= Date.now(),
  );
}

export function createApp(deps: AppDependencies): Hono<AppEnv> {
  const { config, store } = deps;
  const app = new Hono<AppEnv>();
  const generalLimiter = new RateLimiter();
  const jobLimiter = new RateLimiter();
  const authLimiter = new RateLimiter();

  app.use("*", async (c, next) => {
    const requestId = c.req.header("X-Request-Id") ?? newId();
    c.set("requestId", requestId);
    c.header("X-Request-Id", requestId);
    await next();
  });

  app.use(
    "*",
    cors({
      origin: (origin) =>
        isAllowedCorsOrigin(origin, config.corsExtraOrigins)
          ? origin
          : undefined,
      allowHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
      exposeHeaders: ["X-Request-Id"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      maxAge: 86_400,
    }),
  );

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    if (c.req.path.startsWith("/v1/")) {
      c.header("Cache-Control", "no-store");
    }
  });

  app.get("/v1/health", (c) =>
    c.json({
      ok: true,
      service: "perseus-toolforge-backend",
      version: "0.1.0",
    }),
  );

  const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
    const session = await authenticate(store, c.req.header("Authorization"));
    c.set("user", session.user);
    await next();
  };

  app.use("/v1/*", async (c, next) => {
    if (c.req.path === "/v1/health") return next();
    await authMiddleware(c, next);
  });

  app.get("/auth/login", async (c) => {
    c.header("Cache-Control", "no-store");
    const origin = c.req.query("origin");
    if (!origin) {
      throw new ApiError(400, "ORIGIN_REQUIRED", "The origin is required.");
    }
    assertGadgetOrigin(origin);

    const ip =
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
      c.req.header("CF-Connecting-IP") ??
      "unknown";
    if (!authLimiter.check(`login:${ip}`, 20, 60_000)) {
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Too many login attempts. Try again shortly.",
      );
    }

    const state = newToken("os", 32);
    const now = new Date();
    await store.createOAuthState({
      stateHash: sha256(state),
      origin,
      createdAt: now.toISOString(),
      expiresAt: addMinutes(now, config.oauthStateTtlMinutes).toISOString(),
      consumedAt: null,
    });

    return c.redirect(buildAuthorizeUrl(config, state));
  });

  app.get("/auth/callback", async (c) => {
    c.header("Cache-Control", "no-store");
    const code = c.req.query("code");
    const state = c.req.query("state");

    if (!code || !state) {
      return c.html(errorPage("پاسخ OAuth ناقص بود."), 400);
    }

    try {
      const record = await store.consumeOAuthState(sha256(state));
      if (!record) {
        return c.html(errorPage("وضعیت OAuth معتبر یا منقضی شده است."), 400);
      }

      const accessToken = await exchangeCode(config, code);
      const profile = await fetchProfile(config, accessToken);
      const user = await store.upsertUser(
        profile.wikimediaUserId,
        profile.username,
      );
      const issued = await issueGadgetCode(
        store,
        user.id,
        record.origin,
        config.gadgetCodeTtlSeconds,
      );

      const completeUrl = new URL("/auth/complete", config.publicBaseUrl);
      completeUrl.searchParams.set("code", issued.code);
      return c.redirect(completeUrl.toString());
    } catch (error) {
      const message = isApiError(error)
        ? error.message
        : "خطای غیرمنتظره در ورود رخ داد.";
      return c.html(errorPage(message), 400);
    }
  });

  app.get("/auth/complete", async (c) => {
    c.header("Cache-Control", "no-store");
    const code = c.req.query("code");
    if (!code) {
      return c.html(errorPage("کد ورود در نشانی وجود ندارد."), 400);
    }

    const record = await store.findGadgetCode(sha256(code));
    if (
      !record ||
      record.redeemedAt ||
      new Date(record.expiresAt).getTime() <= Date.now()
    ) {
      return c.html(errorPage("کد ورود نامعتبر یا منقضی شده است."), 400);
    }

    c.header(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    );
    return c.html(completePage(code, record.origin));
  });

  app.post("/auth/token", async (c) => {
    c.header("Cache-Control", "no-store");
    const body = await parseBody(c, tokenSchema);
    const origin = c.req.header("Origin");
    const record = await redeemGadgetCode(store, body.code, origin);
    const user = await store.findUserById(record.userId);
    if (!user) {
      throw new ApiError(
        401,
        "USER_NOT_FOUND",
        "The user for this code no longer exists.",
      );
    }

    const session = await issueSession(store, user.id, config.sessionTtlDays);

    return c.json({
      token: session.token,
      tokenType: "Bearer",
      expiresAt: session.expiresAt,
      user: { id: user.id, username: user.username },
    });
  });

  app.post("/auth/logout", authMiddleware, async (c) => {
    const token = bearerToken(c.req.header("Authorization"));
    if (token) await store.deleteSession(sha256(token));
    return c.json({ ok: true });
  });

  app.get("/v1/me", async (c) => {
    const user = c.get("user");
    const active = await store.getActiveJob(user.id);
    return c.json({
      user: { id: user.id, username: user.username },
      activeJob: active ? toJobView(active) : null,
    });
  });

  app.get("/v1/source", async (c) => {
    const user = c.get("user");
    if (!generalLimiter.check(`source:${user.id}`, 30, 60_000)) {
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Too many source requests. Try again shortly.",
      );
    }

    const wikiRaw = c.req.query("wiki");
    const title = c.req.query("title")?.trim();
    if (!wikiRaw || !title) {
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "wiki and title query parameters are required.",
      );
    }

    const wiki = assertSourceWiki(wikiRaw);
    const targetWiki = parseTargetWiki(c.req.query("targetWiki"));
    const inspection = await inspectSource(config, wiki, title, targetWiki);
    const active = await store.getActiveJob(user.id);
    const restorable = await store.findRestorableJob(
      user.id,
      inspection.page.wiki,
      inspection.page.title,
      targetWiki,
    );

    const { html: _html, ...publicInspection } = inspection;

    return c.json({
      ...publicInspection,
      activeJob: active ? toJobView(active) : null,
      existingJob: restorable ? toJobView(restorable) : null,
    } satisfies SourceInspection & {
      activeJob: ReturnType<typeof toJobView> | null;
      existingJob: ReturnType<typeof toJobView> | null;
    });
  });

  app.post("/v1/jobs", async (c) => {
    const user = c.get("user");
    const body = await parseBody(c, createJobSchema);
    const wiki = assertSourceWiki(body.source.wiki);

    if (!jobLimiter.check(`create:${user.id}`, 5, 10 * 60_000)) {
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Too many job creation attempts. Try again shortly.",
      );
    }

    const active = await store.getActiveJob(user.id);
    if (active) {
      throw new ApiError(
        409,
        "ACTIVE_JOB_EXISTS",
        "You already have an active translation job.",
        { job: toJobView(active) },
      );
    }

    const existing = await store.findRestorableJob(
      user.id,
      wiki,
      body.source.title,
      body.targetWiki,
    );
    if (existing && !body.replaceExisting) {
      throw new ApiError(
        409,
        "RESULT_EXISTS",
        "A previous result or job exists for this article and target language. Confirm replacement first.",
        { job: toJobView(existing) },
      );
    }

    const createdSince = await store.countJobsCreatedSince(
      user.id,
      new Date(Date.now() - 24 * 3600 * 1000),
    );
    if (createdSince >= config.maxJobsPerDay) {
      throw new ApiError(
        429,
        "DAILY_LIMIT",
        "The daily job limit for this account has been reached.",
        { limit: config.maxJobsPerDay },
      );
    }

    const loaded = await loadSource(
      config,
      wiki,
      body.source.title,
      body.source.revisionId,
    );

    if (loaded.page.namespace !== 0) {
      throw new ApiError(
        422,
        "SOURCE_NOT_ELIGIBLE",
        "Only main-namespace articles can be translated.",
      );
    }
    if (loaded.page.redirect) {
      throw new ApiError(
        422,
        "SOURCE_NOT_ELIGIBLE",
        "Redirect pages cannot be translated.",
      );
    }
    if (loaded.page.disambiguation) {
      throw new ApiError(
        422,
        "SOURCE_NOT_ELIGIBLE",
        "Disambiguation pages cannot be translated.",
      );
    }

    const known = new Set(
      flattenSections(loaded.sections.tree).map((section) => section.id),
    );
    for (const id of Object.keys(body.selection?.sections ?? {})) {
      if (!known.has(id)) {
        throw new ApiError(
          409,
          "SELECTION_MISMATCH",
          "The article structure changed. Reload and select sections again.",
        );
      }
    }

    const selection = normalizeSelection(
      loaded.sections.tree,
      body.selection as SectionSelection | undefined,
    );

    // Validate the actual selection (including the empty-selection case)
    // before creating a job that the worker cannot complete.
    selectSections(loaded.html, selection);

    const job = await store.createJob({
      userId: user.id,
      source: loaded.page,
      targetWiki: body.targetWiki,
      selection,
      sections: loaded.sections.tree,
      sourceHtml: loaded.html,
      replaceExisting: body.replaceExisting,
    });

    return c.json({ job: toJobView(job) }, 202);
  });

  app.get("/v1/jobs", async (c) => {
    const user = c.get("user");
    const jobs = await store.listRecentJobs(user.id, 20);
    return c.json({ jobs: jobs.map(toJobView) });
  });

  app.get("/v1/jobs/active", async (c) => {
    const user = c.get("user");
    const active = await store.getActiveJob(user.id);
    return c.json({ job: active ? toJobView(active) : null });
  });

  app.get("/v1/jobs/lookup", async (c) => {
    const user = c.get("user");
    const wikiRaw = c.req.query("wiki");
    const title = c.req.query("title")?.trim();
    if (!wikiRaw || !title) {
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "wiki and title query parameters are required.",
      );
    }
    const wiki = assertSourceWiki(wikiRaw);
    const targetWiki = parseTargetWiki(c.req.query("targetWiki"));

    const active = await store.getActiveJob(user.id);
    if (active) {
      return c.json({ kind: "active", job: toJobView(active) });
    }

    const restorable = await store.findRestorableJob(
      user.id,
      wiki,
      title,
      targetWiki,
    );
    return c.json({
      kind: restorable ? "restorable" : "none",
      job: restorable ? toJobView(restorable) : null,
    });
  });

  app.get("/v1/jobs/:id", async (c) => {
    const job = await getOwnedJob(store, c);
    return c.json({ job: toJobView(job) });
  });

  app.get("/v1/jobs/:id/events", async (c) => {
    const job = await getOwnedJob(store, c);
    const after = Number(c.req.query("after") ?? "0");
    const limit = Number(c.req.query("limit") ?? "200");
    const events = await store.listEvents(
      job.id,
      Number.isFinite(after) ? after : 0,
      Number.isFinite(limit) ? limit : 200,
    );

    return c.json({
      events,
      nextAfter: events.at(-1)?.id ?? (Number.isFinite(after) ? after : 0),
    });
  });

  app.get("/v1/jobs/:id/output", async (c) => {
    const job = await getOwnedJob(store, c);
    const output = requireOutput(job);
    return c.json(output);
  });

  app.get("/v1/jobs/:id/output/article.wiki", async (c) => {
    const job = await getOwnedJob(store, c);
    const output = requireOutput(job);
    c.header("Content-Disposition", 'attachment; filename="article.wiki"');
    c.header("Content-Type", "text/plain; charset=utf-8");
    return c.text(output.wikitext);
  });

  app.post("/v1/jobs/:id/retry", async (c) => {
    const job = await getOwnedJob(store, c);
    if (job.status !== "failed") {
      throw new ApiError(
        409,
        "JOB_NOT_RETRYABLE",
        "Only a failed job can be retried.",
      );
    }

    if (job.expiresAt && new Date(job.expiresAt).getTime() <= Date.now()) {
      throw new ApiError(
        410,
        "JOB_EXPIRED",
        "This failed job has expired and can no longer be retried.",
      );
    }

    const active = await store.getActiveJob(job.userId);
    if (active && active.id !== job.id) {
      throw new ApiError(
        409,
        "ACTIVE_JOB_EXISTS",
        "Another job is already active.",
        { job: toJobView(active) },
      );
    }

    const reset = await store.resetFailedChunks(job.id);

    await store.appendEvent(
      job.id,
      "info",
      "JOB_RETRY_REQUESTED",
      reset > 0
        ? "Manual retry requested for failed chunks."
        : "Manual retry requested after a generation/preparation failure.",
      { failedChunks: reset },
    );
    const updated = await store.getJobSummary(job.id);
    if (!updated) throw new ApiError(404, "JOB_NOT_FOUND", "Job not found.");
    return c.json({ job: toJobView(updated) }, 202);
  });

  app.post("/v1/jobs/:id/cancel", async (c) => {
    const job = await getOwnedJob(store, c);
    const updated = await store.requestCancel(job.id, c.get("user").id);
    if (!updated) {
      throw new ApiError(
        409,
        "JOB_NOT_CANCELLABLE",
        "This job can no longer be cancelled.",
      );
    }

    if (updated.status === "cancelled") {
      await store.appendEvent(
        job.id,
        "info",
        "JOB_CANCELLED",
        "Job cancelled before processing started.",
      );
    } else {
      await store.appendEvent(
        job.id,
        "info",
        "JOB_CANCEL_REQUESTED",
        "Cancellation requested; the worker will stop before the next chunk.",
      );
    }

    return c.json({ job: toJobView(updated) }, 202);
  });

  app.notFound((c) =>
    c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "The requested endpoint does not exist.",
        },
      },
      404,
    ),
  );

  app.onError((error, c) => {
    const requestId = c.get("requestId") ?? "unknown";
    const status = isApiError(error)
      ? (error.status as ContentfulStatusCode)
      : 500;
    const body = isApiError(error)
      ? {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        }
      : {
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected server error occurred.",
          },
        };

    console.error(
      JSON.stringify({
        level: "error",
        requestId,
        method: c.req.method,
        path: c.req.path,
        status,
        code: body.error.code,
        message: error instanceof Error ? error.message : String(error),
      }),
    );

    return c.json(body, status);
  });

  return app;
}

async function getOwnedJob(
  store: Store,
  c: Context<AppEnv>,
): Promise<JobRecord> {
  const id = c.req.param("id");
  if (!id) throw new ApiError(404, "JOB_NOT_FOUND", "Job not found.");
  const job = await store.getJobSummary(id);
  const user = c.get("user");
  if (!job || job.userId !== user.id) {
    throw new ApiError(404, "JOB_NOT_FOUND", "Job not found.");
  }
  return job;
}

function requireOutput(job: JobRecord): {
  jobId: string;
  wikitext: string;
  filename: "article.wiki";
  completedAt: string;
  expiresAt: string;
  warnings: string[];
} {
  if (job.status !== "completed" || !job.resultWikitext) {
    throw new ApiError(
      409,
      "OUTPUT_NOT_READY",
      "This job does not have a completed output.",
    );
  }
  if (outputExpired(job)) {
    throw new ApiError(
      410,
      "OUTPUT_EXPIRED",
      "The output retention period has ended.",
    );
  }
  if (!job.completedAt || !job.expiresAt) {
    throw new ApiError(
      409,
      "OUTPUT_METADATA_MISSING",
      "The completed output metadata is incomplete.",
    );
  }

  return {
    jobId: job.id,
    wikitext: job.resultWikitext,
    filename: "article.wiki",
    completedAt: job.completedAt,
    expiresAt: job.expiresAt,
    warnings: job.warnings,
  };
}
