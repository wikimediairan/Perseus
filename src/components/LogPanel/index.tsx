import { useEffect, useRef } from "react";

import type { LogLine } from "@/hooks/useChunkWorkspace";
import { cn } from "@/lib/utils";

const LEVEL_COLOR: Record<LogLine["level"], string> = {
  debug: "text-neutral-400",
  info: "text-neutral-100",
  warn: "text-amber-400",
  error: "text-red-400",
};

export function LogPanel({ log }: { log: LogLine[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, []);

  if (log.length === 0) {
    return null;
  }

  return (
    <div
      className="max-h-40 overflow-y-auto rounded-md border border-border bg-foreground/95 p-3 font-mono text-xs leading-relaxed"
      dir="ltr"
      ref={scrollRef}
    >
      {log.map((line) => (
        <div className={cn(LEVEL_COLOR[line.level], "opacity-90")} key={line.id}>
          {line.message}
        </div>
      ))}
    </div>
  );
}
