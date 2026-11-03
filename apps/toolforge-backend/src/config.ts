import { z } from "zod";

const envSchema = z.object({
  PUBLIC_BASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(8000),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(""),
  DB_NAME: z.string().min(1),

  OAUTH_CLIENT_ID: z.string().default(""),
  OAUTH_CLIENT_SECRET: z.string().default(""),
  OAUTH_REDIRECT_URI: z.string().url().optional(),
  OAUTH_SCOPE: z.string().default(""),

  OPENROUTER_API_KEY: z.string().default(""),
  PERSEUS_MODEL: z.string().default("google/gemini-2.5-flash"),

  PERSEUS_USER_AGENT: z
    .string()
    .min(1)
    .default(
      "Perseus Toolforge Backend/0.1 (https://github.com/wikimediairan/Perseus)",
    ),

  JOB_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
  JOB_METADATA_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  MAX_ARTICLE_BYTES: z.coerce.number().int().positive().default(2_000_000),
  MAX_CHUNKS: z.coerce.number().int().positive().default(60),
  MAX_JOBS_PER_DAY: z.coerce.number().int().positive().default(10),
  CHUNK_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  AI_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(600_000)
    .default(120_000),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(2000),
  WORKER_LEASE_SECONDS: z.coerce.number().int().positive().default(180),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OAUTH_STATE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  GADGET_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  CORS_EXTRA_ORIGINS: z.string().default(""),
});

export interface AppConfig {
  publicBaseUrl: string;
  port: number;
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  oauth: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scope: string;
  };
  openRouterApiKey: string;
  model: string;
  userAgent: string;
  jobRetentionHours: number;
  jobMetadataRetentionDays: number;
  maxArticleBytes: number;
  maxChunks: number;
  maxJobsPerDay: number;
  chunkRetries: number;
  aiRequestTimeoutMs: number;
  workerPollMs: number;
  workerLeaseSeconds: number;
  sessionTtlDays: number;
  oauthStateTtlMinutes: number;
  gadgetCodeTtlSeconds: number;
  corsExtraOrigins: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  const value = parsed.data;

  return {
    publicBaseUrl: value.PUBLIC_BASE_URL.replace(/\/+$/, ""),
    port: value.PORT,
    db: {
      host: value.DB_HOST,
      port: value.DB_PORT,
      user: value.DB_USER,
      password: value.DB_PASSWORD,
      database: value.DB_NAME,
    },
    oauth: {
      clientId: value.OAUTH_CLIENT_ID,
      clientSecret: value.OAUTH_CLIENT_SECRET,
      redirectUri:
        value.OAUTH_REDIRECT_URI ??
        `${value.PUBLIC_BASE_URL.replace(/\/+$/, "")}/auth/callback`,
      scope: value.OAUTH_SCOPE,
    },
    openRouterApiKey: value.OPENROUTER_API_KEY,
    model: value.PERSEUS_MODEL,
    userAgent: value.PERSEUS_USER_AGENT,
    jobRetentionHours: value.JOB_RETENTION_HOURS,
    jobMetadataRetentionDays: value.JOB_METADATA_RETENTION_DAYS,
    maxArticleBytes: value.MAX_ARTICLE_BYTES,
    maxChunks: value.MAX_CHUNKS,
    maxJobsPerDay: value.MAX_JOBS_PER_DAY,
    chunkRetries: value.CHUNK_RETRIES,
    aiRequestTimeoutMs: value.AI_REQUEST_TIMEOUT_MS,
    workerPollMs: value.WORKER_POLL_MS,
    workerLeaseSeconds: value.WORKER_LEASE_SECONDS,
    sessionTtlDays: value.SESSION_TTL_DAYS,
    oauthStateTtlMinutes: value.OAUTH_STATE_TTL_MINUTES,
    gadgetCodeTtlSeconds: value.GADGET_CODE_TTL_SECONDS,
    corsExtraOrigins: value.CORS_EXTRA_ORIGINS.split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };
}
