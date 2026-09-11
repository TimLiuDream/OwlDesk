/**
 * Brief generation job (ARCHITECTURE.md §7, PRD A3).
 * Aggregates one ET session's events per ticker → LLM 三段式 brief.
 * Falls back to a deterministic template when LLM is unavailable so the
 * dashboard always has a brief (demo-anytime requirement).
 */

import { read, update, uid, type Brief, type BriefTicker, type OvernightEvent } from "@/lib/db";
import { getSnapshots } from "@/lib/agenthub/market";
import { chatCompletion } from "@/lib/llm/provider";
import { briefSystemPrompt } from "@/lib/llm/prompts";
import { etDate } from "./patrol";

function eventsForSession(events: OvernightEvent[], date: string): OvernightEvent[] {
  return events.filter((e) => e.ts_et.slice(0, 10) === date);
}

function templateBrief(date: string, events: OvernightEvent[], tickers: Array<{ symbol: string; name: string; changePct: number | null; price: number | null }>): Brief["summary_json"] {
  const moved = events.filter((e) => e.symbol !== "MARKET");
  const t: BriefTicker[] = tickers.map((tk) => {
    const own = moved.filter((e) => e.symbol === tk.symbol);
    const newsish = events.find((e) => e.type === "news" || e.type === "sentiment");
    return {
      symbol: tk.symbol,
      name: tk.name,
      what:
        own.length > 0
          ? own.map((e) => e.title + "。" + e.detail).join(" ")
          : `夜间无显著异动，现价 ${tk.price ?? "—"}（24h ${tk.changePct !== null ? (tk.changePct > 0 ? "+" : "") + tk.changePct + "%" : "—"}）。`,
      why:
        newsish?.title
          ? `市场背景：${newsish.title}`
          : "消息面平静（模板模式：LLM 未配置，未做新闻归因）。",
      view: "观察为主；配置 LLM_API_KEY 后晨报将包含 AI 归因解读。",
      focus: own.length > 0 ? "跟踪已触发异动的价位" : "关注财报与宏观日历",
    };
  });
  const movedCount = moved.length;
  // honest 2-sentence overview computed from the events themselves
  const biggest = moved
    .filter((e) => typeof e.change_pct === "number")
    .sort((a, b) => Math.abs(b.change_pct as number) - Math.abs(a.change_pct as number))[0];
  const upCount = moved.filter((e) => (e.change_pct ?? 0) > 0).length;
  const summary =
    movedCount === 0
      ? `本时段巡检未记录到显著异动（${tickers.length} 个标的），市场整体平静。模板简报 — 配置 LLM 后将包含 AI 总览。`
      : `本时段共记录 ${movedCount} 条异动（涨 ${upCount} / 跌 ${movedCount - upCount}）` +
        (biggest
          ? `，其中幅度最大的是 ${biggest.symbol.replace(/USDT$/, "")} 的 ${biggest.title.replace(/^.*异动\s*/, "")}。`
          : "。") +
        `消息面事件${events.some((e) => e.type === "news") ? "已有记录" : "暂缺"}，模板简报 — 配置 LLM 后将包含 AI 归因总览。`;
  return {
    headline: `${date} 隔夜：${movedCount} 条异动事件（模板简报 — LLM 未启用）`,
    summary,
    tickers: t,
  };
}

export async function generateBrief(force = false): Promise<{ brief: Brief; created: boolean }> {
  const date = etDate();
  const existing = await read((store) => store.briefs.find((b) => b.date === date));
  if (existing && !force) return { brief: existing, created: false };

  const watchlist = await read((store) => store.watchlist.map((w) => ({ symbol: w.symbol, name: w.name })));
  const events = await read((store) => eventsForSession(store.overnight_events, date));

  const snapshots = await getSnapshots(watchlist.map((w) => w.symbol));
  const snapBySymbol = new Map(snapshots.map((s) => [s.symbol, s]));

  let summary: Brief["summary_json"];
  let status: Brief["status"] = "ok";

  try {
    const eventsText = events.length
      ? events.map((e) => `[${e.ts_et.slice(11, 16)} ET] ${e.symbol} ${e.type}: ${e.title} — ${e.detail}`).join("\n")
      : "（本时段巡检未记录到事件）";
    const tickerLine = watchlist
      .map((w) => {
        const s = snapBySymbol.get(w.symbol);
        return `${w.symbol}(${w.name}): price=${s?.price ?? "?"}, 24h=${s?.changePct ?? "?"}%`;
      })
      .join("; ");

    const res = await chatCompletion(
      [
        { role: "system", content: briefSystemPrompt() },
        {
          role: "user",
          content: `日期(ET): ${date}\n自选标的行情:\n${tickerLine}\n\n夜间事件:\n${eventsText}`,
        },
      ],
      { jsonMode: true, temperature: 0.4, maxTokens: 3000 },
    );
    const raw = res.choices?.[0]?.message?.content ?? "";
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as Brief["summary_json"];
      if (parsed && Array.isArray(parsed.tickers) && typeof parsed.headline === "string") {
        // LLM may omit the summary paragraph — backfill with the computed one
        if (!parsed.summary || parsed.summary.length < 20) {
          parsed.summary = templateBrief(date, events, watchlist.map((w) => ({
            symbol: w.symbol,
            name: w.name,
            changePct: snapBySymbol.get(w.symbol)?.changePct ?? null,
            price: snapBySymbol.get(w.symbol)?.price ?? null,
          }))).summary;
        }
        summary = parsed;
      } else {
        summary = templateBrief(date, events, watchlist.map((w) => ({
          symbol: w.symbol,
          name: w.name,
          changePct: snapBySymbol.get(w.symbol)?.changePct ?? null,
          price: snapBySymbol.get(w.symbol)?.price ?? null,
        })));
        status = "partial";
      }
    } else {
      throw new Error("brief JSON parse failed");
    }
  } catch (e) {
    // ANY generation failure (LLM down, proxy breaker, parse error) degrades
    // to the template AND must be labeled partial — never "ok". A degraded
    // brief that claims to be normal is the same class of bug as fake data
    // (review A1): degradation must be explicit.
    status = "partial";
    console.warn("[brief] LLM generation failed, template fallback:", e instanceof Error ? e.message : e);
    summary = templateBrief(date, events, watchlist.map((w) => ({
      symbol: w.symbol,
      name: w.name,
      changePct: snapBySymbol.get(w.symbol)?.changePct ?? null,
      price: snapBySymbol.get(w.symbol)?.price ?? null,
    })));
  }

  const brief: Brief = {
    id: uid("b"),
    date,
    generated_at: new Date().toISOString(),
    status,
    summary_json: summary,
  };

  await update((store) => {
    store.briefs = store.briefs.filter((b) => b.date !== date);
    store.briefs.push(brief);
  });
  return { brief, created: true };
}
