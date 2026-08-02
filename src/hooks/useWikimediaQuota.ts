import type { WikimediaQuota } from "@core/wikimedia-provider/quota";
import { fetchWikimediaQuota } from "@core/wikimedia-provider/quota";
import { useCallback, useEffect, useState } from "react";

export function useWikimediaQuota(apiKey: string | undefined) {
  const [quota, setQuota] = useState<null | WikimediaQuota>(null);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const refetch = useCallback(async () => {
    if (!apiKey) {
      setQuota(null);
      setHasError(false);
      return;
    }

    setLoading(true);
    setHasError(false);

    try {
      setQuota(await fetchWikimediaQuota(apiKey));
    } catch {
      setQuota(null);
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { quota, loading, hasError, refetch };
}
