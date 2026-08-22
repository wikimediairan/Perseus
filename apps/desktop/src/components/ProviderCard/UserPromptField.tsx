import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function UserPromptField({
  userPrompt,
  onChange,
}: {
  userPrompt: string | undefined;
  onChange(userPrompt: string): void;
}) {
  const { t } = useTranslation();

  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <Label htmlFor="user-prompt">
        {t("providerCard.additionalPromptsLabel")}
      </Label>

      <Textarea
        id="user-prompt"
        onChange={(e) => {
          onChange(e.target.value);
        }}
        placeholder={t("providerCard.additionalPromptsPlaceholder")}
        rows={2}
        value={userPrompt ?? ""}
      />
    </div>
  );
}
