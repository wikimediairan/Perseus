import { PerseusError } from "@core/platform/errors/PerseusError";
import type { TFunction } from "i18next";

/** Translates a thrown error into a message safe to show the user, using the PerseusError category when available. */
export function toUserMessage(err: unknown, t: TFunction): string {
  if (!(err instanceof PerseusError)) {
    return t("errors.unexpected");
  }

  switch (err.category) {
    case "InputError": {
      return err.message;
    }

    case "ParsingError": {
      return t("errors.parsing", { message: err.message });
    }

    case "LinkResolutionError": {
      return t("errors.linkResolution", { message: err.message });
    }

    case "TranslationError": {
      return t("errors.translation", { message: err.message });
    }

    case "MergeError": {
      return t("errors.merge", { message: err.message });
    }

    case "GenerationError": {
      return t("errors.generation", { message: err.message });
    }

    case "ConfigurationError": {
      return t("errors.configuration", { message: err.message });
    }

    case "ProviderError": {
      return t("errors.provider", { message: err.message });
    }

    default: {
      return err.message;
    }
  }
}
