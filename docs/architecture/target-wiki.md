> Was a sentence unclear? Instead of ignoring it, make a simple 'edit' and leave your name in the
> history of this page's improvement.

# Target Wiki

Every pipeline run needs exactly one destination wiki, decided before translation begins. This
document covers the configuration boundary that determines what "the target wiki" means for a given
run, and everything downstream that depends on it.

## `TargetWikiDefinition`

```ts
interface TargetWikiDefinition {
  code: TargetWikiCode; // "fa" | "tj"
  displayName: string;
  languageName: string;
  domain: string;
  draft: string;
  move: string;
  direction: "ltr" | "rtl";
  templateRemovalDenylist: string[];
  interwikiFallbackTemplate: string | null;
}
```

`config/targetWikis.ts`'s `TARGET_WIKIS` is a static registry of exactly two entries today — `fa`
(Persian) and `tj` (Tajik). Adding a third target wiki is a data change to this registry, not a code
change anywhere else: `WikidataLinkResolver`'s constructor takes a `TargetWikiDefinition` and never
hardcodes `"fa"` anywhere in its own logic, and the same is true of every other stage that depends on
target-wiki configuration.

## What each field controls

- **`code`** drives the Wikidata sitelink key (`${code}wiki`) Link Resolution queries for — see
  [Link Resolution](./link-resolution.md).
- **`direction`** informs presentation-layer rendering; it is not consumed by any Core pipeline stage
  itself.
- **`templateRemovalDenylist`** — template names Wikitext Generation strips entirely from the final
  output (see [pipeline-stages.md](./pipeline-stages.md#9-09-generation--generate-wikitext-wikitextgeneratorts)).
  Source-language editing-convention markers with no meaning once translated.
- **`interwikiFallbackTemplate`** — the name of this target wiki's own "link via interwiki"-style
  fallback template (`"پم"` for Persian — see
  [fa.wikipedia.org's documentation](https://fa.wikipedia.org/wiki/الگو:پیوند_با_میان‌ویکی)), used
  whenever a link has no target-wiki equivalent (see
  [Link Resolution](./link-resolution.md#the-interwiki-fallback)). `null` means this target wiki has no
  such template configured — an unresolved link is left pointed at the English article, the behavior
  that predates the interwiki-fallback feature entirely. Currently `null` for Tajik: no verified
  equivalent template was confirmed at the time this field was introduced, and guessing at an
  unverified template name was judged worse than falling back to the pre-existing behavior.

## Where `targetWiki` is, and is not, available

Not every stage receives `targetWiki` — this matters because it determines WHERE a target-wiki-
dependent decision can actually be implemented:

| Stage / call                | Receives `targetWiki`? |
| ----------------------------- | ------------------------ |
| `WikidataLinkResolver` (constructor) | Yes                       |
| `Merger.merge`                          | No                        |
| `WikitextGenerator.generate`              | Yes                       |

This is exactly why the interwiki fallback for ORDINARY body links is constructed at generation time
rather than merge time, and why the fallback for TEMPLATE-PARAMETER links is instead pre-decided
(template name chosen) by the link resolver itself and only the LABEL substitution deferred to merge
time — see [Link Resolution](./link-resolution.md#the-interwiki-fallback) for the full reasoning.
