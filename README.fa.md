<div align="center">

<img src="assets/development-status.svg" width="100%" alt="وضعیت توسعه">

</div>

<div dir="ltr" align="center">

[**فارسی**](README.fa.md) / [**English**](README.md) / [**Тоҷикӣ**](README.tg.md)

</div>

<div align="center">

<p align="center">
  <img src="assets/logo.png" alt="لوگوی پرسیوس" width="200">
</p>

[![Release](https://img.shields.io/github/v/release/wikimediairan/Perseus?display_name=tag)](https://github.com/wikimediairan/Perseus/releases)
[![License](https://img.shields.io/github/license/wikimediairan/Perseus)](LICENSE)

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-fcbe03?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)

</div>

<div dir="rtl">

# پرسیوس

پرسیوس یک ابزار کمک-ترجمه برای ویکی‌پدیا است. این ابزار به شما کمک می‌کند مقاله‌های ویکی‌پدیای انگلیسی را به **فارسی یا تاجیکی** ترجمه و برای انتشار در ویکی‌پدیای فارسی یا تاجیکی آماده کنید. پرسیوس بخش‌های وقت‌گیر و مستعد خطا، مانند پیوندها، یادکردها، الگوها و قالب‌بندی را مدیریت می‌کند تا شما بتوانید روی ویراستاری نهایی و بررسی منابع تمرکز کنید.

<p align="center">
  <a href="https://github.com/wikimediairan/Perseus/releases">
    <img src="https://img.shields.io/badge/⬇%20Download%20-2ea44f?style=for-the-badge" alt="Download">
  </a>
</p>

## قابلیت‌های اصلی

* مقاله‌های ویکی‌پدیای انگلیسی را به **فارسی یا تاجیکی** ترجمه می‌کند و ساختار آن‌ها را حفظ می‌کند؛ یادکردها، جعبه‌های اطلاعات، الگوها و سایر قالب‌بندی‌ها دست‌نخورده باقی می‌مانند و فقط متن قابل‌خواندن ترجمه می‌شود.
* پیوندها را به‌صورت خودکار به مقالهٔ متناظر در ویکی‌پدیای زبان مقصد هدایت می‌کند و در صورت نبود مقالهٔ متناظر، یک پیوند جایگزین مناسب ایجاد می‌کند.
* پیشرفت کار را ذخیره می‌کند تا بتوانید فرایند ترجمه را بعداً ادامه دهید.
* امکان ترجمه با LLM انتخابی شما را فراهم می‌کند و همچنین می‌توانید متن را به‌صورت دستی ترجمه کنید.

## کلید API
برای استفاده از پرسیوس می‌توانید از کلید API ویکی‌مدیا که توسط Wikimedia Iran در اختیار کاربران قرار گرفته است استفاده کنید. اگر ترجیح می‌دهید از کلید API اختصاصی خودتان استفاده کنید، می‌توانید با ورود به حساب کاربری ویکی‌مدیای خود، آن را از [perseus-backend.alireza3205.workers.dev](https://perseus-backend.alireza3205.workers.dev) دریافت کنید.

## نحوهٔ استفاده

1. پرسیوس را باز کنید و نشانی مقالهٔ ویکی‌پدیای انگلیسی را که می‌خواهید ترجمه کنید وارد کنید.
2. **فارسی یا تاجیکی** را به‌عنوان زبان مقصد انتخاب کنید.
3. اجازه دهید پرسیوس مقاله را بارگیری کرده و آن را به بخش‌های قابل ترجمه تقسیم کند.
4. هر بخش را همراه با پرامپت ترجمه کپی کنید، آن را به LLM انتخابی خود بدهید و پاسخ ترجمه‌شده را دوباره در پرسیوس جای‌گذاری کنید. این کار را برای تمام چانک‌ها تکرار کنید.
5. پس از ترجمهٔ همهٔ بخش‌ها، روی **تولید ویکی‌متن** کلیک کنید تا ویکی‌متن کامل مقاله ساخته شود.

</div>
