/**
 * WikimediaAuthField.tsx
 *
 * Replaces ApiKeyField for the "wikimedia" provider: instead of a
 * pasted API key, this renders a "Sign in with Wikimedia" button and
 * reflects the Backend's actual authorization state (signed-out /
 * signing-in / active / pending / rejected / disabled) -- see
 * hooks/useWikimediaSession.ts. Possessing a token is not treated as
 * "access granted" here; the Backend's per-request status check is
 * the source of truth, re-verified on every mount.
 */
import type { LLMProviderConfig } from "@perseus/core";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useWikimediaSession } from "@/hooks/useWikimediaSession";

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

export function WikimediaAuthField({
  provider,
  onChange,
}: {
  provider: LLMProviderConfig;
  onChange(next: LLMProviderConfig): void;
}) {
  const { t, i18n } = useTranslation();
  const { state, login, logout, refresh } = useWikimediaSession();

  // Pushes the live token into the in-memory provider config the
  // translation pipeline actually reads (createPipeline(configRef.current, ...) --
  // see useTranslationSession.ts) without ever routing it through
  // useConfig's persisted save path with the real value (see
  // useConfig.ts's stripSecretsForPersistence).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (provider.kind !== "wikimedia") return;

    const nextToken = state.phase === "signed-in" ? state.token : "";
    if (provider.sessionToken === nextToken) return;

    onChangeRef.current({ ...provider, sessionToken: nextToken });
    // Only re-run when the session's own token actually changes --
    // `provider`/`onChange` identity changes on every keystroke
    // elsewhere in the form and would otherwise cause a render loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, provider]);

  return (
    <div className="col-span-2 flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      {state.phase === "loading" && (
        <p className="text-xs text-muted-foreground">
          {t("providerCard.quota.loading")}
        </p>
      )}

      {state.phase === "signed-out" && (
        <Button
          onClick={() => {
            void login();
          }}
          type="button"
        >
          {t("providerCard.auth.signInButton")}
        </Button>
      )}

      {state.phase === "signing-in" && (
        <p className="text-xs text-muted-foreground">
          {t("providerCard.auth.signingIn")}
        </p>
      )}

      {state.phase === "error" && (
        <>
          <p className="text-xs text-destructive">
            {t("providerCard.auth.signInError")}
          </p>
          <Button
            onClick={() => {
              void login();
            }}
            type="button"
            variant="secondary"
          >
            {t("providerCard.auth.signInButton")}
          </Button>
        </>
      )}

      {state.phase === "signed-in" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Button
              className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                void refresh();
              }}
              type="button"
              variant="ghost"
            >
              {t("providerCard.quota.refresh")}
            </Button>
            <Button
              className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                void logout();
              }}
              type="button"
              variant="ghost"
            >
              {t("providerCard.auth.signOut")}
            </Button>
          </div>

          {state.access.kind === "restricted" && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t(
                `providerCard.auth.status${
                  state.access.userStatus === "pending"
                    ? "Pending"
                    : state.access.userStatus === "rejected"
                      ? "Rejected"
                      : state.access.userStatus === "disabled"
                        ? "Disabled"
                        : "Unknown"
                }`,
              )}
            </p>
          )}

          {state.access.kind === "active" && (
            <>
              <Progress
                value={
                  (state.access.quota.usedCost /
                    state.access.quota.weeklyLimitCost) *
                  100
                }
              />
              <div
                className="flex items-center justify-between text-xs text-muted-foreground"
                dir="ltr"
              >
                <span>
                  {t("providerCard.quota.used", {
                    used: formatCost(state.access.quota.usedCost),
                    limit: formatCost(state.access.quota.weeklyLimitCost),
                  })}
                </span>
                <span>
                  {t("providerCard.quota.remaining", {
                    remaining: formatCost(state.access.quota.remainingCost),
                  })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("providerCard.quota.resetsAt", {
                  date: new Date(state.access.quota.resetsAt).toLocaleString(
                    i18n.language,
                  ),
                })}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
