<div align="center">
  <img src="docs/assets/development-status.svg" width="100%" alt="Development Status">
</div>
<div dir="ltr" align=center>

[**فارسی**](docs/README/fa.md) / [**English**](README.md) / [**Тоҷикӣ**](docs/README/tj.md)

</div>

# Perseus

<div align="center">

<p align="center">
  <img src="docs/assets/logo.png" alt="Perseus Logo" width="200">
</p>

[![Release](https://img.shields.io/github/v/release/wikimediairan/Perseus?display_name=tag)](https://github.com/wikimediairan/Perseus/releases)
[![License](https://img.shields.io/github/license/wikimediairan/Perseus)](LICENSE)

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-fcbe03?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)

</div>

Perseus is a desktop application that helps Wikipedia editors translate English Wikipedia articles
into Wikitext compatible with a supported target wiki (currently Persian Wikipedia and Tajik
Wikipedia).

Unlike browser-based translation tools, Perseus is designed as an editor's workspace. It combines
deterministic processing with large language models to preserve Wikipedia structure while assisting
with translation.

Additional documentation is available under the [architecture](docs/architecture) directory.

## Project Status

Perseus is currently under active development.

The core translation workflow is fully functional and has been stable enough for my own daily use
for approximately a week. This repository is being published primarily to demonstrate the project's
architecture, workflow, and current capabilities.

Several areas are still being actively improved, including:

- Backend service implementation
- Desktop-specific user experience improvements
- Codebase cleanup and modularization
- Lint cleanup and general refactoring

Although this is not yet considered a production-ready release, the repository reflects the current
direction of the project and provides a realistic view of how Perseus is designed to work.

## Manifesto

Perseus exists to strengthen non-English Wikipedia communities by reducing repetitive work while
improving the quality of article translation. It is currently designed for Persian and Tajik
Wikipedia.

Perseus aims to redefine the contributor's role in the age of AI. Rather than spending time on
repetitive tasks such as formatting Wikitext, creating wikilinks, or adapting citations,
contributors can focus on what matters most: exercising human judgment.

We hope the time saved through automation will be invested in verifying sources, fact-checking
content, evaluating neutrality, and making thoughtful editorial decisions that no automated system
should make on its own.

## Features

- Multilingual user interface (English, Persian, and Tajik)
- Translate English Wikipedia articles into Persian/Tajik wiki
- Parse articles using Parsoid
- Resolve Wikidata sitelinks before translation
- Preserve Wikipedia structure during translation
- Chunk-based translation pipeline
- Built-in LLM translation
  - Ollama
  - OpenAI
  - OpenRouter
  - Anthropic
  - Gemini
- Manual translation using any external AI or by hand
- Save and resume translation sessions (`.perseus`)
- Copy or save generated Wikitext

## Running

```bash
pnpm install

pnpm tauri dev

pnpm tauri build
```
