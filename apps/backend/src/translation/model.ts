/**
 * Model allow-list. This reuses Core's `WIKIMEDIA_MODELS`/`WikimediaModel`
 * — that list happens to be exactly the curated set of models Perseus
 * backend allows requests to specify (a cost-control concern; letting
 * users request literally any OpenRouter model string is a backend
 * decision, not a Core one). Reusing Core's list instead of keeping a
 * byte-for-byte duplicate here is the point — see the "wikimedia" name
 * on the Core side: this is Core's curated model list, applied here to
 * an `openrouter` request, not a use of the (structurally unrelated)
 * WikimediaProvider protocol.
 */
import type { WikimediaModel } from "@perseus/core";
import { PerseusError, WIKIMEDIA_MODELS } from "@perseus/core";

export type ModelId = WikimediaModel;

export function resolveModel(model: string): ModelId {
  if (!(WIKIMEDIA_MODELS as readonly string[]).includes(model)) {
    throw new PerseusError(
      "InputError",
      `Unsupported model "${model}". Supported values: ${WIKIMEDIA_MODELS.join(", ")}.`,
      { stage: "translation" },
    );
  }

  return model as ModelId;
}
