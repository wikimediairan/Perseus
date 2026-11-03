import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";
import mysql from "mysql2/promise";
import type { AppConfig } from "../config.js";
import type {
  ChunkPlan,
  ChunkRecord,
  EventLevel,
  GadgetCodeRecord,
  JobEventRecord,
  JobRecord,
  JobStatus,
  OAuthStateRecord,
  SectionNode,
  SectionSelection,
  TargetWikiCode,
  TranslatedChunkRecord,
  UserRecord,
} from "../domain/types.js";
import { ApiError } from "../util/errors.js";
import { newId } from "../util/ids.js";
import type { CreateJobInput, Store, UpdateJobPatch } from "./store.js";

interface UserRow extends RowDataPacket {
  id: string;
  wikimedia_user_id: string;
  username: string;
  created_at: Date;
  updated_at: Date;
}

interface SessionRow extends RowDataPacket {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
  revoked_at: Date | null;
  u_id: string;
  u_wikimedia_user_id: string;
  u_username: string;
  u_created_at: Date;
  u_updated_at: Date;
}

interface OAuthStateRow extends RowDataPacket {
  state_hash: string;
  origin: string;
  created_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
}

interface GadgetCodeRow extends RowDataPacket {
  code_hash: string;
  user_id: string;
  origin: string;
  created_at: Date;
  expires_at: Date;
  redeemed_at: Date | null;
}

interface JobRow extends RowDataPacket {
  id: string;
  user_id: string;
  status: JobStatus;
  source_wiki: string;
  source_title: string;
  source_page_id: number;
  source_revision_id: number;
  source_url: string;
  target_wiki: TargetWikiCode;
  selection_json: string;
  sections_json: string;
  source_html: string | null;
  total_chunks: number;
  completed_chunks: number;
  failed_chunks: number;
  total_units: number;
  translated_units: number;
  progress: number;
  stage: string;
  error_code: string | null;
  error_message: string | null;
  result_wikitext: string | null;
  result_meta_json: string | null;
  warnings_json: string;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  expires_at: Date | null;
  cancel_requested_at: Date | null;
  lease_owner: string | null;
  lease_expires_at: Date | null;
}

interface ChunkRow extends RowDataPacket {
  job_id: string;
  chunk_id: string;
  ordinal: number;
  status: ChunkRecord["status"];
  fingerprint: string;
  units_json: string;
  translated_json: string | null;
  usage_json: string | null;
  attempts: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

interface EventRow extends RowDataPacket {
  id: number;
  job_id: string;
  level: EventLevel;
  code: string;
  message: string;
  data_json: string | null;
  created_at: Date;
}

const JOB_COLUMNS = `
  id, user_id, status, source_wiki, source_title, source_page_id,
  source_revision_id, source_url, target_wiki, selection_json, sections_json,
  total_chunks, completed_chunks, failed_chunks, total_units, translated_units,
  progress, stage, error_code, error_message, result_wikitext, result_meta_json,
  warnings_json, created_at, started_at, completed_at, expires_at,
  cancel_requested_at, lease_owner, lease_expires_at
`;

const JOB_COLUMNS_WITH_HTML = `${JOB_COLUMNS}, source_html`;

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    wikimediaUserId: row.wikimedia_user_id,
    username: row.username,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    sourceWiki: row.source_wiki,
    sourceTitle: row.source_title,
    sourcePageId: Number(row.source_page_id),
    sourceRevisionId: Number(row.source_revision_id),
    sourceUrl: row.source_url,
    targetWiki: row.target_wiki,
    selection: parseJson<SectionSelection>(row.selection_json, {
      lead: true,
      sections: {},
    }),
    sections: parseJson<SectionNode[]>(row.sections_json, []),
    sourceHtml: row.source_html ?? null,
    totalChunks: Number(row.total_chunks),
    completedChunks: Number(row.completed_chunks),
    failedChunks: Number(row.failed_chunks),
    totalUnits: Number(row.total_units),
    translatedUnits: Number(row.translated_units),
    progress: Number(row.progress),
    stage: row.stage,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    resultWikitext: row.result_wikitext,
    resultMeta: parseJson<Record<string, unknown> | null>(
      row.result_meta_json,
      null,
    ),
    warnings: parseJson<string[]>(row.warnings_json, []),
    createdAt: row.created_at.toISOString(),
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    expiresAt: toIso(row.expires_at),
    cancelRequestedAt: toIso(row.cancel_requested_at),
    leaseOwner: row.lease_owner,
    leaseExpiresAt: toIso(row.lease_expires_at),
  };
}

function mapChunk(row: ChunkRow): ChunkRecord {
  return {
    jobId: row.job_id,
    chunkId: row.chunk_id,
    ordinal: Number(row.ordinal),
    status: row.status,
    fingerprint: row.fingerprint,
    units: parseJson(row.units_json, []),
    translated: parseJson(row.translated_json, null),
    usage: parseJson(row.usage_json, null),
    attempts: Number(row.attempts),
    lastError: row.last_error,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapEvent(row: EventRow): JobEventRecord {
  return {
    id: Number(row.id),
    jobId: row.job_id,
    level: row.level,
    code: row.code,
    message: row.message,
    data: parseJson(row.data_json, null),
    createdAt: row.created_at.toISOString(),
  };
}

export class MariaStore implements Store {
  private readonly pool: Pool;

  constructor(config: AppConfig) {
    this.pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 10,
      idleTimeout: 60_000,
      enableKeepAlive: true,
      charset: "utf8mb4",
      timezone: "Z",
      supportBigNumbers: true,
    });
  }

  async init(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async upsertUser(
    wikimediaUserId: string,
    username: string,
  ): Promise<UserRecord> {
    const now = new Date();
    const id = newId();

    await this.pool.execute(
      `INSERT INTO users (id, wikimedia_user_id, username, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE username = ?, updated_at = ?`,
      [id, wikimediaUserId, username, now, now, username, now],
    );

    const [rows] = await this.pool.execute<UserRow[]>(
      `SELECT * FROM users WHERE wikimedia_user_id = ? LIMIT 1`,
      [wikimediaUserId],
    );
    const row = rows[0];
    if (!row) throw new Error("User upsert did not return a row");
    return mapUser(row);
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const [rows] = await this.pool.execute<UserRow[]>(
      `SELECT * FROM users WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.pool.execute(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [newId(), userId, tokenHash, new Date(), expiresAt],
    );
  }

  async findSession(
    tokenHash: string,
  ): Promise<{ user: UserRecord; expiresAt: string } | null> {
    const [rows] = await this.pool.execute<SessionRow[]>(
      `SELECT s.id, s.user_id, s.token_hash, s.expires_at, s.created_at,
              s.revoked_at, u.id AS u_id, u.wikimedia_user_id AS u_wikimedia_user_id,
              u.username AS u_username, u.created_at AS u_created_at,
              u.updated_at AS u_updated_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > NOW(3)
       LIMIT 1`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;

    return {
      user: {
        id: row.u_id,
        wikimediaUserId: row.u_wikimedia_user_id,
        username: row.u_username,
        createdAt: row.u_created_at.toISOString(),
        updatedAt: row.u_updated_at.toISOString(),
      },
      expiresAt: row.expires_at.toISOString(),
    };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.execute(
      `UPDATE sessions SET revoked_at = NOW(3) WHERE token_hash = ?`,
      [tokenHash],
    );
  }

  async createOAuthState(record: OAuthStateRecord): Promise<void> {
    await this.pool.execute(
      `INSERT INTO oauth_states (state_hash, origin, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
      [
        record.stateHash,
        record.origin,
        new Date(record.createdAt),
        new Date(record.expiresAt),
      ],
    );
  }

  async consumeOAuthState(stateHash: string): Promise<OAuthStateRecord | null> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<OAuthStateRow[]>(
        `SELECT * FROM oauth_states WHERE state_hash = ? FOR UPDATE`,
        [stateHash],
      );
      const row = rows[0];
      if (
        !row ||
        row.consumed_at !== null ||
        row.expires_at.getTime() <= Date.now()
      ) {
        await connection.rollback();
        return null;
      }
      await connection.execute(
        `UPDATE oauth_states SET consumed_at = NOW(3) WHERE state_hash = ?`,
        [stateHash],
      );
      await connection.commit();
      return {
        stateHash: row.state_hash,
        origin: row.origin,
        createdAt: row.created_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        consumedAt: null,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async createGadgetCode(record: GadgetCodeRecord): Promise<void> {
    await this.pool.execute(
      `INSERT INTO gadget_codes (code_hash, user_id, origin, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        record.codeHash,
        record.userId,
        record.origin,
        new Date(record.createdAt),
        new Date(record.expiresAt),
      ],
    );
  }

  async findGadgetCode(codeHash: string): Promise<GadgetCodeRecord | null> {
    const [rows] = await this.pool.execute<GadgetCodeRow[]>(
      `SELECT * FROM gadget_codes WHERE code_hash = ? LIMIT 1`,
      [codeHash],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      codeHash: row.code_hash,
      userId: row.user_id,
      origin: row.origin,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      redeemedAt: toIso(row.redeemed_at),
    };
  }

  async redeemGadgetCode(codeHash: string): Promise<GadgetCodeRecord | null> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<GadgetCodeRow[]>(
        `SELECT * FROM gadget_codes WHERE code_hash = ? FOR UPDATE`,
        [codeHash],
      );
      const row = rows[0];
      if (
        !row ||
        row.redeemed_at !== null ||
        row.expires_at.getTime() <= Date.now()
      ) {
        await connection.rollback();
        return null;
      }
      await connection.execute(
        `UPDATE gadget_codes SET redeemed_at = NOW(3) WHERE code_hash = ?`,
        [codeHash],
      );
      await connection.commit();
      return {
        codeHash: row.code_hash,
        userId: row.user_id,
        origin: row.origin,
        createdAt: row.created_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        redeemedAt: new Date().toISOString(),
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async createJob(input: CreateJobInput): Promise<JobRecord> {
    const connection = await this.pool.getConnection();
    const jobId = newId();
    const now = new Date();

    try {
      await connection.beginTransaction();

      const [activeRows] = await connection.execute<JobRow[]>(
        `SELECT ${JOB_COLUMNS} FROM jobs
         WHERE user_id = ? AND active_slot = 1
         FOR UPDATE`,
        [input.userId],
      );

      if (activeRows[0]) {
        throw new ApiError(
          409,
          "ACTIVE_JOB_EXISTS",
          "You already have an active translation job.",
          { jobId: activeRows[0].id },
        );
      }

      if (input.replaceExisting) {
        await connection.execute(
          `UPDATE jobs
           SET status = 'superseded', source_html = NULL,
               result_wikitext = NULL, result_meta_json = NULL,
               lease_owner = NULL, lease_expires_at = NULL,
               completed_at = COALESCE(completed_at, NOW(3))
           WHERE user_id = ? AND source_wiki = ? AND source_title = ?
             AND target_wiki = ? AND active_slot IS NULL`,
          [
            input.userId,
            input.source.wiki,
            input.source.title,
            input.targetWiki,
          ],
        );
      }

      await connection.execute(
        `INSERT INTO jobs (
           id, user_id, status, source_wiki, source_title, source_page_id,
           source_revision_id, source_url, target_wiki, selection_json,
           sections_json, source_html, total_chunks, completed_chunks,
           failed_chunks, total_units, translated_units, progress, stage,
           warnings_json, created_at
         ) VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 'queued', '[]', ?)`,
        [
          jobId,
          input.userId,
          input.source.wiki,
          input.source.title,
          input.source.pageId,
          input.source.revisionId,
          input.source.url,
          input.targetWiki,
          JSON.stringify(input.selection),
          JSON.stringify(input.sections),
          input.sourceHtml,
          now,
        ],
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "ER_DUP_ENTRY"
      ) {
        throw new ApiError(
          409,
          "ACTIVE_JOB_EXISTS",
          "You already have an active translation job.",
        );
      }
      throw error;
    } finally {
      connection.release();
    }

    const job = await this.getJobSummary(jobId);
    if (!job) throw new Error("Created job could not be read back");
    return job;
  }

  async getJob(jobId: string): Promise<JobRecord | null> {
    const [rows] = await this.pool.execute<JobRow[]>(
      `SELECT ${JOB_COLUMNS_WITH_HTML} FROM jobs WHERE id = ? LIMIT 1`,
      [jobId],
    );
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async getJobSummary(jobId: string): Promise<JobRecord | null> {
    const [rows] = await this.pool.execute<JobRow[]>(
      `SELECT ${JOB_COLUMNS} FROM jobs WHERE id = ? LIMIT 1`,
      [jobId],
    );
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async getActiveJob(userId: string): Promise<JobRecord | null> {
    const [rows] = await this.pool.execute<JobRow[]>(
      `SELECT ${JOB_COLUMNS} FROM jobs
       WHERE user_id = ? AND active_slot = 1
       LIMIT 1`,
      [userId],
    );
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async findRestorableJob(
    userId: string,
    sourceWiki: string,
    sourceTitle: string,
    targetWiki: TargetWikiCode,
  ): Promise<JobRecord | null> {
    const [rows] = await this.pool.execute<JobRow[]>(
      `SELECT ${JOB_COLUMNS} FROM jobs
       WHERE user_id = ? AND source_wiki = ? AND source_title = ?
         AND target_wiki = ?
         AND status IN ('completed', 'failed', 'cancelled')
         AND (expires_at IS NULL OR expires_at > NOW(3))
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, sourceWiki, sourceTitle, targetWiki],
    );
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async listRecentJobs(userId: string, limit: number): Promise<JobRecord[]> {
    const [rows] = await this.pool.execute<JobRow[]>(
      `SELECT ${JOB_COLUMNS} FROM jobs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, Math.max(1, Math.min(50, limit))],
    );
    return rows.map(mapJob);
  }

  async updateJob(
    jobId: string,
    patch: UpdateJobPatch,
    claimOwner?: string,
  ): Promise<boolean> {
    const fields: string[] = [];
    const values: (string | number | Date | null)[] = [];

    const set = (
      column: string,
      value: string | number | Date | null,
    ): void => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (patch.status !== undefined) set("status", patch.status);
    if (patch.stage !== undefined) set("stage", patch.stage);
    if (patch.progress !== undefined) {
      set("progress", Math.max(0, Math.min(100, Math.round(patch.progress))));
    }
    if (patch.totalChunks !== undefined) set("total_chunks", patch.totalChunks);
    if (patch.completedChunks !== undefined) {
      set("completed_chunks", patch.completedChunks);
    }
    if (patch.failedChunks !== undefined) {
      set("failed_chunks", patch.failedChunks);
    }
    if (patch.totalUnits !== undefined) set("total_units", patch.totalUnits);
    if (patch.translatedUnits !== undefined) {
      set("translated_units", patch.translatedUnits);
    }
    if (patch.errorCode !== undefined) set("error_code", patch.errorCode);
    if (patch.errorMessage !== undefined) {
      set("error_message", patch.errorMessage);
    }
    if (patch.resultWikitext !== undefined) {
      set("result_wikitext", patch.resultWikitext);
    }
    if (patch.resultMeta !== undefined) {
      set(
        "result_meta_json",
        patch.resultMeta === null ? null : JSON.stringify(patch.resultMeta),
      );
    }
    if (patch.sourceHtml !== undefined) set("source_html", patch.sourceHtml);
    if (patch.warnings !== undefined) {
      set("warnings_json", JSON.stringify(patch.warnings));
    }
    if (patch.startedAt !== undefined) {
      set("started_at", patch.startedAt ? new Date(patch.startedAt) : null);
    }
    if (patch.completedAt !== undefined) {
      set(
        "completed_at",
        patch.completedAt ? new Date(patch.completedAt) : null,
      );
    }
    if (patch.expiresAt !== undefined) {
      set("expires_at", patch.expiresAt ? new Date(patch.expiresAt) : null);
    }
    if (patch.cancelRequestedAt !== undefined) {
      set(
        "cancel_requested_at",
        patch.cancelRequestedAt ? new Date(patch.cancelRequestedAt) : null,
      );
    }
    if (patch.leaseOwner !== undefined) set("lease_owner", patch.leaseOwner);
    if (patch.leaseExpiresAt !== undefined) {
      set(
        "lease_expires_at",
        patch.leaseExpiresAt ? new Date(patch.leaseExpiresAt) : null,
      );
    }

    if (fields.length === 0) return true;

    values.push(jobId);
    if (claimOwner) values.push(claimOwner);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE jobs SET ${fields.join(", ")} WHERE id = ?${
        claimOwner
          ? " AND lease_owner = ? AND lease_expires_at > NOW(3) AND status = 'running' AND cancel_requested_at IS NULL"
          : ""
      }`,
      values,
    );
    return result.affectedRows > 0;
  }

  async requestCancel(
    jobId: string,
    userId: string,
  ): Promise<JobRecord | null> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE jobs
       SET stage = CASE WHEN status IN ('queued', 'retrying') THEN 'cancelled' ELSE 'cancelling' END,
           cancel_requested_at = COALESCE(cancel_requested_at, NOW(3)),
           completed_at = CASE WHEN status IN ('queued', 'retrying') THEN NOW(3) ELSE completed_at END,
           source_html = CASE WHEN status IN ('queued', 'retrying') THEN NULL ELSE source_html END,
           lease_owner = CASE WHEN status IN ('queued', 'retrying') THEN NULL ELSE lease_owner END,
           lease_expires_at = CASE WHEN status IN ('queued', 'retrying') THEN NULL ELSE lease_expires_at END,
           status = CASE WHEN status IN ('queued', 'retrying') THEN 'cancelled' ELSE 'cancelling' END
       WHERE id = ? AND user_id = ?
         AND status IN ('queued', 'retrying', 'running', 'cancelling')`,
      [jobId, userId],
    );
    if (result.affectedRows === 0) return null;
    const job = await this.getJobSummary(jobId);
    return job &&
      job.userId === userId &&
      ["cancelled", "cancelling"].includes(job.status) &&
      job.cancelRequestedAt
      ? job
      : null;
  }

  async finishCancelledJob(
    jobId: string,
    claimOwner: string,
  ): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE jobs
       SET status = 'cancelled', stage = 'cancelled',
           completed_at = NOW(3), source_html = NULL,
           lease_owner = NULL, lease_expires_at = NULL,
           error_code = NULL, error_message = NULL
       WHERE id = ? AND lease_owner = ?
         AND lease_expires_at > NOW(3)
         AND status IN ('running', 'cancelling')
         AND cancel_requested_at IS NOT NULL`,
      [jobId, claimOwner],
    );
    return result.affectedRows > 0;
  }

  async markSuperseded(
    userId: string,
    sourceWiki: string,
    sourceTitle: string,
    targetWiki: TargetWikiCode,
    exceptJobId?: string,
  ): Promise<void> {
    const params: (string | number | Date | null)[] = [
      userId,
      sourceWiki,
      sourceTitle,
      targetWiki,
    ];
    let extra = "";
    if (exceptJobId) {
      extra = " AND id <> ?";
      params.push(exceptJobId);
    }
    await this.pool.execute(
      `UPDATE jobs
       SET status = 'superseded', source_html = NULL,
           result_wikitext = NULL, result_meta_json = NULL,
           lease_owner = NULL, lease_expires_at = NULL,
           completed_at = COALESCE(completed_at, NOW(3))
       WHERE user_id = ? AND source_wiki = ? AND source_title = ?
         AND target_wiki = ? AND active_slot IS NULL${extra}`,
      params,
    );
  }

  async countJobsCreatedSince(userId: string, since: Date): Promise<number> {
    const [rows] = await this.pool.execute<
      (RowDataPacket & { count: number })[]
    >(
      `SELECT COUNT(*) AS count FROM jobs
       WHERE user_id = ? AND created_at >= ?`,
      [userId, since],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async claimNextJob(
    workerId: string,
    leaseSeconds: number,
  ): Promise<JobRecord | null> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<JobRow[]>(
        `SELECT ${JOB_COLUMNS_WITH_HTML} FROM jobs
         WHERE status IN ('queued', 'retrying')
            OR (status = 'running' AND (lease_expires_at IS NULL OR lease_expires_at < NOW(3)))
            OR (status = 'cancelling' AND (lease_expires_at IS NULL OR lease_expires_at < NOW(3)))
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      );
      const row = rows[0];
      if (!row) {
        await connection.rollback();
        return null;
      }

      const claimOwner = `${workerId}:${newId()}`;
      await connection.execute(
        `UPDATE jobs
         SET status = 'running',
             stage = CASE WHEN stage = 'queued' OR stage = 'retrying' THEN 'parsing' ELSE stage END,
             lease_owner = ?,
             lease_expires_at = DATE_ADD(NOW(3), INTERVAL ${Math.max(
               30,
               Math.floor(leaseSeconds),
             )} SECOND),
             started_at = COALESCE(started_at, NOW(3))
         WHERE id = ?`,
        [claimOwner, row.id],
      );
      await connection.commit();

      const job = await this.getJob(row.id);
      if (!job) throw new Error("Claimed job could not be read back");
      return job;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async renewLease(
    jobId: string,
    workerId: string,
    leaseSeconds: number,
  ): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE jobs
       SET lease_expires_at = DATE_ADD(NOW(3), INTERVAL ${Math.max(
         30,
         Math.floor(leaseSeconds),
       )} SECOND)
       WHERE id = ? AND lease_owner = ?
         AND lease_expires_at > NOW(3)
         AND status IN ('running', 'cancelling')`,
      [jobId, workerId],
    );
    return result.affectedRows > 0;
  }

  async saveChunkPlan(
    jobId: string,
    claimOwner: string,
    chunks: ChunkPlan[],
  ): Promise<boolean> {
    const connection = await this.pool.getConnection();
    const now = new Date();
    try {
      await connection.beginTransaction();
      const [claims] = await connection.execute<
        (RowDataPacket & { id: string })[]
      >(
        `SELECT id FROM jobs
         WHERE id = ? AND lease_owner = ?
           AND lease_expires_at > NOW(3)
           AND status = 'running' AND cancel_requested_at IS NULL
         FOR UPDATE`,
        [jobId, claimOwner],
      );
      if (!claims[0]) {
        await connection.rollback();
        return false;
      }
      for (const chunk of chunks) {
        await connection.execute(
          `INSERT INTO job_chunks (
             id, job_id, chunk_id, ordinal, status, fingerprint, units_json,
             attempts, created_at, updated_at
           ) VALUES (?, ?, ?, ?, 'pending', ?, ?, 0, ?, ?)
           ON DUPLICATE KEY UPDATE
             ordinal = VALUES(ordinal),
             fingerprint = VALUES(fingerprint),
             units_json = VALUES(units_json),
             updated_at = VALUES(updated_at)`,
          [
            newId(),
            jobId,
            chunk.id,
            chunks.indexOf(chunk),
            chunk.fingerprint,
            JSON.stringify(chunk.units),
            now,
            now,
          ],
        );
      }
      await connection.execute(
        `UPDATE jobs
         SET total_chunks = ?, total_units = ?,
             completed_chunks = 0, failed_chunks = 0,
             translated_units = 0, stage = 'translating'
         WHERE id = ?`,
        [
          chunks.length,
          chunks.reduce((sum, chunk) => sum + chunk.units.length, 0),
          jobId,
        ],
      );
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getChunks(jobId: string): Promise<ChunkRecord[]> {
    const [rows] = await this.pool.execute<ChunkRow[]>(
      `SELECT * FROM job_chunks WHERE job_id = ? ORDER BY ordinal ASC`,
      [jobId],
    );
    return rows.map(mapChunk);
  }

  async markChunkTranslating(
    jobId: string,
    claimOwner: string,
    chunkId: string,
  ): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE job_chunks c JOIN jobs j ON j.id = c.job_id
       SET c.status = 'translating', c.attempts = c.attempts + 1,
           c.updated_at = NOW(3)
       WHERE c.job_id = ? AND c.chunk_id = ?
         AND c.status IN ('pending', 'failed', 'translating')
         AND j.lease_owner = ? AND j.lease_expires_at > NOW(3)
         AND j.status = 'running' AND j.cancel_requested_at IS NULL`,
      [jobId, chunkId, claimOwner],
    );
    return result.affectedRows > 0;
  }

  async saveChunkTranslation(
    jobId: string,
    claimOwner: string,
    chunkId: string,
    translated: TranslatedChunkRecord,
    attempts: number,
  ): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE job_chunks c JOIN jobs j ON j.id = c.job_id
       SET c.status = 'translated', c.translated_json = ?, c.usage_json = ?,
           c.attempts = ?, c.last_error = NULL, c.updated_at = NOW(3)
       WHERE c.job_id = ? AND c.chunk_id = ? AND c.status = 'translating'
         AND j.lease_owner = ? AND j.lease_expires_at > NOW(3)
         AND j.status = 'running' AND j.cancel_requested_at IS NULL`,
      [
        JSON.stringify(translated.units),
        translated.usage ? JSON.stringify(translated.usage) : null,
        attempts,
        jobId,
        chunkId,
        claimOwner,
      ],
    );
    return result.affectedRows > 0;
  }

  async markChunkFailed(
    jobId: string,
    claimOwner: string,
    chunkId: string,
    message: string,
    attempts: number,
  ): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE job_chunks c JOIN jobs j ON j.id = c.job_id
       SET c.status = 'failed', c.last_error = ?, c.attempts = ?,
           c.updated_at = NOW(3)
       WHERE c.job_id = ? AND c.chunk_id = ? AND c.status = 'translating'
         AND j.lease_owner = ? AND j.lease_expires_at > NOW(3)
         AND j.status = 'running' AND j.cancel_requested_at IS NULL`,
      [message.slice(0, 2000), attempts, jobId, chunkId, claimOwner],
    );
    return result.affectedRows > 0;
  }

  async resetFailedChunks(jobId: string): Promise<number> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE job_chunks
         SET status = 'pending', last_error = NULL, updated_at = NOW(3)
         WHERE job_id = ? AND status = 'failed'`,
        [jobId],
      );
      await connection.execute(
        `UPDATE jobs
         SET status = 'queued', stage = 'retrying', progress = 5,
             error_code = NULL, error_message = NULL,
             completed_at = NULL, expires_at = NULL,
             lease_owner = NULL, lease_expires_at = NULL
         WHERE id = ?`,
        [jobId],
      );
      await connection.commit();
      return result.affectedRows;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async appendEvent(
    jobId: string,
    level: EventLevel,
    code: string,
    message: string,
    data?: Record<string, unknown> | null,
  ): Promise<JobEventRecord> {
    const now = new Date();
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO job_events (job_id, level, code, message, data_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        jobId,
        level,
        code.slice(0, 64),
        message.slice(0, 4000),
        data ? JSON.stringify(data) : null,
        now,
      ],
    );
    return {
      id: Number(result.insertId),
      jobId,
      level,
      code,
      message,
      data: data ?? null,
      createdAt: now.toISOString(),
    };
  }

  async listEvents(
    jobId: string,
    afterId: number,
    limit: number,
  ): Promise<JobEventRecord[]> {
    const [rows] = await this.pool.execute<EventRow[]>(
      `SELECT * FROM job_events
       WHERE job_id = ? AND id > ?
       ORDER BY id ASC
       LIMIT ?`,
      [jobId, Math.max(0, afterId), Math.max(1, Math.min(500, limit))],
    );
    return rows.map(mapEvent);
  }

  async expireJobs(now: Date): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE jobs
       SET status = 'expired', source_html = NULL,
           result_wikitext = NULL, result_meta_json = NULL,
           lease_owner = NULL, lease_expires_at = NULL
       WHERE status IN ('completed', 'failed')
         AND expires_at IS NOT NULL AND expires_at <= ?`,
      [now],
    );
    return result.affectedRows;
  }

  async purgeExpiredPayloads(now: Date): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `DELETE c FROM job_chunks c
       JOIN jobs j ON j.id = c.job_id
       WHERE j.status IN ('expired', 'superseded')
          OR (j.status = 'cancelled' AND j.completed_at < DATE_SUB(?, INTERVAL 1 DAY))`,
      [now],
    );
    return result.affectedRows;
  }

  async purgeOldJobs(cutoff: Date): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `DELETE FROM jobs
       WHERE status IN ('expired', 'cancelled', 'superseded')
         AND created_at < ?`,
      [cutoff],
    );
    return result.affectedRows;
  }
}
