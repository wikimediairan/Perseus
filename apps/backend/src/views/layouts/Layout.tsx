import type { FC, PropsWithChildren } from "hono/jsx";

export interface LayoutProps {
  title: string;
  description?: string;
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({
  title,
  description,
  children,
}) => {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap"
        />
        <title>{title}</title>
        {description ? <meta name="description" content={description} /> : null}
        <link rel="stylesheet" href="/static/app.css" />
      </head>
      <body class="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased">
        <div class="min-h-screen bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.25),transparent_60%)]">
          {children}
        </div>
      </body>
    </html>
  );
};
