import type { Logger, PipelineStageName } from "@perseus/core";
import { useCallback, useState } from "react";

import type { LogLine } from "./types";

export function useUiLogger() {
  const [currentStage, setCurrentStage] = useState<null | PipelineStageName>(
    null,
  );
  const [log, setLog] = useState<LogLine[]>([]);

  const makeLogger = useCallback((): Logger => {
    const append = (
      level: LogLine["level"],
      message: string,
      stage?: PipelineStageName,
    ) => {
      if (stage) {
        setCurrentStage(stage);
      }

      setLog((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          level,
          message: stage ? `${stage}: ${message}` : message,
        },
      ]);
    };

    const build = (stage?: PipelineStageName): Logger => ({
      debug: (m) => {
        append("debug", m, stage);
      },
      info: (m) => {
        append("info", m, stage);
      },
      warn: (m) => {
        append("warn", m, stage);
      },
      error: (m) => {
        append("error", m, stage);
      },
      forStage: (s) => build(s),
    });

    return build();
  }, []);

  const resetLog = useCallback(() => {
    setCurrentStage(null);
    setLog([]);
  }, []);

  return { currentStage, log, makeLogger, resetLog };
}
