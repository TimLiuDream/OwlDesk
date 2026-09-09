/**
 * Overnight patrol job (ARCHITECTURE.md §7, PRD A2).
 * Runs every 15 min inside the US session window (ET 21:30–04:00 UTC-equiv):
 * snapshots → threshold moves → news → events table.
 */

import { getSnapshots } from "@/lib/agenthub/market";
import { callSignal } from "@/lib/agenthub/signal";
import { read, update, uid, type OvernightEvent } from "@/lib/db";

export const MOVE_THRESHOLD_PCT = 1.5;

/** True when US equity session is open (09:30–16:00 America/New_York, Mon–Fri). */
export function isUsSessionOpen(now: Date = new Date()): boolean {
  let et: string;
  try {
    et = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    }).format(now);
  } catch {
    return true; // TZ database missing → don't block patrols
  }
  const weekday = et.split(",")[0].trim();
  if (weekday === "Sat" || weekday === "Sun") return false;
  const [h, m] = et.split(",")[1].trim().split(":").map(Number);
  const minutes = h * 60 + m;
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

function etTimestamp(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now).replace(", ", "T") + "-04:00";
  } catch {
    return now.toISOString();
  }
}

/** ET calendar date (YYYY-MM-DD) — the brief key. */
export function etDate(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export interface PatrolReport {
  ranAt: string;
  sessionOpen: boolean;
  symbols: string[];
  eventsAdded: number;
  skipped?: string;
}

export async function runPatrol(force = false): Promise<PatrolReport> {
  const ranAt = new Date().toISOString();
  if (!force && !isUsSessionOpen()) {
    return { ranAt, sessionOpen: false, symbols: [], eventsAdded: 0, skipped: "outside US session window (ET)" };
  }

  const watchlist = await read((store) => store.watchlist.map((w) => w.symbol));
  if (watchlist.length === 0) {
    return { ranAt, sessionOpen: true, symbols: [], eventsAdded: 0, skipped: "watchlist empty" };
  }

  const snapshots = await getSnapshots(watchlist);
  const newEvents: OvernightEvent[] = [];
  const nowIso = new Date().toISOString();
  const tsEt = etTimestamp();

  // --- price moves since previous snapshot of the same session ---
  const lastBySymbol = await read((store) => {
    const map = new Map<string, OvernightEvent>();
    for (const ev of store.overnight_events) {
      if (ev.type === "price_move" && ev.price != null) {
        const prev = map.get(ev.symbol);
        if (!prev || prev.ts_et < ev.ts_et) map.set(ev.symbol, ev);
      }
    }
    return map;
  });

  for (const snap of snapshots) {
    if (snap.price === null || snap.changePct === null) continue;

    const last = lastBySymbol.get(snap.symbol);
    const prevPrice = last?.price ?? null;
    const moveSinceLast =
      prevPrice !== null ? ((snap.price - prevPrice) / prevPrice) * 100 : snap.changePct;

    if (Math.abs(moveSinceLast) >= MOVE_THRESHOLD_PCT) {
      newEvents.push({
        id: uid("e"),
        symbol: snap.symbol,
        ts_et: tsEt,
        type: "price_move",
        title: `${snap.symbol} 异动 ${moveSinceLast > 0 ? "+" : ""}${moveSinceLast.toFixed(2)}%`,
        detail:
          prevPrice !== null
            ? `自上次巡检 ${prevPrice} → ${snap.price}（${moveSinceLast > 0 ? "+" : ""}${moveSinceLast.toFixed(2)}%），24h ${snap.changePct > 0 ? "+" : ""}${snap.changePct}%`
            : `24h 变动 ${snap.changePct > 0 ? "+" : ""}${snap.changePct}%，现价 ${snap.price}`,
        price: snap.price,
        change_pct: moveSinceLast,
        created_at: nowIso,
      });
    }
  }

  // --- news (one call per patrol, attach to watchlist as market-wide event once) ---
  const news = await callSignal("news");
  if (news.source === "mcp" && news.headline) {
    newEvents.push({
      id: uid("e"),
      symbol: "MARKET",
      ts_et: tsEt,
      type: "news",
      title: news.headline.slice(0, 120),
      detail: news.keyPoints.slice(0, 5).join("；"),
      source_url: news.sources[0],
      created_at: nowIso,
    });
  }

  // --- sentiment shift (light: once per patrol) ---
  const sentiment = await callSignal("sentiment");
  if (sentiment.source === "mcp") {
    newEvents.push({
      id: uid("e"),
      symbol: "MARKET",
      ts_et: tsEt,
      type: "sentiment",
      title: sentiment.headline.slice(0, 120),
      detail: sentiment.keyPoints.slice(0, 4).join("；"),
      created_at: nowIso,
    });
  }

  if (newEvents.length > 0) {
    await update((store) => {
      store.overnight_events.push(...newEvents);
    });
  }

  return {
    ranAt,
    sessionOpen: true,
    symbols: watchlist,
    eventsAdded: newEvents.length,
  };
}
