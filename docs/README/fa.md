<div align="center">
  <img src="../assets/development-status.svg" width="100%" alt="Development Status">
</div>
<div dir="ltr" align=center>

[**فارسی**](./fa.md) / [**English**](../../README.md) / [**Тоҷикӣ**](./tj.md)

</div>

<div dir="rtl">

# پرسیوس

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

پرسیوس یک نرم‌افزار دسکتاپ است که به مشارکت‌کنندگان ویکی‌پدیا کمک می‌کند مقاله‌های ویکی‌پدیای
انگلیسی را به wikitext سازگار با ویکی مقصد(در حال حاضر ویکی‌پدیای فارسی و تاجیکی) ترجمه کنند.

برخلاف ابزارهای مبتنی بر مرورگر، پرسیوس به‌عنوان یک محیط کاری برای ویراستاران طراحی شده است. این
برنامه ضمن کمک به ترجمه، ساختار ویکی‌پدیا را نیز کاملا حفظ می‌کند.

مستندات فنی پروژه در پوشهٔ [architecture](../architecture) قرار دارد.

## وضعیت پروژه

پرسیوس در حال حاضر در مرحلهٔ توسعهٔ فعال قرار دارد.

هستهٔ اصلی فرایند ترجمه به‌طور کامل کار می‌کند. هدف از انتشار این مخزن، ارائهٔ نسخهٔ فعلی پروژه برای
نمایش معماری، روند کار و قابلیت‌های آن است.

بخش‌هایی که همچنان در دست توسعه هستند عبارت‌اند از:

- پیاده‌سازی سرویس بک‌اند
- بهبود تجربهٔ کاربری نسخهٔ دسکتاپ
- بازآرایی و ماژولار کردن کدها

اگرچه این نسخه هنوز برای استفادهٔ نهایی آماده نیست، اما تصویر دقیقی از مسیر توسعه و نحوهٔ عملکرد
پرسیوس ارائه می‌دهد.

## مرامنامه

پرسیوس برای تقویت جامعه‌های ویکی‌پدیای غیرانگلیسی‌زبان ساخته شده است؛ با کاهش کارهای تکراری و افزایش
کیفیت ترجمهٔ مقاله‌ها. این پروژه در حال حاضر برای ویکی‌پدیای فارسی و تاجیکی طراحی شده است.

پرسیوس تلاش می‌کند نقش مشارکت‌کننده را در عصر هوش مصنوعی بازتعریف کند. به‌جای صرف زمان برای کارهای
تکراری مانند قالب‌بندی ویکی‌متن، ایجاد پیوندهای داخلی یا تطبیق ارجاع‌ها، مشارکت‌کنندگان می‌توانند بر
چیزی تمرکز کنند که واقعاً ارزشمند است: قضاوت انسانی.

امید ما این است که زمانی که از طریق خودکارسازی این فرایندها آزاد می‌شود، صرف بررسی منابع،
راستی‌آزمایی مطالب، ارزیابی بی‌طرفی و اتخاذ تصمیم‌های ویرایشی شود؛ کارهایی که هیچ سامانهٔ خودکاری
نباید به‌تنهایی انجام دهد.

## قابلیت‌ها

- رابط کاربری چندزبانه (فارسی، انگلیسی و تاجیکی)
- ترجمهٔ مقاله‌های ویکی‌پدیای انگلیسی به ویکی‌پدیای فارسی یا تاجیکی
- پردازش مقاله‌ها با Parsoid
- جایگزینی پیوندها با استفاده از ویکی‌داده پیش از ترجمه
- حفظ ساختار ویکی‌متن در طول فرایند ترجمه
- سامانهٔ ترجمهٔ مبتنی بر قطعه‌بندی (Chunk-based)
- ترجمه با مدل‌های زبانی داخلی از جمله Ollama و OpenAI و OpenRouter و Anthropic و Gemini
- امکان ترجمه با هر هوش مصنوعی خارجی یا به‌صورت دستی
- ذخیره و ادامهٔ نشست‌های ترجمه تحت فرمت `perseus.`
- کپی یا ذخیرهٔ ویکی‌متن تولیدشده

## شروع کار

<div dir="ltr">

```bash
pnpm install

pnpm tauri dev

pnpm tauri build
```

</div>

</div>
