import { open } from "@tauri-apps/plugin-shell";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const HELP_HIDDEN_STORAGE_KEY = "perseus-help-hidden";

const HELP_LINKS = {
  videoTutorial: "https://youtu.be/IiIlffc__GI",
  wikipediaArticle:
    "https://fa.wikipedia.org/wiki/%DA%A9%D8%A7%D8%B1%D8%A8%D8%B1:NedaMani/%D9%BE%D8%B1%D8%B3%DB%8C%D9%88%D8%B3",
  documentation: "https://github.com/wikimediairan/Perseus/wiki",
  telegram: "https://t.me/Perseus_movement",
} as const;

function readHelpHidden(): boolean {
  try {
    return localStorage.getItem(HELP_HIDDEN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistHelpHidden(hidden: boolean): void {
  try {
    if (hidden) {
      localStorage.setItem(HELP_HIDDEN_STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(HELP_HIDDEN_STORAGE_KEY);
    }
  } catch {
    // localStorage may be unavailable; the button still works for this run.
  }
}

async function openExternal(url: string): Promise<void> {
  try {
    await open(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function HelpDialog() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(readHelpHidden);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);

  if (isHidden) {
    return null;
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      if (doNotShowAgain) {
        persistHelpHidden(true);
        setIsHidden(true);
      }
    }

    setIsOpen(open);
  }

  function handleDoNotShowAgainChange(checked: boolean) {
    setDoNotShowAgain(checked);
    persistHelpHidden(checked);
  }

  return (
    <>
      <button
        aria-label={t("help.buttonLabel")}
        className="fixed right-5 bottom-5 z-40 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border bg-primary text-lg font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        onClick={() => {
          setIsOpen(true);
        }}
        type="button"
      >
        <span aria-hidden="true">?</span>
      </button>

      <Dialog onOpenChange={handleOpenChange} open={isOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("help.title")}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1.5">
              {(
                Object.entries(HELP_LINKS) as [
                  keyof typeof HELP_LINKS,
                  string,
                ][]
              ).map(([key, url]) => (
                <button
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-start text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  key={key}
                  onClick={() => {
                    void openExternal(url);
                  }}
                  type="button"
                >
                  <span>{t(`help.${key}`)}</span>
                  <ExternalLink
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                  />
                </button>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              checked={doNotShowAgain}
              className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
              onChange={(event) => {
                handleDoNotShowAgainChange(event.currentTarget.checked);
              }}
              type="checkbox"
            />

            <span>{t("help.doNotShowAgain")}</span>
          </label>

          <DialogFooter>
            <Button
              onClick={() => {
                handleOpenChange(false);
              }}
              type="button"
            >
              {t("help.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
