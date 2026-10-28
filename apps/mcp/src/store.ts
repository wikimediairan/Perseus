import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, posix, resolve, win32 } from "node:path";
import lockfile from "proper-lockfile";
import { ToolError } from "./runtime.js";
import { type SavedSession, sessionIdSchema, sessionSchema } from "./schema.js";

export function defaultDataDir(
  env = process.env,
  platform = process.platform,
  home = homedir(),
): string {
  const paths = platform === "win32" ? win32 : posix;
  if (platform === "win32")
    return paths.join(
      env.LOCALAPPDATA || paths.join(home, "AppData", "Local"),
      "Perseus",
      "mcp",
    );
  if (platform === "darwin")
    return paths.join(home, "Library", "Application Support", "Perseus", "mcp");
  return paths.join(
    env.XDG_DATA_HOME && posix.isAbsolute(env.XDG_DATA_HOME)
      ? env.XDG_DATA_HOME
      : paths.join(home, ".local", "share"),
    "perseus",
    "mcp",
  );
}

async function syncDirectory(path: string): Promise<void> {
  // Windows does not support opening directories for fsync through Node.
  if (process.platform === "win32") return;
  const directory = await open(path, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export async function atomicWrite(
  path: string,
  content: string,
  beforeCommit = () => {},
): Promise<void> {
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(content, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    beforeCommit();
    await rename(temporary, path);
    await syncDirectory(dirname(path));
  } finally {
    await rm(temporary, { force: true });
  }
}

export class SessionStore {
  readonly root: string;
  constructor(dataDir = process.env.PERSEUS_MCP_DATA_DIR || defaultDataDir()) {
    if (!isAbsolute(dataDir))
      throw new ToolError(
        "INVALID_DATA_DIR",
        "PERSEUS_MCP_DATA_DIR must be an absolute path.",
      );
    this.root = resolve(dataDir);
  }

  directory(id: string): string {
    if (!sessionIdSchema.safeParse(id).success)
      throw new ToolError(
        "INVALID_SESSION_ID",
        "Use the session ID returned by create_translation; paths are not accepted.",
      );
    return join(this.root, id);
  }

  private async checkDirectory(id: string): Promise<string> {
    const directory = this.directory(id);
    try {
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new ToolError(
          "INVALID_SESSION",
          "Session directory must be a real directory.",
        );
      const fileInfo = await lstat(join(directory, "session.json"));
      if (
        !fileInfo.isFile() ||
        fileInfo.isSymbolicLink() ||
        fileInfo.size > 50_000_000
      )
        throw new ToolError(
          "INVALID_SESSION",
          "Session file must be a regular JSON file of at most 50 MB.",
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new ToolError(
          "SESSION_NOT_FOUND",
          "Session not found. Check the ID and PERSEUS_MCP_DATA_DIR.",
        );
      throw error;
    }
    return directory;
  }

  async create(session: SavedSession): Promise<void> {
    sessionSchema.parse(session);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const directory = this.directory(session.id);
    // An unpredictable UUID and exclusive mkdir make creation independent.
    await mkdir(directory, { mode: 0o700 });
    await this.save(session);
  }

  async read(id: string): Promise<SavedSession> {
    const directory = await this.checkDirectory(id);
    try {
      const session = sessionSchema.parse(
        JSON.parse(await readFile(join(directory, "session.json"), "utf8")),
      );
      if (session.id !== id) throw new Error("Mismatched session identity");
      return session;
    } catch {
      throw new ToolError(
        "INVALID_SESSION",
        "Session data is invalid or uses an unsupported schema version. Restore a backup; do not edit version fields.",
      );
    }
  }

  async save(session: SavedSession): Promise<void> {
    sessionSchema.parse(session);
    const content = JSON.stringify(session);
    if (Buffer.byteLength(content) > 50_000_000)
      throw new ToolError(
        "ARTICLE_TOO_LARGE",
        "Saved session exceeds the 50 MB storage limit.",
      );
    await atomicWrite(
      join(this.directory(session.id), "session.json"),
      content,
      () => this.checkLock(session.id),
    );
  }

  async locked<T>(
    id: string,
    operation: (session: SavedSession) => Promise<T>,
  ): Promise<T> {
    const directory = await this.checkDirectory(id);
    let compromised = false;
    let release: () => Promise<void>;
    try {
      release = await lockfile.lock(join(directory, "session.json"), {
        realpath: false,
        stale: 10_000,
        update: 2000,
        retries: 0,
        onCompromised() {
          compromised = true;
        },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ELOCKED")
        throw new ToolError(
          "SESSION_BUSY",
          "Another process is updating this session. Retry, then retrieve the current chunk version.",
        );
      throw error;
    }
    // A compromised lease must never commit. Keep save/export behind this guard.
    this.guards.set(id, () => {
      if (compromised)
        throw new ToolError(
          "SESSION_BUSY",
          "Session lock was lost. Retrieve status and retry.",
        );
    });
    try {
      return await operation(await this.read(id));
    } finally {
      this.guards.delete(id);
      if (!compromised) await release();
    }
  }

  private guards = new Map<string, () => void>();
  checkLock(id: string): void {
    this.guards.get(id)?.();
  }

  async writeExport(id: string, desktopSession: unknown, wikitext: string) {
    this.checkLock(id);
    const directory = this.directory(id);
    const exportId = `export-${randomUUID()}`;
    const temporary = join(directory, `.${exportId}.tmp`);
    const destination = join(directory, exportId);
    await mkdir(temporary, { mode: 0o700 });
    try {
      await atomicWrite(
        join(temporary, "session.json"),
        JSON.stringify(desktopSession, null, 2),
      );
      await atomicWrite(join(temporary, "article.wiki"), wikitext);
      this.checkLock(id);
      // Publish the pair together. A failure cannot expose a half-written export.
      await rename(temporary, destination);
      await syncDirectory(directory);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
    return {
      sessionFile: join(destination, "session.json"),
      wikitextFile: join(destination, "article.wiki"),
    };
  }
}
