import { useEffect } from "react";
import { useTranslation } from "react-i18next";

interface SplashProps {
  onFinished: () => void;
}

export function Opening({ onFinished }: SplashProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const timer = setTimeout(onFinished, 5000);
    return () => {
      clearTimeout(timer);
    };
  }, [onFinished]);

  return (
    <main
      onContextMenu={(e) => {
        e.preventDefault();
      }}
      className="flex h-screen w-screen items-center justify-center bg-background select-none"
    >
      <div className="animate-splash flex flex-col items-center gap-6 text-center">
        <img src="/icon.png" alt={t("app.title")} className="h-32 w-32" draggable={false} />

        <div className="space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{t("app.title")}</h1>

          <div className="text-sm leading-relaxed text-muted-foreground">
            <p>{t("opening.tagline1")}</p>
            <p>{t("opening.tagline2")}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
