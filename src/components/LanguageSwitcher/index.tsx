/**
 * LanguageSwitcher
 *
 * Lets the user switch the UI language between the three languages
 * registered in src/i18n (English, Persian, Tajik). Reuses the existing
 * Select primitive so it matches the rest of the app visually. Language
 * changes take effect immediately (react-i18next re-renders on
 * `languageChanged`), and persistence/RTL-LTR direction handling both
 * live in src/i18n, not here.
 */
import { useTranslation } from "react-i18next";

import {
  Select,
  SelectItem,
  SelectValue,
  SelectContent,
  SelectTrigger,
} from "@/components/ui/select";
import { SUPPORTED_LANGUAGES } from "@/i18n";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <Select
      value={i18n.resolvedLanguage ?? i18n.language}
      onValueChange={(language) => {
        void i18n.changeLanguage(language);
      }}
    >
      <SelectTrigger aria-label={t("languageSwitcher.label")} className="h-8 w-fit gap-1.5 px-2.5 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((language) => (
          <SelectItem key={language} value={language}>
            {t(`languageSwitcher.${language}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
