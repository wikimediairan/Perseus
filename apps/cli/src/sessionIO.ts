import { readFile } from "node:fs/promises";
import type { TranslationSession } from "@perseus/core";
import { PerseusError, validateTranslationSession } from "@perseus/core";

export async function loadSession(
  filePath: string,
): Promise<TranslationSession> {
  let raw: string;

  try {
    raw = await readFile(filePath, "utf-8");
  } catch (cause) {
    throw new PerseusError(
      "InputError",
      `Could not read Translation Session at "${filePath}".`,
      {
        cause,
      },
    );
  }

  let data: unknown;

  try {
    data = JSON.parse(raw);
  } catch (cause) {
    throw new PerseusError("InputError", `"${filePath}" is not valid JSON.`, {
      cause,
    });
  }

  return validateTranslationSession(data); // throws a specific InputError on any shape problem
}
