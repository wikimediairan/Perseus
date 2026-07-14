import { useState } from "react";
import { useTranslation } from "react-i18next";

import packageJson from "../package.json";
export const APP_VERSION = packageJson.version;

import { ChunkWorkspace } from "@/components/ChunkWorkspace";
import { LogPanel } from "@/components/LogPanel";
import { AppLayout } from "@/components/layout/AppLayout";
import { Header } from "@/components/layout/Header";
import { MainPanel } from "@/components/layout/MainPanel";
import { Sidebar } from "@/components/layout/Sidebar";
import { Opening } from "@/components/Opening";
import { OutputCard } from "@/components/OutputCard";
import { ProviderCard } from "@/components/ProviderCard";
import { SourceCard } from "@/components/SourceCard";
import { StageRail } from "@/components/StageRail";
import { UpdateDialog } from "@/components/UpdateDialog";
import { Separator } from "@/components/ui/separator";
import { useChunkWorkspace } from "@/hooks/useChunkWorkspace";
import { useConfig } from "@/hooks/useConfig";
import { useUpdateChecker } from "@/hooks/useUpdateChecker";

const LOAD_PHASE_STAGE_COUNT = 5;

export default function App() {
  const { t } = useTranslation();
  const { config, updateConfig } = useConfig();

  const [showSplash, setShowSplash] = useState(true);

  const {
    updateAvailable,
    result: updateResult,
    openReleases,
    dismiss: dismissUpdate,
  } = useUpdateChecker();

  const {
    status,
    currentStage,
    log,
    stages,
    chunks,
    chunkState,
    progress,
    targetWiki,
    translateAllBusy,
    wikitext,
    generateBusy,
    loadArticle,
    openSession,
    saveSession,
    copyGeneralPrompt,
    copyChunk,
    pasteChunkTranslation,
    translateChunkBuiltIn,
    translateAllBuiltIn,
    generateWikitext,
    copyToClipboard,
    saveToFile,
  } = useChunkWorkspace(config);

  const busy = status === "extracting";
  const hasArticle = status === "ready" && chunks !== null;
  const showLoadProgress = busy || status === "error" || hasArticle;

  // useEffect(async () => {
  //   const unlistenOpen = await listen("menu://open-session", async () => {
  //     await openSession();
  //   });

  //   const unlistenSave = await listen("menu://save-session", async () => {
  //     await saveSession();
  //   });

  //   return () => {
  //     unlistenOpen();
  //     unlistenSave();
  //   };
  // }, []);

  if (showSplash) {
    return (
      <Opening
        onFinished={() => {
          setShowSplash(false);
        }}
      />
    );
  }

  return (
    <AppLayout
      header={<Header version={APP_VERSION} />}
      sidebar={
        <Sidebar>
          <ProviderCard config={config} disabled={hasArticle || busy} onChange={updateConfig} />

          <SourceCard
            actionLabel={t("app.sourceAction.loadArticle")}
            busyLabel={t("app.sourceBusy.loading")}
            config={config}
            disabled={busy}
            onChange={updateConfig}
            onSubmit={loadArticle}
          />

          <button
            className="w-fit cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
            disabled={busy}
            onClick={openSession}
            type="button"
          >
            {t("chunkWorkspace.openSession")}
          </button>

          {showLoadProgress && (
            <>
              <Separator />
              <div className="flex flex-col gap-3">
                <StageRail
                  currentStage={currentStage}
                  stages={stages.slice(0, LOAD_PHASE_STAGE_COUNT)}
                  status={status}
                />
                <LogPanel log={log} />
              </div>
            </>
          )}
        </Sidebar>
      }
    >
      <MainPanel>
        {!hasArticle && !chunks && (
          <div className="flex items-center justify-center lg:h-screen">
            {t("errors.noArticle")}
          </div>
        )}

        {hasArticle && chunks && (
          <ChunkWorkspace
            chunkState={chunkState}
            chunks={chunks}
            disabled={busy}
            generateBusy={generateBusy}
            onCopyChunk={copyChunk}
            onCopyGeneralPrompt={copyGeneralPrompt}
            onGenerateWikitext={generateWikitext}
            onPasteChunkTranslation={pasteChunkTranslation}
            onSaveSession={() => {
              void saveSession("translation-session.perseus");
            }}
            onTranslateAllBuiltIn={translateAllBuiltIn}
            onTranslateChunkBuiltIn={translateChunkBuiltIn}
            progress={progress}
            translateAllBusy={translateAllBusy}
          />
        )}

        {wikitext !== null && targetWiki && (
          <OutputCard
            onCopy={copyToClipboard}
            onSave={saveToFile}
            targetWiki={targetWiki}
            wikitext={wikitext}
          />
        )}
      </MainPanel>

      {updateAvailable && updateResult && (
        <UpdateDialog
          onDismiss={dismissUpdate}
          onOpenReleases={openReleases}
          result={updateResult}
        />
      )}
    </AppLayout>
  );
}
