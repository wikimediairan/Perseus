//? for Runs the GitHub Releases version check

import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-shell";
import { useState, useEffect, useCallback } from "react";

import { GITHUB_RELEASES_URL } from "@/services/config";
import type { UpdateCheckResult } from "@/services/updateChecker";
import { checkForUpdates } from "@/services/updateChecker";

export function useUpdateChecker() {
  const [result, setResult] = useState<null | UpdateCheckResult>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const currentVersion = await getVersion();
        const checked = await checkForUpdates(currentVersion);
        if (!cancelled) {
          setResult(checked);
        }
      } catch (error) {
        // Update checks are best-effort. Users shouldn't be notified if they fail.
        console.warn("Update check failed:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const openReleases = useCallback(() => {
    void open(result?.releaseUrl ?? GITHUB_RELEASES_URL);
  }, [result]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return {
    updateAvailable: Boolean(result?.available) && !dismissed,
    result,
    openReleases,
    dismiss,
  };
}
