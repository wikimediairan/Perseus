<div align="center">
  <img src="../assets/development-status.svg" width="100%" alt="Development Status">
</div>
<div dir="ltr" align=center>

[**فارسی**](./fa.md) / [**English**](../../README.md) / [**Тоҷикӣ**](./tj.md)

</div>

# Perseus

<div align="center">

<p align="center">
  <img src="../assets/logo.png" alt="Perseus Logo" width="200">
</p>

[![Release](https://img.shields.io/github/v/release/wikimediairan/Perseus?display_name=tag)](https://github.com/wikimediairan/Perseus/releases)
[![License](https://img.shields.io/github/license/wikimediairan/Perseus)](LICENSE)

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-fcbe03?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)

</div>

Perseus як барномаи мизи корӣ мебошад, ки ба саҳмгузорони Википедиа барои тарҷумаи мақолаҳои
Википедияи англисӣ ба викиматне, ки бо викии мақсад мувофиқ аст (ҳоло Википедияи тоҷикӣ ва форсӣ),
кумак мекунад.

Бар хилофи абзорҳои тарҷумаи таҳти браузер, Perseus ҳамчун муҳити кори муҳаррирон тарҳрезӣ шудааст.
Ин барнома бо ҳамгиро кардани коркарди муайян (deterministic processing) ва моделҳои бузурги забонӣ
сохтори Википедиаро ҳангоми тарҷума нигоҳ медорад.

Ҳуҷҷатҳои техникии лоиҳа дар феҳристи [architecture](../architecture) ҷойгиранд.

## Вазъи лоиҳа

Perseus ҳоло дар марҳилаи рушди фаъол қарор дорад.

Раванди асосии тарҷума пурра амал мекунад ва тақрибан як ҳафта аст, ки ҳар рӯз аз он истифода
мебарам. Ҳадафи нашри ин анбор нишон додани меъморӣ, ҷараёни кор ва имкониятҳои кунунии лоиҳа
мебошад.

Самтҳое, ки ҳанӯз дар ҳоли такмил мебошанд:

- Татбиқи хидмати backend
- Беҳтар намудани таҷрибаи корбарии барномаи мизи корӣ
- Поксозӣ ва ҷудокунии код ба қисмҳои хурдтар

Гарчанде ки ин ҳанӯз нашри омода барои истифодаи умум нест, он самти рушди Perseus ва тарзи кори
онро ба хубӣ нишон медиҳад.

## Манифест

Perseus барои тақвият бахшидани ҷомеаҳои Википедияи ғайрианглисӣ тавассути коҳиш додани корҳои
такрорӣ ва беҳтар намудани сифати тарҷумаи мақолаҳо сохта шудааст. Ҳоло он барои Википедияи тоҷикӣ
ва форсӣ тарҳрезӣ шудааст.

Perseus мехоҳад нақши саҳмгузорро дар давраи зеҳни сунъӣ аз нав муайян кунад. Ба ҷойи сарф кардани
вақт барои корҳои такрорӣ, аз қабили шаклбандии викиматн, сохтани пайвандҳои дохилӣ ё мутобиқ
кардани иқтибосҳо, саҳмгузорон метавонанд ба муҳимтарин чиз — доварии инсонӣ — диққат диҳанд.

Умед дорем, ки вақти сарфашуда ба шарофати худкорсозӣ барои санҷиши манбаъҳо, ҳақиқатсанҷии муҳтаво,
арзёбии бетарафӣ ва қабули қарорҳои муҳаррирӣ истифода мешавад; қарорҳое, ки ҳеҷ низоми худкор
набояд онҳоро мустақилона қабул кунад.

## Имкониятҳо

- Интерфейси чандзабона (англисӣ, форсӣ ва тоҷикӣ)
- Тарҷумаи мақолаҳои Википедияи англисӣ ба Википедияи тоҷикӣ ё форсӣ
- Коркарди мақолаҳо бо Parsoid
- Иваз кардани пайвандҳо тавассути Wikidata пеш аз тарҷума
- Нигоҳ доштани сохтори викиматн ҳангоми тарҷума
- Раванди тарҷумаи порча-порча (Chunk-based)
- Тарҷума бо моделҳои бузурги забонӣ
  - Ollama
  - OpenAI
  - OpenRouter
  - Anthropic
  - Gemini

- Имкони тарҷума бо ҳар гуна зеҳни сунъии беруна ё ба таври дастӣ
- Захира ва идомаи нишастҳои тарҷума (`.perseus`)
- Нусхабардорӣ ё захира кардани викиматни тавлидшуда

## Оғози кор

```bash
pnpm install

pnpm tauri dev

pnpm tauri build
```
