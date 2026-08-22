import type { ReactNode } from "react";

interface MainPanelProps {
  children: ReactNode;
}

export function MainPanel({ children }: MainPanelProps) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 py-10">
      {children}
    </main>
  );
}
