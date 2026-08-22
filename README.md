<div align="center">
  <img src="assets/development-status.svg" width="100%" alt="Development Status">
</div>
<div dir="ltr" align=center>

[**فارسی**](/README.fa.md) / [**English**](README.md) / [**Тоҷикӣ**](README.tg.md)

</div>

<div align="center">

<p align="center">
  <img src="assets/logo.png" alt="Perseus Logo" width="200">
</p>

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-fcbe03?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)

</div>

# Perseus
Perseus is a Computer-Assisted Translation tool for Wikipedia. It helps you translate English Wikipedia articles into **Persian or Tajik**, preparing them for publication on Persian or Tajik Wikipedia while taking care of the tedious, error-prone parts — links, citations, templates, and formatting — so you can focus on producing an accurate, natural translation.

<p align="center">
  <a href="https://github.com/wikimediairan/Perseus/releases">
    <img src="https://img.shields.io/badge/⬇%20Download%20-2ea44f?style=for-the-badge" alt="Download">
  </a>
</p>

## Key capabilities
* Translates English Wikipedia articles into **Persian or Tajik** while preserving their structure — citations, infoboxes, templates, and other formatting stay intact; only the readable text is translated.
* Automatically resolves links to the corresponding article on the target Wikipedia, with a clear fallback when no matching article exists.
* Saves your progress so you can resume a translation later.
* Supports translation through an AI provider of your choice, or lets you work through the text yourself.

## API Key
To use Perseus, you can use the Wikimedia API key provided by Wikimedia Iran. If you prefer to use your own dedicated API key, you can obtain one at [perseus-backend.alireza3205.workers.dev](https://perseus-backend.alireza3205.workers.dev) by signing in with your Wikimedia account.

## Basic usage
1. Open Perseus and paste the URL of the English Wikipedia article you want to translate.
2. Select **Persian or Tajik** as the target language.
3. Let Perseus load the article and split it into translation chunks.
4. For each chunk, copy the chunk together with its translation prompt, send it to your chosen LLM, and paste the model's translated response back into Perseus.
5. When all chunks have been translated, click Generate Wikitext to assemble the complete translated Wikipedia article.
