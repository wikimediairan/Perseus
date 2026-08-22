import type { FC, PropsWithChildren } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import type {
  CreditQueueWithUserRow,
  CreditTransactionRow,
} from "@/repositories/creditRepo";
import type { UserRow, UserStatus } from "@/repositories/usersRepo";
import { Button } from "@/views/components/Button";
import { Card } from "@/views/components/Card";
import { Layout } from "@/views/layouts/Layout";

const STATUS_LABELS: Record<string, string> = {
  pending: "در انتظار بررسی",
  active: "فعال",
  disabled: "غیرفعال",
  rejected: "رد شده",
  processed: "پردازش‌شده",
};

function statusLabel(value: string): string {
  return STATUS_LABELS[value] ?? value;
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function dateLabel(value: string): string {
  return new Date(value).toLocaleString("fa-IR");
}

const Section: FC<PropsWithChildren<{ title: string }>> = ({
  title,
  children,
}) => (
  <Card class="mb-6">
    <h2 class="mb-4 text-lg font-semibold text-white">{title}</h2>
    {children}
  </Card>
);

const Table: FC<PropsWithChildren<{ headers: string[] }>> = ({
  headers,
  children,
}) => (
  <div class="overflow-x-auto">
    <table class="w-full text-right text-sm">
      <thead>
        <tr class="border-b border-white/10 text-slate-400">
          {headers.map((h) => (
            <th class="px-2 py-2 font-medium">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

const Empty: FC<{ colSpan: number; label: string }> = ({ colSpan, label }) => (
  <tr>
    <td colSpan={colSpan} class="px-2 py-6 text-center text-slate-500">
      {label}
    </td>
  </tr>
);

export interface AdminPageProps {
  adminUsername: string;
  notice: { kind: "success" | "error"; message: string } | null;
  users: UserRow[];
  creditQueue: CreditQueueWithUserRow[];
  creditTransactions: CreditTransactionRow[];
  loadError: boolean;
}

const USER_STATUSES: UserStatus[] = [
  "pending",
  "active",
  "disabled",
  "rejected",
];

export function AdminPage({
  adminUsername,
  notice,
  users,
  creditQueue,
  creditTransactions,
  loadError,
}: AdminPageProps): JSX.Element {
  const pendingCount = users.filter((u) => u.status === "pending").length;

  return (
    <Layout title="پنل مدیریت پرسیوس">
      <main class="mx-auto max-w-5xl px-4 py-12">
        <div class="mb-8 flex items-center justify-between">
          <h1 class="text-2xl font-semibold tracking-tight text-white">
            پنل مدیریت
          </h1>
          <div class="flex items-center gap-3">
            <span class="text-sm text-slate-400">{adminUsername}</span>
            <a
              href="/dashboard"
              class="text-sm text-indigo-300 hover:underline"
            >
              داشبورد کاربری
            </a>
          </div>
        </div>

        {notice ? (
          <div
            class={`mb-6 rounded border p-4 text-sm ${
              notice.kind === "success"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : "border-red-400/30 bg-red-500/10 text-red-200"
            }`}
          >
            {notice.message}
          </div>
        ) : null}

        {loadError ? (
          <div class="rounded border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
            در بارگذاری اطلاعات پنل مدیریت خطایی رخ داد. لطفاً بعداً دوباره تلاش
            کنید.
          </div>
        ) : (
          <>
            <Section
              title={`کاربران (${users.length}${
                pendingCount > 0 ? ` — ${pendingCount} در انتظار بررسی` : ""
              })`}
            >
              <Table
                headers={[
                  "کاربر ویکی‌مدیا",
                  "وضعیت",
                  "اعتبار هفتگی",
                  "تاریخ ثبت‌نام",
                  "تغییر وضعیت",
                ]}
              >
                {users.length === 0 ? (
                  <Empty colSpan={5} label="کاربری وجود ندارد" />
                ) : (
                  users.map((u) => (
                    <tr class="border-b border-white/5">
                      <td class="px-2 py-3">
                        <a
                          href={`/admin/users/${u.id}`}
                          class="text-indigo-300 hover:underline"
                        >
                          {u.wikimediaUsername ??
                            `(بدون نام، ${u.id.slice(0, 8)})`}
                        </a>
                      </td>
                      <td class="px-2 py-3">{statusLabel(u.status)}</td>
                      <td class="px-2 py-3">{money(u.weeklyCredit)}</td>
                      <td class="px-2 py-3 text-slate-400">
                        {dateLabel(u.createdAt)}
                      </td>
                      <td class="px-2 py-3">
                        <form
                          method="post"
                          action={`/admin/users/${u.id}/status`}
                          class="flex items-center gap-2"
                        >
                          <select
                            name="status"
                            class="rounded border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                          >
                            {USER_STATUSES.map((s) => (
                              <option value={s} selected={s === u.status}>
                                {statusLabel(s)}
                              </option>
                            ))}
                          </select>
                          <Button type="submit" variant="secondary">
                            اعمال
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </Table>
            </Section>

            <Section title={`صف اعتبار (${creditQueue.length})`}>
              <form
                method="post"
                action="/admin/credits/queue/process"
                class="mb-4"
              >
                <Button type="submit" variant="primary">
                  پردازش صف اعتبار
                </Button>
              </form>
              <Table headers={["کاربر", "مبلغ درخواستی", "وضعیت", "تاریخ"]}>
                {creditQueue.length === 0 ? (
                  <Empty colSpan={4} label="صف اعتبار خالی است" />
                ) : (
                  creditQueue.map((q) => (
                    <tr class="border-b border-white/5">
                      <td class="px-2 py-3">
                        {q.wikimediaUsername ?? "(ناشناس)"}
                      </td>
                      <td class="px-2 py-3">{money(q.requestedAmount)}</td>
                      <td class="px-2 py-3">{statusLabel(q.status)}</td>
                      <td class="px-2 py-3 text-slate-400">
                        {dateLabel(q.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </Table>
            </Section>

            <Section title="آخرین تراکنش‌های اعتبار">
              <Table headers={["کاربر", "نوع", "مبلغ", "تاریخ"]}>
                {creditTransactions.length === 0 ? (
                  <Empty colSpan={4} label="تراکنشی ثبت نشده است" />
                ) : (
                  creditTransactions.map((t) => (
                    <tr class="border-b border-white/5">
                      <td class="px-2 py-3">{t.userId.slice(0, 8)}</td>
                      <td class="px-2 py-3">{t.type}</td>
                      <td class="px-2 py-3">{money(t.amount)}</td>
                      <td class="px-2 py-3 text-slate-400">
                        {dateLabel(t.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </Table>
            </Section>
          </>
        )}
      </main>
    </Layout>
  );
}
