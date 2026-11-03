import type {
  ChunkPlan,
  ChunkRecord,
  EventLevel,
  GadgetCodeRecord,
  JobEventRecord,
  JobRecord,
  JobStatus,
  OAuthStateRecord,
  TargetWikiCode,
  TranslatedChunkRecord,
  UserRecord,
} from "../domain/types.js";
import { ApiError } from "../util/errors.js";
import { newId } from "../util/ids.js";
import type { CreateJobInput, Store, UpdateJobPatch } from "./store.js";

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const ACTIVE_STATUSES: JobStatus[] = [
  "queued",
  "running",
  "retrying",
  "cancelling",
];

function isActive(status: JobStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export class MemoryStore implements Store {
  private readonly users = new Map<string, UserRecord>();
  private readonly usersByWikimediaId = new Map<string, string>();
  private readonly sessions = new Map<
    string,
    {
      userId: string;
      expiresAt: string;
      createdAt: string;
      revokedAt: string | null;
    }
  >();
  private readonly oauthStates = new Map<string, OAuthStateRecord>();
  private readonly gadgetCodes = new Map<string, GadgetCodeRecord>();
  private readonly jobs = new Map<string, JobRecord>();
  private readonly chunks = new Map<string, ChunkRecord[]>();
  private readonly events = new Map<string, JobEventRecord[]>();
  private nextEventId = 1;

  private ownsClaim(jobId: string, claimOwner: string): boolean {
    const job = this.jobs.get(jobId);
    return Boolean(
      job &&
        job.status === "running" &&
        job.leaseOwner === claimOwner &&
        job.leaseExpiresAt &&
        new Date(job.leaseExpiresAt).getTime() > Date.now() &&
        !job.cancelRequestedAt,
    );
  }

  async init(): Promise<void> {
    // No-op.
  }

  async upsertUser(
    wikimediaUserId: string,
    username: string,
  ): Promise<UserRecord> {
    const existingId = this.usersByWikimediaId.get(wikimediaUserId);
    const now = new Date().toISOString();

    if (existingId) {
      const existing = this.users.get(existingId);
      if (!existing) throw new Error("User index is inconsistent");
      const updated = { ...existing, username, updatedAt: now };
      this.users.set(existingId, updated);
      return copy(updated);
    }

    const user: UserRecord = {
      id: newId(),
      wikimediaUserId,
      username,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    this.usersByWikimediaId.set(wikimediaUserId, user.id);
    return copy(user);
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return user ? copy(user) : null;
  }

  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    this.sessions.set(tokenHash, {
      userId,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      revokedAt: null,
    });
  }

  async findSession(
    tokenHash: string,
  ): Promise<{ user: UserRecord; expiresAt: string } | null> {
    const session = this.sessions.get(tokenHash);
    if (!session || session.revokedAt) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
    const user = this.users.get(session.userId);
    if (!user) return null;
    return { user: copy(user), expiresAt: session.expiresAt };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    const session = this.sessions.get(tokenHash);
    if (session) {
      this.sessions.set(tokenHash, {
        ...session,
        revokedAt: new Date().toISOString(),
      });
    }
  }

  async createOAuthState(record: OAuthStateRecord): Promise<void> {
    this.oauthStates.set(record.stateHash, copy(record));
  }

  async consumeOAuthState(stateHash: string): Promise<OAuthStateRecord | null> {
    const record = this.oauthStates.get(stateHash);
    if (!record || record.consumedAt) return null;
    if (new Date(record.expiresAt).getTime() <= Date.now()) return null;
    const consumed = { ...record, consumedAt: new Date().toISOString() };
    this.oauthStates.set(stateHash, consumed);
    return copy(record);
  }

  async createGadgetCode(record: GadgetCodeRecord): Promise<void> {
    this.gadgetCodes.set(record.codeHash, copy(record));
  }

  async findGadgetCode(codeHash: string): Promise<GadgetCodeRecord | null> {
    const record = this.gadgetCodes.get(codeHash);
    return record ? copy(record) : null;
  }

  async redeemGadgetCode(codeHash: string): Promise<GadgetCodeRecord | null> {
    const record = this.gadgetCodes.get(codeHash);
    if (!record || record.redeemedAt) return null;
    if (new Date(record.expiresAt).getTime() <= Date.now()) return null;
    const redeemed = { ...record, redeemedAt: new Date().toISOString() };
    this.gadgetCodes.set(codeHash, redeemed);
    return copy(record);
  }

  async createJob(input: CreateJobInput): Promise<JobRecord> {
    const active = await this.getActiveJob(input.userId);
    if (active) {
      throw new ApiError(
        409,
        "ACTIVE_JOB_EXISTS",
        "You already have an active translation job.",
        { jobId: active.id },
      );
    }

    if (input.replaceExisting) {
      for (const job of this.jobs.values()) {
        if (
          job.userId === input.userId &&
          job.sourceWiki === input.source.wiki &&
          job.sourceTitle === input.source.title &&
          job.targetWiki === input.targetWiki &&
          !isActive(job.status)
        ) {
          job.status = "superseded";
          job.sourceHtml = null;
          job.resultWikitext = null;
          job.resultMeta = null;
          job.completedAt = job.completedAt ?? new Date().toISOString();
        }
      }
    }

    const now = new Date().toISOString();
    const job: JobRecord = {
      id: newId(),
      userId: input.userId,
      status: "queued",
      sourceWiki: input.source.wiki,
      sourceTitle: input.source.title,
      sourcePageId: input.source.pageId,
      sourceRevisionId: input.source.revisionId,
      sourceUrl: input.source.url,
      targetWiki: input.targetWiki,
      selection: copy(input.selection),
      sections: copy(input.sections),
      sourceHtml: input.sourceHtml,
      totalChunks: 0,
      completedChunks: 0,
      failedChunks: 0,
      totalUnits: 0,
      translatedUnits: 0,
      progress: 0,
      stage: "queued",
      errorCode: null,
      errorMessage: null,
      resultWikitext: null,
      resultMeta: null,
      warnings: [],
      createdAt: now,
      startedAt: null,
      completedAt: null,
      expiresAt: null,
      cancelRequestedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    };
    this.jobs.set(job.id, job);
    return copy(job);
  }

  async getJob(jobId: string): Promise<JobRecord | null> {
    const job = this.jobs.get(jobId);
    return job ? copy(job) : null;
  }

  async getJobSummary(jobId: string): Promise<JobRecord | null> {
    const job = this.jobs.get(jobId);
    return job ? { ...copy(job), sourceHtml: null } : null;
  }

  async getActiveJob(userId: string): Promise<JobRecord | null> {
    for (const job of this.jobs.values()) {
      if (job.userId === userId && isActive(job.status)) {
        return { ...copy(job), sourceHtml: null };
      }
    }
    return null;
  }

  async findRestorableJob(
    userId: string,
    sourceWiki: string,
    sourceTitle: string,
    targetWiki: TargetWikiCode,
  ): Promise<JobRecord | null> {
    let found: JobRecord | null = null;
    for (const job of this.jobs.values()) {
      if (
        job.userId === userId &&
        job.sourceWiki === sourceWiki &&
        job.sourceTitle === sourceTitle &&
        job.targetWiki === targetWiki &&
        ["completed", "failed", "cancelled"].includes(job.status) &&
        (!job.expiresAt || new Date(job.expiresAt).getTime() > Date.now())
      ) {
        if (!found || job.createdAt > found.createdAt) found = job;
      }
    }
    return found ? copy(found) : null;
  }

  async listRecentJobs(userId: string, limit: number): Promise<JobRecord[]> {
    return [...this.jobs.values()]
      .filter((job) => job.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, Math.min(50, limit)))
      .map((job) => copy(job));
  }

  async updateJob(
    jobId: string,
    patch: UpdateJobPatch,
    claimOwner?: string,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || (claimOwner && !this.ownsClaim(jobId, claimOwner))) {
      return false;
    }

    if (patch.status !== undefined) job.status = patch.status;
    if (patch.stage !== undefined) job.stage = patch.stage;
    if (patch.progress !== undefined) {
      job.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));
    }
    if (patch.totalChunks !== undefined) job.totalChunks = patch.totalChunks;
    if (patch.completedChunks !== undefined) {
      job.completedChunks = patch.completedChunks;
    }
    if (patch.failedChunks !== undefined) job.failedChunks = patch.failedChunks;
    if (patch.totalUnits !== undefined) job.totalUnits = patch.totalUnits;
    if (patch.translatedUnits !== undefined) {
      job.translatedUnits = patch.translatedUnits;
    }
    if (patch.errorCode !== undefined) job.errorCode = patch.errorCode;
    if (patch.errorMessage !== undefined) {
      job.errorMessage = patch.errorMessage;
    }
    if (patch.resultWikitext !== undefined) {
      job.resultWikitext = patch.resultWikitext;
    }
    if (patch.resultMeta !== undefined) job.resultMeta = patch.resultMeta;
    if (patch.sourceHtml !== undefined) job.sourceHtml = patch.sourceHtml;
    if (patch.warnings !== undefined) job.warnings = copy(patch.warnings);
    if (patch.startedAt !== undefined) job.startedAt = patch.startedAt;
    if (patch.completedAt !== undefined) job.completedAt = patch.completedAt;
    if (patch.expiresAt !== undefined) job.expiresAt = patch.expiresAt;
    if (patch.cancelRequestedAt !== undefined) {
      job.cancelRequestedAt = patch.cancelRequestedAt;
    }
    if (patch.leaseOwner !== undefined) job.leaseOwner = patch.leaseOwner;
    if (patch.leaseExpiresAt !== undefined) {
      job.leaseExpiresAt = patch.leaseExpiresAt;
    }

    this.jobs.set(jobId, job);
    return true;
  }

  async requestCancel(
    jobId: string,
    userId: string,
  ): Promise<JobRecord | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId || !isActive(job.status)) return null;
    const now = new Date().toISOString();
    if (job.status === "queued" || job.status === "retrying") {
      await this.updateJob(jobId, {
        status: "cancelled",
        stage: "cancelled",
        completedAt: now,
        cancelRequestedAt: now,
        sourceHtml: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
    } else {
      await this.updateJob(jobId, {
        status: "cancelling",
        stage: "cancelling",
        cancelRequestedAt: now,
      });
    }
    return this.getJobSummary(jobId);
  }

  async finishCancelledJob(
    jobId: string,
    claimOwner: string,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (
      !job ||
      job.leaseOwner !== claimOwner ||
      !job.leaseExpiresAt ||
      new Date(job.leaseExpiresAt).getTime() <= Date.now() ||
      !job.cancelRequestedAt ||
      !["running", "cancelling"].includes(job.status)
    ) {
      return false;
    }
    return this.updateJob(jobId, {
      status: "cancelled",
      stage: "cancelled",
      completedAt: new Date().toISOString(),
      sourceHtml: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCode: null,
      errorMessage: null,
    });
  }

  async markSuperseded(
    userId: string,
    sourceWiki: string,
    sourceTitle: string,
    targetWiki: TargetWikiCode,
    exceptJobId?: string,
  ): Promise<void> {
    for (const job of this.jobs.values()) {
      if (
        job.userId === userId &&
        job.sourceWiki === sourceWiki &&
        job.sourceTitle === sourceTitle &&
        job.targetWiki === targetWiki &&
        job.id !== exceptJobId &&
        !isActive(job.status)
      ) {
        job.status = "superseded";
        job.sourceHtml = null;
        job.resultWikitext = null;
        job.resultMeta = null;
      }
    }
  }

  async countJobsCreatedSince(userId: string, since: Date): Promise<number> {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (
        job.userId === userId &&
        new Date(job.createdAt).getTime() >= since.getTime()
      ) {
        count++;
      }
    }
    return count;
  }

  async claimNextJob(
    workerId: string,
    leaseSeconds: number,
  ): Promise<JobRecord | null> {
    const now = Date.now();
    const candidate = [...this.jobs.values()]
      .filter((job) => {
        if (job.status === "queued" || job.status === "retrying") return true;
        return (
          (job.status === "running" || job.status === "cancelling") &&
          (!job.leaseExpiresAt || new Date(job.leaseExpiresAt).getTime() < now)
        );
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

    if (!candidate) return null;

    candidate.status = "running";
    candidate.leaseOwner = `${workerId}:${newId()}`;
    candidate.leaseExpiresAt = new Date(
      now + leaseSeconds * 1000,
    ).toISOString();
    candidate.startedAt = candidate.startedAt ?? new Date().toISOString();
    if (candidate.stage === "queued" || candidate.stage === "retrying") {
      candidate.stage = "parsing";
    }
    this.jobs.set(candidate.id, candidate);
    return copy(candidate);
  }

  async renewLease(
    jobId: string,
    workerId: string,
    leaseSeconds: number,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (
      !job ||
      !["running", "cancelling"].includes(job.status) ||
      job.leaseOwner !== workerId ||
      !job.leaseExpiresAt ||
      new Date(job.leaseExpiresAt).getTime() <= Date.now()
    ) {
      return false;
    }
    job.leaseExpiresAt = new Date(
      Date.now() + leaseSeconds * 1000,
    ).toISOString();
    return true;
  }

  async saveChunkPlan(
    jobId: string,
    claimOwner: string,
    chunks: ChunkPlan[],
  ): Promise<boolean> {
    if (!this.ownsClaim(jobId, claimOwner)) return false;
    const now = new Date().toISOString();
    this.chunks.set(
      jobId,
      chunks.map((chunk, index) => ({
        jobId,
        chunkId: chunk.id,
        ordinal: index,
        status: "pending",
        fingerprint: chunk.fingerprint,
        units: copy(chunk.units),
        translated: null,
        usage: null,
        attempts: 0,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      })),
    );

    const job = this.jobs.get(jobId);
    if (job) {
      job.totalChunks = chunks.length;
      job.totalUnits = chunks.reduce(
        (sum, chunk) => sum + chunk.units.length,
        0,
      );
      job.completedChunks = 0;
      job.failedChunks = 0;
      job.translatedUnits = 0;
      job.stage = "translating";
    }
    return true;
  }

  async getChunks(jobId: string): Promise<ChunkRecord[]> {
    return copy(this.chunks.get(jobId) ?? []);
  }

  async markChunkTranslating(
    jobId: string,
    claimOwner: string,
    chunkId: string,
  ): Promise<boolean> {
    if (!this.ownsClaim(jobId, claimOwner)) return false;
    const chunk = this.chunks
      .get(jobId)
      ?.find((item) => item.chunkId === chunkId);
    if (chunk && ["pending", "failed", "translating"].includes(chunk.status)) {
      chunk.status = "translating";
      chunk.attempts++;
      chunk.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  async saveChunkTranslation(
    jobId: string,
    claimOwner: string,
    chunkId: string,
    translated: TranslatedChunkRecord,
    attempts: number,
  ): Promise<boolean> {
    if (!this.ownsClaim(jobId, claimOwner)) return false;
    const chunk = this.chunks
      .get(jobId)
      ?.find((item) => item.chunkId === chunkId);
    if (!chunk || chunk.status !== "translating") return false;
    chunk.status = "translated";
    chunk.translated = copy(translated.units);
    chunk.usage = translated.usage ? copy(translated.usage) : null;
    chunk.attempts = attempts;
    chunk.lastError = null;
    chunk.updatedAt = new Date().toISOString();
    return true;
  }

  async markChunkFailed(
    jobId: string,
    claimOwner: string,
    chunkId: string,
    message: string,
    attempts: number,
  ): Promise<boolean> {
    if (!this.ownsClaim(jobId, claimOwner)) return false;
    const chunk = this.chunks
      .get(jobId)
      ?.find((item) => item.chunkId === chunkId);
    if (!chunk || chunk.status !== "translating") return false;
    chunk.status = "failed";
    chunk.lastError = message;
    chunk.attempts = attempts;
    chunk.updatedAt = new Date().toISOString();
    return true;
  }

  async resetFailedChunks(jobId: string): Promise<number> {
    const chunks = this.chunks.get(jobId) ?? [];
    let reset = 0;
    for (const chunk of chunks) {
      if (chunk.status === "failed") {
        chunk.status = "pending";
        chunk.lastError = null;
        chunk.updatedAt = new Date().toISOString();
        reset++;
      }
    }
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = "queued";
      job.stage = "retrying";
      job.progress = 5;
      job.errorCode = null;
      job.errorMessage = null;
      job.completedAt = null;
      job.expiresAt = null;
      job.leaseOwner = null;
      job.leaseExpiresAt = null;
    }
    return reset;
  }

  async appendEvent(
    jobId: string,
    level: EventLevel,
    code: string,
    message: string,
    data?: Record<string, unknown> | null,
  ): Promise<JobEventRecord> {
    const event: JobEventRecord = {
      id: this.nextEventId++,
      jobId,
      level,
      code,
      message,
      data: data ?? null,
      createdAt: new Date().toISOString(),
    };
    const list = this.events.get(jobId) ?? [];
    list.push(event);
    this.events.set(jobId, list);
    return copy(event);
  }

  async listEvents(
    jobId: string,
    afterId: number,
    limit: number,
  ): Promise<JobEventRecord[]> {
    return (this.events.get(jobId) ?? [])
      .filter((event) => event.id > afterId)
      .slice(0, Math.max(1, Math.min(500, limit)))
      .map((event) => copy(event));
  }

  async expireJobs(now: Date): Promise<number> {
    let expired = 0;
    for (const job of this.jobs.values()) {
      if (
        (job.status === "completed" || job.status === "failed") &&
        job.expiresAt &&
        new Date(job.expiresAt).getTime() <= now.getTime()
      ) {
        job.status = "expired";
        job.sourceHtml = null;
        job.resultWikitext = null;
        job.resultMeta = null;
        job.leaseOwner = null;
        job.leaseExpiresAt = null;
        expired++;
      }
    }
    return expired;
  }

  async purgeExpiredPayloads(_now: Date): Promise<number> {
    return 0;
  }

  async purgeOldJobs(cutoff: Date): Promise<number> {
    let removed = 0;
    for (const [id, job] of this.jobs) {
      if (
        ["expired", "cancelled", "superseded"].includes(job.status) &&
        new Date(job.createdAt).getTime() < cutoff.getTime()
      ) {
        this.jobs.delete(id);
        this.chunks.delete(id);
        this.events.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
