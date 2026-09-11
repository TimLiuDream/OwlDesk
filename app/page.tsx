"use client";

import { useCallback, useEffect, useState } from "react";
import type { Brief, OvernightEvent, WatchlistItem } from "@/lib/db";
import BriefCard from "@/components/BriefCard";

interface BriefResponse {
  brief: Brief;
  events: OvernightEvent[];
  stale?: boolean;
}

export default function BriefPage() {
  const [data, setData] = useState<BriefResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [newSymbol, setNewSymbol] = useState("");

  const load = () => {
    fetch("/api/brief?events=1")
      .then((r) => r.json())
      .then((d: BriefResponse) => setData(d))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  const loadWatchlist = useCallback(() => {
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((d: { watchlist: WatchlistItem[] }) => setWatchlist(d.watchlist ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    loadWatchlist();
  }, [loadWatchlist]);

  const addSymbol = async () => {
    const symbol = newSymbol.trim().toUpperCase();
    if (!symbol) return;
    setNewSymbol("");
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    }).catch(() => undefined);
    loadWatchlist();
  };

  const removeSymbol = async (symbol: string) => {
    await fetch(`/api/watchlist?symbol=${symbol}`, { method: "DELETE" }).catch(() => undefined);
    loadWatchlist();
  };

  const regenerate = async () => {
    setRegenerating(true);
    await fetch("/api/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    }).catch(() => undefined);
    load();
    setRegenerating(false);
  };

  const patrolNow = async () => {
    setRegenerating(true);
    await fetch("/api/cron/patrol", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    }).catch(() => undefined);
    await regenerate();
  };

  if (loading) {
    return <p className="py-20 text-center text-slate-500">🦉 正在读取昨夜…</p>;
  }
  if (!data?.brief) {
    return <p className="py-20 text-center text-slate-500">暂无晨报。先跑一次巡检。</p>;
  }

  const { brief, events } = data;
  const tickerEvents = (symbol: string) =>
    events.filter((e) => e.symbol === symbol).sort((a, b) => (a.ts_et > b.ts_et ? 1 : -1));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            夜间晨报
            <span className="pill ml-3 align-middle">
              ET {brief.date} 收盘 · {new Date(brief.generated_at).toLocaleString("zh-CN")}
            </span>
            {data.stale && <span className="pill pill-warn ml-2 align-middle">最近一份（新时段未开盘）</span>}
            {brief.status === "partial" && <span className="pill pill-warn ml-2 align-middle">模板降级</span>}
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-300">{brief.summary_json.headline}</p>
          {brief.summary_json.summary && (
            <div className="mt-3 rounded-xl border-l-2 border-owl-amber bg-night-900 px-5 py-3.5">
              <div className="mb-1 text-[11px] tracking-widest text-slate-500">隔夜总览</div>
              <p className="text-[15px] leading-relaxed text-slate-200">{brief.summary_json.summary}</p>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={patrolNow} disabled={regenerating}>
            🛰 立即巡检
          </button>
          <button className="btn btn-primary" onClick={regenerate} disabled={regenerating}>
            {regenerating ? "生成中…" : "⟳ 重新生成晨报"}
          </button>
        </div>
      </div>

      {/* Watchlist 管理（PRD A1） */}
      <div className="card mb-5 flex flex-wrap items-center gap-2 px-5 py-3.5">
        <span className="text-xs tracking-widest text-slate-500">巡检自选</span>
        {watchlist.map((w) => (
          <span key={w.id} className="pill">
            {w.symbol}
            <button
              className="ml-1 text-slate-500 transition-colors hover:text-owl-red"
              title="从自选移除"
              onClick={() => removeSymbol(w.symbol)}
            >
              ×
            </button>
          </span>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <input
            className="input !w-40 !px-3 !py-1.5 text-sm"
            placeholder="加标的，如 RGOOGLUSDT"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSymbol()}
          />
          <button className="btn !px-3 !py-1.5" onClick={addSymbol}>
            添加
          </button>
        </span>
      </div>

      <div className="space-y-4">
        {brief.summary_json.tickers.map((t) => (
          <BriefCard key={t.symbol} ticker={t} events={tickerEvents(t.symbol)} />
        ))}
      </div>

      {events.filter((e) => e.symbol === "MARKET").length > 0 && (
        <div className="card mt-6 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-400">🌐 全市场事件</h2>
          <ul className="space-y-2 text-sm">
            {events
              .filter((e) => e.symbol === "MARKET")
              .map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="shrink-0 font-mono text-xs text-slate-500">{e.ts_et.slice(11, 16)} ET</span>
                  <span>
                    {e.title}
                    {e.detail && <span className="block text-xs text-slate-500">{e.detail}</span>}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-slate-600">
        数据与信号来自 Bitget Agent Hub（market 模块 + bitget-signal 五技能）· 引用随回答标注 · 不构成投资建议
      </p>
    </div>
  );
}
