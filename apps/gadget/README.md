# Perseus Wikipedia User Script

This directory contains a readable, dependency-free Wikipedia client for the
existing Toolforge API. It is **source code ready to publish on-wiki**, not a
deployed user script or an approved community gadget. The product returns
wikitext only through **copy** or **`article.wiki` download**. It has no
preview, editor, draft save, or publishing action.

## Files

- `gadget.js`: ResourceLoader-compatible client, OAuth handoff, source and
  section selection, job management, progress, events, and output actions.
- `gadget.css`: isolated right-side panel styles, mobile layout and RTL.
- `tests/gadget.test.cjs`: source-wiki, section-selection and API-origin
  invariants, runnable with Node's built-in test runner.

The client uses only browser APIs and `mw.loader.using("mediawiki.util")`.
It never executes code received from the backend and never renders backend
content as HTML.

## Configure and install as a global User Script

First publish **exact copies** of `gadget.js` and `gadget.css` as JavaScript
and CSS user subpages on Meta-Wiki, for example:

- `User:YOUR_USERNAME/Perseus.js`
- `User:YOUR_USERNAME/Perseus.css`

Then put this in your Meta-Wiki `User:YOUR_USERNAME/global.js`, replacing the
username and verified backend origin:

```js
window.PerseusGadgetConfig = {
  apiBaseUrl: "https://YOUR_TOOL.toolforge.org"
};
mw.loader.load(
  "https://meta.wikimedia.org/w/index.php?title=User:YOUR_USERNAME/Perseus.css&action=raw&ctype=text/css",
  "text/css"
);
mw.loader.load(
  "https://meta.wikimedia.org/w/index.php?title=User:YOUR_USERNAME/Perseus.js&action=raw&ctype=text/javascript",
  "text/javascript"
);
```

The code defaults to `https://perseus.toolforge.org`, which is an **example
from the backend README**, not a verified deployment address. Set
`apiBaseUrl` to the actual HTTPS origin in both the User Script config and
the backend's `PUBLIC_BASE_URL` / OAuth callback registration. The backend
must allow source Wikipedia origins through CORS, and Wikimedia's CSP must
allow the Toolforge connection; check the browser console during staging.

The launcher appears on supported Wikipedia source editions, including
mobile subdomains, and stays absent on Persian and Tajik Wikipedia. It appears
on non-article pages as well so the user's active job can be managed there.
Only a regular main-namespace article can start a new translation.

## Future official Gadget

After community review, publish the same JS and CSS as pages in the target
wiki's MediaWiki namespace and register an opt-in ResourceLoader gadget. An
illustrative `MediaWiki:Gadgets-definition` entry is:

```text
* Perseus[ResourceLoader|type=general|dependencies=mediawiki.util]|Perseus.js|Perseus.css
```

The exact page names, permissions and approval process belong to each wiki's
interface administrators and community. A Meta global User Script is the
first distribution stage; this repository does not publish it automatically.

## Behavior and trust boundary

1. The user opens Perseus and signs in through the backend's Wikimedia OAuth
   popup. The popup message is accepted only from the configured backend
   origin and the popup window. A displayed one-time code is a fallback when
   browser popup isolation blocks `postMessage`.
2. The bearer token stays in `sessionStorage` for this tab. Reload preserves
   it; a separate tab may require its own sign-in. No token is written to a
   wiki page, URL, localStorage, or the article.
3. The API inspects the current article and gives a heading tree. The user
   explicitly selects Persian (`fa`) or Tajik (`tg`). Lead and all sections
   begin selected. A parent branch toggle affects descendants; “متن این بخش”
   controls the parent's own prose independently.
4. A job is created with the inspected source revision pinned. The client
   polls the durable job and events every 2.5 seconds while the panel is open.
   Closing the panel or tab does not cancel the server job. On return, it
   restores the active job or the current article's recent result.
5. Only a completed job with `outputAvailable` can fetch the authenticated
   `article.wiki` endpoint. The client keeps its Blob and decoded wikitext in
   memory while the tab is open. Copy uses the Clipboard API; download saves
   the same Blob. Prefetching lets the copy action run directly in the user's
   click gesture, which matters for browser clipboard permissions. The
   wikitext is never inserted into the page DOM or persistent storage.

Before replacing a restorable result for the same article and target language,
the client asks for explicit confirmation. A backend `RESULT_EXISTS` response
caused by a race is shown as an error; the user can retry after refreshing the
job state.

## Local checks

```powershell
node --check apps/gadget/gadget.js
node --test apps/gadget/tests/gadget.test.cjs
```

No dependency installation or build step is required. The JavaScript and CSS
must be tested in a real Wikipedia browser session and with a staging
Toolforge service before publication. In particular: OAuth popup/manual code,
CORS/CSP, Vector/Vector 2022/Monobook/Minerva, keyboard, Persian RTL,
clipboard permission, download, tab reload, and multiple tabs.

The backend still has documented correctness and concurrency gaps in
[`09-toolforge-backend-audit.md`](../../docs/architecture-research/09-toolforge-backend-audit.md).
Passing the client tests does not close those gaps.
