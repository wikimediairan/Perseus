import type { ReactNode } from "react";

interface SidebarProps {
  children: ReactNode;
}

/**
 * Holds the setup / session controls: provider config, source loading,
 * open-session, and load progress. Scrolls independently of the main
 * panel on wide layouts so these stay reachable during a long session.
 */
export function Sidebar({ children }: SidebarProps) {
  return <div className="flex flex-col gap-5 p-5">{children}</div>;
}
