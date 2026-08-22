> Was a sentence unclear? Instead of ignoring it, make a simple 'edit' and leave your name in the
> history of this page's improvement.

# LLM Providers

Translation is executed by whichever `Translator` implementation `createPipeline` wires up for the
configured provider (Architectural Principle 10). This document covers both implementations that
exist today, and corrects a significant gap in earlier documentation: the Wikimedia provider is fully
wired into the pipeline, not a stub.

## The `Translator` interface

```ts
interface Translator {
  translateChunk(chunk: Chunk, targetWiki: TargetWikiDefinition): Promise<TranslatedChunk>;
}
```

The pipeline depends on exactly this interface, never on a concrete provider. `createPipeline.ts`
chooses which implementation to construct based on the configured provider kind:

```ts
isWikimediaProvider(provider)
  ? new WikimediaTranslator(provider.sessionToken)
  : new LLMTranslator(createProvider(provider));
```

## `LLMTranslator` — the generic text-completion path

For any provider that isn't Wikimedia's own backend, `LLMTranslator` wraps an `LLMProvider`
(`translate(request): Promise<LLMResponse>`, a plain chat-completion-shaped call) and drives it
through the [segment protocol](./chunking-and-translation.md#the-segment-protocol):
`renderChunkForTranslation` builds the wire text, the provider's raw text response is parsed by
`parseChunkTranslation`, and every unit is validated with `markersMatch` before being merged. A single
unit the model dropped is retried once before being given up on.

`ProviderFactory.createProvider(config)` currently supports two concrete `LLMProvider`
implementations, both speaking the same OpenAI-compatible chat-completion shape
(`chatProtocol.ts`'s `chatCompletion`):

- **`OpenRouterProvider`** — OpenRouter's hosted API.
- **`NineRouterProvider`** — a self-hosted OpenRouter-compatible gateway, for deployments that need
  their own routing/rate-limiting layer in front of the same protocol.

`PromptManager.ts` owns the system prompt that establishes the placeholder-token rules translators
must follow (see [Chunking & Translation](./chunking-and-translation.md#what-a-translator-is-allowed-to-do-and-what-must-remain-untouched)) —
this is the entire mechanism by which token-preservation behavior is requested from a model; there is
no other enforcement on the request side, only validation on the response side.

## The Wikimedia provider

`wikimedia-provider/` is a second, complete `Translator` implementation, for Perseus's own
Cloudflare-Workers-hosted backend rather than a generic chat-completion API. This is a real,
selectable, fully wired-in path today — choosing it does not fail with a configuration error.

- **`WikimediaProvider.translate(request)`** posts a whole-chunk translation request and returns the
  backend's raw response.
- **`WikimediaTranslator.translateChunk(chunk, targetWiki)`** adapts the pipeline's `Chunk`/`TranslatedChunk`
  shapes to the Wikimedia backend's own contract (`wikimedia-provider/contract.ts`) — this backend
  speaks in terms of the WHOLE chunk's structure directly, not the `[[PERSEUS CHUNK ...]]`/`⟪n⟫` wire
  text `LLMTranslator` builds; there is no shared request format between the two `Translator`
  implementations.
- **`quota.ts`** tracks the backend's own usage/quota accounting, specific to this provider.

### A gap worth being explicit about

Unlike `LLMTranslator`, `WikimediaTranslator` does not run `markersMatch` validation on the backend's
response before constructing a `TranslatedChunk` — see
[Chunking & Translation](./chunking-and-translation.md#an-important-gap-in-this-guarantee). This is a
fact about current behavior, recorded here rather than fixed, per this documentation pass's own
constraint against changing runtime behavior.

## Switching providers mid-session

Because both implementations satisfy the same `Translator` interface, and a
[Translation Session](./translation-session.md) persists chunk/text state rather than which provider
produced it, a session started under one provider can, in principle, be resumed under a different one
— the pipeline has no dependency on provider identity beyond the single `translateChunk` call at the
point translation actually happens.
