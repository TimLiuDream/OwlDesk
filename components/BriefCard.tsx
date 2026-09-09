"use client";

import { useState } from "react";
import Link from "next/link";
import type { BriefTicker, OvernightEvent } from "@/lib/db";

export default function BriefCard({ ticker, events }: { ticker: BriefTicker; events: OvernightEvent[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-4">
        <span className="text-lg font-bold">{ticker.name || ticker.symbol.replace(/USDT$/, "")}</span>
        <span className="text-xs text-slate-500">{ticker.symbol}</span>
        <span className="flex-1" />
        {events.length > 0 && <span className="pill">🦉 巡检 {events.length} 条</span>}
      </div>

      <div className="grid gap-5 px-6 py-5 sm:grid-cols-3">
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-widest text-slate-600">发生了什么</div>
          <p className="text-sm leading-relaxed text-slate-300">{ticker.what}</p>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-widest text-slate-600">为什么</div>
          <p className="text-sm leading-relaxed text-slate-300">{ticker.why}</p>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-widest text-slate-600">怎么看</div>
          <p className="text-sm leading-relaxed text-slate-300">{ticker.view}</p>
        </div>
      </div>

      <div className="mx-6 mb-4 rounded-lg border border-dashed border-line-strong bg-night-900 px-4 py-2.5 text-sm">
        🔍 今日关注：<span className="font-semibold text-owl-amber">{ticker.focus}</span>
      </div>

      {open && events.length > 0 && (
        <div className="border-t border-dashed border-line px-6 py-4">
          {events.map((e) => (
            <div key={e.id} className="flex items-baseline gap-3 py-1 text-sm">
              <span className={`h-2 w-2 shrink-0 rounded-full ${e.type === "price_move" ? "bg-owl-amber shadow-[0_0_6px_#f5b544]" : "bg-line-strong"}`} />
              <span className="w-16 shrink-0 font-mono text-xs text-slate-500">{e.ts_et.slice(11, 16)} ET</span>
              <span>
                {e.title}
                {e.detail && <span className="ml-2 text-xs text-slate-500">{e.detail}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5 border-t border-line bg-white/[0.01] px-6 py-3.5">
        <Link href={`/chat?q=${encodeURIComponent(ticker.symbol + " 昨晚为什么这样走？")}`} className="btn">
          💬 追问解读
        </Link>
        <Link href={`/orders?q=${encodeURIComponent(ticker.name || ticker.symbol)}`} className="btn">
          ✍️ 就此拟单
        </Link>
        {events.length > 0 && (
          <button className="btn btn-ghost" onClick={() => setOpen(!open)}>
            {open ? "▴ 收起时间线" : "▾ 夜间时间线"}
          </button>
        )}
      </div>
    </div>
  );
}
