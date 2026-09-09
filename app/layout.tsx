import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "OwlDesk — The desk that never sleeps",
  description:
    "24h research desk for tokenized US stocks: overnight briefs while you sleep, order drafts that wait for your signature. Built on Bitget Agent Hub.",
};

const tabs = [
  { href: "/", label: "🌙 夜间晨报" },
  { href: "/chat", label: "💬 研究对话" },
  { href: "/orders", label: "✍️ 拟单台" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <header className="sticky top-0 z-50 border-b border-line bg-night-950/85 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-7 px-6 py-3.5">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-line-strong bg-gradient-to-br from-night-700 to-night-950 text-xl">
                🦉
              </span>
              <span className="leading-tight">
                <span className="text-lg font-bold">OwlDesk</span>
                <span className="block text-[10px] tracking-widest text-slate-500">
                  THE DESK THAT NEVER SLEEPS
                </span>
              </span>
            </Link>
            <nav className="flex flex-1 gap-1">
              {tabs.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className="rounded-lg px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-night-900 hover:text-slate-100"
                >
                  {t.label}
                </Link>
              ))}
            </nav>
            <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-owl-teal shadow-[0_0_8px_#3ddbc4]" />
              Agent Hub · paper 模式
            </span>
          </div>
        </header>

        <div className="border-b border-owl-amber/20 bg-owl-amber/5 py-1.5 text-center text-xs text-owl-amber/80">
          Bitget AI Hackathon S2 · AI Trading Desk · AI 拟单，你签字；分析只读，执行走模拟盘
        </div>

        <main className="mx-auto max-w-5xl px-6 pb-24 pt-7">{children}</main>
      </body>
    </html>
  );
}
