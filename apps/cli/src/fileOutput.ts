/**
 * fileOutput
 *
 * Replaces Core's `output/OutputDelivery.ts` (Tauri clipboard/native
 * dialog plugins — Desktop-specific, excluded from this CLI). The CLI
 * only ever needs to write two plain files to a directory — no
 * clipboard, no native file dialogs — so this is a plain `node:fs`
 * writer instead. Session (de)serialization still goes through Core's
 * own `validateTranslationSession` (see sessionIO.ts), exactly as
 * `TauriOutputDelivery.openSession` did.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TranslationSession } from "@perseus/core";

export interface WrittenOutputs {
  wikitextPath: string;
  sessionPath: string;
}

/** Turns an article title into a filesystem-safe base filename. */
export function slugify(title: string): string {
  const slug = title
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "");
  return slug || "article";
}

export async function writeOutputs(
  outputDir: string,
  baseName: string,
  wikitext: string,
  session: TranslationSession,
): Promise<WrittenOutputs> {
  await mkdir(outputDir, { recursive: true });

  const wikitextPath = path.join(outputDir, `${baseName}.wiki`);
  const sessionPath = path.join(outputDir, `${baseName}.json`);

  await writeFile(wikitextPath, wikitext, "utf-8");
  await writeFile(
    sessionPath,
    `${JSON.stringify(session, null, 2)}\n`,
    "utf-8",
  );

  return { wikitextPath, sessionPath };
}

/** Incremental session-only save, used between chunks so an interrupted run can be resumed (see translateWorkflow.ts). */
export async function writeSessionOnly(
  outputDir: string,
  baseName: string,
  session: TranslationSession,
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const sessionPath = path.join(outputDir, `${baseName}.session.json`);
  await writeFile(
    sessionPath,
    `${JSON.stringify(session, null, 2)}\n`,
    "utf-8",
  );
  return sessionPath;
}
