# Perseus MCP

Perseus MCP is a local [Model Context Protocol](https://modelcontextprotocol.io/) stdio server that
helps an MCP-capable agent translate English Wikipedia articles into Persian (`fa`) or Tajik (`tj`).
It fetches and snapshots an article, divides it into structurally protected chunks, validates the
agent's translations, saves progress, and exports reviewable Wikipedia wikitext plus a
Perseus Desktop-compatible session. The connected agent performs translation with its own model;
the server does not need a translation-provider API key.

## Requirements and installation

- Node.js 22 or newer.
- Network access to the public `en.wikipedia.org` and `www.wikidata.org` endpoints.
- An MCP client that supports local stdio servers.

Codex (verified with the installed `codex mcp add --help`):

```bash
codex mcp add perseus -- npx -y @perseus/mcp
```

Codex with custom storage:

```bash
codex mcp add perseus \
  --env PERSEUS_MCP_DATA_DIR=/absolute/path/to/perseus-data \
  -- npx -y @perseus/mcp
```

Claude Code (the CLI was unavailable during packaging). The current
[official MCP guide](https://docs.anthropic.com/en/docs/claude-code/mcp) documents stdio as the
default and omits `--transport stdio`; verify whether your installed CLI accepts this explicit
equivalent requested for Perseus:

```bash
claude mcp add --transport stdio perseus -- npx -y @perseus/mcp
```

Officially documented form:

```bash
claude mcp add perseus -- npx -y @perseus/mcp
```

Pin a reviewed release for reproducible execution:

```bash
npx -y @perseus/mcp@0.1.0
```

The process accepts no command-line arguments and writes MCP protocol traffic only to stdout.
Diagnostics go to stderr.

## Storage and resume

Sessions are durable JSON snapshots. Their default roots are:

- Linux: `$XDG_DATA_HOME/perseus/mcp`, or `~/.local/share/perseus/mcp` when
  `XDG_DATA_HOME` is unset or relative.
- macOS: `~/Library/Application Support/Perseus/mcp`.
- Windows: `%LOCALAPPDATA%\Perseus\mcp`, or
  `%USERPROFILE%\AppData\Local\Perseus\mcp` when `LOCALAPPDATA` is unset.

Set `PERSEUS_MCP_DATA_DIR` to use another location. It **must be an absolute path**. Each session is
stored under its UUID; accepted chunks and rejected-validation details survive server and client
restarts. Save the session ID returned by `create_translation`, then call
`get_translation_status` to resume. Updates are atomic and locked across processes. If a session is
busy, retry and retrieve the current chunk version before submitting again.

For recovery, back up the complete session UUID directory while the server is stopped. Restore that
directory under the same data root. Do not hand-edit IDs, versions, snapshots, or lock files. An
`INVALID_SESSION` error means the persisted data is malformed, inconsistent, too new, or was
partially restored. `SESSION_NOT_FOUND` usually means the wrong data root or session ID is in use.

## Tools and normal workflow

1. `create_translation` validates an English Wikipedia URL, fetches one revision, resolves links,
   saves the immutable source snapshot, and returns a session ID.
2. `get_translation_status` reports progress and validation problems without returning article
   content.
3. `get_translation_chunk` returns the next unfinished chunk by source order (or a requested chunk),
   its version, protected markers, bounded context, and translation instructions.
4. `submit_translation_chunk` validates the complete marked response. Identical accepted retries
   are idempotent. Revisions require `replace: true` and the current version.
5. `export_translation` refuses incomplete work, rebuilds solely from the saved source snapshot,
   calls Wikimedia Parsoid for HTML-to-wikitext conversion, and writes a Desktop-compatible JSON
   session and `.wiki` file.

See [AGENT_GUIDE.md](./AGENT_GUIDE.md) for the detailed agent contract.

## Security and privacy

Article text, titles, context, existing translations, and upstream markup are untrusted data, not
instructions. The server parses markup inertly, validates all IDs and structure, bounds persisted
data, rejects path traversal and symlinked session files, uses restrictive file modes where the OS
supports them, and does not accept arbitrary export paths. Its network guard allows HTTPS requests
only to English Wikipedia and Wikidata, rejects redirects, strips credentials and ports, applies a
timeout, and identifies Perseus with a Wikimedia User-Agent. The server has no Wikipedia login and
never publishes. Publishing is a separate workflow that requires explicit user authorization and
review of the exported wikitext.

## Limitations and troubleshooting

- Only English Wikipedia input and Persian or Tajik output are supported.
- Article and chunk size limits protect MCP clients and local storage.
- Link resolution and export need Wikimedia availability; translation itself is performed by the
  connected agent.
- Protected markers, citations, templates, links, and segment order must remain exact. Retrieve the
  chunk again and repair every reported validation error.
- A stale submission is rejected rather than overwriting newer accepted work.
- This server prepares drafts; factual review, source review, policy compliance, and publication
  remain the user's responsibility.

Run the executable directly to inspect startup failures; keep stdout connected to the MCP client and
read stderr for diagnostics. A relative custom data path produces `INVALID_DATA_DIR` at startup.

## License, source, and releases

Perseus MCP, including the bundled Core implementation, is licensed under
`GPL-3.0-or-later`; see [LICENSE](./LICENSE). The corresponding source and build scripts for version
0.1.0 are at
[`mcp-v0.1.0`](https://github.com/wikimediairan/Perseus/tree/mcp-v0.1.0), with MCP-specific release
tags following `mcp-vX.Y.Z`. Source maps are included in the npm package and retain source content.

Maintainers must configure npm Trusted Publishing for GitHub repository `wikimediairan/Perseus` and
workflow `release-mcp.yml` before tag publishing can succeed. If npm requires the scoped package to
be created first, a maintainer may perform one authenticated publication of the already tested
tarball, then configure Trusted Publishing; no long-lived npm token belongs in GitHub. The release
workflow publishes the exact CI-tested tarball with public access and provenance.
