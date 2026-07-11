//? errors to a user-facing message, and reports them via sonner toast. Rethrows so a

import { useCallback, useState } from "react";
import { toast } from "sonner";

export interface AsyncActionOptions {
  toastOnError?: boolean;
  successMessage?: string;
}

export interface AsyncAction<Args extends unknown[]> {
  busy: boolean;
  run: (...args: Args) => Promise<void>;
}

export function useAsyncAction<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void>,
  toUserMessage: (err: unknown) => string,
  options: AsyncActionOptions = {},
): AsyncAction<Args> {
  const { toastOnError = true, successMessage } = options;
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (...args: Args) => {
      setBusy(true);
      try {
        await fn(...args);
        if (successMessage) {
          toast.success(successMessage);
        }
      } catch (error_) {
        if (toastOnError) {
          toast.error(toUserMessage(error_));
        }
        throw error_;
      } finally {
        setBusy(false);
      }
    },
    [fn, toUserMessage, toastOnError, successMessage],
  );

  return { busy, run };
}
