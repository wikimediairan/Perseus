> Was a sentence unclear? Instead of ignoring it, make a simple 'edit' and leave your name in the
> history of this page's improvement.

# Comment Handling

HTML comments are not article content and must never enter the translation flow (Architectural
Principle 6). This is a firm policy, not a heuristic — every comment, wherever it appears, is excluded.

## Where filtering happens

There are two contexts a comment can appear in, and each is handled at the layer that first has
enough information to recognize it — never patched afterward in generation.

### Ordinary DOM content

In Parsoid HTML, `<!-- ... -->` in Wikitext becomes a genuine DOM `Comment` node, not an `ELEMENT_NODE`
or text. `placeholders.ts`'s `flattenToPlaceholderText` switches on `nodeType` while flattening a
block to translatable text; a `Comment` node is captured as a SOLO placeholder token
(`verbatimHtml`/`render()` returning the comment unchanged) and its text content is never appended to
the flattened string that goes to translation. On reconstruction, the placeholder is spliced back in
verbatim — the comment is preserved in the article, just never seen by a translator.

### Inside a template parameter's raw wikitext

A template parameter's value (e.g. an Infobox field) is not DOM content — it is a raw wikitext STRING
captured in `data-mw`, tokenized separately by `templateWikitextTokens.ts`'s `tokenizeWikitextValue`
(see [Template Handling](./template-handling.md)). This is a genuinely different code path from
ordinary DOM content, and for a period it recognized `{{...}}`, `[[...]]`, and `<ref>...</ref>` as
protected spans but had NO comment recognition at all — a comment embedded inline in a parameter's
wikitext, a common Wikipedia editing convention for leaving an editorial note near a field (for
example `{{Infobox officeholder | order = ... <!-- or | owners = --> | ... }}`), was treated as
ordinary translatable prose and sent to the LLM verbatim.

This has been fixed by extending the SAME tokenizer with an `HTML_COMMENT_PATTERN` check, using the
exact same mechanism already used for `<ref>` — an opaque solo span, excluded from the translatable
text and preserved verbatim on reconstruction. The two examples that originally surfaced this gap:

```html
<!-- or | owners = -->
<!-- or | gen_sec for General Secretary -->
```

are excluded from translation, and reproduced unchanged in the generated Wikitext, the same way an
ordinary DOM comment always has been.

## Why comments are preserved, not deleted

Perseus's established behavior — set by the ordinary-DOM-comment handling described above — is to keep
a comment in the article but never translate it, not to delete it. Extending the same treatment to
template-parameter comments (rather than, say, silently dropping them) keeps this consistent across
both contexts and avoids introducing a special case in how comments behave depending on where they
happen to sit in the article.

## Edge cases

- **Multiple comments in one parameter value** are each recognized and protected independently; the
  plain text between and around them still translates normally.
- **A comment containing text that looks like wikitext** (e.g. `<!-- {{cite web}} was here -->`) is
  matched as a single opaque unit by the comment pattern before any `{{`/`[[` check runs, so its
  contents are never separately tokenized or leaked as a link target.
- **An unterminated comment** (`<!--` with no matching `-->`) simply fails to match and falls through
  to the ordinary plain-text handling, character by character — the same graceful degradation already
  used for an unmatched `{{`, `[[`, or `<ref`.
