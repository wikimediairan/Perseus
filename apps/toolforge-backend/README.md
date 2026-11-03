# Perseus Toolforge Backend

Backend for the Perseus Wikipedia gadget, designed for **Wikimedia Toolforge**
(Node.js web service + a separate continuous worker + MariaDB).

This app implements the backend contract implied by
[`apps/gadget/product-specification.md.md`](../gadget/product-specification.md.md)
without changing the existing Cloudflare backend in `apps/backend`.

> **Scope boundary:** this service produces **unreviewed wikitext** and returns
> it as JSON or as `article.wiki`. It has no preview, editor, review workflow,
> draft save, article creation, or publishing endpoint. Human review happens
> outside Perseus.

## Why this shape

- **Toolforge-native:** one Node web service for HTTP, one continuous worker for
  long jobs, MariaDB for durable state. No Cloudflare Workers/D1 dependency.
- **Survives tab close:** the API only creates and reads jobs; the worker owns
  translation, retries, validation, merge, and wikitext generation.
- **One active job per account:** enforced by a MariaDB generated column and a
  unique index, not just by application code.
- **Perseus Core remains the engine:** `@perseus/core` is bundled into the
  worker from this monorepo. The worker adds section selection, reference
  preservation, strict token validation, and a durable job model around it.
- **Fail closed:** incomplete or invalid output is never exposed as a completed
  job. A completed job is the only state with output.

## Architecture

```
gadget (source wiki)
  │  OAuth popup + bearer token
  ▼
API (Toolforge webservice) ──────► MariaDB
  │  create/read/cancel/retry          ▲
  │  events + output                   │
  ▼                                    │
Worker (Toolforge continuous job) ─────┘
  │
  ├─ Wikimedia REST/API (source article, Parsoid HTML, Wikidata)
  ├─ @perseus/core (IR, placeholders, chunks, merge, generation)
  └─ OpenRouter-compatible LLM provider
```

The API and worker are separate processes. The API is stateless except for an
in-process rate limiter; all durable state lives in MariaDB.

## Endpoints

All `/v1/*` routes except `/v1/health` require
`Authorization: Bearer <perseus-session-token>`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/health` | Toolforge health check |
| `GET` | `/auth/login?origin=https://en.wikipedia.org` | Start Wikimedia OAuth (popup) |
| `GET` | `/auth/callback` | OAuth callback; issues a one-time gadget code |
| `GET` | `/auth/complete?code=...` | Posts `{type:"perseus-auth", code}` to the source wiki |
| `POST` | `/auth/token` | Exchange the one-time code for a bearer session |
| `POST` | `/auth/logout` | Revoke the current bearer session |
| `GET` | `/v1/me` | Current user + active job |
| `GET` | `/v1/source?wiki=enwiki&title=Bibimbap&targetWiki=fa` | Page eligibility, heading tree, target equivalent |
| `POST` | `/v1/jobs` | Create a translation job |
| `GET` | `/v1/jobs` | Recent jobs for the current user |
| `GET` | `/v1/jobs/active` | The single active job, if any |
| `GET` | `/v1/jobs/lookup?wiki=...&title=...&targetWiki=fa` | Restore an active/completed/failed job for an article |
| `GET` | `/v1/jobs/:id` | Job status/progress/counts/error |
| `GET` | `/v1/jobs/:id/events?after=0` | Progress/detail log (polling) |
| `POST` | `/v1/jobs/:id/retry` | Retry only failed chunks |
| `POST` | `/v1/jobs/:id/cancel` | Cancel a queued/running job |
| `GET` | `/v1/jobs/:id/output` | Completed wikitext as JSON |
| `GET` | `/v1/jobs/:id/output/article.wiki` | Download `article.wiki` |

### Create job request

```json
{
  "source": {
    "wiki": "enwiki",
    "title": "Bibimbap",
    "revisionId": 1381322117
  },
  "targetWiki": "fa",
  "selection": {
    "lead": true,
    "sections": {
      "sec-1": { "selected": true, "ownText": true },
      "sec-2": { "selected": true, "ownText": false }
    }
  },
  "replaceExisting": false
}
```

`selection` may be omitted; then the lead and every section are selected,
including each section's own text. `ownText` is the PD-022 "متن این بخش"
control: a parent can stay selected while its own prose is excluded. The
server keeps ancestor headings needed by selected descendants.

`revisionId` is optional. When supplied, the backend rejects the job with
`409 SOURCE_CHANGED` if the article has changed since the gadget read it.

### Output

Only `completed` jobs with a non-expired result return output:

```json
{
  "jobId": "…",
  "wikitext": "…",
  "filename": "article.wiki",
  "completedAt": "2026-10-31T…",
  "expiresAt": "2026-11-01T…",
  "warnings": []
}
```

`completed` results are retained for `JOB_RETENTION_HOURS` (default 24). The
worker expires them and clears the wikitext/source snapshot; chunks are purged
after expiry.

## Job lifecycle

1. Gadget opens `GET /v1/source` for the current article.
2. User picks `fa` or `tg` and a heading selection.
3. Gadget `POST /v1/jobs`; the API fetches the pinned revision, validates the
   page, stores the Parsoid HTML + section tree, and enqueues a `queued` job.
4. Worker claims it with a lease, parses the selected HTML, preserves needed
   references, builds Perseus chunks, and starts translating.
5. Each successful chunk is persisted. Failed chunks are retried
   `CHUNK_RETRIES` times (default 3). A failed job keeps successful chunks.
6. If any chunk is still failed, the job becomes `failed`; no output is exposed.
   `POST /retry` resets **only failed chunks**.
7. If all chunks succeed, the worker merges them, generates wikitext, validates
   that no protocol markers leaked, and marks the job `completed`.
8. Cancel is cooperative: a queued job is cancelled immediately; a running job
   is marked `cancelling` and the worker stops before the next chunk. An AI
   request already in flight may still complete and incur cost.

Statuses: `queued`, `running`, `retrying`, `completed`, `failed`,
`cancelling`, `cancelled`, `expired`, `superseded`.

## Section selection and references

The source is parsed as a heading tree. The selection module:

- keeps the lead independently;
- keeps a section's own content independently from its children (PD-022);
- keeps ancestor headings required to preserve structure;
- removes unselected blocks before Perseus extraction;
- if a selected citation references a named definition outside the selected
  blocks, retains the source References section (or the definition's block) so
  the output does not contain an undefined reference;
- asks the generator to append a target-language References section when refs
  are present and no references section survived.

This is intentionally conservative. The product specification leaves the
policy for infoboxes, tables, galleries, and some template structures open; this
MVP preserves what Parsoid/Perseus already handle and does not invent a new
policy for those elements.

## Wikimedia OAuth flow

This backend is a confidential OAuth 2.0 client. It never exposes the Wikimedia
access token or the AI key to the gadget.

1. Gadget opens
   `https://<tool>/auth/login?origin=https://en.wikipedia.org` in a popup.
2. Backend redirects to Meta Wikimedia OAuth with a one-time `state` stored in
   MariaDB.
3. Callback exchanges the code, fetches the profile, upserts the Perseus user,
   and redirects to `/auth/complete?code=<one-time-gadget-code>`.
4. The complete page verifies the code record and posts
   `{type:"perseus-auth", code}` to the **exact stored source-wiki origin**.
5. Gadget calls `POST /auth/token` with the code and exchanges it for a Perseus
   bearer token (30 days by default). Store it in `sessionStorage` or memory,
   not in a wiki page.

The code is single-use and short-lived (`GADGET_CODE_TTL_SECONDS`), and is
bound to the originating wiki origin. CORS accepts source Wikipedia origins
(`https://<lang>.wikipedia.org` and `https://<lang>.m.wikipedia.org`), rejecting
`fa.wikipedia.org` and `tg.wikipedia.org` as sources.

If a browser policy (for example COOP) prevents the popup from reaching
`window.opener`, the complete page still shows the one-time code; the gadget
can provide a manual paste fallback. **CSP:** Wikimedia currently operates CSP
headers (including report-only policies). A Toolforge hostname is not
automatically inside the default-src allow-list, so verify the browser console
on the target wiki before rollout and track Wikimedia's CSP allow-list/opt-out
work.

### Gadget handshake

The gadget should keep the bearer token in memory or `sessionStorage`, never in
the wiki page source:

```js
const API = "https://perseus.toolforge.org";

function loginWithPerseus() {
  const popup = window.open(
    `${API}/auth/login?origin=${encodeURIComponent(location.origin)}`,
    "perseus-auth",
    "width=520,height=640",
  );

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("login timeout")), 120000);

    window.addEventListener("message", async (event) => {
      if (event.origin !== API) return;
      if (event.data?.type !== "perseus-auth") return;
      if (event.source !== popup) return;

      clearTimeout(timeout);
      const response = await fetch(`${API}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: event.data.code }),
      });
      if (!response.ok) {
        reject(new Error("token exchange failed"));
        return;
      }
      const { token } = await response.json();
      sessionStorage.setItem("perseus-token", token);
      resolve(token);
    }, { once: true });
  });
}
```

API calls then use `Authorization: Bearer <token>`. The gadget must verify both
`event.origin` and `event.source`; the backend binds the one-time code to the
source wiki origin as a second layer.

## Local development

Node 20+ and a MariaDB/MySQL instance are required.

```bash
pnpm install --filter perseus-toolforge-backend...
pnpm --filter @perseus/core build
pnpm --filter perseus-toolforge-backend test
pnpm --filter perseus-toolforge-backend typecheck
```

Create `.env` from `.env.example`, create the database, then:

```bash
pnpm --filter perseus-toolforge-backend migrate
pnpm --filter perseus-toolforge-backend dev:api
pnpm --filter perseus-toolforge-backend dev:worker
```

The API starts on `PORT` (default `8000`). `GET /v1/health` should return
`{"ok":true}`.

### Environment

See `.env.example` for the full list. The important ones:

| Variable | Meaning |
|---|---|
| `PUBLIC_BASE_URL` | Public HTTPS origin; used for the OAuth callback/complete page |
| `DB_*` | Toolforge MariaDB credentials |
| `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` | Wikimedia OAuth consumer |
| `OAUTH_REDIRECT_URI` | Must exactly match the registered callback |
| `OPENROUTER_API_KEY` | Server-side AI key; never sent to the gadget |
| `PERSEUS_MODEL` | One of Core's allow-listed models |
| `JOB_RETENTION_HOURS` | Completed-result lifetime (default 24) |
| `JOB_METADATA_RETENTION_DAYS` | Retain terminal job metadata/events for at most 30 days |
| `MAX_CHUNKS` | Per-job chunk limit |
| `MAX_JOBS_PER_DAY` | Per-account job creation limit |
| `CHUNK_RETRIES` | Automatic attempts beyond the first |
| `AI_REQUEST_TIMEOUT_MS` | Deadline for each AI provider call (default 120 seconds) |
| `WORKER_LEASE_SECONDS` | Crash-recovery lease |

## Toolforge deployment

### 1. Create the tool, database, and OAuth consumer

- Create a Toolforge tool (for example `perseus`).
- Create a Toolforge user database and grant the tool account access.
- Register an OAuth 2.0 consumer at
  `https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose`.
  Use a confidential client and set the callback to
  `https://perseus.toolforge.org/auth/callback` (replace with your domain).
- Set the environment variables with `toolforge envvars create NAME value`
  (or the Toolforge UI). Do not commit `.env`.

### 2. Build a deployable directory

The monorepo uses `workspace:*` for Core, which npm cannot install on Toolforge.
Core is bundled into `dist/worker.js`; the packaging script writes a clean
production `package.json`:

```bash
pnpm --filter @perseus/core build
pnpm --filter perseus-toolforge-backend build:toolforge
```

This writes `apps/toolforge-backend/toolforge-dist/`.

### 3. Deploy the API

```bash
# from your machine, after building
scp -r toolforge-dist/* <tool>@login.toolforge.org:/home/<tool>/www/js/

# on Toolforge
become <tool>
cd $HOME/www/js
npm install --omit=dev
npm run migrate
toolforge webservice node20 start
```

`service.template` sets one replica, 1 CPU, 1 GiB RAM, and the health check.
The API is intentionally single-replica because rate limiting is in-process and
the OAuth/complete page is stateless.

### 4. Deploy the worker

The worker must be a separate continuous job; it must not be started as a
webservice.

```bash
toolforge jobs run perseus-worker \
  --image node20 \
  --continuous \
  --command "npm --prefix /home/<tool>/www/js run start:worker" \
  --mem 1Gi \
  --cpu 1
```

Check `toolforge jobs run --help` for the exact flags in your Toolforge
environment. Only one worker is expected. The lease columns make a second
worker safe, but the MVP is sized for one.

### 5. Verify

- `https://<tool>.toolforge.org/v1/health`
- `GET /auth/login?origin=https://en.wikipedia.org` opens Meta OAuth.
- After login, `/auth/complete` posts to the opener.
- Create a job from an eligible article and watch `/v1/jobs/:id` progress.
- Completed jobs produce `/v1/jobs/:id/output/article.wiki`.
- Check worker logs with `toolforge jobs logs perseus-worker` (or the jobs UI).

## Database

`migrations/001_init.sql` creates users, sessions, OAuth states, gadget codes,
jobs, chunks, and events. Important details:

- `jobs.active_slot` is a generated column and is `1` only for
  `queued/running/retrying/cancelling` jobs. `UNIQUE(user_id, active_slot)`
  enforces "one active job per account" at the database level.
- `job_chunks` persists successful translations so retries never redo good
  chunks.
- `job_events` is the detail log; the UI hides it by default.
- `source_html` and `result_wikitext` are cleared on expiry/cancel/supersede.
- Set `PERSEUS_TEST_DB_NAME` (and optional `PERSEUS_TEST_DB_HOST`, `PERSEUS_TEST_DB_PORT`,
  `PERSEUS_TEST_DB_USER`, `PERSEUS_TEST_DB_PASSWORD`) to run the claim/cancel
  integration test against a disposable, migrated MariaDB database.

Apply migrations with `npm run migrate` (`node dist/migrate.js` in the
production bundle). Migrations are additive and versioned by filename.

## Security and privacy

- AI credentials and Wikimedia OAuth secrets stay in server environment
  variables; the gadget only receives a Perseus bearer token.
- No article text is written to application logs. Events log job/chunk IDs,
  counts, error codes, and short error messages.
- Source HTML and generated wikitext are stored only for the job lifetime and
  are deleted on expiry (24h by default), cancel, or supersede. Failed jobs
  also receive a 24h expiry so their source snapshot cannot live forever.
- Expired, cancelled, and superseded job rows are deleted after 30 days by
  default; their events and chunks are removed by foreign-key cascade.
- The API accepts only Wikipedia source origins and only Wikipedia source wikis
  other than `fa`/`tg`. It does not fetch arbitrary URLs.
- The gadget must not use this service as a general-purpose proxy.
- The complete page has a restrictive CSP and posts only to the origin stored
  with the one-time code.

## Deliberate limitations / open product decisions

- No preview, review editor, draft creation, or publishing. Only JSON/wikitext
  delivery, as the specification requires.
- Reference preservation is heuristic. Named definitions are retained by
  keeping the References section or the definition block; complex citation
  layouts need a real-article test corpus.
- Section selection currently operates on headings and content blocks. The
  open questions about infoboxes, tables, galleries, and category policy are
  not decided here.
- Automatic retries are per chunk and bounded. Cancellation aborts an active AI
  request; cost may still be incurred.
- The worker is single-job, single-process. It is sufficient for the MVP but
  not a multi-tenant queue; a second worker is safe at the lease level, not a
  throughput plan.
- The public target code is `tg` (Tajik Wikipedia). Perseus Core still calls the
  target `tj` internally, so this adapter maps `tg` to Core's `tj` definition
  and corrects the domain to `tg.wikipedia.org` without modifying the desktop
  pipeline.
- Toolforge's proxy rate-limits clients; the API uses polling for progress. The
  gadget should poll no faster than every 2 seconds and stop when the job is
  terminal.

## Tests

```bash
pnpm --filter perseus-toolforge-backend test
```

The suite covers:

- heading tree construction and PD-022 parent/own-text selection;
- reference-section/definition retention;
- empty and unknown selections;
- strict protected-marker validation and final protocol-leak checks;
- OAuth code exchange, origin binding, bearer auth, job ownership, CORS
  preflight, and one-active-job enforcement;
- a synthetic end-to-end worker run (translation, validation, merge,
  generation) with a mocked provider;
- attribute-entity normalization before HTML-to-wikitext.

It does **not** yet cover a live MediaWiki integration, a real LLM call, a
MariaDB integration test, or a full real-article fixture. Those belong in the
next integration-test phase.

## Relationship to `apps/backend`

`apps/backend` (Cloudflare Worker + D1) is intentionally untouched. This is a
parallel, Toolforge-native implementation. Once the Toolforge backend is
validated, the migration can move the product surface here without breaking the
desktop client that still uses the Cloudflare API.
