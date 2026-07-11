/**
 * OutputDelivery
 *
 * Real implementation of the "Output Delivery" responsibility named in
 * the Software Specification (Section 9, Module Responsibilities table).
 * Wikitext copy/save are exactly the two actions the Output requirements
 * describe — nothing here can ever reach a live Wikipedia page.
 *
 * Translation Session addendum: two more methods, `saveSession` /
 * `openSession`, give the chunk workspace's save/resume the same
 * "file I/O lives in Output Delivery, not scattered around the app"
 * treatment as Wikitext already gets. They deliberately contain no
 * session-specific logic beyond JSON (de)serialization and the file
 * dialog — shape validation is delegated to
 * `translationPackage/validate.ts`, so this module still only knows
 * about "files and the clipboard," not about what a Translation Session
 * means. Files use the `.perseus` extension (JSON underneath, see
 * translationPackage/types.ts for why a plain, versioned JSON document
 * rather than a container format).
 *
 * All four actions depend on Tauri plugins rather than web APIs: the
 * Clipboard API and native `<a download>` file saving are unreliable or
 * unavailable inside a Tauri webview, whereas the Tauri plugins give a
 * proper native save/open dialog and clipboard access.
 */

import { PerseusError } from "@core/errors/PerseusError";
import type { TranslationSession } from "@core/translationPackage/types";
import { validateTranslationSession } from "@core/translationPackage/validate";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const SESSION_EXTENSION = "perseus";
const SESSION_FILTER_NAME = "Perseus Translation Session";

export interface OutputDelivery {
  copyToClipboard(text: string): Promise<void>;
  /** Opens a native save dialog and writes the file if the user confirms; resolves to the chosen path, or null if cancelled. */
  saveToFile(wikitext: string, suggestedName: string): Promise<string | null>;
  /** Saves a Translation Session as pretty-printed JSON with a `.perseus` extension; resolves to the chosen path, or null if cancelled. */
  saveSession(session: TranslationSession, suggestedName: string): Promise<string | null>;
  /** Opens a native open dialog, reads and validates the chosen file; resolves to the session, or null if cancelled. */
  openSession(): Promise<TranslationSession | null>;
}

export class TauriOutputDelivery implements OutputDelivery {
  async copyToClipboard(text: string): Promise<void> {
    try {
      await writeText(text);
    } catch (cause) {
      throw new PerseusError("ProviderError", "Could not copy to the clipboard.", { cause });
    }
  }

  async saveToFile(wikitext: string, suggestedName: string): Promise<string | null> {
    let path: string | null;
    try {
      path = await save({
        defaultPath: suggestedName.endsWith(".wiki") ? suggestedName : `${suggestedName}.wiki`,
        filters: [{ name: "Wikitext", extensions: ["wiki"] }],
      });
    } catch (cause) {
      throw new PerseusError("InputError", "Could not open the save dialog.", { cause });
    }

    if (!path) {
      return null; // user cancelled
    }

    try {
      await writeTextFile(path, wikitext);
    } catch (cause) {
      throw new PerseusError("InputError", `Could not save the file to "${path}".`, { cause });
    }

    return path;
  }

  async saveSession(session: TranslationSession, suggestedName: string): Promise<string | null> {
    let path: string | null;
    try {
      path = await save({
        defaultPath: suggestedName.endsWith(`.${SESSION_EXTENSION}`)
          ? suggestedName
          : `${suggestedName}.${SESSION_EXTENSION}`,
        filters: [{ name: SESSION_FILTER_NAME, extensions: [SESSION_EXTENSION] }],
      });
    } catch (cause) {
      throw new PerseusError("InputError", "Could not open the save dialog.", { cause });
    }

    if (!path) {
      return null; // user cancelled
    }

    try {
      await writeTextFile(path, JSON.stringify(session, null, 2));
    } catch (cause) {
      throw new PerseusError("InputError", `Could not save the session to "${path}".`, { cause });
    }

    return path;
  }

  async openSession(): Promise<TranslationSession | null> {
    let path: string | string[] | null;
    try {
      path = await open({
        multiple: false,
        filters: [{ name: SESSION_FILTER_NAME, extensions: [SESSION_EXTENSION, "json"] }],
      });
    } catch (cause) {
      throw new PerseusError("InputError", "Could not open the file dialog.", { cause });
    }

    if (!path || Array.isArray(path)) {
      return null; // user cancelled
    }

    let raw: string;
    try {
      raw = await readTextFile(path);
    } catch (cause) {
      throw new PerseusError("InputError", `Could not read "${path}".`, { cause });
    }

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (cause) {
      throw new PerseusError("InputError", `"${path}" is not valid JSON.`, { cause });
    }

    return validateTranslationSession(data); // throws a clear InputError on any shape/duplicate-id problem
  }
}
