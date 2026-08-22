import type { FC, PropsWithChildren } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { AdminUserDetail } from "@/services/adminService";
import { Button } from "@/views/components/Button";
import { Card } from "@/views/components/Card";
import { Layout } from "@/views/layouts/Layout";

const STATUS_LABELS: Record<string, string> = {
  pending: "در انتظار بررسی",
  active: "فعال",
  disabled: "غیرفعال",
  rejected: "رد شده",
};

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function dateLabel(value: string): string {
  return new Date(value).toLocaleString("fa-IR");
}

const Row: FC<PropsWithChildren<{ label: string }>> = ({ label, children }) => (
  <div class="flex items-center justify-between border-b border-white/5 py-3 last:border-0">
    <dt class="text-sm text-slate-400">{label}</dt>
    <dd class="text-sm font-medium text-slate-100">{children}</dd>
  </div>
);

export interface AdminUserDetailPageProps {
  detail: AdminUserDetail;
}

export function AdminUserDetailPage({
  detail,
}: AdminUserDetailPageProps): JSX.Element {
  const { user, usage, creditTransactions } = detail;

  return (
    <Layout title="جزئیات کاربر — پرسیوس">
      <main class="mx-auto max-w-2xl px-4 py-12">
        <a
          href="/admin"
          class="mb-6 inline-block text-sm text-indigo-300 hover:underline"
        >
          ← بازگشت به پنل مدیریت
        </a>

        <Card class="mb-6">
          <h1 class="mb-4 text-xl font-semibold text-white">
            {user.wikimediaUsername ?? `(بدون نام، ${user.id.slice(0, 8)})`}
          </h1>
          <dl>
            <Row label="شناسه کاربر">{user.id}</Row>
            <Row label="وضعیت">{STATUS_LABELS[user.status] ?? user.status}</Row>
            <Row label="اعتبار هفتگی">{money(user.weeklyCredit)}</Row>
            <Row label="تاریخ ثبت‌نام">{dateLabel(user.createdAt)}</Row>
            <Row label="هفته‌های مصرف کم">{user.lowUsageWeeks}</Row>
            <Row label="هفته‌های مصرف کامل">{user.fullUsageWeeks}</Row>
          </dl>

          <form
            method="post"
            action={`/admin/users/${user.id}/status`}
            class="mt-6 flex items-center gap-2"
          >
            <select
              name="status"
              class="rounded border border-white/10 bg-slate-900 px-2 py-1 text-sm text-slate-100"
            >
              {(["pending", "active", "disabled", "rejected"] as const).map(
                (s) => (
                  <option value={s} selected={s === user.status}>
                    {STATUS_LABELS[s]}
                  </option>
                ),
              )}
            </select>
            <Button type="submit" variant="primary">
              اعمال تغییر وضعیت
            </Button>
          </form>
        </Card>

        <Card class="mb-6">
          <h2 class="mb-4 text-lg font-semibold text-white">مصرف این هفته</h2>
          {usage ? (
            <dl>
              <Row label="مصرف‌شده">{money(usage.usedThisWeek)}</Row>
              <Row label="باقی‌مانده">{money(usage.remainingThisWeek)}</Row>
              <Row label="بازنشانی در">{usage.resetsAt}</Row>
            </dl>
          ) : (
            <p class="text-sm text-slate-400">
              مصرفی برای نمایش وجود ندارد (کاربر در وضعیت فعال نیست).
            </p>
          )}
        </Card>

        <Card>
          <h2 class="mb-4 text-lg font-semibold text-white">
            تاریخچه تراکنش‌های اعتبار
          </h2>
          {creditTransactions.length === 0 ? (
            <p class="text-sm text-slate-400">تراکنشی ثبت نشده است.</p>
          ) : (
            <ul class="space-y-2 text-sm">
              {creditTransactions.map((t) => (
                <li class="flex justify-between border-b border-white/5 pb-2">
                  <span class="text-slate-400">
                    {t.type} — {dateLabel(t.createdAt)}
                  </span>
                  <span class="font-medium">{money(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
    </Layout>
  );
}
