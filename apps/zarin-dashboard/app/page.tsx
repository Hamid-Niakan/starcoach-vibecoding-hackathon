import {
  BarChart3,
  CircleDollarSign,
  Database,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  return (
    <div className="dashboard-grid">
      <aside className="dashboard-sidebar">
        <div className="flex items-center gap-2 text-lg font-bold">
          <CircleDollarSign className="text-amber-500" />
          دیدبان پذیرنده
        </div>
        <nav className="mt-10 space-y-2 text-sm text-zinc-600">
          <Button className="w-full justify-start" variant="outline">
            <BarChart3 className="ml-2 h-4 w-4" />
            نمای کلی
          </Button>
          <div className="flex items-center rounded-xl px-4 py-3 opacity-50">
            <Sparkles className="ml-2 h-4 w-4" />
            دستیار تحلیلی — به‌زودی
          </div>
        </nav>
      </aside>
      <main className="dashboard-main">
        <div className="mx-auto max-w-5xl">
          <header className="dashboard-header">
            <p className="mb-1 text-sm text-zinc-500">نسخه پایه هکاتون</p>
            <h1 className="m-0 text-2xl font-bold">داشبورد تحلیل پذیرنده</h1>
            <p className="text-sm text-zinc-600">
              پوسته محصول آماده است و تحلیل‌های قابل ردیابی در مرحله داده اضافه
              می‌شوند.
            </p>
          </header>

          <section className="dataset-notice" aria-label="وضعیت داده">
            <Database aria-hidden="true" />
            <div>
              <strong>مجموعه‌داده هنوز بارگذاری نشده است</strong>
              <p>
                اعداد ساختگی نمایش داده نمی‌شوند؛ همه شاخص‌ها بعداً از داده رسمی
                محاسبه و قابل پیگیری خواهند بود.
              </p>
            </div>
          </section>

          <section className="metric-grid" aria-label="شاخص‌های آینده">
            {[
              ["نرخ موفقیت پرداخت", "—"],
              ["درآمد قابل مقایسه", "—"],
              ["فرصت‌های بهبود", "—"],
            ].map(([label, value]) => (
              <article className="metric-card" key={label}>
                <span>{label}</span>
                <strong aria-label={`${label}: در انتظار داده`}>{value}</strong>
                <small>در انتظار داده رسمی</small>
              </article>
            ))}
          </section>

          <section
            className="assistant-deferred"
            data-testid="zarinpal-assistant-deferred"
          >
            <div className="assistant-deferred__icon">
              <LockKeyhole aria-hidden="true" />
            </div>
            <div>
              <p className="eyebrow">مرحله آینده</p>
              <h2>دستیار تحلیلی زرین‌پال</h2>
              <p>
                این قابلیت پس از دریافت مجموعه‌داده رسمی و تعریف قواعد تحلیل
                فعال می‌شود تا هیچ پاسخ یا بینش بدون پشتوانه داده ارائه نشود.
              </p>
              <Button type="button" disabled>
                پس از دریافت مجموعه‌داده رسمی فعال می‌شود
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
