import { useTranslation } from "react-i18next";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Badge } from "@/components/ui/badge";

interface HeaderProps {
  version: string;
}

export function Header({ version }: HeaderProps) {
  const { t } = useTranslation();

  return (
    <div dir="ltr" className="flex items-center justify-between gap-3">
      <h1 className="font-display flex items-center gap-x-2 text-lg font-semibold tracking-tight text-foreground">
        <span>{t("app.title")}</span>
        <Badge>{version}</Badge>
      </h1>
      <LanguageSwitcher />
    </div>
  );
}
