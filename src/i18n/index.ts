import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import fa from "./locales/fa.json";
import tj from "./locales/tj.json";

export const SUPPORTED_LANGUAGES = ["en", "fa", "tj"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const RTL_LANGUAGES = new Set<SupportedLanguage>(["fa"]);

const LANGUAGE_STORAGE_KEY = "perseus-ui-language";

function isSupportedLanguage(value: null | string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value ?? "");
}

function readStoredLanguage(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(stored)) {
      return stored;
    }
  } catch {
    // localStorage may be unavailable (e.g. disabled); fall back to default.
  }

  return "en";
}

/** Applies the document-level direction/lang attributes for the given UI language. */
function applyDocumentDirection(language: string) {
  const dir = RTL_LANGUAGES.has(language as SupportedLanguage) ? "rtl" : "ltr";
  document.documentElement.dir = dir;
  document.documentElement.lang = language;
}

const initialLanguage = readStoredLanguage();

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: en,
    },
    fa: {
      translation: fa,
    },
    tj: {
      translation: tj,
    },
  },

  lng: initialLanguage,

  fallbackLng: "en",

  interpolation: {
    escapeValue: false,
  },
});

applyDocumentDirection(initialLanguage);

i18n.on("languageChanged", (language) => {
  applyDocumentDirection(language);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore persistence failures (e.g. localStorage disabled).
  }
});

export default i18n;
