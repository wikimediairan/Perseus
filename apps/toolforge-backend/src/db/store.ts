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
  SourcePage,
  TargetWikiCode,
  TranslatedChunkRecord,
  UserRecord,
} from "../domain/types.js";

export interface CreateJobInput {
  userId: string;
  source: SourcePage;
  targetWiki: TargetWikiCode;
  selection: SectionSelection;
  sections: SectionNode[];
  sourceHtml: string;
  replaceExisting: boolean;
}

export interface UpdateJobPatch {
  status?: JobStatus;
  stage?: string;
  progress?: number;
  totalChunks?: number;
  completedChunks?: number;
  failedChunks?: number;
  totalUnits?: number;
  translatedUnits?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  resultWikitext?: string | null;
  resultMeta?: Record<string, unknown> | null;
  sourceHtml?: string | null;
  warnings?: string[];
  startedAt?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
  cancelRequestedAt?: string | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
}

export interface Store {
  init(): Promise<void>;

  upsertUser(wikimediaUserId: string, username: string): Promise<UserRecord>;
  findUserById(id: string): Promise<UserRecord | null>;

  createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  findSession(
    tokenHash: string,
  ): Promise<{ user: UserRecord; expiresAt: string } | null>;
  deleteSession(tokenHash: string): Promise<void>;

  createOAuthState(record: OAuthStateRecord): Promise<void>;
  consumeOAuthState(stateHash: string): Promise<OAuthStateRecord | null>;

  createGadgetCode(record: GadgetCodeRecord): Promise<void>;
  findGadgetCode(codeHash: string): Promise<GadgetCodeRecord | null>;
  redeemGadgetCode(codeHash: string): Promise<GadgetCodeRecord | null>;

  createJob(input: CreateJobInput): Promise<JobRecord>;
  getJob(jobId: string): Promise<JobRecord | null>;
  getJobSummary(jobId: string): Promise<JobRecord | null>;
  getActiveJob(userId: string): Promise<JobRecord | null>;
  findRestorableJob(
    userId: string,
    sourceWiki: string,
    sourceTitle: string,
    targetWiki: TargetWikiCode,
  ): Promise<JobRecord | null>;
  listRecentJobs(userId: string, limit: number): Promise<JobRecord[]>;
  updateJob(
    jobId: string,
    patch: UpdateJobPatch,
    claimOwner?: string,
  ): Promise<boolean>;
  requestCancel(jobId: string, userId: string): Promise<JobRecord | null>;
  finishCancelledJob(jobId: string, claimOwner: string): Promise<boolean>;
  markSuperseded(
    userId: string,
    sourceWiki: string,
    sourceTitle: string,
    targetWiki: TargetWikiCode,
    exceptJobId?: string,
  ): Promise<void>;
  countJobsCreatedSince(userId: string, since: Date): Promise<number>;

  claimNextJob(
    workerId: string,
    leaseSeconds: number,
  ): Promise<JobRecord | null>;
  renewLease(
    jobId: string,
    workerId: string,
    leaseSeconds: number,
  ): Promise<boolean>;

  saveChunkPlan(
    jobId: string,
    claimOwner: string,
    chunks: ChunkPlan[],
  ): Promise<boolean>;
  getChunks(jobId: string): Promise<ChunkRecord[]>;
  markChunkTranslating(
    jobId: string,
    claimOwner: string,
    chunkId: string,
  ): Promise<boolean>;
  saveChunkTranslation(
    jobId: string,
    claimOwner: string,
    chunkId: string,
    translated: TranslatedChunkRecord,
    attempts: number,
  ): Promise<boolean>;
  markChunkFailed(
    jobId: string,
    claimOwner: string,
    chunkId: string,
    message: string,
    attempts: number,
  ): Promise<boolean>;
  resetFailedChunks(jobId: string): Promise<number>;

  appendEvent(
    jobId: string,
    level: EventLevel,
    code: string,
    message: string,
    data?: Record<string, unknown> | null,
  ): Promise<JobEventRecord>;
  listEvents(
    jobId: string,
    afterId: number,
    limit: number,
  ): Promise<JobEventRecord[]>;

  expireJobs(now: Date): Promise<number>;
  purgeExpiredPayloads(now: Date): Promise<number>;
  purgeOldJobs(cutoff: Date): Promise<number>;
}
