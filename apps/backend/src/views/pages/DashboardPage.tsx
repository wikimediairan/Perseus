import type { FC, PropsWithChildren } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Button } from "@/views/components/Button";
import { Card } from "@/views/components/Card";
import { Layout } from "@/views/layouts/Layout";

interface DashboardUsageView {
  weeklyCredit: number;
  usedThisWeek: number;
  remainingThisWeek: number;
  nextEvaluationAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "در انتظار بررسی",
  active: "فعال",
  disabled: "غیرفعال",
  rejected: "رد شده",
};

function statusLabel(value: string): string {
  return STATUS_LABELS[value] ?? value;
}

export interface DashboardPageProps {
  wikimediaUsername: string;
  status: string;
  usage: DashboardUsageView | null;
  reviewRequest: string | null;
  loadError: boolean;
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

const Row: FC<PropsWithChildren<{ label: string }>> = ({ label, children }) => (
  <div class="flex items-center justify-between border-b border-white/5 py-3 last:border-0">
    <dt class="text-sm text-slate-400">{label}</dt>
    <dd class="text-sm font-medium text-slate-100">{children}</dd>
  </div>
);

export function DashboardPage({
  wikimediaUsername,
  status,
  usage,
  reviewRequest,
  loadError,
}: DashboardPageProps): JSX.Element {
  return (
    <Layout title="Perseus Dashboard">
      <main class="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-16">
        <Card>
          <div class="mb-8 flex items-center justify-between">
            <h1 class="text-2xl font-semibold tracking-tight text-white">
              داشبورد
            </h1>
            <form method="post" action="/auth/logout">
              <Button type="submit" variant="secondary">
                خروج از حساب کاربری
              </Button>
            </form>
          </div>

          {loadError ? (
            <div class="rounded border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
              در بارگذاری اطلاعات حساب خطایی رخ داد. لطفاً بعداً دوباره تلاش کنید.
            </div>
          ) : (
            <>
              <dl>
                <Row label="حساب ویکی‌مدیا">{wikimediaUsername}</Row>
                <Row label="وضعیت حساب">{statusLabel(status)}</Row>

                {usage ? (
                  <>
                    <Row label="اعتبار هفتگی">{money(usage.weeklyCredit)}</Row>
                    <Row label="مصرف‌شده در این هفته">
                      {money(usage.usedThisWeek)}
                    </Row>
                    <Row label="باقی‌مانده">
                      {money(usage.remainingThisWeek)}
                    </Row>
                    <Row label="ارزیابی بعدی">{usage.nextEvaluationAt}</Row>
                  </>
                ) : null}
              </dl>

              {status === "pending" ? (
                <div class="mt-8 rounded border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  درخواست شما در انتظار بررسی توسط مدیر است.
                </div>
              ) : null}

              {status === "rejected" ? (
                <>
                  <form
                    method="post"
                    action="/dashboard/request-review"
                    class="mt-8"
                  >
                    <Button type="submit" variant="primary" class="w-full">
                      درخواست بررسی مجدد
                    </Button>
                  </form>
                  {reviewRequest === "success" && (
                    <div class="mt-4 rounded border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                      درخواست بررسی مجدد ثبت شد
                    </div>
                  )}

                  {reviewRequest === "error" && (
                    <div class="mt-4 rounded border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
                      ثبت درخواست ناموفق بود
                    </div>
                  )}
                </>
              ) : null}

              {status === "disabled" ? (
                <div class="mt-8 rounded border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
                  حساب شما غیرفعال شده است. برای اطلاعات بیشتر با مدیر تماس
                  بگیرید.
                </div>
              ) : null}
            </>
          )}
        </Card>
      </main>
    </Layout>
  );
}
