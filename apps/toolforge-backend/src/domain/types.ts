export type TargetWikiCode = "fa" | "tg";

export type JobStatus =
  | "queued"
  | "running"
  | "retrying"
  | "completed"
  | "failed"
  | "cancelling"
  | "cancelled"
  | "expired"
  | "superseded";

export type ChunkStatus = "pending" | "translating" | "translated" | "failed";

export type EventLevel = "debug" | "info" | "warn" | "error";

export interface SourceRef {
  wiki: string;
  title: string;
  pageId: number;
  revisionId: number;
  url: string;
}

export interface WorkUnit {
  nodeId: string;
  sourceText: string;
}

export interface TranslatedUnitRecord {
  nodeId: string;
  sourceText: string;
  translatedText: string;
}

export interface ChunkPlan {
  id: string;
  units: WorkUnit[];
  fingerprint: string;
}

export interface UsageRecord {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}

export interface TranslatedChunkRecord {
  id: string;
  units: TranslatedUnitRecord[];
  usage?: UsageRecord;
}

export interface SectionNode {
  id: string;
  title: string;
  level: number;
  parentId: string | null;
  hasOwnText: boolean;
  children: SectionNode[];
}

export interface SectionSelection {
  lead: boolean;
  sections: Record<string, { selected: boolean; ownText: boolean }>;
}

export interface SourcePage {
  wiki: string;
  domain: string;
  title: string;
  pageId: number;
  revisionId: number;
  url: string;
  namespace: number;
  redirect: boolean;
  disambiguation: boolean;
  fetchedAt: string;
}

export interface TargetEquivalent {
  title: string;
  url: string;
  found: boolean;
}

export interface SourceInspection {
  page: SourcePage;
  eligible: boolean;
  reason:
    | "ok"
    | "namespace"
    | "redirect"
    | "disambiguation"
    | "missing"
    | "unsupported-wiki";
  message: string;
  sections: SectionNode[];
  targetEquivalent: TargetEquivalent | null;
  warnings: string[];
}

export interface JobRecord {
  id: string;
  userId: string;
  status: JobStatus;
  sourceWiki: string;
  sourceTitle: string;
  sourcePageId: number;
  sourceRevisionId: number;
  sourceUrl: string;
  targetWiki: TargetWikiCode;
  selection: SectionSelection;
  sections: SectionNode[];
  sourceHtml: string | null;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  totalUnits: number;
  translatedUnits: number;
  progress: number;
  stage: string;
  errorCode: string | null;
  errorMessage: string | null;
  resultWikitext: string | null;
  resultMeta: Record<string, unknown> | null;
  warnings: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  cancelRequestedAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
}

export interface ChunkRecord {
  jobId: string;
  chunkId: string;
  ordinal: number;
  status: ChunkStatus;
  fingerprint: string;
  units: WorkUnit[];
  translated: TranslatedUnitRecord[] | null;
  usage: UsageRecord | null;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobEventRecord {
  id: number;
  jobId: string;
  level: EventLevel;
  code: string;
  message: string;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface UserRecord {
  id: string;
  wikimediaUserId: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface OAuthStateRecord {
  stateHash: string;
  origin: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface GadgetCodeRecord {
  codeHash: string;
  userId: string;
  origin: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
}

export interface JobView {
  id: string;
  status: JobStatus;
  stage: string;
  progress: number;
  source: SourceRef;
  targetWiki: TargetWikiCode;
  counts: {
    totalChunks: number;
    completedChunks: number;
    failedChunks: number;
    totalUnits: number;
    translatedUnits: number;
  };
  error: { code: string; message: string } | null;
  warnings: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  cancelRequested: boolean;
  outputAvailable: boolean;
}

export interface OutputView {
  jobId: string;
  wikitext: string;
  filename: "article.wiki";
  completedAt: string;
  expiresAt: string;
  warnings: string[];
}
