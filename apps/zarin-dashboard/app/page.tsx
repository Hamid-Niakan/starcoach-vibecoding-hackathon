import { BarChart3, CircleDollarSign, Sparkles } from "lucide-react";
import { ChatPanel } from "@hackathon/chat-ui";
import { Button } from "@/components/ui/button";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

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
            <Sparkles className="ml-2 h-4 w-4" />
            دستیار تحلیلی
          </Button>
          <div className="flex items-center rounded-xl px-4 py-3 opacity-50">
            <BarChart3 className="ml-2 h-4 w-4" />
            بینش‌ها — به‌زودی
          </div>
        </nav>
      </aside>
      <main className="dashboard-main">
        <div className="mx-auto max-w-5xl">
          <header className="mb-5 px-2">
            <p className="mb-1 text-sm text-zinc-500">نسخه پایه هکاتون</p>
            <h1 className="m-0 text-2xl font-bold">دستیار تحلیل پذیرنده</h1>
            <p className="text-sm text-zinc-600">
              زیرساخت گفتگو آماده است؛ تحلیل داده پس از دریافت مجموعه‌داده رسمی
              اضافه می‌شود.
            </p>
          </header>
          <div className="dashboard-card">
            <ChatPanel
              apiUrl={apiUrl}
              product="zarinpal"
              title="دستیار زرین‌پال"
              description="گفتگوی آزمایشی با تاریخچه پایدار"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
