import type { ReactNode } from "react";

interface MainPanelProps {
  children: ReactNode;
}

/**
 * Holds the chunk workspace and its output. This is expected to be the
 * tallest part of the app (potentially hundreds of chunks), so it owns
 * its own scroll region on wide layouts rather than scrolling the whole
 * page.
 */
export function MainPanel({ children }: MainPanelProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-6 lg:min-h-0">
      {children}
    </div>
  );
}
