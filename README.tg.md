<div align="center">

<img src="assets/development-status.svg" width="100%" alt="Ҳолати рушд">

</div>

<div dir="ltr" align="center">

[**فارسی**](README.fa.md) / [**English**](README.md) / [**Тоҷикӣ**](README.tg.md)

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
Perseus як абзори тарҷумаи компютерӣ барои Википедия мебошад. Он ба шумо имкон медиҳад, ки мақолаҳои Википедияи англисиро ба **тоҷикӣ ё форсӣ** тарҷума карда, онҳоро барои нашр дар Википедияи тоҷикӣ ё форсӣ омода намоед. Perseus корҳои душвор ва хатоёби ҳамешагӣ — аз қабили кор бо пайвандҳо, иқтибосҳо, қолабҳо ва сохтори матн —ро ба уҳда мегирад, то шумо тавонед ба таҳияи тарҷумаи дақиқу равон тамаркуз кунед.

<p align="center">
  <a href="https://github.com/wikimediairan/Perseus/releases">
    <img src="https://img.shields.io/badge/⬇%20Download%20-2ea44f?style=for-the-badge" alt="Download">
  </a>
</p>

## Имкониятҳои асосӣ
* Мақолаҳои Википедияи англисиро ба **тоҷикӣ ё форсӣ** тарҷума мекунад ва сохтори онҳоро нигоҳ медорад — иқтибосҳо, инфобоксҳо, қолабҳо ва дигар унсурҳои сохторӣ бетағйир мемонанд; танҳо матни хондашаванда тарҷума мешавад.
* Пайвандҳоро ба мақолаи мувофиқ дар Википедияи забони мақсад ба таври худкор муайян мекунад ва агар мақолаи мувофиқ вуҷуд надошта бошад, пайванди эҳтиётӣ месозад.
* Раванди тарҷумаро нигоҳ медорад, то шумо баъдтар онро идома диҳед.
* Истифодаи LLM-и интихобкардаи шуморо барои тарҷума дастгирӣ мекунад ё ба шумо имкон медиҳад, ки матнро дастӣ тарҷума кунед.

## API Key
Барои истифодаи Perseus шумо метавонед аз калиди API-и Wikimedia, ки аз ҷониби Wikimedia Iran дар ихтиёри корбарон гузошта шудааст, истифода баред. Агар хоҳед аз калиди API-и махсуси худ истифода баред, метавонед бо ворид шудан ба ҳисоби Wikimedia-и худ онро аз [perseus-backend.alireza3205.workers.dev](https://perseus-backend.alireza3205.workers.dev) дастрас намоед.

## Тарзи истифода
1. Perseus-ро кушоед ва URL-и мақолаи Википедияи англисиро, ки мехоҳед тарҷума кунед, ворид намоед.
2. **Тоҷикӣ ё форсӣ**-ро ҳамчун забони мақсад интихоб кунед.
3. Perseus мақоларо бор карда, онро ба чанкҳои тарҷумашаванда тақсим мекунад.
4. Барои ҳар як чанк, худи чанкро ҳамроҳ бо prompt-и тарҷума нусха карда, ба LLM-и интихобкардаатон фиристед ва ҷавоби тарҷумашударо дубора ба Perseus ҷойгузин кунед. Ин амалро барои ҳар як чанк такрор намоед.
5. Пас аз тарҷумаи ҳамаи чанкҳо, тугмаи **Тавлиди викиматн**-ро пахш кунед, то матни пурраи мақолаи Википедия сохта шавад.
