import type { JSX } from "hono/jsx/jsx-runtime";
import { Button } from "@/views/components/Button";
import { Card } from "@/views/components/Card";
import { Layout } from "@/views/layouts/Layout";

export function LandingPage(_props: Record<string, never>): JSX.Element {
  return (
    <Layout
      title="پرسیوس"
      description="دستیار هوش مصنوعی برای ترجمهٔ مقالات ویکی‌پدیا، با مدیریت جامعهٔ مشارکت‌کنندگان."
    >
      <main class="flex min-h-screen items-center justify-center px-4 py-16">
        <Card class="w-full max-w-md text-center">
          <h1 class="text-3xl font-semibold tracking-tight text-white">
            پرسیوس
          </h1>

          <p class="mt-3 text-balance text-sm leading-relaxed text-slate-300">
            دستیار هوش مصنوعی برای ترجمهٔ مقالات ویکی‌پدیا
          </p>

          <Button href="/auth/wikimedia" variant="primary" class="mt-8 w-full">
            ورود با حساب ویکی‌مدیا
          </Button>
        </Card>
      </main>
    </Layout>
  );
}
