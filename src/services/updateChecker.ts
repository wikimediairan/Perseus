import { GITHUB_LATEST_RELEASE_API_URL } from "@/services/config";

// How long to wait for GitHub before giving up
const REQUEST_TIMEOUT_MS = 5000;

export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  releaseUrl?: string;
}

interface GithubReleaseResponse {
  tag_name?: unknown;
  html_url?: unknown;
  body?: unknown;
  prerelease?: unknown;
}

function parseVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease: null | string;
} {
  const clean = version.trim().replace(/^v/i, "");
  const [core, prerelease = null] = clean.split("-", 2);
  const [major = 0, minor = 0, patch = 0] = core.split(".").map((n) => Number.parseInt(n, 10) || 0);
  return { major, minor, patch, prerelease };
}

export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);

  if (va.major !== vb.major) {
    return va.major - vb.major;
  }

  if (va.minor !== vb.minor) {
    return va.minor - vb.minor;
  }

  if (va.patch !== vb.patch) {
    return va.patch - vb.patch;
  }

  if (va.prerelease === vb.prerelease) {
    return 0;
  }

  if (va.prerelease === null) {
    return 1;
  }

  if (vb.prerelease === null) {
    return -1;
  }

  return va.prerelease < vb.prerelease ? -1 : 1;
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}

function firstParagraph(body: string): string {
  const MAX_LENGTH = 400;
  const paragraph =
    body
      .trim()
      .split(/\r?\n\s*\n/)[0]
      ?.trim() ?? "";
  return paragraph.length > MAX_LENGTH ? `${paragraph.slice(0, MAX_LENGTH).trimEnd()}…` : paragraph;
}

async function fetchLatestRelease(): Promise<null | GithubReleaseResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GITHUB_LATEST_RELEASE_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as GithubReleaseResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
  const release = await fetchLatestRelease();

  if (!release || typeof release.tag_name !== "string" || typeof release.html_url !== "string") {
    return { available: false, currentVersion };
  }

  if (release.prerelease === true) {
    return { available: false, currentVersion };
  }

  const latestVersion = release.tag_name.replace(/^v/i, "");

  if (!isNewerVersion(latestVersion, currentVersion)) {
    return { available: false, currentVersion };
  }

  return {
    available: true,
    currentVersion,
    latestVersion,
    releaseNotes:
      typeof release.body === "string" && release.body.trim()
        ? firstParagraph(release.body)
        : undefined,
    releaseUrl: release.html_url,
  };
}
