import type { ReactNode } from "react";
import { useEffect } from "react";

interface AppLayoutProps {
  header: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}

export function AppLayout({ header, sidebar, children }: AppLayoutProps) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      e.preventDefault();
    };

    document.addEventListener("contextmenu", handler);

    return () => {
      document.removeEventListener("contextmenu", handler);
    };
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background select-none">
      <div className="shrink-0 border-b border-border bg-background">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">{header}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden xl:grid xl:grid-cols-[700px_1fr]">
        <aside className="border-b border-border xl:min-h-0 xl:overflow-y-auto xl:border-e xl:border-b-0">
          {sidebar}
        </aside>

        <div className="lg:flex lg:min-h-0 lg:flex-col lg:overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
